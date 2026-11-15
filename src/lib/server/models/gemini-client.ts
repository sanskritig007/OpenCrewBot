// Module J: Multi-Model Intelligence — Real Gemini Provider Client
// Calls Google Gemini API directly with system instructions, user prompts,
// and handles structured responses for arbitrary user requests.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function getApiKey(): string {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  if (process.env.GOOGLE_API_KEY) return process.env.GOOGLE_API_KEY;

  // Try reading from .env directly if process.env hasn't loaded it
  const envPath = resolve(process.cwd(), ".env");
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("GEMINI_API_KEY=")) {
        return trimmed.replace("GEMINI_API_KEY=", "").trim();
      }
    }
  }
  return "";
}

export interface GeminiGenerateOptions {
  model?: string;
  systemInstruction?: string;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
}

const ANTI_HALLUCINATION_GUARDRAILS = `
[STRICT OPERATIONAL & ANTI-HALLUCINATION DIRECTIVES]
1. Absolute Factual Grounding: Never fabricate data, statistics, URLs, citations, or pricing. If exact numbers are variable across regions/institutions, provide realistic verified ranges and explicitly state assumptions.
2. Zero Fluff & No Meta-Conversational Filler: Do NOT write boilerplate intros or outros (e.g. "Sure, I'd be happy to help", "As an AI...", "I hope this assists you"). Lead immediately with high-density executive information.
3. Structured Formatting: Use markdown tables, structured bullet points, and clear bold headings.
4. Language Precision: Respect the detected conversation language (Hinglish/Hindi/English) naturally and consistently.
`;

export async function generateWithGemini(
  prompt: string,
  options: GeminiGenerateOptions = {}
): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in .env");
  }

  const model = options.model || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  // Add user prompt
  contents.push({
    role: "user",
    parts: [{ text: prompt }]
  });

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: options.temperature ?? 0.15, // Low temperature for highest probability, deterministic factual tokens
      topP: options.topP ?? 0.85,               // Truncate low-probability hallucination tail
      maxOutputTokens: options.maxOutputTokens ?? 2048,
    }
  };

  const combinedSystemInstruction = options.systemInstruction
    ? `${options.systemInstruction.trim()}\n\n${ANTI_HALLUCINATION_GUARDRAILS}`
    : ANTI_HALLUCINATION_GUARDRAILS;

  body.systemInstruction = {
    parts: [{ text: combinedSystemInstruction }]
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    // If gemini-2.5-flash model name fails, fallback to gemini-1.5-flash
    if (model !== "gemini-flash-latest") {
      return generateWithGemini(prompt, { ...options, model: "gemini-flash-latest" });
    }
    throw new Error(`Gemini API error (${response.status}): ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("No text content returned from Gemini model.");
  }

  return text.trim();
}

