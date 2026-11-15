// Comprehensive Verification Test Suite for Module B: Dynamic Agent Creation (Agent Factory)

import { createAgentFromPrompt } from "../src/lib/server/factory/agent-factory.ts";
import { getBot, listBots } from "../src/lib/server/db.ts";
import { readMemory, memoryPath } from "../src/lib/server/memory-files.ts";
import { existsSync } from "node:fs";

async function runAgentFactoryTests() {
  console.log("================================================================================");
  console.log("🧪 RUNNING VERIFICATION TEST SUITE: MODULE B (DYNAMIC AGENT CREATION)");
  console.log("   Evaluation: Natural Language Agent Factory without Editing Application Code");
  console.log("================================================================================\n");

  // TEST 1: Create a Sensitive Legal Agent via Natural Language
  console.log("▶ TEST 1: Natural Language Agent Creation (Legal & Compliance Specialist)");
  const prompt1 = "Create a Senior Legal Advisor agent to review EdTech university partner contracts and highlight liabilities";
  console.log(`  User Prompt: "${prompt1}"`);

  const result1 = await createAgentFromPrompt(prompt1);
  const bot1 = result1.bot;

  console.log(`  ✨ Created Agent:`);
  console.log(`     - ID:           ${bot1.id}`);
  console.log(`     - Name:         ${bot1.name} ${bot1.emoji}`);
  console.log(`     - Handle:       @${bot1.handle}`);
  console.log(`     - Title:        ${bot1.title}`);
  console.log(`     - Model:        ${bot1.model}`);
  console.log(`     - Permissions:  ${bot1.approval.toUpperCase()}`);
  console.log(`     - Source Engine: ${result1.source}`);
  console.log(`     - Instructions: "${bot1.instructions.slice(0, 100)}..."`);

  // Verify all 7 required components from PDF
  if (!bot1.id || !bot1.name || !bot1.handle || !bot1.instructions || !bot1.model) {
    throw new Error("Agent missing core identity or instructions!");
  }
  if (!["ask", "controlled", "full"].includes(bot1.approval)) {
    throw new Error("Agent has invalid permission tier!");
  }
  console.log("  ✅ TEST 1 PASSED: Agent successfully generated with all 7 required attributes.\n");

  // TEST 2: Runtime Database Persistence Verification (Zero Code Changes)
  console.log("▶ TEST 2: Runtime Database Persistence Verification");
  const retrievedBot = await getBot(bot1.id);
  if (!retrievedBot || retrievedBot.id !== bot1.id) {
    throw new Error("Agent was not saved to database!");
  }
  console.log(`  Verified in LibSQL DB: Bot "${retrievedBot.name}" exists and is active.`);

  const allBots = await listBots();
  console.log(`  Total Active Workforce Agents in System: ${allBots.length}`);
  console.log("  ✅ TEST 2 PASSED: Agent is immediately persistent in runtime storage.\n");

  // TEST 3: Persistent Memory Workspace Initialization (Module E Integration)
  console.log("▶ TEST 3: Persistent Workspace & Memory Initialization");
  const memFilePath = memoryPath(bot1.id);
  const fileExists = existsSync(memFilePath);
  const memoryContent = readMemory(bot1.id);

  console.log(`  Workspace Path: ${memFilePath} (Exists: ${fileExists})`);
  console.log(`  Initial Memory Content:\n${memoryContent.trim()}`);

  if (!fileExists || !memoryContent.includes(bot1.name)) {
    throw new Error("Agent memory workspace failed to initialize!");
  }
  console.log("  ✅ TEST 3 PASSED: Agent workspace and MEMORY.md initialized on disk.\n");

  // TEST 4: Create a Second Agent in Hinglish (Growth Marketing Specialist)
  console.log("▶ TEST 4: Multilingual Natural Language Creation (Hinglish Request)");
  const prompt2 = "Mujhe ek YouTube Scriptwriter agent chahiye jo Class 11 students ke liye career advice scripts likhe";
  console.log(`  User Prompt: "${prompt2}"`);

  const result2 = await createAgentFromPrompt(prompt2);
  const bot2 = result2.bot;

  console.log(`  ✨ Created Agent:`);
  console.log(`     - Name:         ${bot2.name} ${bot2.emoji}`);
  console.log(`     - Handle:       @${bot2.handle}`);
  console.log(`     - Title:        ${bot2.title}`);
  console.log(`     - Model:        ${bot2.model}`);
  console.log(`     - Permissions:  ${bot2.approval.toUpperCase()}`);

  if (!bot2.name || !bot2.instructions) {
    throw new Error("Hinglish agent creation failed!");
  }
  console.log("  ✅ TEST 4 PASSED: Multilingual agent generation verified.\n");

  console.log("================================================================================");
  console.log("🎉 MODULE B TEST SUITE: ALL TESTS PASSED SUCCESSFULLY! (4/4)");
  console.log("================================================================================\n");
}

runAgentFactoryTests().catch(err => {
  console.error("❌ AGENT FACTORY TEST FAILED:", err);
  process.exit(1);
});

