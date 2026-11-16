// Script to seed all 8 core workforce bots and 4 collaboration rooms into OpenCrewBot DB
import { saveBot, saveRoom } from "../src/lib/server/db.ts";
import { writeMemory, writeRoomMemory } from "../src/lib/server/memory-files.ts";
import type { Bot, Room } from "../src/lib/shared/types.ts";

const WORKFORCE_BOTS: Bot[] = [
  {
    id: "bot-chief",
    name: "Aria (Chief of Staff)",
    handle: "chief",
    title: "Executive Orchestrator",
    description: "Orchestrates workforce, breaks down goals into DAGs, coordinates deliverables",
    instructions: "You are Aria, Chief of Staff. You break down goals, coordinate specialists via @mentions, enforce quality standards, and synthesize final business deliverables.",
    emoji: "",
    color: "#6366f1",
    model: "gemini-2.5-flash",
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
    instructions: "You are Zara, Intelligence & Insights Lead. You gather factual market intelligence, analyze competitors, uncover customer trends, and provide source-grounded insights.",
    emoji: "",
    color: "#3b82f6",
    model: "qwen/qwen3.8-27b",
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
    description: "Spreadsheets, financial models, pricing comparisons, unit economics",
    instructions: "You are Marcus, Commercial & Data Analyst. You build financial models, calculate CAC/LTV, model unit economics, and analyze dataset anomalies with statistical rigor.",
    emoji: "",
    color: "#10b981",
    model: "gemini-2.5-flash",
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
    description: "Audience targeting, student outreach, campaigns, campus distribution",
    instructions: "You are Sofia, Growth & Campaign Lead. You design student acquisition campaigns, campus ambassador programs, referral incentives, and high-converting marketing funnels.",
    emoji: "",
    color: "#ec4899",
    model: "gemini-2.5-flash",
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
    description: "GitHub inspection, security audits, automated refactoring, bug fixes",
    instructions: "You are Dev, Senior Software Engineer. You inspect repositories, identify security vulnerabilities (OWASP), optimize latency, and provide refactoring diffs.",
    emoji: "",
    color: "#f59e0b",
    model: "qwen/qwen3.8-27b",
    tools: { webSearch: false, memory: true, codeMode: true, browser: false, askUser: true },
    connections: [],
    approval: "ask",
    pinned: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "bot-writer",
    name: "Maya (Content Specialist)",
    handle: "writer",
    title: "Executive Content & Scriptwriter",
    description: "Scripts, pitch deck narratives, blog posts, high-converting copy",
    instructions: "You are Maya, Executive Content & Scriptwriter. You craft clear, persuasive narratives, YouTube scripts, email campaigns, and pitch deck presentations.",
    emoji: "",
    color: "#14b8a6",
    model: "gemini-2.5-flash",
    tools: { webSearch: false, memory: true, codeMode: false, browser: false, askUser: false },
    connections: [],
    approval: "controlled",
    pinned: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: "bot-legal",
    name: "Advocate Rajiv (Legal Counsel)",
    handle: "legal",
    title: "Senior Legal & Regulatory Counsel",
    description: "Contract teardowns, liabilities, GDPR/FERPA compliance, governance",
    instructions: "You are Advocate Rajiv, Senior Legal Counsel. You review partnership agreements, highlight liability loopholes, evaluate regulatory compliance, and guard against contractual risks.",
    emoji: "",
    color: "#8b5cf6",
    model: "gemini-2.5-flash",
    tools: { webSearch: false, memory: true, codeMode: false, browser: false, askUser: true },
    connections: [],
    approval: "ask",
    pinned: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: "bot-ops",
    name: "Vikram (Operations Specialist)",
    handle: "ops",
    title: "Operations & Delivery Lead",
    description: "Process automation, partner logistics, vendor SLAs, KPI tracking",
    instructions: "You are Vikram, Operations & Delivery Lead. You manage 3PL logistics, monitor vendor SLAs, resolve operational bottlenecks, and streamline cross-functional delivery.",
    emoji: "",
    color: "#64748b",
    model: "qwen/qwen3.8-27b",
    tools: { webSearch: false, memory: true, codeMode: false, browser: false, askUser: false },
    connections: [],
    approval: "controlled",
    pinned: false,
    createdAt: new Date().toISOString(),
  },
];

const WORKFORCE_ROOMS: Room[] = [
  {
    id: "room-executive",
    name: "Executive War Room",
    topic: "Strategic decisions, M&A evaluations, competitor response, and executive planning",
    emoji: "",
    memberIds: ["bot-chief", "bot-researcher", "bot-analyst"],
    leadId: "bot-chief",
    responder: "auto",
    pinned: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "room-engineering",
    name: "Engineering & Security War Room",
    topic: "Code reviews, vulnerability remediation, architecture refactoring, and CI/CD stability",
    emoji: "",
    memberIds: ["bot-developer", "bot-chief"],
    leadId: "bot-developer",
    responder: "auto",
    pinned: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "room-growth",
    name: "Campus Outreach & Growth Room",
    topic: "Student campaigns, campus ambassador gamification, social distribution, and acquisition",
    emoji: "",
    memberIds: ["bot-marketing", "bot-writer", "bot-analyst"],
    leadId: "bot-marketing",
    responder: "auto",
    pinned: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "room-legal",
    name: "Legal & Compliance Governance Room",
    topic: "University partnership contract teardowns, regulatory risk, liabilities, and GDPR/data privacy",
    emoji: "",
    memberIds: ["bot-legal", "bot-ops", "bot-chief"],
    leadId: "bot-legal",
    responder: "auto",
    pinned: true,
    createdAt: new Date().toISOString(),
  },
];

async function seed() {
  console.log("Seeding all 8 Workforce Bots into LibSQL Database...");
  for (const bot of WORKFORCE_BOTS) {
    await saveBot(bot);
    writeMemory(
      bot.id,
      `# ${bot.name} Workspace (${bot.title})\n- Handle: @${bot.handle}\n- Role: ${bot.title}\n- Approval Tier: ${bot.approval.toUpperCase()}\n\n## Core Directives\n${bot.instructions}\n`,
      "Workforce seeding initialization"
    );
    console.log(`- Seeded Bot: ${bot.name} (@${bot.handle}) [${bot.approval.toUpperCase()}]`);
  }

  console.log("\nSeeding all 4 Collaboration Rooms into LibSQL Database...");
  for (const room of WORKFORCE_ROOMS) {
    await saveRoom(room);
    writeRoomMemory(
      room.id,
      `# ${room.name} Workspace\n- Topic: ${room.topic}\n- Lead: ${room.leadId}\n- Members: ${room.memberIds.join(", ")}\n`,
      "Room seeding initialization"
    );
    console.log(`- Seeded Room: ${room.name} (${room.id})`);
  }

  console.log("\nAll 8 Workforce Bots and 4 Collaboration Rooms successfully seeded into database!");
}

seed().catch(console.error);

