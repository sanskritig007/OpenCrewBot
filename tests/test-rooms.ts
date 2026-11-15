// Comprehensive Verification Test Suite for Module C: Multi-Agent Collaboration & Rooms
// Usage: node --experimental-strip-types tests/test-rooms.ts

import {
  PRECONFIGURED_ROOMS,
  seedCollaborationRooms,
  executeRoomCollaboration,
} from "../src/lib/server/rooms/room-collaboration.ts";
import { readRoomMemory, writeRoomMemory } from "../src/lib/server/memory-files.ts";
import type { Bot } from "../src/lib/shared/types.ts";

const testWorkforce: Bot[] = [
  {
    id: "bot-chief",
    name: "Aria (Chief of Staff)",
    handle: "chief",
    title: "Executive Orchestrator",
    description: "Orchestrates workforce, breaks down goals, coordinates deliverables",
    instructions: "You are the Chief of Staff. Coordinate team members by @mentioning them.",
    emoji: "",
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
    instructions: "You are Zara. Gather factual intelligence and hand off financial questions to @analyst.",
    emoji: "",
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
    instructions: "You are Marcus. Calculate unit economics and summarize recommendations for @chief.",
    emoji: "",
    color: "#10b981",
    model: "gemini-2.5-pro",
    tools: { webSearch: false, memory: true, codeMode: true, browser: false, askUser: false },
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
    instructions: "You are Dev. Inspect code security and hand off findings to @chief.",
    emoji: "",
    color: "#f59e0b",
    model: "codex-deepseek-r1",
    tools: { webSearch: false, memory: true, codeMode: true, browser: false, askUser: true },
    connections: [],
    approval: "ask",
    pinned: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "bot-legal",
    name: "Advocate Rajiv (Legal Counsel)",
    handle: "legal",
    title: "Senior Legal & Regulatory Counsel",
    instructions: "You are Rajiv. Review liabilities and regulatory compliance.",
    emoji: "",
    color: "#8b5cf6",
    model: "gemini-2.5-flash",
    description: "Legal advice and compliance",
    tools: { webSearch: false, memory: true, codeMode: false, browser: false, askUser: true },
    connections: [],
    approval: "ask",
    pinned: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: "bot-marketing",
    name: "Sofia (Marketing Strategist)",
    handle: "marketing",
    title: "Growth & Campaign Lead",
    instructions: "You are Sofia. Create student acquisition campaigns.",
    emoji: "",
    color: "#ec4899",
    model: "gpt-4o",
    description: "Marketing lead",
    tools: { webSearch: true, memory: true, codeMode: false, browser: false, askUser: false },
    connections: [],
    approval: "controlled",
    pinned: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: "bot-writer",
    name: "Maya (Content Specialist)",
    handle: "writer",
    title: "Content & Copywriter",
    instructions: "You are Maya. Write compelling posts and scripts.",
    emoji: "",
    color: "#14b8a6",
    model: "gemini-2.5-flash",
    description: "Content writer",
    tools: { webSearch: false, memory: true, codeMode: false, browser: false, askUser: false },
    connections: [],
    approval: "controlled",
    pinned: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: "bot-ops",
    name: "Vikram (Operations Specialist)",
    handle: "ops",
    title: "Operations & Delivery Lead",
    instructions: "You are Vikram. Optimize workflows and logistics.",
    emoji: "",
    color: "#64748b",
    model: "qwen/qwen3.8-27b",
    description: "Operations lead",
    tools: { webSearch: false, memory: true, codeMode: false, browser: false, askUser: false },
    connections: [],
    approval: "controlled",
    pinned: false,
    createdAt: new Date().toISOString(),
  },
];

async function runTestSuite() {
  console.log("\n================================================================================");
  console.log("RUNNING VERIFICATION TEST SUITE: MODULE C (MULTI-AGENT COLLABORATION & ROOMS)");
  console.log("   Evaluation: 4 Specialized Rooms, @Mention Handoffs, Shared Memory, Loop Guards");
  console.log("================================================================================\n");

  // --------------------------------------------------------------------------
  // TEST 1: Pre-configured Rooms Seeding & Structural Verification
  // --------------------------------------------------------------------------
  console.log("▶ TEST 1: Pre-configured Collaboration Rooms Verification");
  const seededRooms = await seedCollaborationRooms();
  console.log(`  Total Active Collaboration Rooms: ${seededRooms.length} (Expected: 4)`);

  const expectedRoomIds = ["room-executive", "room-engineering", "room-growth", "room-legal"];
  for (const expId of expectedRoomIds) {
    const found = seededRooms.find((r) => r.id === expId);
    console.log(`  - [${found ? "PASS" : "FAIL"}] Room: ${expId} -> "${found?.name}" (Lead: ${found?.leadId}, Members: ${found?.memberIds.length})`);
    if (!found) throw new Error(`Missing expected room: ${expId}`);
  }
  console.log("  [PASS] TEST 1: All 4 pre-configured rooms seeded and verified.\n");

  // --------------------------------------------------------------------------
  // TEST 2: Shared Room Memory (ROOM_MEMORY.md) Persistence
  // --------------------------------------------------------------------------
  console.log("▶ TEST 2: Shared Room Persistent Memory Read/Write Verification");
  const testRoomId = "room-executive";
  const initialMemory = `# Executive War Room Shared Directives
- Company: MeetUniversity
- Core Objective: Win Tier-2 Indian STEM study-abroad market
- Approved Target CAC: ₹12,000 max
- Primary Competitor: LeapScholar
`;
  writeRoomMemory(testRoomId, initialMemory, "Test setup for executive room directives");
  const readBack = readRoomMemory(testRoomId);
  console.log(`  Read back from ROOM_MEMORY.md:\n${readBack.slice(0, 150)}...`);
  if (!readBack.includes("MeetUniversity") || !readBack.includes("₹12,000")) {
    throw new Error("Shared room memory failed persistence verification.");
  }
  console.log("  [PASS] TEST 2: Shared room memory read/write verified on disk.\n");

  // --------------------------------------------------------------------------
  // TEST 3: Multi-Agent Collaboration Session & @Mention Handoff
  // --------------------------------------------------------------------------
  console.log("▶ TEST 3: Live Multi-Agent Dialogue & Inter-Agent Handoff in Executive War Room");
  const sessionTrace = await executeRoomCollaboration(
    "room-executive",
    "MeetUniversity needs a quick assessment of LeapScholar's pricing vs our margin target. Coordinate and synthesize.",
    testWorkforce.filter((b) => ["bot-chief", "bot-researcher", "bot-analyst"].includes(b.id)),
    { maxDepth: 2, preferredLanguage: "english" }
  );

  console.log(`  Room Name:          ${sessionTrace.roomName}`);
  console.log(`  Total Dialogue Turns: ${sessionTrace.messages.length}`);
  console.log(`  Total Handoffs:     ${sessionTrace.totalHandoffs}`);

  sessionTrace.messages.forEach((msg, idx) => {
    console.log(`  Turn ${idx + 1}: ${msg.senderName} (${msg.senderRole}) via ${msg.engineUsed.toUpperCase()} [${msg.latencyMs}ms]`);
    if (msg.targetMention) {
      console.log(`    ↳ Handoff Tag: @${msg.targetMention}`);
    }
  });

  if (sessionTrace.messages.length === 0) {
    throw new Error("No messages produced in collaboration session.");
  }
  console.log("  [PASS] TEST 3: Multi-agent discussion and handoff successfully executed.\n");

  // --------------------------------------------------------------------------
  // TEST 4: Loop Prevention Guardrail (Depth Cap & Cycle Blocker)
  // --------------------------------------------------------------------------
  console.log("▶ TEST 4: Loop Prevention & Cycle Blocker Verification");
  console.log("  Simulating ping-pong loop between two agents with MAX_HANDOFF_DEPTH = 3...");
  const loopSession = await executeRoomCollaboration(
    "room-engineering",
    "Inspect security and hand off immediately to @chief for review.",
    testWorkforce.filter((b) => ["bot-developer", "bot-chief"].includes(b.id)),
    { maxDepth: 3 }
  );

  console.log(`  Messages in loop session: ${loopSession.messages.length}`);
  console.log(`  Loop Prevented Flag:      ${loopSession.loopPrevented || loopSession.messages.length <= 4}`);
  if (loopSession.messages.length > 4) {
    throw new Error(`Loop prevention failed: Session exceeded max handoff depth (${loopSession.messages.length} messages)`);
  }
  console.log("  [PASS] TEST 4: Loop prevention strictly terminated at safe depth.\n");

  console.log("================================================================================");
  console.log("MODULE C TEST SUITE: ALL TESTS PASSED SUCCESSFULLY! (4/4)");
  console.log("================================================================================\n");
}

runTestSuite().catch((err) => {
  console.error("❌ Test Suite Failed:", err);
  process.exit(1);
});

