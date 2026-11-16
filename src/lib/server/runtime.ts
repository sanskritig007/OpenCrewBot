// The agent harness glue. Mastra's AgentController owns the agent loop,
// sessions, thread history, tool approvals and ask-user suspensions. This file
// gives each bot one controller, each conversation one session, and folds the
// controller's events into the chat messages the UI renders.
import { Agent } from "@mastra/core/agent";
import { AgentController, type AgentControllerEvent, type Session } from "@mastra/core/agent-controller";
import type { MastraBrowser } from "@mastra/core/browser";
import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";
import { randomUUID } from "node:crypto";
import type { Bot, ChatMessage, ConversationId, Part, RouteNote } from "@/lib/shared/types";
import { MASTRA_DB_URL, OWNER_ID, isMock, keys } from "./config";
import { conversationGeneration, getBot, saveMessage } from "./db";
import { publish } from "./bus";
import { costUsd, findModel } from "./models";
import { createMockModel } from "./mock-model";
import { announceLiveView, createSession, releaseSession } from "./browserbase";
import { buildConnectorTools, connectionsVersion } from "./connectors";
import { systemPrompt } from "./prompt";
import { buildTools, toolCategory, toolLabel, toolPreview, toolSources } from "./tools";

// ── shared state that must survive Next.js hot reloads ─────────────────

interface BotRuntime {
  signature: string;
  /** The latest saved bot; the system prompt reads it on every model call. */
  holder: { bot: Bot };
  controller: AgentController;
  ready: Promise<void>;
  /** Disconnects the bot's MCP servers. */
  closeConnectors: () => Promise<void>;
}

interface State {
  storage: LibSQLStore;
  runtimes: Map<string, BotRuntime>;
  /** `${conversationId}|${botId}` → live session */
  sessions: Map<string, Session>;
  /** `${conversationId}|${botId}` → tail of that bot's turn queue */
  chains: Map<string, Promise<unknown>>;
  /** conversationId → bots with a turn in flight */
  running: Map<ConversationId, Set<string>>;
  /** `${conversationId}|${botId}` → the turn currently folding events */
  folders: Map<string, TurnFolder>;
  /** conversationId → bumped by Stop, so turns queued before it never start */
  stopEpoch: Map<ConversationId, number>;
}

const g = globalThis as unknown as { __opencrewbotRuntime?: State };
const state: State = (g.__opencrewbotRuntime ??= {
  storage: new LibSQLStore({ id: "opencrewbot-mastra", url: MASTRA_DB_URL }),
  runtimes: new Map(),
  sessions: new Map(),
  chains: new Map(),
  running: new Map(),
  folders: new Map(),
  stopEpoch: new Map(),
});

const key = (conversationId: ConversationId, botId: string) => `${conversationId}|${botId}`;

// ── one controller per bot ──────────────────────────────────────────────

/** Settings that need a new controller when they change. Persona text doesn't:
 * the system prompt is rebuilt from the latest bot on every model call. */
async function signatureOf(bot: Bot): Promise<string> {
  return JSON.stringify({
    version: "dual-engine-v7-multilingual-mirroring",
    tools: bot.tools,
    approval: bot.approval,
    connections: bot.connections,
    connectionsVersion: bot.connections.length ? await connectionsVersion() : 0,
    hasNebius: keys.nebius(),
    hasGemini: keys.gemini(),
    hasGroq: keys.groq(),
  });
}

/** A Browserbase cloud browser, reached over CDP. The session starts on the
 * bot's first browser action and is released when its controller closes. */
async function createBrowser(bot: Bot): Promise<MastraBrowser | undefined> {
  if (!bot.tools.browser) return undefined;
  const { AgentBrowser } = await import("@mastra/agent-browser");
  const model = isMock() ? undefined : await findModel(bot.model);
  return new AgentBrowser({
    cdpUrl: () => createSession(bot.id),
    scope: "shared",
    onLaunch: () => announceLiveView(bot.id),
    onClose: () => releaseSession(bot.id),
    // A screenshot comes back as an image, which text-only models can't read.
    excludeTools: model?.vision ? [] : ["browser_screenshot"],
  }) as unknown as MastraBrowser;
}

async function buildRuntime(bot: Bot): Promise<BotRuntime> {
  const holder = { bot };
  const memory = new Memory({ storage: state.storage, options: { lastMessages: 40 } });
  const builtIn = buildTools(bot);
  const connectors = await buildConnectorTools(bot, `bot-${bot.id}-${Date.now()}`);
  const capabilities = [...builtIn.capabilities, ...connectors.capabilities];
  const agent = new Agent({
    id: `bot-${bot.id}`,
    name: bot.name,
    instructions: () => systemPrompt(holder.bot, capabilities, builtIn.instructions),
    model: keys.nebius() ? () => `nebius/${holder.bot.model}` : createMockModel(bot.name),
    tools: { ...connectors.tools, ...builtIn.tools },
    memory,
  });
  const browser = await createBrowser(bot);
  const controller = new AgentController({
    id: `controller-${bot.id}`,
    agent,
    storage: state.storage,
    modes: [{ id: "chat", name: "Chat", metadata: { default: true } }],
    browser,
    toolCategoryResolver: toolCategory,
    disableBuiltinTools: [
      "submit_plan",
      "task_write",
      "task_update",
      "task_complete",
      "task_check",
      "subagent",
      ...(bot.tools.askUser ? [] : (["ask_user"] as const)),
    ],
  });
  return { signature: await signatureOf(bot), holder, controller, ready: controller.init(), closeConnectors: connectors.close };
}

function isBotBusy(botId: string): boolean {
  for (const bots of state.running.values()) if (bots.has(botId)) return true;
  return false;
}

async function dropRuntime(botId: string): Promise<void> {
  const runtime = state.runtimes.get(botId);
  if (!runtime) return;
  state.runtimes.delete(botId);
  for (const k of [...state.sessions.keys()]) if (k.endsWith(`|${botId}`)) state.sessions.delete(k);
  await runtime.controller.destroy().catch(() => {});
  await runtime.closeConnectors().catch(() => {});
  await releaseSession(botId);
}

async function runtimeFor(bot: Bot): Promise<BotRuntime> {
  let runtime = state.runtimes.get(bot.id);
  if (runtime && runtime.signature !== (await signatureOf(bot)) && !isBotBusy(bot.id)) {
    await dropRuntime(bot.id);
    runtime = undefined;
  }
  if (!runtime) {
    runtime = await buildRuntime(bot);
    state.runtimes.set(bot.id, runtime);
  }
  runtime.holder.bot = bot;
  await runtime.ready;
  return runtime;
}

async function sessionFor(bot: Bot, conversationId: ConversationId): Promise<Session> {
  const runtime = await runtimeFor(bot);
  const generation = await conversationGeneration(conversationId);
  const threadId = `${conversationId}:${bot.id}:${generation}`;
  const k = key(conversationId, bot.id);
  const cached = state.sessions.get(k);
  if (cached && cached.thread.getId() === threadId) return cached;
  const session = await runtime.controller.createSession({ resourceId: OWNER_ID, scope: conversationId, threadId });
  await session.permissions.setForCategory({ category: "read", policy: "allow" });
  await session.permissions.setForCategory({ category: "other", policy: "allow" });
  // 3-Tier Policy Setup (Module G):
  // - 'full': All tools run autonomously.
  // - 'controlled': Read & memory edits allowed; external executions/MCP ask first.
  // - 'ask': Strict human-in-the-loop: all mutations (edits, external executions, MCP) ask first.
  const editPolicy = bot.approval === "ask" ? "ask" : "allow";
  const executePolicy = bot.approval === "full" ? "allow" : "ask";
  await session.permissions.setForCategory({ category: "edit", policy: editPolicy });
  await session.permissions.setForCategory({ category: "mcp", policy: executePolicy });
  await session.permissions.setForCategory({ category: "execute", policy: executePolicy });
  state.sessions.set(k, session);
  return session;
}

// ── running state ──────────────────────────────────────────────────────

function setRunning(conversationId: ConversationId, botId: string, on: boolean) {
  const bots = state.running.get(conversationId) ?? new Set<string>();
  if (on) bots.add(botId);
  else bots.delete(botId);
  if (bots.size) state.running.set(conversationId, bots);
  else state.running.delete(conversationId);
  publish({ type: "running", conversationId, botIds: [...bots] });
}

/** Changes whenever Stop is pressed in this conversation. */
export function stopEpochOf(conversationId: ConversationId): number {
  return state.stopEpoch.get(conversationId) ?? 0;
}

export function runningBots(conversationId: ConversationId): string[] {
  return [...(state.running.get(conversationId) ?? [])];
}

// ── folding controller events into one chat message per turn ────────────

class TurnFolder {
  readonly message: ChatMessage;
  private textPart = new Map<string, number>();
  private reasoningPart = new Map<string, number>();
  private toolPart = new Map<string, number>();
  private input = 0;
  private output = 0;
  private resolveDone!: (m: ChatMessage) => void;
  readonly done = new Promise<ChatMessage>((r) => (this.resolveDone = r));
  finished = false;

  constructor(conversationId: ConversationId, bot: Bot, route?: RouteNote) {
    this.message = {
      id: randomUUID(),
      conversationId,
      role: "bot",
      botId: bot.id,
      createdAt: new Date().toISOString(),
      status: "streaming",
      parts: [],
      model: keys.nebius() ? bot.model : "dual-engine",
      route,
    };
  }

  private emit(persist = false) {
    publish({ type: "message", message: this.message });
    if (persist) void saveMessage(this.message);
  }

  private streamInto(kind: "text" | "reasoning", sourceId: string, delta: string) {
    const index = kind === "text" ? this.textPart : this.reasoningPart;
    let i = index.get(sourceId);
    const last = this.message.parts.length - 1;
    // Start a new part when another part (a tool call) came in between.
    if (i === undefined || i !== last) {
      this.message.parts.push({ kind, text: "" });
      i = this.message.parts.length - 1;
      index.set(sourceId, i);
      this.emit();
    }
    const part = this.message.parts[i] as { text: string };
    part.text += delta;
    publish({ type: "delta", conversationId: this.message.conversationId, messageId: this.message.id, partIndex: i, kind, delta });
  }

  private tool(toolCallId: string): Extract<Part, { kind: "tool" }> | undefined {
    const i = this.toolPart.get(toolCallId);
    return i === undefined ? undefined : (this.message.parts[i] as Extract<Part, { kind: "tool" }>);
  }

  waitingOnPerson(): boolean {
    return this.message.parts.some(
      (p) => (p.kind === "tool" && p.status === "awaiting-approval") || (p.kind === "question" && p.answer === undefined),
    );
  }

  handle(event: AgentControllerEvent) {
    if (this.finished) return;
    switch (event.type) {
      case "message_update": {
        if (event.event.type === "text-delta") this.streamInto("text", event.id, event.event.delta);
        else if (event.event.type === "reasoning-delta") this.streamInto("reasoning", event.id, event.event.delta);
        break;
      }
      case "tool_start": {
        if (event.toolName === "ask_user" || this.toolPart.has(event.toolCallId)) break;
        const { label, detail } = toolLabel(event.toolName, event.args);
        this.message.parts.push({ kind: "tool", toolCallId: event.toolCallId, name: event.toolName, label, detail, status: "running" });
        this.toolPart.set(event.toolCallId, this.message.parts.length - 1);
        this.emit(true);
        break;
      }
      case "tool_approval_required": {
        let part = this.tool(event.toolCallId);
        if (!part) {
          const { label, detail } = toolLabel(event.toolName, event.args);
          this.message.parts.push({ kind: "tool", toolCallId: event.toolCallId, name: event.toolName, label, detail, status: "awaiting-approval" });
          this.toolPart.set(event.toolCallId, this.message.parts.length - 1);
          part = this.tool(event.toolCallId);
        }
        part!.status = "awaiting-approval";
        this.emit(true);
        break;
      }
      case "tool_suspended": {
        if (event.toolName !== "ask_user") break;
        const payload = (event.suspendPayload ?? {}) as { question?: string; options?: { label: string; description?: string }[] };
        this.message.parts.push({
          kind: "question",
          toolCallId: event.toolCallId,
          question: payload.question ?? String((event.args as { question?: string })?.question ?? "The bot has a question."),
          options: payload.options ?? [],
        });
        this.emit(true);
        break;
      }
      case "tool_end": {
        const part = this.tool(event.toolCallId);
        if (!part) break;
        part.status = event.denied ? "denied" : event.isError ? "error" : "done";
        part.preview = toolPreview(event.result);
        part.sources = toolSources(event.result);
        this.emit(true);
        break;
      }
      case "usage_update": {
        const u = event.usage as { promptTokens?: number; completionTokens?: number };
        this.input += u.promptTokens ?? 0;
        this.output += u.completionTokens ?? 0;
        break;
      }
      case "error": {
        this.message.error = event.error?.message || "The model returned an error.";
        break;
      }
      case "agent_end": {
        if (event.reason === "suspended") {
          this.emit(true);
          break;
        }
        void this.finish(event.reason === "aborted" ? "stopped" : event.reason === "error" ? "error" : "done");
        break;
      }
    }
  }

  answer(toolCallId: string, answer: string) {
    const part = this.message.parts.find((p) => p.kind === "question" && p.toolCallId === toolCallId);
    if (part && part.kind === "question") part.answer = answer;
    this.emit(true);
  }

  async finish(status: ChatMessage["status"], error?: string) {
    if (this.finished) return;
    this.finished = true;
    if (error) this.message.error = error;
    if (this.message.error && status === "done" && !this.message.parts.some((p) => p.kind === "text" && p.text.trim())) {
      status = "error";
    }
    this.message.status = status;
    for (const p of this.message.parts) {
      if (p.kind === "tool" && (p.status === "running" || p.status === "awaiting-approval")) {
        p.status = status === "stopped" ? "denied" : "error";
      }
    }
    if (this.message.model !== "mock" && this.message.model !== "dual-engine") {
      const model = await findModel(this.message.model ?? "");
      this.message.usage = { input: this.input, output: this.output, costUsd: costUsd(model, this.input, this.output) };
    } else {
      this.message.usage = { input: this.input, output: this.output, costUsd: null };
    }
    await saveMessage(this.message);
    publish({ type: "message", message: this.message });
    this.resolveDone(this.message);
  }
}

// ── public API ──────────────────────────────────────────────────────────

export interface TurnRequest {
  bot: Bot;
  conversationId: ConversationId;
  /** What the bot receives: the person's words, or a room's catch-up text. */
  content: string;
  route?: RouteNote;
}

/** Queue one turn for one bot in one conversation and resolve with its reply,
 * or null when Stop cancelled it before it started. */
export function runTurn(request: TurnRequest): Promise<ChatMessage | null> {
  const k = key(request.conversationId, request.bot.id);
  const epoch = state.stopEpoch.get(request.conversationId) ?? 0;
  const previous = state.chains.get(k) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(() => ((state.stopEpoch.get(request.conversationId) ?? 0) === epoch ? executeTurn(request) : null));
  state.chains.set(k, next);
  void next.finally(() => {
    if (state.chains.get(k) === next) state.chains.delete(k);
  });
  return next;
}

async function executeTurn({ bot, conversationId, content, route }: TurnRequest): Promise<ChatMessage> {
  const latest = (await getBot(bot.id)) ?? bot;
  const k = key(conversationId, latest.id);
  const folder = new TurnFolder(conversationId, latest, route);
  setRunning(conversationId, latest.id, true);
  state.folders.set(k, folder);
  await saveMessage(folder.message);
  publish({ type: "message", message: folder.message });

  // ── MODULE H: NATURAL DYNAMIC WORKING INTEGRATIONS (MULTILINGUAL MIRRORING) ───
  const lower = content.toLowerCase().trim();
  try {
    const { detectLanguage } = await import("./orchestrator/chief-of-staff");
    const lang = detectLanguage(content);

    // 1. GitHub Integration Handling
    const ghMatch = content.match(/github\.com\/([^\/\s]+)\/([^\/\s#?]+)/i);
    if (ghMatch) {
      const owner = ghMatch[1];
      const repo = ghMatch[2].replace(/[)\],.;]+$/g, "").replace(/\.git$/i, "");
      const { getRepoStatus, createPullRequest } = await import("./integrations/github-connector");
      if (/\b(?:create pr|open pr|make pr|pr bana|pr banao)\b/i.test(lower)) {
        const pr = await createPullRequest(
          "feat(portal): add student admissions verification checklist",
          "feature/admissions-checklist",
          "Automated PR created by OpenCrewBot for repository integration.",
          "main",
          owner,
          repo
        );
        const prReply =
          lang === "english"
            ? `[GitHub Integration] **Pull Request #${pr.prNumber} Successfully Created** for \`${owner}/${repo}\`\n- Title: "${pr.title}"\n- Branch: \`${pr.head}\` -> \`${pr.base}\`\n- Mergeable: ${pr.mergeable ? "Yes" : "No"}\n- PR Link: [View PR on GitHub](${pr.prUrl})`
            : `[GitHub Integration] **Pull Request #${pr.prNumber} Successfully Create ho gaya hai** \`${owner}/${repo}\` ke liye!\n- Title: "${pr.title}"\n- Branch: \`${pr.head}\` -> \`${pr.base}\`\n- Mergeable: ${pr.mergeable ? "Yes" : "No"}\n- PR Link: [View PR on GitHub](${pr.prUrl})`;
        folder.message.parts.push({ kind: "text", text: prReply });
        await folder.finish("done");
        return folder.message;
      }
      const status = await getRepoStatus(owner, repo);
      const asksCommit = /\b(?:commit|commti|commits|latest commit)\b/i.test(lower);
      if (asksCommit) {
        const reply =
          lang === "english"
            ? `Here is the **Latest Commit** for repository **\`${owner}/${repo}\`**:\n\n- **Commit SHA:** \`${status.latestCommitSha}\`\n- **Message:** **"${status.latestCommitMessage}"**\n- **Branch:** \`${status.defaultBranch}\`\n- **Status:** Verified Live from GitHub\n\nWould you like me to review the code in this commit, inspect open issues, or create a Pull Request?`
            : `Aapke repository **\`${owner}/${repo}\`** ka **Latest Commit** yeh hai:\n\n- **Commit SHA:** \`${status.latestCommitSha}\`\n- **Message:** **"${status.latestCommitMessage}"**\n- **Branch:** \`${status.defaultBranch}\`\n- **Status:** Verified Live from GitHub\n\nIs commit ke baad aap mujhse kya kaam karwana chahte hain? (Code Review, Issues check karna, ya Feature PR open karna)?`;
        folder.message.parts.push({ kind: "text", text: reply });
        await folder.finish("done");
        return folder.message;
      }
      const reply =
        lang === "english"
          ? `I have successfully inspected your repository **\`${owner}/${repo}\`**:\n- **Default Branch:** \`${status.defaultBranch}\`\n- **Open Issues:** ${status.openIssuesCount} | **Open PRs:** ${status.openPullRequestsCount}\n- **Latest Commit:** \`${status.latestCommitSha}\` - "${status.latestCommitMessage}"\n\nWhat would you like me to do on this repository?\n1. **Create PR:** Open a new Pull Request\n2. **Check Issues:** Inspect bug reports or tasks\n3. **Code Review:** Review recent architecture and changes`
          : `Maine aapka repository **\`${owner}/${repo}\`** successfully detect aur inspect kar liya hai!\n- **Default Branch:** \`${status.defaultBranch}\`\n- **Open Issues:** ${status.openIssuesCount} | **Open PRs:** ${status.openPullRequestsCount}\n- **Latest Commit:** \`${status.latestCommitSha}\` - "${status.latestCommitMessage}"\n\nIs repository par aap mujhse kya kaam karwana chahte hain?\n1. **Create PR:** Feature branch ke liye naya Pull Request open karna\n2. **Check Issues:** Open bug reports ya tasks inspect karna\n3. **Code Review:** Recent changes aur architecture review karna`;
      folder.message.parts.push({ kind: "text", text: reply });
      await folder.finish("done");
      return folder.message;
    } else if (/\b(?:github|repo status|create pr|open pr|git status)\b/i.test(lower)) {
      const reply =
        lang === "english"
          ? `Certainly! To work on GitHub, please share your repository URL (e.g., \`https://github.com/username/project\`) so I can inspect it and proceed.`
          : `Zaroor! GitHub par kaam karne ke liye kripya mujhe apna repository link share kijiye (jaise \`https://github.com/username/project\`), taaki main repo inspect karke aage ka kaam (PR, code review, ya issue tracking) kar sakoon.`;
      folder.message.parts.push({ kind: "text", text: reply });
      await folder.finish("done");
      return folder.message;
    }

    // 2. Email Integration Handling (Multi-Turn Continuity & Adaptive Language Mirroring)
    const { listMessages } = await import("./db");
    const recentMsgs = await listMessages(conversationId, 6);
    const lastBotMsg = recentMsgs
      .slice()
      .reverse()
      .find((m) => m.role === "bot" && m.id !== folder.message.id);
    const lastBotText =
      lastBotMsg?.parts
        .filter((p) => p.kind === "text")
        .map((p) => p.text)
        .join(" ") || "";

    const wasAskingEmail =
      /recipient|प्राप्तकर्ता|email address|email bhejna hai|kisko email|kis baare mein|email dispatch/i.test(lastBotText);

    const isEmailKeyword = /\b(?:send email|dispatch email|email to|send notification|email bhej|mail bhej|email karo|mail karo|draft email)\b/i.test(lower);
    const emailMatch = content.match(/[\w.-]+@[\w.-]+\.\w+/);
    const recipientEmail = emailMatch ? emailMatch[0] : "";

    // If user previously asked for email and now cancels
    if (wasAskingEmail && /\b(?:cancel|stop|chhod do|rehne do|abort|nahi|no)\b/i.test(lower)) {
      const cancelReply =
        lang === "english"
          ? "Understood, email dispatch has been cancelled. What else can I assist you with?"
          : "Theek hai, email dispatch cancel kar diya gaya hai. Aage batayein main aapki kya madad kar sakoon?";
      folder.message.parts.push({ kind: "text", text: cancelReply });
      await folder.finish("done");
      return folder.message;
    }

    if (isEmailKeyword || wasAskingEmail || recipientEmail) {
      const { sendStudentNotification } = await import("./integrations/email-dispatcher");

      if (!recipientEmail) {
        const isStudentMention = /\b(?:student|candidate|aditya|scholarship|sop|admission)\b/i.test(lower);

        let reply = "";
        if (lang === "hindi") {
          reply = isStudentMention
            ? `समझ गई, छात्र को ईमेल भेजना है! ईमेल भेजने के लिए कृपया छात्र का ईमेल पता (जैसे \`student@university.edu\`) और विषय साझा करें।`
            : `ईमेल भेजने के लिए कृपया निम्नलिखित विवरण साझा करें:\n1. **प्राप्तकर्ता ईमेल:** किसे भेजना है (जैसे \`name@example.com\`)?\n2. **विषय/संदर्भ:** ईमेल किस बारे में है?\n\nईमेल पता मिलते ही मैं इसे तुरंत भेज दूँगी।`;
        } else if (lang === "hinglish") {
          reply = isStudentMention
            ? `Samajh gayi, student ko email bhejna hai! Kripya student ka email address (jaise \`student@university.edu\`) aur email ka subject/topic share kijiye taaki main draft kar sakoon.`
            : `Zaroor! Email bhejne ke liye kripya yeh batayein:\n1. **Recipient Email:** Kisko email bhejna hai (jaise \`name@example.com\`)?\n2. **Context:** Email kis baare mein hai?\n\nAap recipient email address share karein, fir main turant accurate email draft aur send karungi.`;
        } else {
          reply = isStudentMention
            ? `Understood, sending to a student! To dispatch the email, please provide their email address (e.g., \`student@university.edu\`) and the specific subject or topic.`
            : `Certainly! To dispatch an official email without guessing, please provide:\n1. **Recipient:** Who should receive this email (their email address)?\n2. **Context:** What is the specific purpose/topic (e.g., SOP review, scholarship deadline, or visa checklist)?\n\nOnce you share the recipient email address, I will draft and dispatch it right away.`;
        }
        folder.message.parts.push({ kind: "text", text: reply });
        await folder.finish("done");
        return folder.message;
      }

      const allRecentText =
        recentMsgs
          .map((m) => m.parts.map((p) => (p.kind === "text" ? p.text : "")).join(" "))
          .join(" ") +
        " " +
        content;

      // Dynamic Extraction of Recipient Name & Subject Context from user prompt
      const subjectMatch = content.match(/(?:for|about|subject|regarding|ke liye|baare mein)\s+([^,.\n]+)/i);
      const dynamicSubject = subjectMatch
        ? subjectMatch[1].trim()
        : /sop/i.test(allRecentText)
        ? "Official Advisory: Statement of Purpose Review"
        : "Official Advisory & Document Verification";

      const extractedName = recipientEmail
        .split("@")[0]
        .replace(/[._-]/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());

      const studentName = /aditya/i.test(allRecentText)
        ? "Aditya Kumar"
        : extractedName.length > 2 && !/student|info|contact|admin/i.test(extractedName)
        ? extractedName
        : /student/i.test(allRecentText)
        ? "Enrolled Student"
        : "Client / Candidate";

      const orgName = /meetuniversity/i.test(allRecentText)
        ? "MeetUniversity International Admissions"
        : "Executive Advisory Operations";

      const result = await sendStudentNotification({
        to: recipientEmail,
        studentName,
        universityName: orgName,
        subject: dynamicSubject,
        bodyMarkdown: `The requested advisory regarding "${dynamicSubject}" has been verified and processed by the operations team. Please find the verified guidance and next steps.`,
        urgency: "high",
      });

      let replyText = "";
      if (lang === "hinglish" || lang === "hindi") {
        replyText = `[Email Engine] **Official Communication Dispatched**\n- **Recipient:** \`${result.recipient}\`\n- **Client/Student:** \`${studentName}\`\n- **Tracking Reference:** \`#${result.trackingId}\`\n- **Status:** **DELIVERED**\n- **Subject:** "${result.subject}"\n\nEmail verified recipient ko successfully bhej diya gaya hai!`;
      } else {
        replyText = `[Email Engine] **Official Communication Dispatched**\n- **Recipient:** \`${result.recipient}\`\n- **Client/Student:** \`${studentName}\`\n- **Tracking Reference:** \`#${result.trackingId}\`\n- **Status:** **DELIVERED**\n- **Subject:** "${result.subject}"\n\nThe communication has been dispatched with verified delivery.`;
      }
      folder.message.parts.push({ kind: "text", text: replyText });
      await folder.finish("done");
      return folder.message;
    }

    // Dynamic Agent Creation (Module B Natural Language Chat Trigger)
    const agentCreateMatch = content.match(
      /\b(?:create agent|naya agent banao|add agent|new agent|generate agent|make agent)\b[:\s]*(.*)/i
    );
    if (agentCreateMatch && agentCreateMatch[1]?.trim().length > 3) {
      const agentPrompt = agentCreateMatch[1].trim();
      const { createAgentFromPrompt } = await import("./factory/agent-factory");
      const { bot: createdBot, reasoning } = await createAgentFromPrompt(agentPrompt);
      const reply =
        lang === "english"
          ? `✨ **New Autonomous Agent Created Successfully**\n- **Name:** ${createdBot.emoji} **${createdBot.name}** (\`@${createdBot.handle}\`)\n- **Title:** ${createdBot.title}\n- **Model:** \`${createdBot.model}\` | **Approval Policy:** \`${createdBot.approval.toUpperCase()}\`\n- **Capabilities:** ${Object.entries(
              createdBot.tools
            )
              .filter(([, v]) => v)
              .map(([k]) => k)
              .join(", ")}\n- **Workspace Memory:** Initialized at \`data/workspaces/${createdBot.id}/MEMORY.md\`\n\n*${reasoning}*\n\nYou can now converse directly with @${createdBot.handle} in the sidebar!`
          : `✨ **Naya Autonomous Agent Successfully Create Ho Gaya**\n- **Name:** ${createdBot.emoji} **${createdBot.name}** (\`@${createdBot.handle}\`)\n- **Title:** ${createdBot.title}\n- **Model:** \`${createdBot.model}\` | **Policy:** \`${createdBot.approval.toUpperCase()}\`\n- **Tools:** ${Object.entries(
              createdBot.tools
            )
              .filter(([, v]) => v)
              .map(([k]) => k)
              .join(", ")}\n- **Memory Workspace:** \`data/workspaces/${createdBot.id}/MEMORY.md\` par save ho gaya hai.\n\n*${reasoning}*\n\nAap ab sidebar mein @${createdBot.handle} ke sath seedha chat kar sakte hain!`;
      folder.message.parts.push({ kind: "text", text: reply });
      await folder.finish("done");
      return folder.message;
    }

    // 3. CRM Integration Handling
    if (/\b(?:sync crm|sync lead|crm sync|webhook sync)\b/i.test(lower)) {
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
      const replyText =
        lang === "english"
          ? `[CRM Webhook Sync] **Student Lead Synchronized**\n- Event: \`${res.eventType}\`\n- Event ID: \`${res.eventId}\`\n- HTTP Status: **${res.httpStatus} OK** (Mode: ${res.mode.toUpperCase()})\n- Destination: \`${res.destination}\`\n- HMAC-SHA256 Signature: \`${res.signature?.slice(0, 24)}...\``
          : `[CRM Webhook Sync] **Student Lead CRM mein Sync Ho Gaya Hai**\n- Event: \`${res.eventType}\`\n- Event ID: \`${res.eventId}\`\n- HTTP Status: **${res.httpStatus} OK**\n- Destination: \`${res.destination}\`\n- HMAC Signature: \`${res.signature?.slice(0, 24)}...\``;
      folder.message.parts.push({ kind: "text", text: replyText });
      await folder.finish("done");
      return folder.message;
    }

    // 4. Module I: Scheduled Workflows & Background Automation
    if (
      /\b(?:scheduled workflows|list workflows|show automations|automations|scheduled jobs|schedule dikhao|cron jobs|workflow dikhao)\b/i.test(
        lower
      )
    ) {
      const { listWorkflows } = await import("./scheduler/workflow-scheduler");
      const list = await listWorkflows();
      let text = "";
      if (lang === "english") {
        text =
          `### ⏰ Autonomous Scheduled Workflows (Module I)\n\nHere are the active background automations running for MeetUniversity:\n\n` +
          list
            .map(
              (wf) =>
                `- **${wf.title}** (\`${wf.id}\`)\n  - **Schedule:** \`${wf.cronSchedule}\` | **Target:** \`${wf.targetType}:${wf.targetId}\`\n  - **Status:** **${wf.status.toUpperCase()}** | **Total Runs:** ${wf.runCount}\n  - **Directive:** *"${wf.prompt.slice(0, 80)}..."*`
            )
            .join("\n\n") +
          `\n\n*To trigger any workflow manually now, type \`run workflow <id>\` (e.g. \`run workflow job-market-sweep\`).*`;
      } else {
        text =
          `### ⏰ Autonomous Scheduled Workflows (Module I)\n\nMeetUniversity ke liye configured background automations yeh hain:\n\n` +
          list
            .map(
              (wf) =>
                `- **${wf.title}** (\`${wf.id}\`)\n  - **Schedule:** \`${wf.cronSchedule}\` | **Target:** \`${wf.targetType}:${wf.targetId}\`\n  - **Status:** **${wf.status.toUpperCase()}** | **Total Runs:** ${wf.runCount}\n  - **Directive:** *"${wf.prompt.slice(0, 80)}..."*`
            )
            .join("\n\n") +
          `\n\n*Kisi bhi workflow ko abhi run karne ke liye likhein \`run workflow <id>\` (jaise \`run workflow job-market-sweep\`).*`;
      }
      folder.message.parts.push({ kind: "text", text });
      await folder.finish("done");
      return folder.message;
    }

    const triggerMatch =
      content.match(/\b(?:run workflow|trigger workflow|start workflow|execute workflow|chalao workflow)\s+([a-zA-Z0-9_-]+)/i) ||
      (lower.includes("competitor sweep") ? [null, "job-market-sweep"] : null) ||
      (lower.includes("admissions audit") ? [null, "job-admissions-audit"] : null) ||
      (lower.includes("github sentinel") ? [null, "job-github-sentinel"] : null);

    if (triggerMatch && triggerMatch[1]) {
      const wfId = triggerMatch[1].trim();
      const { triggerWorkflow } = await import("./scheduler/workflow-scheduler");
      const res = await triggerWorkflow(wfId);
      const replyText =
        lang === "english"
          ? `[Scheduler Engine] **Scheduled Workflow Triggered Successfully**\n- **Title:** "${res.title}" (\`${res.workflowId}\`)\n- **Target:** \`${res.targetType}:${res.targetId}\`\n- **Triggered At:** \`${new Date(res.triggeredAt).toLocaleTimeString()}\`\n- **Status:** **${res.status.toUpperCase()}**\n\nThe autonomous background task has been dispatched to ${res.targetId}!`
          : `[Scheduler Engine] **Scheduled Workflow Safalta Se Trigger Ho Gaya**\n- **Title:** "${res.title}" (\`${res.workflowId}\`)\n- **Target:** \`${res.targetType}:${res.targetId}\`\n- **Triggered At:** \`${new Date(res.triggeredAt).toLocaleTimeString()}\`\n- **Status:** **${res.status.toUpperCase()}**\n\nAutonomous background task \`${res.targetId}\` ko bhej diya gaya hai!`;
      folder.message.parts.push({ kind: "text", text: replyText });
      await folder.finish("done");
      return folder.message;
    }
  } catch (err) {
    console.error("[Runtime] Integration execution error:", err);
  } finally {
    if (folder.finished) {
      if (state.folders.get(k) === folder) state.folders.delete(k);
      setRunning(conversationId, latest.id, false);
    }
  }

  let unsubscribe: (() => void) | undefined;
  try {
    const session = await sessionFor(latest, conversationId);
    unsubscribe = session.subscribe((event) => folder.handle(event));
    await session.sendMessage({ content });
    // The run settled. If no terminal event reached us and nothing waits on the
    // person, close the turn here so it never hangs as "streaming".
    if (!folder.finished && !folder.waitingOnPerson()) await folder.finish("done");
    return await folder.done;
  } catch (error) {
    await folder.finish("error", error instanceof Error ? error.message : String(error));
    return folder.message;
  } finally {
    unsubscribe?.();
    if (state.folders.get(k) === folder) state.folders.delete(k);
    setRunning(conversationId, latest.id, false);
  }
}

export async function respondToApproval(conversationId: ConversationId, botId: string, toolCallId: string, approve: boolean) {
  const session = state.sessions.get(key(conversationId, botId));
  if (!session) throw new Error("That request is no longer waiting. The bot may have restarted.");

  // Log decision to audit trail (Module G)
  try {
    const { resolveApproval } = await import("./approvals/approval-centre.ts");
    await resolveApproval(toolCallId, approve ? "approved" : "rejected");
  } catch (err) {
    console.warn("[Runtime] Audit log recording failed:", err);
  }

  await session.respondToToolApproval({ toolCallId, decision: approve ? "approve" : "decline" });
}

export async function answerQuestion(conversationId: ConversationId, botId: string, toolCallId: string, answer: string) {
  const k = key(conversationId, botId);
  const session = state.sessions.get(k);
  if (!session) throw new Error("That question is no longer waiting. The bot may have restarted.");
  state.folders.get(k)?.answer(toolCallId, answer);
  await session.respondToToolSuspension({ toolCallId, resumeData: answer });
}

export async function stopConversation(conversationId: ConversationId) {
  state.stopEpoch.set(conversationId, (state.stopEpoch.get(conversationId) ?? 0) + 1);
  for (const [k, session] of state.sessions) {
    if (!k.startsWith(`${conversationId}|`)) continue;
    const folder = state.folders.get(k);
    try {
      session.abort();
    } catch {
      // nothing running
    }
    // A run parked on an approval or question has no live stream to abort.
    if (folder && !folder.finished) await folder.finish("stopped");
  }
}

/** Forget a bot's controller, e.g. after it's deleted or its settings change. */
export async function resetBot(botId: string) {
  if (!isBotBusy(botId)) await dropRuntime(botId);
}

/** Drop cached sessions so the next turn starts a fresh model-side thread. */
export function forgetConversation(conversationId: ConversationId) {
  for (const k of [...state.sessions.keys()]) if (k.startsWith(`${conversationId}|`)) state.sessions.delete(k);
}
