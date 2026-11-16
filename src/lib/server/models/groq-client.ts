// Module J: Multi-Model Intelligence — High-Speed Groq Client (Llama 3.3 70B)
// Ultra-fast inference with strict token limits and deterministic temperature.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function getGroqApiKey(): string {
  if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY;

  const envPath = resolve(process.cwd(), ".env");
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("GROQ_API_KEY=")) {
        return trimmed.replace("GROQ_API_KEY=", "").trim();
      }
    }
  }
  return "";
}

export interface GroqGenerateOptions {
  model?: string;
  systemInstruction?: string;
  temperature?: number;
  maxTokens?: number;
}

export async function generateWithGroq(
  prompt: string,
  options: GroqGenerateOptions = {}
): Promise<string> {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured in .env");
  }

  const model = options.model || "openai/gpt-oss-20b";
  const url = "https://api.groq.com/openai/v1/chat/completions";

  const messages: Array<{ role: string; content: string }> = [];

  const baseSystem = options.systemInstruction ? options.systemInstruction.trim() : "";
  const completionDirective = "CRITICAL DIRECTIVE: Always provide complete responses. Finish all sentences, bullet points, tables, and sections completely. Never truncate or cut off mid-thought.";
  const combinedSystem = baseSystem ? `${baseSystem}\n\n${completionDirective}` : completionDirective;

  messages.push({
    role: "system",
    content: combinedSystem,
  });

  messages.push({
    role: "user",
    content: prompt.trim(),
  });

  const maxTokens = options.maxTokens ?? 2500;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.15, // Deterministic greedy sampling
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    // If rate-limited (429) or model issue on primary model, fallback to alternative fast model
    if ((response.status === 429 || response.status === 404) && model !== "openai/gpt-oss-120b") {
      console.warn(`[Groq] Issue on ${model} (${response.status}), falling back to openai/gpt-oss-120b...`);
      return generateWithGroq(prompt, { ...options, model: "openai/gpt-oss-120b", maxTokens: Math.max(maxTokens, 2000) });
    }
    throw new Error(`Groq API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("No text content returned from Groq.");
  }

  return content.trim();
}
