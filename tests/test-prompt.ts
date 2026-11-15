// Interactive CLI Test Runner for Chief of Staff & Workforce Execution
// Usage: node --experimental-strip-types tests/test-prompt.ts "<your prompt here>"

import { generateTaskPlan, detectLanguage, synthesizeFinalDeliverable } from "../src/lib/server/orchestrator/chief-of-staff.ts";
import { TaskExecutionEngine } from "../src/lib/server/orchestrator/execution-engine.ts";
import type { Bot, TaskNode } from "../src/lib/shared/types.ts";
import { generateWithGemini } from "../src/lib/server/models/gemini-client.ts";

const availableWorkforce: Bot[] = [
  {
    id: "bot-chief",
    name: "Aria (Chief of Staff)",
    handle: "chief",
    title: "Executive Orchestrator",
    description: "Orchestrates workforce, breaks down goals, coordinates deliverables",
    instructions: "You are the Chief of Staff.",
    emoji: "👑",
    color: "#6366f1",
    model: "claude-3.7-sonnet",
    tools: { webSearch: true, memory: true, codeMode: true, browser: false, askUser: true },
    connections: [],
    approval: "full",
    pinned: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "bot-researcher",
    name: "Zara (Market Researcher)",
    handle: "researcher",
    title: "Intelligence & Insights Lead",
    description: "Deep market, competitor, and audience discovery",
    instructions: "Gather factual intelligence.",
    emoji: "🔍",
    color: "#3b82f6",
    model: "perplexity-sonar",
    tools: { webSearch: true, memory: true, codeMode: false, browser: true, askUser: false },
    connections: [],
    approval: "ask",
    pinned: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "bot-analyst",
    name: "Marcus (Business Analyst)",
    handle: "analyst",
    title: "Commercial & Data Analyst",
    description: "Spreadsheets, financial models, pricing comparisons",
    instructions: "Analyze data rigorously.",
    emoji: "📊",
    color: "#10b981",
    model: "gemini-2.5-pro",
    tools: { webSearch: false, memory: true, codeMode: true, browser: false, askUser: false },
    connections: [],
    approval: "controlled",
    pinned: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "bot-marketing",
    name: "Sofia (Marketing Strategist)",
    handle: "marketing",
    title: "Growth & Campaign Lead",
    description: "Audience targeting, campaigns, social strategy, campus outreach",
    instructions: "Design high-converting campaigns.",
    emoji: "🎯",
    color: "#ec4899",
    model: "gpt-4o",
    tools: { webSearch: true, memory: true, codeMode: false, browser: false, askUser: false },
    connections: [],
    approval: "controlled",
    pinned: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "bot-developer",
    name: "Dev (Senior Software Engineer)",
    handle: "developer",
    title: "Systems & Code Specialist",
    description: "GitHub inspection, bug fixing, automated refactoring",
    instructions: "Write production code.",
    emoji: "💻",
    color: "#f59e0b",
    model: "codex-deepseek-r1",
    tools: { webSearch: false, memory: true, codeMode: true, browser: false, askUser: true },
    connections: [],
    approval: "ask",
    pinned: true,
    createdAt: new Date().toISOString(),
  },
];

async function main() {
  const userPrompt = process.argv[2] || "MeetUniversity ke competitors identify karo aur pricing comparison report banao";

  console.log("\n================================================================================");
  console.log("🤖 OPENCREWBOT 2.0 — AUTONOMOUS AI WORKFORCE INTERACTIVE CLI");
  console.log("================================================================================");
  console.log(`\n📥 USER INPUT PROMPT:\n"${userPrompt}"\n`);

  // 1. Language Detection
  const language = detectLanguage(userPrompt);
  console.log(`🌐 DETECTED LANGUAGE STYLE: [${language.toUpperCase()}]`);

  // 2. Chief of Staff DAG Decomposition
  console.log("\n🧠 CHIEF OF STAFF: Analyzing prompt and synthesizing DAG Task Plan...");
  const plan = generateTaskPlan(userPrompt, `conv_${Date.now()}`, {
    availableBots: availableWorkforce,
    preferredLanguage: language,
  });

  console.log(`📋 Plan ID: ${plan.id}`);
  console.log(`📌 Total Planned Sub-Tasks: ${plan.nodes.length}\n`);

  console.log("┌─────────────────────────────────────────────────────────────────────────────┐");
  console.log("│ WORKFORCE TASK ALLOCATION & CONCURRENCY GRAPH (DAG)                         │");
  console.log("├─────────────────────────────────────────────────────────────────────────────┤");
  plan.nodes.forEach((node, idx) => {
    const isParallel = node.dependencies.length === 0 ? "⚡ [PARALLEL READY]" : `⏳ [WAITS FOR: ${node.dependencies.join(", ")}]`;
    const approvalBadge = node.approvalRequired ? "🔒 [HUMAN APPROVAL REQUIRED]" : "✅ [AUTO]";
    console.log(`│ ${idx + 1}. Node: ${node.id}`);
    console.log(`│    Title:        ${node.title}`);
    console.log(`│    Assigned:     ${node.assignedRole} (${node.assignedBotId})`);
    console.log(`│    Concurrency:  ${isParallel}`);
    console.log(`│    Security:     ${approvalBadge}`);
    if (node.approvalPrompt) {
      console.log(`│    Approval Msg: "${node.approvalPrompt}"`);
    }
    console.log("├─────────────────────────────────────────────────────────────────────────────┤");
  });
  console.log("└─────────────────────────────────────────────────────────────────────────────┘\n");

  // 3. Execution Engine Simulation
  console.log("⚡ STARTING WORKFORCE EXECUTION ENGINE (True Parallel Dispatch)...");
  const engine = new TaskExecutionEngine();

  const executor = async (node: TaskNode, upstream: Record<string, string>): Promise<string> => {
    const startTime = Date.now();
    console.log(`   🚀 [STARTED] "${node.title}" by ${node.assignedRole}...`);
    
    // Call Live Gemini Model for REAL Dynamic Intelligence
    try {
      const upstreamText = Object.entries(upstream)
        .map(([k, v]) => `[Upstream Output from ${k}]:\n${v}`)
        .join("\n\n");

      const systemInstruction = `You are ${node.assignedRole} in the OpenCrewBot 2.0 Autonomous AI Workforce.
Your specific task is: "${node.title}".
Context / User Goal: "${userPrompt}".
Preferred Language: ${language.toUpperCase()} (If Hinglish, use natural fluent Hinglish; if English, use crisp professional English).
Requirements: Provide accurate, detailed, factual, and direct business/domain output. Include relevant bullet points, numbers, options, or comparison tables where applicable. Do not generate generic placeholders.`;

      const promptPayload = upstreamText
        ? `Upstream Team Inputs:\n${upstreamText}\n\nBased on the above, deliver your specific output for: "${node.title}".`
        : `Execute your specific task: "${node.title}" for goal: "${userPrompt}".`;

      const liveResponse = await generateWithGemini(promptPayload, {
        systemInstruction,
        temperature: 0.15,
        topP: 0.85,
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`   ✨ [LIVE AI COMPLETED] "${node.title}" (took ${duration}s via Gemini API)`);
      return liveResponse;
    } catch (err: unknown) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`   ⚠️ [FALLBACK] "${node.title}" (took ${duration}s, reason: ${err instanceof Error ? err.message : String(err)})`);
      return `### Output for "${node.title}"\n- Evaluated core operational parameters for: "${userPrompt}".`;
    }
  };

  const executedPlan = await engine.runPlan(plan, executor, {
    onNodeAwaitingApproval: (node) => {
      console.log(`\n   🛑 [APPROVAL GATE TRIGGERED] Node: ${node.id}`);
      console.log(`   💬 System asks Human Operator: "${node.approvalPrompt}"`);
      console.log(`   👉 Automatically resolving with operator approval for CLI demo...\n`);
      engine.resolveApproval(plan.id, node.id, true);
    }
  });

  // If paused due to approval, finish the execution
  if (executedPlan.status === "paused") {
    await engine.runPlan(executedPlan, executor);
  }

  // 4. Final Executive Deliverable
  console.log("\n================================================================================");
  console.log("📄 FINAL CONSOLIDATED BUSINESS DELIVERABLE ASSEMBLED BY CHIEF OF STAFF:");
  console.log("================================================================================\n");
  console.log(executedPlan.finalDeliverable);
  console.log("\n================================================================================\n");
}

main().catch(console.error);

