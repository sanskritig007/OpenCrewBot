import assert from "node:assert/strict";
import {
  initScheduler,
  listWorkflows,
  setWorkflowStatus,
  triggerWorkflow,
  DEFAULT_WORKFLOWS,
} from "../src/lib/server/scheduler/workflow-scheduler";

async function runSchedulerTests() {
  console.log("=== RUNNING MODULE I: SCHEDULED WORKFLOWS & BACKGROUND AUTOMATION TESTS ===");

  // Test 1: Initialization & Seed Verification
  console.log("\n--- Test 1: Workflow Initialization & Seeding ---");
  await initScheduler();
  const workflows = await listWorkflows();
  assert.ok(workflows.length >= 3, `Should have at least 3 default workflows, found ${workflows.length}`);
  console.log(`[PASS] Initialized scheduler with ${workflows.length} workflows in LibSQL database`);

  const ids = workflows.map((w) => w.id);
  assert.ok(ids.includes("job-market-sweep"), "Must contain 'job-market-sweep'");
  assert.ok(ids.includes("job-admissions-audit"), "Must contain 'job-admissions-audit'");
  assert.ok(ids.includes("job-github-sentinel"), "Must contain 'job-github-sentinel'");
  console.log("[PASS] All 3 core MeetUniversity background jobs seeded correctly:");
  for (const wf of workflows) {
    console.log(`  - [${wf.id}] "${wf.title}" (${wf.cronSchedule}) -> ${wf.targetType}:${wf.targetId}`);
  }

  // Test 2: Workflow Lifecycle & Pause/Resume
  console.log("\n--- Test 2: Workflow Status Toggle (Pause / Resume) ---");
  const initialJob = workflows.find((w) => w.id === "job-market-sweep");
  assert.ok(initialJob, "job-market-sweep must exist");

  const pauseOk = await setWorkflowStatus("job-market-sweep", "paused");
  assert.equal(pauseOk, true, "Should successfully pause workflow");
  let updatedList = await listWorkflows();
  let pausedJob = updatedList.find((w) => w.id === "job-market-sweep");
  assert.equal(pausedJob?.status, "paused", "Status should be paused");
  console.log("[PASS] Workflow 'job-market-sweep' successfully paused");

  const resumeOk = await setWorkflowStatus("job-market-sweep", "active");
  assert.equal(resumeOk, true, "Should successfully resume workflow");
  updatedList = await listWorkflows();
  let resumedJob = updatedList.find((w) => w.id === "job-market-sweep");
  assert.equal(resumedJob?.status, "active", "Status should be active");
  console.log("[PASS] Workflow 'job-market-sweep' successfully resumed to active");

  // Test 3: Autonomous Workflow Trigger
  console.log("\n--- Test 3: Autonomous Workflow Execution Trigger ---");
  const prevRunCount = resumedJob?.runCount || 0;
  const execution = await triggerWorkflow("job-market-sweep");
  assert.equal(execution.workflowId, "job-market-sweep");
  assert.equal(execution.status, "dispatched");
  assert.ok(execution.conversationId.includes("room:room-growth") || execution.conversationId.includes("room-growth"));
  console.log(`[PASS] Workflow triggered: ${execution.title}`);
  console.log(`  - Dispatched to: ${execution.conversationId}`);
  console.log(`  - Triggered at: ${execution.triggeredAt}`);
  console.log(`  - Execution note: ${execution.summary}`);

  // Test 4: Database Execution Metrics Update
  console.log("\n--- Test 4: Execution Metrics & State Persistence ---");
  const postExecutionList = await listWorkflows();
  const postJob = postExecutionList.find((w) => w.id === "job-market-sweep");
  assert.equal(postJob?.runCount, prevRunCount + 1, "Run count should increment by 1");
  assert.ok(postJob?.lastRunAt, "lastRunAt must be populated");
  assert.ok(postJob?.nextRunAt, "nextRunAt must be populated");
  console.log(`[PASS] Run count incremented from ${prevRunCount} -> ${postJob?.runCount}`);
  console.log(`[PASS] Recorded last execution timestamp: ${postJob?.lastRunAt}`);

  // Test 5: GitHub Sentinel Workflow Trigger
  console.log("\n--- Test 5: Nightly GitHub Sentinel Workflow Trigger ---");
  const ghExecution = await triggerWorkflow("job-github-sentinel");
  assert.equal(ghExecution.workflowId, "job-github-sentinel");
  assert.equal(ghExecution.status, "dispatched");
  assert.ok(ghExecution.conversationId.includes("bot-developer"));
  console.log(`[PASS] GitHub Sentinel triggered: ${ghExecution.title}`);
  console.log(`  - Dispatched to: ${ghExecution.conversationId}`);

  console.log("\n==================================================");
  console.log("MODULE I TEST RESULTS: ALL 5/5 PASSED SUCCESSFULLY");
  console.log("==================================================");
}

runSchedulerTests().catch((err) => {
  console.error("Scheduler test failed:", err);
  process.exit(1);
});

