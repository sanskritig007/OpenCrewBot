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

  const model = options.model || "qwen/qwen3.8-27b";
  const url = "https://api.groq.com/openai/v1/chat/completions";

  const messages: Array<{ role: string; content: string }> = [];

  if (options.systemInstruction) {
    messages.push({
      role: "system",
      content: options.systemInstruction.trim(),
    });
  }

  messages.push({
    role: "user",
    content: prompt.trim(),
  });

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
      max_tokens: options.maxTokens ?? 1024,   // Strict token limit to save quota
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("No text content returned from Groq.");
  }

  return content.trim();
}
