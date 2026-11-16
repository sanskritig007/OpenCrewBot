// Module G Verification Test Suite: 3-Tier Permissions & Approval Centre
// Tests Tier 1 (full), Tier 2 (controlled), Tier 3 (ask), Anti-Hallucination Email Verification,
// and the complete Approval/Rejection Audit Trail.

import { assessActionRisk } from "../src/lib/server/approvals/permission-matrix";
import { evaluateAndQueueApproval, resolveApproval, getPendingApprovals } from "../src/lib/server/approvals/approval-centre";
import { getAuditHistory } from "../src/lib/server/approvals/audit-logger";

async function runTests() {
  console.log("=== RUNNING MODULE G: 3-TIER PERMISSIONS & APPROVAL CENTRE TESTS ===\n");
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}${detail ? ` - Detail: ${detail}` : ""}`);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: Tier 1 ('full') - Read-only actions execute autonomously
  // --------------------------------------------------------------------------
  console.log("--- Test 1: Tier 1 ('full') Autonomous Read Actions ---");
  const readAssessment = assessActionRisk("web_search", { query: "UK Student Visa policy 2026" }, "ask");
  assert(!readAssessment.requiresApproval, "Read actions (web_search) never require approval even if bot is on 'ask'");
  assert(readAssessment.riskLevel === "low", "Read actions are classified as 'low' risk");
  assert(readAssessment.tierRequired === "full", "Read actions require Tier 1 ('full')");

  // --------------------------------------------------------------------------
  // TEST 2: Tier 3 ('ask') - Sensitive Actions Pause for Human Approval
  // --------------------------------------------------------------------------
  console.log("\n--- Test 2: Tier 3 ('ask') Sensitive Action Halting ---");
  const pushAssessment = assessActionRisk("github_push_main", { branch: "main", commit: "deploy" }, "controlled");
  assert(pushAssessment.requiresApproval, "Direct code push to main requires explicit approval in 'controlled' tier");
  assert(pushAssessment.riskLevel === "critical", "Main branch code mutations are classified as 'critical' risk");
  assert(pushAssessment.tierRequired === "ask", "Code push requires Tier 3 ('ask')");

  // --------------------------------------------------------------------------
  // TEST 3: Anti-Hallucination Gate on Outbound Emails (Missing Recipient/Context)
  // --------------------------------------------------------------------------
  console.log("\n--- Test 3: Anti-Hallucination Gate on Incomplete Emails ---");
  // Case A: Missing recipient & context -> must halt for clarification!
  const blindEmailEval = evaluateAndQueueApproval(
    "conv-test-1",
    "bot-marketing",
    "call-blind-email",
    "send_email",
    { subject: "Hi" }, // Missing recipient and proper context!
    "ask"
  );
  assert(blindEmailEval.clarificationRequired === true, "Blind email without recipient halts with clarificationRequired = true");
  assert(
    (blindEmailEval.clarificationQuestions?.length ?? 0) >= 2,
    "Anti-hallucination gate asks for recipient and specific context instead of guessing"
  );

  // Case B: Full context provided -> passes clarification check and moves to Human Approval Card!
  const verifiedEmailEval = evaluateAndQueueApproval(
    "conv-test-2",
    "bot-marketing",
    "call-verified-email",
    "send_email",
    {
      to: "admissions@oxford.ac.uk",
      recipient: "Oxford University Admissions Office",
      context: "Fall 2026 MSc Advanced Computer Science scholarship deadline inquiry for student #OX-902",
      subject: "Scholarship Deadline Clarification - Application #OX-902",
    },
    "ask"
  );
  assert(!verifiedEmailEval.clarificationRequired, "Verified email with context passes clarification gate");
  assert(!verifiedEmailEval.approvedDirectly, "Verified email halts for human authorization (Tier 3)");
  assert(verifiedEmailEval.request?.status === "pending", "Pending approval request is queued for operator");

  // --------------------------------------------------------------------------
  // TEST 4: Human Approval Lifecycle (Approve Flow)
  // --------------------------------------------------------------------------
  console.log("\n--- Test 4: Human Approval Lifecycle (Approve) ---");
  const toolCallId1 = "call-verified-email";
  const approveResult = await resolveApproval(toolCallId1, "approved", "Approved by Admissions Counselor");
  assert(approveResult.success === true, "Approval resolution succeeds");
  assert(approveResult.request?.status === "approved", "Request status transitioned to 'approved'");
  assert(approveResult.auditEntry?.decision === "approved", "Audit entry generated with 'approved' status");

  // --------------------------------------------------------------------------
  // TEST 5: Rejection Recovery & Audit Trail Verification
  // --------------------------------------------------------------------------
  console.log("\n--- Test 5: Rejection Recovery & Audit Trail Verification ---");
  // Queue a risky action
  evaluateAndQueueApproval(
    "conv-test-3",
    "bot-developer",
    "call-drop-database",
    "delete_file",
    { path: "/data/production.db" },
    "ask"
  );

  const rejectResult = await resolveApproval("call-drop-database", "rejected", "Rejected: Unsafe database deletion");
  assert(rejectResult.success === true, "Rejection resolution succeeds without throwing error");
  assert(rejectResult.request?.status === "rejected", "Request status transitioned to 'rejected'");
  assert(
    rejectResult.recoveryGuidance !== undefined && rejectResult.recoveryGuidance.includes("declined"),
    "Rejection provides safe recovery guidance instead of crashing"
  );

  // Verify Audit Log records both approved and rejected decisions
  const auditLogs = await getAuditHistory();
  assert(auditLogs.length >= 2, "Audit log contains all recorded operator decisions");
  const approvedLog = auditLogs.find((l) => l.actionName === "send_email");
  const rejectedLog = auditLogs.find((l) => l.actionName === "delete_file");
  assert(approvedLog?.decision === "approved", "Audit log correctly recorded approval decision");
  assert(rejectedLog?.decision === "rejected", "Audit log correctly recorded rejection decision");

  console.log(`\n==================================================`);
  console.log(`MODULE G TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`==================================================\n`);

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test execution failed with fatal error:", err);
  process.exit(1);
});

