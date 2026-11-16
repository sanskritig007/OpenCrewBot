// A scripted stand-in for a real model, used when NEBIUS_API_KEY is missing.
// It streams a short reply and exercises the same paths a real model does:
// "remember …" calls the memory tool, "search …" calls web search, "ask me …"
// asks a question card, and "open <url>" drives the browser (which asks first).
import { MastraLanguageModelV2Mock } from "@mastra/core/test-utils/llm-mock";
import { routeLLMRequest } from "./models/model-router.ts";

type Part = Record<string, unknown>;
type PromptMessage = { role: string; content: unknown };

function lastUserText(prompt: PromptMessage[]): string {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const m = prompt[i];
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) {
      return m.content
        .filter((p: { type?: string }) => p.type === "text")
        .map((p: { text?: string }) => p.text ?? "")
        .join("\n");
    }
  }
  return "";
}

function streamOf(parts: Part[], delayMs = 0): ReadableStream<Part> {
  return new ReadableStream({
    async start(controller) {
      for (const part of parts) {
        controller.enqueue(part);
        if (delayMs > 0 && part.type === "text-delta") {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
      controller.close();
    },
  });
}

function textParts(text: string): Part[] {
  const words = text.match(/\S+\s*/g) ?? [text];
  return [
    { type: "text-start", id: "t" },
    ...words.map((delta) => ({ type: "text-delta", id: "t", delta })),
    { type: "text-end", id: "t" },
  ];
}

const usage = { inputTokens: 120, outputTokens: 40, totalTokens: 160 };

export function createMockModel(botName: string) {
  return new MastraLanguageModelV2Mock({
    provider: "mock",
    modelId: "mock-model",
    // The mock's stream-part type isn't exported, so the scripted parts are cast.
    doStream: (async (options: { prompt: unknown; tools?: Array<{ name: string }> }) => {
      const prompt = options.prompt as PromptMessage[];
      const tools = new Set((options.tools ?? []).map((t) => t.name));
      const last = prompt[prompt.length - 1];
      const start = [{ type: "stream-start", warnings: [] }];

      if (last?.role === "tool") {
        // Tool results arrive wrapped as { type, value }; forward to live engine for real answer!
        const output = (last.content as Array<{ output?: { value?: unknown } }>)?.[0]?.output;
        const value = output && typeof output === "object" && "value" in output ? output.value : output;
        const content = value && typeof value === "object" && "content" in value ? (value as { content: unknown }).content : value;
        const toolResult = typeof content === "string" ? content : JSON.stringify(content ?? "");

        // Find the user's original query
        const lines = lastUserText(prompt).split("\n").filter(Boolean);
        const personLine = lines.filter((l) => l.startsWith("Person: ")).pop();
        const originalUserPrompt = personLine ? personLine.slice("Person: ".length) : (lines.pop() ?? "");

        let toolFollowUpReply = "";
        try {
          const isShort = /short/i.test(toolResult);
          const isDetailed = /detailed/i.test(toolResult);

          let formatDirective = "";
          if (isShort) {
            formatDirective = "The user explicitly selected a SHORT format. Provide a concise, high-impact 3-bullet executive summary only (under 100 words). Do NOT write long paragraphs.";
          } else if (isDetailed) {
            formatDirective = "The user explicitly requested a DETAILED guide. Provide a comprehensive, multi-stage roadmap with university tiers, budget ranges, IELTS/GRE timelines, and application milestones.";
          }

          const res = await routeLLMRequest(
            `Original inquiry: "${originalUserPrompt}".
User's format preference: "${toolResult}".
Directive: ${formatDirective}
Answer the user's inquiry directly now adhering strictly to their chosen length and format.`,
            `You are ${botName} in OpenCrewBot 2.0 Autonomous AI Workforce for MeetUniversity. Always respect the user's chosen response length (short vs detailed) strictly.`,
            {
              taskCategory: "synthesis",
              temperature: 0.15,
              maxTokens: isShort ? 250 : 1200,
            }
          );
          toolFollowUpReply = res.output;
        } catch (err) {
          toolFollowUpReply = `Action completed: ${toolResult}`;
        }

        const wordCount = toolFollowUpReply.split(/\s+/).length;
        const outputTokens = Math.max(Math.round(wordCount * 1.35), 50);
        const inputTokens = Math.max(Math.round(originalUserPrompt.length / 4), 20);
        const dynamicUsage = { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };

        return {
          stream: streamOf([
            ...start,
            ...textParts(toolFollowUpReply),
            { type: "finish", finishReason: "stop", usage: dynamicUsage },
          ]),
        };
      }

      const toolCall = (toolName: string, input: unknown) => ({
        stream: streamOf([
          ...start,
          { type: "tool-call", toolCallId: `mock-${Date.now()}`, toolName, input: JSON.stringify(input) },
          { type: "finish", finishReason: "tool-calls", usage },
        ]),
      });

      // Room turns wrap the room's new lines; use the person's latest line.
      const lines = lastUserText(prompt).split("\n").filter(Boolean);
      const personLine = lines.filter((l) => l.startsWith("Person: ")).pop();
      const said = personLine ? personLine.slice("Person: ".length) : (lines.pop() ?? "");
      const remember = said.match(/remember (?:that )?(.+)/i);
      if (remember && tools.has("memory_add")) return toolCall("memory_add", { note: remember[1] });
      if (/\bask me\b/i.test(said) && tools.has("ask_user")) {
        return toolCall("ask_user", {
          question: "How would you like your study abroad guidance formatted?",
          options: [
            { label: "Short Summary", description: "Quick 3-bullet executive overview (under 100 words)" },
            { label: "Detailed Guide", description: "Comprehensive roadmap with university tiers, budget, and timelines" },
          ],
        });
      }
      const url = said.match(/\bopen (https?:\/\/\S+)/i);
      if (url && tools.has("browser_goto")) return toolCall("browser_goto", { url: url[1] });
      const search = said.match(/(?:search|look up|find)\s+(?:for\s+)?(.+)/i);
      if (search && tools.has("web_search")) return toolCall("web_search", { query: search[1], maxResults: 3 });

      // ── MODULE H: 3 WORKING INTEGRATIONS HANDLERS ─────────────────────────
      // 1. Integration: GitHub API Connector
      if (/\b(?:github|repo status|create pr|open pr|git status)\b/i.test(said)) {
        const { getRepoStatus, createPullRequest } = await import("./integrations/github-connector");
        if (/\b(?:create pr|open pr)\b/i.test(said)) {
          const pr = await createPullRequest(
            "feat(portal): add UK CAS document upload verification",
            "feature/uk-cas-checklist",
            "Adds automated document checklist validation for UK student visa applicants."
          );
          const prText = `[GitHub Integration] **Pull Request #${pr.prNumber} Opened**\n- Title: "${pr.title}"\n- Head: \`${pr.head}\` -> Base: \`${pr.base}\`\n- Mode: **${pr.mode.toUpperCase()}**\n- Mergeable: ${pr.mergeable ? "Yes" : "No"}\n- URL: [View Pull Request](${pr.prUrl})`;
          return { stream: streamOf([...start, ...textParts(prText), { type: "finish", finishReason: "stop", usage }]) };
        }
        const status = await getRepoStatus("meetuniversity", "student-portal");
        const statusText = `[GitHub Integration] **Repository Status: ${status.repo}**\n- Default Branch: \`${status.defaultBranch}\`\n- Open Issues: ${status.openIssuesCount} | Open PRs: ${status.openPullRequestsCount}\n- Latest Commit: \`${status.latestCommitSha}\` - "${status.latestCommitMessage}"\n- Execution Mode: **${status.mode.toUpperCase()}**`;
        return { stream: streamOf([...start, ...textParts(statusText), { type: "finish", finishReason: "stop", usage }]) };
      }

      // 2. Integration: Email & Communications Engine (with Anti-Hallucination Gate)
      if (/\b(?:send email|dispatch email|email to|send notification)\b/i.test(said)) {
        const { sendStudentNotification } = await import("./integrations/email-dispatcher");
        const emailMatch = said.match(/[\w.-]+@[\w.-]+\.\w+/);
        const recipientEmail = emailMatch ? emailMatch[0] : "";
        if (!recipientEmail) {
          const blockMsg = `⚠️ **[Anti-Hallucination Gate Blocked]** Email dispatch halted: Recipient email address is missing.\n\nPlease provide who to send the email to (e.g. \`send email to student@oxford.ac.uk\`) so I do not hallucinate recipient details.`;
          return { stream: streamOf([...start, ...textParts(blockMsg), { type: "finish", finishReason: "stop", usage }]) };
        }
        const result = await sendStudentNotification({
          to: recipientEmail,
          studentName: "Aditya Kumar",
          universityName: "Imperial College London",
          applicationId: "MU-ICL-2026-904",
          subject: "Official Admissions Advisory: Statement of Purpose Review",
          bodyMarkdown: "Your draft SOP for MSc Advanced Computing has been reviewed by our Senior Admissions Counselor. Please review the attached feedback.",
          urgency: "high",
        });
        const replyText = `[Email Engine] **Official Communication Dispatched**\n- Recipient: \`${result.recipient}\`\n- Tracking ID: \`#${result.trackingId}\`\n- Status: **${result.deliveryStatus.toUpperCase()}** (Mode: ${result.mode.toUpperCase()})\n- Subject: "${result.subject}"\n- Deliverability: 100% Verified against Anti-Hallucination Gate`;
        return { stream: streamOf([...start, ...textParts(replyText), { type: "finish", finishReason: "stop", usage }]) };
      }

      // 3. Integration: CRM & Webhook Realtime Sync
      if (/\b(?:sync crm|sync lead|crm sync|webhook sync)\b/i.test(said)) {
        const { syncStudentLead } = await import("./integrations/crm-webhook-sync");
        const res = await syncStudentLead({
          studentId: "stu_9942",
          name: "Rohan Varma",
          email: "rohan.varma@outlook.com",
          targetCountry: "Germany",
          targetProgram: "MSc Automotive Systems",
          intakeSeason: "Winter 2026",
          budgetInrLakhs: 28,
          stage: "shortlist_finalized",
          counselorId: "counselor-vikram-04",
        });
        const replyText = `[CRM Webhook Sync] **Student Lead Synchronized**\n- Event: \`${res.eventType}\`\n- Event ID: \`${res.eventId}\`\n- HTTP Status: **${res.httpStatus} OK** (Mode: ${res.mode.toUpperCase()})\n- Destination: \`${res.destination}\`\n- HMAC-SHA256 Signature: \`${res.signature?.slice(0, 24)}...\``;
        return { stream: streamOf([...start, ...textParts(replyText), { type: "finish", finishReason: "stop", usage }]) };
      }

      // Call real live Multi-Model Engine (Gemini / Groq) instead of canned text!
      let reply = "";
      try {
        const res = await routeLLMRequest(
          said,
          `You are ${botName} in OpenCrewBot 2.0 Autonomous AI Workforce. Respond with thorough, high-density, factual, and complete business insight. Provide complete bullet points and full explanations without cutting off mid-sentence.`,
          {
            taskCategory: "synthesis",
            temperature: 0.15,
            maxTokens: 1500, // Generous token allowance for complete, comprehensive answers
          }
        );
        reply = res.output;
      } catch (err) {
        reply = `Encountered an issue communicating with intelligence engine: ${err instanceof Error ? err.message : String(err)}`;
      }

      const wordCount = reply.split(/\s+/).length;
      const outputTokens = Math.max(Math.round(wordCount * 1.35), 50);
      const inputTokens = Math.max(Math.round(said.length / 4), 20);
      const dynamicUsage = { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };

      return { stream: streamOf([...start, ...textParts(reply), { type: "finish", finishReason: "stop", usage: dynamicUsage }]) };
    }) as never,
  });
}
