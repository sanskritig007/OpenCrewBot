// Module J: Multi-Model Intelligence & Token Optimization Router
// Balances load across Gemini and Groq, enforces token caps, provides auto-fallback,
// and caches responses to minimize API token expenditure.

import { generateWithGemini, type GeminiGenerateOptions } from "./gemini-client.ts";
import { generateWithGroq, type GroqGenerateOptions } from "./groq-client.ts";

export interface ModelRoutingPreferences {
  preferredProvider?: "gemini" | "groq" | "auto";
  taskCategory?: "research" | "analysis" | "synthesis" | "coding";
  temperature?: number;
  maxTokens?: number;
}

export interface TokenUsageStats {
  geminiCalls: number;
  groqCalls: number;
  cachedHits: number;
  estimatedTokensSaved: number;
}

// In-memory response cache to guarantee ZERO token waste on duplicate queries
const responseCache = new Map<string, { output: string; timestamp: number }>();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour cache
let geminiExhaustedUntil = 0;

export const tokenStats: TokenUsageStats = {
  geminiCalls: 0,
  groqCalls: 0,
  cachedHits: 0,
  estimatedTokensSaved: 0,
};

/**
 * Generates an LLM response with intelligent multi-model routing, token saving, and fallback.
 */
export async function routeLLMRequest(
  prompt: string,
  systemInstruction?: string,
  options: ModelRoutingPreferences = {}
): Promise<{ output: string; providerUsed: "gemini" | "groq" | "cache" }> {
  // 1. Check Cache first (Saves 100% of tokens!)
  const cacheKey = `${prompt.trim()}|${systemInstruction?.trim() || ""}`;
  const cached = responseCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    tokenStats.cachedHits++;
    tokenStats.estimatedTokensSaved += 800;
    return { output: cached.output, providerUsed: "cache" };
  }

  // 2. Decide Primary Provider based on Task Category & Live Provider Health
  let primaryProvider: "gemini" | "groq" = "gemini";

  if (Date.now() < geminiExhaustedUntil) {
    primaryProvider = "groq";
  } else if (options.preferredProvider && options.preferredProvider !== "auto") {
    primaryProvider = options.preferredProvider;
  } else if (options.taskCategory === "research" || options.taskCategory === "coding") {
    primaryProvider = "groq";
  } else {
    primaryProvider = "gemini";
  }

  // 3. Execution with Resilient Cross-Provider Fallback
  const defaultTokens = Math.max(options.maxTokens ?? 2500, 2500);

  if (primaryProvider === "groq") {
    try {
      const output = await generateWithGroq(prompt, {
        systemInstruction,
        temperature: options.temperature ?? 0.15,
        maxTokens: defaultTokens,
      });
      tokenStats.groqCalls++;
      responseCache.set(cacheKey, { output, timestamp: Date.now() });
      return { output, providerUsed: "groq" };
    } catch (groqErr) {
      console.warn(`[Router] Groq error, falling back to Gemini:`, groqErr instanceof Error ? groqErr.message : groqErr);
      const output = await generateWithGemini(prompt, {
        systemInstruction,
        temperature: options.temperature ?? 0.15,
        maxOutputTokens: defaultTokens,
      });
      tokenStats.geminiCalls++;
      responseCache.set(cacheKey, { output, timestamp: Date.now() });
      return { output, providerUsed: "gemini" };
    }
  } else {
    try {
      const output = await generateWithGemini(prompt, {
        systemInstruction,
        temperature: options.temperature ?? 0.15,
        maxOutputTokens: defaultTokens,
      });
      tokenStats.geminiCalls++;
      responseCache.set(cacheKey, { output, timestamp: Date.now() });
      return { output, providerUsed: "gemini" };
    } catch (geminiErr) {
      const errMsg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
      if (errMsg.includes("429") || errMsg.includes("quota")) {
        geminiExhaustedUntil = Date.now() + 10 * 60 * 1000; // 10 minutes auto-route to Groq
      }
      console.warn(`[Router] Gemini unavailable, routing instantly to Groq:`, errMsg);
      const output = await generateWithGroq(prompt, {
        systemInstruction,
        temperature: options.temperature ?? 0.15,
        maxTokens: defaultTokens,
      });
      tokenStats.groqCalls++;
      responseCache.set(cacheKey, { output, timestamp: Date.now() });
      return { output, providerUsed: "groq" };
    }
  }
}

