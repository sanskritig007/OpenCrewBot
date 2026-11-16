// Module H Verification Test Suite: 3 Working Integrations (Dual-Mode Architecture)
// Verifies GitHub API Connector, Email & Communications Dispatcher, and CRM Webhook Sync.

import {
  getRepoStatus,
  createIssue,
  createPullRequest,
} from "../src/lib/server/integrations/github-connector";
import {
  sendStudentNotification,
  sendCounselorAlert,
  verifyEmailDeliverability,
} from "../src/lib/server/integrations/email-dispatcher";
import {
  syncStudentLead,
  postExecutiveSummary,
  dispatchWebhookEvent,
} from "../src/lib/server/integrations/crm-webhook-sync";
import { assessActionRisk } from "../src/lib/server/approvals/permission-matrix";

async function runTests() {
  console.log("=== RUNNING MODULE H: 3 WORKING INTEGRATIONS TESTS (DUAL-MODE) ===\n");
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
  // TEST 1: GitHub API Connector (Dual-Mode)
  // --------------------------------------------------------------------------
  console.log("--- Test 1: GitHub API Connector (@developer Integration) ---");
  const repoStatus = await getRepoStatus("meetuniversity", "student-portal");
  assert(repoStatus.repo === "meetuniversity/student-portal", "Repo identifier correctly resolved");
  assert(typeof repoStatus.defaultBranch === "string" && repoStatus.defaultBranch.length > 0, "Default branch returned");
  assert(repoStatus.mode === "live" || repoStatus.mode === "simulated", "Dual-mode accurately reported (live or simulated)");

  const newIssue = await createIssue(
    "fix(admissions): validate GRE score input bounds",
    "Students are able to enter out-of-range GRE scores (> 340). Input validation required.",
    ["bug", "admissions-form"]
  );
  assert(newIssue.issueNumber > 0, "GitHub issue created with valid issue number");
  assert(newIssue.state === "open", "Issue status is 'open'");
  assert(newIssue.issueUrl.includes("issues/"), "Issue URL properly structured");

  const newPR = await createPullRequest(
    "feat(portal): add UK CAS document upload verification",
    "feature/uk-cas-checklist",
    "Adds automated document checklist validation for UK student visa applicants."
  );
  assert(newPR.prNumber > 0, "Pull Request created with valid PR number");
  assert(newPR.mergeable === true, "Pull Request marked as mergeable");
  assert(newPR.prUrl.includes("pull/"), "PR URL properly structured");

  // --------------------------------------------------------------------------
  // TEST 2: Email & Communications Engine (@marketing / Sofia Integration)
  // --------------------------------------------------------------------------
  console.log("\n--- Test 2: Email Dispatcher (@marketing Integration & Anti-Hallucination) ---");
  // Deliverability checks
  assert(verifyEmailDeliverability("student@oxford.ac.uk").valid, "Valid university email passes deliverability check");
  assert(!verifyEmailDeliverability("invalid-email").valid, "Malformed email correctly rejected by deliverability check");

  // Anti-Hallucination Guardrails: Missing recipient must throw error!
  let caughtMissingRecipient = false;
  try {
    await sendStudentNotification({
      to: "",
      studentName: "Aditya Kumar",
      subject: "Your Application Status",
      bodyMarkdown: "Hello",
    });
  } catch (err) {
    caughtMissingRecipient = true;
  }
  assert(caughtMissingRecipient, "Anti-hallucination gate prevents email dispatch without explicit recipient");

  // Valid Student Notification Dispatch
  const studentEmailResult = await sendStudentNotification({
    to: "aditya.kumar@gmail.com",
    studentName: "Aditya Kumar",
    universityName: "Imperial College London",
    applicationId: "MU-ICL-2026-904",
    subject: "Action Required: Statement of Purpose Review & Edits",
    bodyMarkdown: "Our senior counselor has reviewed your draft SOP for MSc Advanced Computing.\nPlease see comments and submit revised draft before Friday.",
    urgency: "high",
  });
  assert(studentEmailResult.success === true, "Student notification dispatched successfully");
  assert(studentEmailResult.trackingId.startsWith("MU-"), "Tracking ID generated with '#MU-' prefix");
  assert(studentEmailResult.htmlPreview.includes("Imperial College London"), "Branded HTML email generated with institutional context");
  assert(studentEmailResult.deliveryStatus === "delivered", "Email delivery status confirmed");

  // Counselor Alert Dispatch
  const counselorAlertResult = await sendCounselorAlert({
    counselorEmail: "counselor.lead@meetuniversity.com",
    studentName: "Priya Sharma",
    alertType: "deadline_approaching",
    details: "University of Toronto Fall 2026 early scholarship deadline expires in 48 hours. Missing transcripts.",
  });
  assert(counselorAlertResult.success === true, "Counselor urgent alert dispatched successfully");

  // --------------------------------------------------------------------------
  // TEST 3: CRM & Webhook Realtime Sync (@analyst / Marcus Integration)
  // --------------------------------------------------------------------------
  console.log("\n--- Test 3: CRM Webhook Sync (@analyst & War Rooms Integration) ---");
  const leadSyncResult = await syncStudentLead({
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
  assert(leadSyncResult.delivered === true, "Student lead pipeline stage synced to CRM");
  assert(leadSyncResult.httpStatus === 200, "Webhook endpoint returned HTTP 200");
  assert(typeof leadSyncResult.signature === "string" && leadSyncResult.signature.length === 64, "HMAC-SHA256 signature generated for payload authenticity");

  const execSummaryResult = await postExecutiveSummary({
    roomId: "room-executive",
    title: "Q4 2026 International Student Enrollment & Tier-1 University Strategy",
    consensusSummary: "Executive alignment achieved: Focus marketing campaigns on Germany Public Universities and UK STEM programs.",
    participatingAgents: ["Aria", "Marcus", "Sofia"],
    actionItems: [
      "Launch targeted webinar for German APS certificate requirements",
      "Update SOP review rubric for Russell Group universities",
    ],
  });
  assert(execSummaryResult.delivered === true, "War Room executive summary synced to leadership dashboard");

  // --------------------------------------------------------------------------
  // TEST 4: Permission Matrix Integration Check
  // --------------------------------------------------------------------------
  console.log("\n--- Test 4: Integration with Module G Permission Hierarchy ---");
  const emailRisk = assessActionRisk("send_email", { to: "student@delhi.edu", subject: "Offer letter" }, "ask");
  assert(emailRisk.requiresApproval === true, "Outbound email actions require human approval in Tier 3 ('ask')");

  const prRisk = assessActionRisk("create_pull_request", { title: "feat: add form" }, "controlled");
  assert(prRisk.tierRequired === "controlled" || prRisk.tierRequired === "ask", "Pull request is risk-categorized under controlled/ask policy");

  console.log(`\n==================================================`);
  console.log(`MODULE H TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`==================================================\n`);

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test execution failed with fatal error:", err);
  process.exit(1);
});

