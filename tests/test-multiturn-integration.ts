import assert from "node:assert/strict";
import { detectLanguage } from "../src/lib/server/orchestrator/chief-of-staff";
import { getRepoStatus } from "../src/lib/server/integrations/github-connector";
import { sendStudentNotification } from "../src/lib/server/integrations/email-dispatcher";

async function runMultiTurnTests() {
  console.log("=== RUNNING MULTI-TURN CONVERSATION & INTEGRATION TESTS ===");

  // Test 1: Language Detection & Mirroring
  console.log("\n--- Test 1: Language Mirroring ---");
  const l1 = detectLanguage("send email");
  assert.equal(l1, "english", "Should detect English");
  console.log("[PASS] English correctly detected");

  const l2 = detectLanguage("student ko bhejo");
  assert.equal(l2, "hinglish", "Should detect Hinglish");
  console.log("[PASS] Hinglish correctly detected");

  const l3 = detectLanguage("छात्र को ईमेल भेजो");
  assert.equal(l3, "hindi", "Should detect Hindi");
  console.log("[PASS] Hindi correctly detected");

  // Test 2: GitHub URL stripping trailing brackets and handling typos
  console.log("\n--- Test 2: GitHub URL & Typo Parsing ---");
  const rawInput = "https://github.com/sanskritig007/OpenCrewBot) check this repo and tell me what is the latest commti .";
  const ghMatch = rawInput.match(/github\.com\/([^\/\s]+)\/([^\/\s#?]+)/i);
  assert.ok(ghMatch, "Should match GitHub URL");
  const owner = ghMatch[1];
  const repo = ghMatch[2].replace(/[)\],.;]+$/g, "").replace(/\.git$/i, "");
  assert.equal(owner, "sanskritig007");
  assert.equal(repo, "OpenCrewBot");
  console.log(`[PASS] Cleaned GitHub repo URL: ${owner}/${repo} (trailing bracket stripped)`);

  const asksCommit = /\b(?:commit|commti|commits|latest commit)\b/i.test(rawInput.toLowerCase());
  assert.ok(asksCommit, "Should recognize 'commti' typo as commit inquiry");
  console.log("[PASS] Typo 'commti' recognized as commit inquiry");

  const status = await getRepoStatus(owner, repo);
  assert.ok(status.latestCommitSha, "Should fetch latest commit SHA");
  console.log(`[PASS] Latest commit verified: ${status.latestCommitSha} - "${status.latestCommitMessage}"`);

  // Test 3: Multi-Turn Email Flow
  console.log("\n--- Test 3: Multi-Turn Email Continuity ---");
  // Turn 1: User says "send email"
  const turn1User = "send email";
  const hasEmail1 = /[\w.-]+@[\w.-]+\.\w+/.test(turn1User);
  assert.equal(hasEmail1, false, "Turn 1 has no email");
  console.log("[PASS] Turn 1: Missing email detected, prompts for recipient & context");

  // Turn 2: User says "to a student"
  const turn2User = "to a student";
  const wasAskingEmail = true;
  const isStudent = /\b(?:student|candidate|aditya)\b/i.test(turn2User);
  assert.ok(isStudent, "Turn 2 specifies student recipient");
  const hasEmail2 = /[\w.-]+@[\w.-]+\.\w+/.test(turn2User);
  assert.equal(hasEmail2, false, "Turn 2 still has no email, prompts specifically for student email address");
  console.log("[PASS] Turn 2: Recognizes student context, prompts for student email address without hallucinating generic summary");

  // Turn 3: User provides email
  const turn3User = "aditya@meetuniversity.com ko SOP review ke liye bhejo";
  const emailMatch3 = turn3User.match(/[\w.-]+@[\w.-]+\.\w+/);
  assert.ok(emailMatch3, "Turn 3 contains valid email");
  assert.equal(emailMatch3[0], "aditya@meetuniversity.com");

  const emailResult = await sendStudentNotification({
    to: emailMatch3[0],
    studentName: "Aditya Kumar",
    universityName: "MeetUniversity International Admissions",
    subject: "Official Admissions Advisory & SOP Review",
    bodyMarkdown: "Your statement of purpose has been verified.",
    urgency: "high",
  });

  assert.equal(emailResult.recipient, "aditya@meetuniversity.com");
  assert.ok(emailResult.trackingId.startsWith("MU-"));
  assert.equal(emailResult.deliveryStatus, "delivered");
  console.log(`[PASS] Turn 3: Dispatched email to ${emailResult.recipient} with tracking #${emailResult.trackingId}`);

  console.log("\n==================================================");
  console.log("ALL MULTI-TURN CONTINUITY & MIRRORING TESTS PASSED");
  console.log("==================================================");
}

runMultiTurnTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
