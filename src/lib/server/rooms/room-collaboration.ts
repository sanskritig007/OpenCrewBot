// Module C: Multi-Agent Collaboration & Rooms Service
// Manages collaborative group rooms, multi-agent @mention handoffs,
// loop prevention (MAX_HANDOFF_DEPTH = 3), and shared room memory persistence.

import type { Bot, Room } from "../../shared/types.ts";
import { saveRoom, getRoom, listRooms } from "../db.ts";
import { readRoomMemory, writeRoomMemory } from "../memory-files.ts";
import { routeLLMRequest } from "../models/model-router.ts";

export interface RoomCollaborationMessage {
  id: string;
  senderBotId: string;
  senderName: string;
  senderRole: string;
  content: string;
  engineUsed: string;
  latencyMs: number;
  depth: number;
  targetMention?: string;
  timestamp: string;
}

export interface RoomSessionTrace {
  roomId: string;
  roomName: string;
  topic: string;
  initialPrompt: string;
  messages: RoomCollaborationMessage[];
  totalHandoffs: number;
  loopPrevented: boolean;
  sharedRoomMemory: string;
  finalDeliverableSummary: string;
}

export const PRECONFIGURED_ROOMS: Array<Omit<Room, "createdAt">> = [
  {
    id: "room-executive",
    name: "Executive War Room",
    topic: "Strategic decisions, M&A evaluations, competitor response, and executive planning",
    emoji: "",
    memberIds: ["bot-chief", "bot-researcher", "bot-analyst"],
    leadId: "bot-chief",
    responder: "auto",
    pinned: true,
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
  },
];

/**
 * Ensures all 4 pre-configured collaboration rooms exist in storage.
 */
export async function seedCollaborationRooms(): Promise<Room[]> {
  const existing = await listRooms();
  const existingMap = new Map(existing.map((r) => [r.id, r]));

  const seeded: Room[] = [];
  for (const template of PRECONFIGURED_ROOMS) {
    let room = existingMap.get(template.id);
    if (!room) {
      room = {
        ...template,
        createdAt: new Date().toISOString(),
      };
      await saveRoom(room);
    }
    seeded.push(room);
  }
  return seeded;
}

/**
 * Execute an autonomous multi-agent dialogue in a room.
 * Agents collaborate via @mentions, pass intermediate context, enforce loop prevention,
 * and record key decisions to shared ROOM_MEMORY.md.
 */
export async function executeRoomCollaboration(
  roomId: string,
  userGoal: string,
  roster: Bot[],
  options: {
    maxDepth?: number;
    preferredLanguage?: "hinglish" | "hindi" | "english" | "multilingual";
  } = {}
): Promise<RoomSessionTrace> {
  const room = (await getRoom(roomId)) || PRECONFIGURED_ROOMS.find((r) => r.id === roomId);
  const roomName = room?.name || "Collaboration Room";
  const roomTopic = room?.topic || "Autonomous Team Collaboration";
  const maxDepth = options.maxDepth ?? 3;
  const lang = options.preferredLanguage || "english";

  const botsMap = new Map(roster.map((b) => [b.id, b]));
  const handlesMap = new Map(roster.map((b) => [b.handle.toLowerCase(), b]));

  // Find Lead Agent to initiate discussion
  const leadBot = roster.find((b) => b.id === room?.leadId) || roster[0];
  const messages: RoomCollaborationMessage[] = [];
  let loopPrevented = false;

  // Queue of turns: { bot, prompt, depth, path }
  const queue: Array<{ bot: Bot; contextPrompt: string; depth: number; path: string[] }> = [
    {
      bot: leadBot,
      contextPrompt: userGoal,
      depth: 0,
      path: [leadBot.id],
    },
  ];

  while (queue.length > 0) {
    const { bot, contextPrompt, depth, path } = queue.shift()!;
    const startTime = Date.now();

    // Read current shared room memory
    const roomMem = readRoomMemory(roomId);

    // Format transcript context
    const recentHistory = messages
      .slice(-6)
      .map((m) => `${m.senderName} (@${bot.handle}): ${m.content}`)
      .join("\n\n");

    const systemPrompt = `You are ${bot.name} (${bot.title}), acting in the "${roomName}" collaborative room.
Room Topic: "${roomTopic}".
Language Preference: ${lang.toUpperCase()}.

Role Directives:
${bot.instructions}

Team Members in Room:
${roster.map((b) => `- ${b.name} (@${b.handle}) [${b.title}]`).join("\n")}

Guidelines:
1. Address the goal directly with factual, actionable insight.
2. If you need data, modeling, code review, or approval from a teammate, explicitly @mention their handle (e.g. @researcher, @analyst, @chief, @developer).
3. Be concise and high-density. Avoid meta-conversational filler.
4. When handing off, explicitly state what specific question or deliverable you need from them.`;

    const turnPrompt = recentHistory
      ? `Room History:\n${recentHistory}\n\n[Active Assignment from Team]:\n${contextPrompt}\n\nShared Room Context:\n${roomMem || "(No prior room memory recorded)"}`
      : `Initiate collaboration on the user goal: "${userGoal}".\nAssess initial requirements and hand off tasks to appropriate specialists (@mentions).`;

    let taskCategory: "research" | "analysis" | "synthesis" | "coding" = "synthesis";
    if (bot.handle.includes("research")) taskCategory = "research";
    else if (bot.handle.includes("analyst")) taskCategory = "analysis";
    else if (bot.handle.includes("dev") || bot.handle.includes("code")) taskCategory = "coding";

    const { output: botResponse, providerUsed } = await routeLLMRequest(
      turnPrompt,
      systemPrompt,
      {
        taskCategory,
        temperature: 0.15,
        maxTokens: 512,
      }
    );

    const latencyMs = Date.now() - startTime;

    // Detect @mentions in response
    const mentionedHandles = [...botResponse.matchAll(/@([a-z0-9_-]+)/gi)].map((m) => m[1].toLowerCase());
    const validMentionedBots = mentionedHandles
      .map((h) => handlesMap.get(h))
      .filter((b): b is Bot => Boolean(b && b.id !== bot.id));

    const targetMention = validMentionedBots[0]?.handle;

    messages.push({
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      senderBotId: bot.id,
      senderName: bot.name,
      senderRole: bot.title || "Specialist",
      content: botResponse,
      engineUsed: providerUsed,
      latencyMs,
      depth,
      targetMention,
      timestamp: new Date().toISOString(),
    });

    // Check if we can hand off to next mentioned agent
    if (validMentionedBots.length > 0 && depth < maxDepth) {
      const nextBot = validMentionedBots[0];

      // Loop Prevention Check 1: Direct cyclic ping-pong (A -> B -> A)
      if (path.length >= 2 && path[path.length - 2] === nextBot.id) {
        loopPrevented = true;
        console.log(`[Room Collaboration] Loop prevention triggered: Blocked cyclic loop back to ${nextBot.name}`);
        break;
      }

      // Loop Prevention Check 2: Visited depth limit
      queue.push({
        bot: nextBot,
        contextPrompt: `Teammate ${bot.name} (@${bot.handle}) requested your input on: "${botResponse.slice(0, 300)}..."`,
        depth: depth + 1,
        path: [...path, nextBot.id],
      });
    }
  }

  // Record consensus decision into ROOM_MEMORY.md
  const finalSummary = messages.map((m) => `- **${m.senderName}:** ${m.content.slice(0, 150)}...`).join("\n");
  const decisionLog = `\n### Collaboration Session (${new Date().toLocaleDateString()})\n**Goal:** ${userGoal}\n**Key Consensus & Contributions:**\n${finalSummary}\n`;
  writeRoomMemory(roomId, (readRoomMemory(roomId) + decisionLog).trim(), "Collaborative room session conclusion");

  return {
    roomId,
    roomName,
    topic: roomTopic,
    initialPrompt: userGoal,
    messages,
    totalHandoffs: messages.length - 1,
    loopPrevented,
    sharedRoomMemory: readRoomMemory(roomId),
    finalDeliverableSummary: messages[messages.length - 1]?.content || "",
  };
}

