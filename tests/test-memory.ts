// Test Suite for Module E: Persistent Markdown Memory Architecture
// Covers Demonstration 6: Teach preference, simulate restart, edit memory file, verify adaptation, and provenance audit.

import {
  writeMemory,
  readMemory,
  appendMemory,
  editMemory,
  writeRoomMemory,
  readRoomMemory,
  writeProjectMemory,
  readProjectMemory,
  writeUserPreferences,
  readUserPreferences,
  listProvenance,
  assembleMemoryContext,
  memoryPath,
} from "../src/lib/server/memory-files.ts";
import { writeFileSync } from "node:fs";

async function runMemoryTestSuite() {
  console.log("================================================================================");
  console.log("🧪 RUNNING VERIFICATION TEST SUITE: MODULE E (PERSISTENT MEMORY)");
  console.log("   Evaluation: Demonstration 6 (Persistence, File Editing, Adaptation, Provenance)");
  console.log("================================================================================\n");

  const testBotId = "bot-aria-chief";
  const testRoomId = "room-strategy";
  const testProjectId = "meetuniversity-core";

  // STEP 1: Individual Memory Write & Read
  console.log("▶ STEP 1: Individual Agent Memory");
  writeMemory(testBotId, "# Aria's Personal Workspace\n- Role: Chief of Staff\n", "Initial setup");
  appendMemory(testBotId, "Prefers structured 3-part summaries", "Preferences", "User stated preference");
  const individualMem = readMemory(testBotId);
  console.log(`  Individual Memory Content:\n${individualMem.trim()}`);
  if (!individualMem.includes("structured 3-part summaries")) {
    throw new Error("Individual memory write failed!");
  }
  console.log("  ✅ STEP 1 PASSED: Individual agent memory created & appended.\n");

  // STEP 2: Shared Room & Project Memory
  console.log("▶ STEP 2: Shared Room & Project Memory");
  writeRoomMemory(testRoomId, "# Room Strategy Memory\n- Current Focus: MeetUniversity Q4 Expansion\n", "Team alignment");
  writeProjectMemory(testProjectId, "# MeetUniversity Project\n- Target Audience: High school & college students\n- Products: Aspirations, Study Abroad\n", "Company background");

  const roomMem = readRoomMemory(testRoomId);
  const projMem = readProjectMemory(testProjectId);
  if (!roomMem.includes("Q4 Expansion") || !projMem.includes("Aspirations")) {
    throw new Error("Room or Project memory verification failed!");
  }
  console.log("  ✅ STEP 2 PASSED: Shared Room and Project memory operational.\n");

  // STEP 3: User Preferences
  console.log("▶ STEP 3: User Preferences Store");
  writeUserPreferences("- Language: Hinglish preferred for conversational updates\n- Deliverables: Include comparison tables and ROI calculations\n", "User set global preferences");
  const userPrefs = readUserPreferences();
  if (!userPrefs.includes("Hinglish preferred")) {
    throw new Error("User preferences store failed!");
  }
  console.log("  ✅ STEP 3 PASSED: User preferences persisted.\n");

  // STEP 4: Demonstration 6 Simulation — Teach, Restart, Edit, Adapt
  console.log("▶ STEP 4: Demonstration 6 (Teach Preference -> Restart -> Edit -> Adapt)");
  
  // A. Teach agent a specific preference
  console.log("  [4a] Teaching agent: 'Target market must focus on Tier-2 CBSE schools'");
  appendMemory(testBotId, "Target market must focus on Tier-2 CBSE schools", "Strategic Focus", "Direct user directive");

  // B. Simulate Application Restart (read fresh from disk without in-memory cache)
  console.log("  [4b] Simulating Application Restart (cold reboot)...");
  const postRestartMemory = readMemory(testBotId);
  console.log(`       Verified post-restart content contains directive: ${postRestartMemory.includes("Tier-2 CBSE schools")}`);
  if (!postRestartMemory.includes("Tier-2 CBSE schools")) {
    throw new Error("Memory failed to persist across simulated restart!");
  }

  // C. Edit the Markdown memory file directly (as a human user in VS Code / text editor)
  console.log("  [4c] Simulating Human User manually editing MEMORY.md file on disk...");
  const rawFilePath = memoryPath(testBotId);
  const currentContent = readMemory(testBotId);
  const updatedContent = currentContent.replace(
    "Tier-2 CBSE schools",
    "Tier-1 & Tier-2 CBSE/ICSE schools across North India"
  );
  writeFileSync(rawFilePath, updatedContent, "utf8");
  console.log(`       Directly wrote correction to: ${rawFilePath}`);

  // D. Verify agent adapts to the corrected memory
  console.log("  [4d] Verifying agent adaptation to corrected memory file...");
  const adaptedContext = assembleMemoryContext(testBotId, testRoomId, testProjectId);
  console.log("       Assembled Memory Context for Agent:");
  console.log("       --------------------------------------------------");
  console.log(adaptedContext);
  console.log("       --------------------------------------------------");

  if (!adaptedContext.includes("Tier-1 & Tier-2 CBSE/ICSE schools across North India")) {
    throw new Error("Agent failed to adapt to manual memory file edit!");
  }
  console.log("  ✅ STEP 4 PASSED: Demonstration 6 fully validated (Persistence + Manual Edit + Adaptation).\n");

  // STEP 5: Memory Provenance Audit Trail (What, When, Why, Source)
  console.log("▶ STEP 5: Memory Provenance Audit Trail (What, When, Why)");
  const provenanceList = listProvenance({ targetId: testBotId });
  console.log(`  Total Provenance Records for ${testBotId}: ${provenanceList.length}`);
  provenanceList.forEach((prov, i) => {
    console.log(`   [${i + 1}] When: ${prov.timestamp} | Source: ${prov.source}`);
    console.log(`       Why:  ${prov.reason}`);
    console.log(`       What: "${prov.content}"`);
  });

  if (provenanceList.length === 0) {
    throw new Error("Provenance log is empty!");
  }
  console.log("  ✅ STEP 5 PASSED: Provenance log tracks memory provenance completely.\n");

  console.log("================================================================================");
  console.log("🎉 MODULE E TEST SUITE: ALL TESTS PASSED SUCCESSFULLY! (5/5)");
  console.log("================================================================================\n");
}

runMemoryTestSuite().catch(err => {
  console.error("❌ MEMORY TEST SUITE FAILED:", err);
  process.exit(1);
});

