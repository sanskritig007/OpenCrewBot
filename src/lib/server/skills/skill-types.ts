// Module F: Reusable Skills Ecosystem — Skill Types & Interface Contracts
// Each skill is agent-agnostic, chainable, and produces verifiable structured business outputs.

export interface SkillParameter {
  name: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  required: boolean;
  default?: unknown;
}

export interface SkillExecutionContext {
  invokingAgentId?: string;
  invokingAgentRole?: string;
  preferredLanguage?: "hinglish" | "hindi" | "english" | "multilingual";
  upstreamContext?: Record<string, string>;
  modelOverride?: string;
}

export interface SkillExecutionResult {
  skillId: string;
  skillName: string;
  success: boolean;
  output: string;
  executionTimeMs: number;
  engineUsed: "gemini" | "groq" | "cache";
  metadata?: Record<string, unknown>;
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  category: "research" | "analysis" | "financial" | "strategy" | "communication" | "engineering" | "sales";
  parameters: SkillParameter[];
  execute: (
    params: Record<string, unknown>,
    context?: SkillExecutionContext
  ) => Promise<SkillExecutionResult>;
}

