// Module B: Dynamic Agent Creation (Agent Factory)
// Creates specialized agents through natural language at runtime without editing source code.
// Provisions persona, model configuration, tools, memory, permissions, and expected output formats.

import type { Bot, ApprovalMode } from "../../shared/types.ts";
import { saveBot, getBot } from "../db.ts";
import { writeMemory } from "../memory-files.ts";
import { publish } from "../bus.ts";
import { routeLLMRequest } from "../models/model-router.ts";

export interface CreateAgentResult {
  bot: Bot;
  reasoning: string;
  source: "llm_generated" | "deterministic_fallback";
}

const AGENT_FACTORY_SYSTEM_PROMPT = `
You are the Chief Agent Architect in OpenCrewBot 2.0.
Your task is to take a natural language user request and design a world-class specialized autonomous agent.
You must return ONLY a clean JSON object conforming to this schema (no markdown fences, no extra text):
{
  "name": "string (Professional, authentic human name or agent name)",
  "handle": "string (unique lowercase alphanumeric slug, e.g. legal-counsel, growth-lead)",
  "title": "string (Professional business job title)",
  "description": "string (Crisp 1-line summary of core capability)",
  "instructions": "string (Comprehensive persona instructions detailing behavioral rules, tone, edge cases, and expected output format)",
  "emoji": "string (single relevant emoji)",
  "color": "string (hex color code, e.g. #4f46e5, #10b981, #f59e0b, #ec4899)",
  "model": "string ('gemini-2.5-flash' or 'qwen/qwen3.8-27b')",
  "tools": {
    "webSearch": boolean,
    "memory": boolean,
    "codeMode": boolean,
    "browser": boolean,
    "askUser": boolean
  },
  "approval": "string ('ask' | 'controlled' | 'full' - Assign 'ask' to legal/finance/code write operations, 'controlled' or 'full' to research/creative)",
  "expectedOutputFormat": "string (Format description, e.g. Executive report with comparison tables, or JSON payload, or bulleted playbook)"
}
`;

/**
 * Deterministic fallback generator for offline testing or when LLM is unavailable.
 */
function generateFallbackAgentSpec(prompt: string): Omit<Bot, "id" | "createdAt" | "pinned"> & { expectedOutputFormat: string } {
  const lower = prompt.toLowerCase();
  const slug = lower.replace(/[^a-z0-9]+/g, "-").slice(0, 20).replace(/^-|-$/g, "") || "specialist";

  if (lower.includes("legal") || lower.includes("contract") || lower.includes("law")) {
    return {
      name: "Advocate Rajiv Counsel",
      handle: `legal-${Date.now().toString().slice(-4)}`,
      title: "Senior Legal & Regulatory Counsel",
      description: "EdTech contracts, liability analysis, and university partnership compliance",
      instructions: "You are a Senior Legal Counsel. Review contracts with meticulous detail, identify liability loopholes, indemnification risks, and ensure regulatory compliance. Always ask for human approval before finalizing binding terms.",
      emoji: "⚖️",
      color: "#4f46e5",
      model: "gemini-2.5-flash",
      tools: { webSearch: true, memory: true, codeMode: false, browser: false, askUser: true },
      connections: [],
      approval: "ask",
      expectedOutputFormat: "Structured Legal Teardown with Risk Matrix and Redline Recommendations",
    };
  }

  if (lower.includes("growth") || lower.includes("marketing") || lower.includes("youtube") || lower.includes("social")) {
    return {
      name: "Maya Growth Specialist",
      handle: `growth-${Date.now().toString().slice(-4)}`,
      title: "Growth Marketing & Content Lead",
      description: "Viral hooks, high-converting social campaigns, and audience engagement",
      instructions: "You are a Growth Marketing Specialist. Create viral hooks, demographic-specific content calendars, and student conversion funnels. Write in an engaging, culturally relevant voice (supporting Hinglish and English).",
      emoji: "🚀",
      color: "#ec4899",
      model: "qwen/qwen3.8-27b",
      tools: { webSearch: true, memory: true, codeMode: false, browser: true, askUser: false },
      connections: [],
      approval: "controlled",
      expectedOutputFormat: "Campaign Calendar with Copy Hooks and Target KPIs",
    };
  }

  // General Universal Agent Fallback
  return {
    name: "Alex Specialist",
    handle: `${slug}-${Date.now().toString().slice(-4)}`,
    title: "Domain Intelligence Specialist",
    description: `Specialized autonomous agent for: ${prompt.slice(0, 40)}`,
    instructions: `You are an expert specialist dedicated to: ${prompt}. Execute assigned tasks with extreme precision, ground all data in facts, and collaborate seamlessly with team members.`,
    emoji: "⚡",
    color: "#10b981",
    model: "gemini-2.5-flash",
    tools: { webSearch: true, memory: true, codeMode: true, browser: false, askUser: true },
    connections: [],
    approval: "controlled",
    expectedOutputFormat: "Structured Business Deliverable with Actionable Insights",
  };
}

/**
 * Creates and activates a new agent at runtime from a natural language description.
 */
export async function createAgentFromPrompt(userPrompt: string): Promise<CreateAgentResult> {
  const botId = `bot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  let spec: ReturnType<typeof generateFallbackAgentSpec>;
  let source: "llm_generated" | "deterministic_fallback" = "deterministic_fallback";
  let reasoning = "Created using deterministic domain intelligence.";

  try {
    const { output } = await routeLLMRequest(
      `User Agent Creation Request: "${userPrompt}"\nGenerate the complete agent JSON specification now.`,
      AGENT_FACTORY_SYSTEM_PROMPT,
      {
        preferredProvider: "groq", // Fast generation
        temperature: 0.15,
        maxTokens: 1024,
      }
    );

    // Clean JSON response (strip any accidental markdown code fences)
    const jsonStr = output.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(jsonStr);

    if (parsed.name && parsed.handle && parsed.instructions) {
      spec = {
        name: String(parsed.name),
        handle: String(parsed.handle).toLowerCase().replace(/[^a-z0-9_-]/g, ""),
        title: String(parsed.title || "Specialist"),
        description: String(parsed.description || ""),
        instructions: String(parsed.instructions),
        emoji: String(parsed.emoji || "🤖"),
        color: String(parsed.color || "#6366f1"),
        model: String(parsed.model || "gemini-2.5-flash"),
        tools: {
          webSearch: Boolean(parsed.tools?.webSearch),
          memory: Boolean(parsed.tools?.memory ?? true),
          codeMode: Boolean(parsed.tools?.codeMode),
          browser: Boolean(parsed.tools?.browser),
          askUser: Boolean(parsed.tools?.askUser ?? true),
        },
        connections: [],
        approval: (["ask", "controlled", "full"].includes(parsed.approval) ? parsed.approval : "controlled") as ApprovalMode,
        expectedOutputFormat: String(parsed.expectedOutputFormat || "Markdown Deliverable"),
      };
      source = "llm_generated";
      reasoning = `Synthesized agent specification using AI model router for requirement: "${userPrompt}".`;
    } else {
      spec = generateFallbackAgentSpec(userPrompt);
    }
  } catch (err) {
    // Graceful fallback to deterministic generator if offline
    spec = generateFallbackAgentSpec(userPrompt);
  }

  // Construct complete Bot object
  const newBot: Bot = {
    id: botId,
    name: spec.name,
    handle: spec.handle,
    title: spec.title,
    description: spec.description,
    instructions: spec.instructions,
    emoji: spec.emoji,
    color: spec.color,
    model: spec.model,
    tools: spec.tools,
    connections: [],
    approval: spec.approval,
    pinned: true,
    createdAt: new Date().toISOString(),
  };

  // 1. Save Bot to SQLite/LibSQL database (Runtime persistence)
  await saveBot(newBot);

  // 2. Initialize Bot's Personal Persistent Workspace Memory (Module E integration)
  const initialMemory = `# ${newBot.name} Workspace (${newBot.title})
- **Handle:** @${newBot.handle}
- **Role:** ${newBot.title}
- **Permissions:** ${newBot.approval.toUpperCase()}
- **Output Standard:** ${spec.expectedOutputFormat}
- **Creation Date:** ${new Date().toISOString().slice(0, 10)}

## Core Directives
${newBot.instructions}
`;
  writeMemory(newBot.id, initialMemory, "Agent factory runtime initialization");

  // 3. Publish Server Event for live UI update
  try {
    publish({ type: "bots-changed" });
  } catch {
    // Fail-safe
  }

  return {
    bot: newBot,
    reasoning,
    source,
  };
}

