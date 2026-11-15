// Comprehensive Verification Test Suite for Module A (Chief of Staff) and Module D (Execution Engine)

import { generateTaskPlan, detectLanguage, synthesizeFinalDeliverable } from "../src/lib/server/orchestrator/chief-of-staff.ts";
import { TaskExecutionEngine } from "../src/lib/server/orchestrator/execution-engine.ts";
import type { Bot, TaskNode } from "../src/lib/shared/types.ts";

const mockBots: Bot[] = [
  {
    id: "bot-1",
    name: "Research Specialist",
    handle: "researcher",
    title: "Market Researcher",
    description: "Deep research and competitive intelligence",
    instructions: "Research thoroughly.",
    emoji: "🔍",
    color: "#3b82f6",
    model: "llama-3.3-70b",
    tools: { webSearch: true, memory: true, codeMode: false, browser: false, askUser: true },
    connections: [],
    approval: "ask",
    pinned: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "bot-2",
    name: "Business Analyst",
    handle: "analyst",
    title: "Data & Pricing Analyst",
    description: "Financial analysis and comparison matrices",
    instructions: "Analyze data meticulously.",
    emoji: "📈",
    color: "#10b981",
    model: "llama-3.3-70b",
    tools: { webSearch: false, memory: true, codeMode: true, browser: false, askUser: false },
    connections: [],
    approval: "controlled",
    pinned: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "bot-3",
    name: "Executive Writer",
    handle: "writer",
    title: "Communications Lead",
    description: "Synthesize reports and executive deliverables",
    instructions: "Write clean deliverables.",
    emoji: "📝",
    color: "#8b5cf6",
    model: "llama-3.3-70b",
    tools: { webSearch: false, memory: true, codeMode: false, browser: false, askUser: false },
    connections: [],
    approval: "full",
    pinned: true,
    createdAt: new Date().toISOString(),
  },
];

async function runTestSuite() {
  console.log("=====================================================");
  console.log("🧪 RUNNING VERIFICATION TEST SUITE: OPENCREWBOT 2.0");
  console.log("   Modules: Module A (Chief of Staff) & Module D (DAG Engine)");
  console.log("=====================================================\n");

  // TEST 1: Language Detection (English vs Hinglish)
  console.log("▶ TEST 1: Language Detection Verification");
  const lang1 = detectLanguage("Research the competitive landscape for MeetUniversity and identify pricing.");
  const lang2 = detectLanguage("MeetUniversity ke competitors identify karo aur pricing comparison report banao");
  console.log(`  English prompt detected as: "${lang1}" (Expected: english)`);
  console.log(`  Hinglish prompt detected as: "${lang2}" (Expected: hinglish)`);
  if (lang1 !== "english" || lang2 !== "hinglish") {
    throw new Error("Language detection test failed!");
  }
  console.log("  ✅ TEST 1 PASSED: Language styles accurately distinguished.\n");

  // TEST 2: Task Plan (DAG) Generation & Concurrency Identification
  console.log("▶ TEST 2: Autonomous DAG Task Plan Decomposition");
  const plan = generateTaskPlan(
    "Research competitor landscape and pricing for MeetUniversity",
    "conv-101",
    { availableBots: mockBots }
  );

  console.log(`  Plan ID: ${plan.id}`);
  console.log(`  Total Tasks Generated: ${plan.nodes.length}`);
  plan.nodes.forEach(n => {
    console.log(`   - [${n.id}] "${n.title}" assigned to: ${n.assignedRole} | Dependencies: [${n.dependencies.join(", ")}]`);
  });

  const parallelTasks = plan.nodes.filter(n => n.dependencies.length === 0);
  console.log(`  Identified Parallel Starting Tasks: ${parallelTasks.map(t => t.id).join(", ")}`);
  if (parallelTasks.length < 2) {
    throw new Error("DAG generation failed to identify parallel tasks!");
  }
  console.log("  ✅ TEST 2 PASSED: DAG generated with parallel task branches.\n");

  // TEST 3: Parallel Execution & Context Passing Verification
  console.log("▶ TEST 3: True Parallel Execution & Data Flow Verification");
  const engine = new TaskExecutionEngine();
  const executionOrder: string[] = [];
  const startTimes: Record<string, number> = {};

  const mockExecutor = async (node: TaskNode, upstream: Record<string, string>): Promise<string> => {
    startTimes[node.id] = Date.now();
    executionOrder.push(`START:${node.id}`);
    
    // Simulate non-trivial work
    await new Promise(r => setTimeout(r, 150));

    if (node.id === "task-3-comparative-synthesis") {
      // Verify upstream outputs received from both parallel parent tasks
      if (!upstream["task-1-market-research"] || !upstream["task-2-pricing-intelligence"]) {
        throw new Error("Data dependency error: Upstream outputs not passed to dependent task!");
      }
    }

    executionOrder.push(`FINISH:${node.id}`);
    return `Output for ${node.id} generated at ${new Date().toISOString()}`;
  };

  const executedPlan = await engine.runPlan(plan, mockExecutor);
  console.log("  Execution Log:");
  executionOrder.forEach(log => console.log(`   * ${log}`));

  // Check parallel timing: task-1 and task-2 should have started simultaneously before either finished!
  const task1StartIdx = executionOrder.indexOf("START:task-1-market-research");
  const task2StartIdx = executionOrder.indexOf("START:task-2-pricing-intelligence");
  const task1FinishIdx = executionOrder.indexOf("FINISH:task-1-market-research");
  
  if (task2StartIdx > task1FinishIdx) {
    throw new Error("Parallel execution failed: Task 2 waited for Task 1 instead of running simultaneously!");
  }
  console.log(`  Plan Final Status: "${executedPlan.status}"`);
  console.log("  ✅ TEST 3 PASSED: Independent tasks executed simultaneously in parallel.\n");

  // TEST 4: Human Approval Enforcement (Demonstration 7 Simulation)
  console.log("▶ TEST 4: Human Approval Gate & Rejection Blocking");
  const sensitivePlan = generateTaskPlan(
    "Inspect GitHub repo and apply proposed code bug fixes",
    "conv-102",
    { availableBots: mockBots, preferredLanguage: "hinglish" }
  );

  const approvalNode = sensitivePlan.nodes.find(n => n.approvalRequired);
  if (!approvalNode) {
    throw new Error("Sensitive plan did not flag approvalRequired!");
  }
  console.log(`  Approval Node: "${approvalNode.title}"`);
  console.log(`  Approval Prompt (Hinglish): "${approvalNode.approvalPrompt}"`);

  // First run: Should pause at awaiting-approval
  let awaitingTriggered = false;
  await engine.runPlan(sensitivePlan, async () => "Simulated change", {
    onNodeAwaitingApproval: (n) => {
      awaitingTriggered = true;
      console.log(`  🔔 Human approval requested for: ${n.id}`);
    }
  });

  if (!awaitingTriggered || sensitivePlan.status !== "paused") {
    throw new Error("Approval gate did not pause execution!");
  }

  // Operator REJECTS the sensitive action
  console.log("  ❌ Operator REJECTS the sensitive action.");
  engine.resolveApproval(sensitivePlan.id, approvalNode.id, false, "Rejected: unauthorized write access");

  // Resume plan: Ensure the rejected task is CANCELLED and NEVER executed
  const finalSensitivePlan = await engine.runPlan(sensitivePlan, async () => {
    throw new Error("CRITICAL FAILURE: Rejected action was executed!");
  });

  console.log(`  Approval Node Status: "${approvalNode.status}" (Expected: cancelled)`);
  console.log(`  Approval Error Note: "${approvalNode.error}"`);
  if (approvalNode.status !== "cancelled") {
    throw new Error("Rejection enforcement failed: action was not cancelled!");
  }
  console.log("  ✅ TEST 4 PASSED: Sensitive action successfully blocked upon human rejection.\n");

  // TEST 5: Fault Tolerance & Retries
  console.log("▶ TEST 5: Transient Failure Recovery & Retries");
  const retryPlan = generateTaskPlan("General problem analysis", "conv-103", { availableBots: mockBots });
  let failCount = 0;
  
  await engine.runPlan(retryPlan, async (node) => {
    if (node.id === "task-1-analysis" && failCount < 2) {
      failCount++;
      throw new Error(`Simulated transient network timeout (attempt ${failCount})`);
    }
    return "Recovered and completed.";
  });

  const retriedNode = retryPlan.nodes.find(n => n.id === "task-1-analysis");
  console.log(`  Task retries performed: ${retriedNode?.retryCount} (Max: ${retriedNode?.maxRetries})`);
  console.log(`  Task status after recovery: "${retriedNode?.status}"`);
  if (retriedNode?.status !== "completed" || retriedNode?.retryCount !== 2) {
    throw new Error("Retry failure recovery test failed!");
  }
  console.log("  ✅ TEST 5 PASSED: Engine automatically recovered from transient failures via retries.\n");

  console.log("=====================================================");
  console.log("🎉 ALL TESTS PASSED SUCCESSFULLY! (5/5)");
  console.log("=====================================================");
}

runTestSuite().catch(err => {
  console.error("❌ TEST SUITE FAILED:", err);
  process.exit(1);
});
