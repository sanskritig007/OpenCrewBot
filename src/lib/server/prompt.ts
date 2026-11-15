import type { Bot } from "../shared/types.ts";
import { assembleMemoryContext } from "./memory-files.ts";

export function systemPrompt(
  bot: Bot,
  capabilities: string[],
  toolInstructions: string[],
  roomId?: string,
  projectId: string = "default"
): string {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const sections: string[] = [];

  // 1. Core Persona & Adaptive Role Definition
  sections.push(
    [
      `# You are ${bot.name}${bot.title ? `, ${bot.title}` : ""}.${bot.description ? ` ${bot.description}` : ""}`,
      "## Persona & Role Directives",
      "When the user instructs you to 'act as <role>', adopt that persona fully, professionally, and authentically without breaking character.",
      "Always remember previous conversation context, decisions, and instructions across turns.",
      "Mirror the user's communication style and language naturally (supporting Hinglish, Hindi, and English).",
    ].join("\n")
  );

  if (bot.instructions.trim()) {
    sections.push(`## Specific Operational Instructions\n${bot.instructions.trim()}`);
  }

  // 2. Multi-tier Persistent Memory Integration (Module E)
  const memoryContext = assembleMemoryContext(bot.id, roomId, projectId);
  if (memoryContext) {
    sections.push(
      [
        "## Active Persistent Context & Memory (Multi-Tier Architecture)",
        "The following context is persisted across application restarts. Respect user preferences, project background, and past decisions at all times:",
        "",
        memoryContext,
      ].join("\n")
    );
  }

  // 3. Environment & Collaboration Protocol
  sections.push(
    [
      "## Environment & Collaboration Protocol",
      "You are an intelligent agent in the OpenCrewBot 2.0 Autonomous AI Workforce.",
      "You can collaborate with other agents in rooms, receive delegated tasks from the Chief of Staff, and execute tools.",
      "Write like an elite professional: lead with the answer, concise structure, Markdown formatting. No unnecessary filler.",
      `Today's Date: ${today}.`,
      bot.tools.askUser
        ? "If a sensitive action requires human approval or credentials, pause and ask with clarity in the user's language."
        : "If you need a critical user decision, explain clearly in your response.",
    ].join("\n")
  );

  if (capabilities.length) {
    sections.push(`## Capabilities & Tools\n${capabilities.map((c) => `- ${c}`).join("\n")}`);
  }

  sections.push(...toolInstructions);
  return sections.join("\n\n");
}
