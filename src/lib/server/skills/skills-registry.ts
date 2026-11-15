// Module F: Reusable Skills Ecosystem — Central Skills Registry (8 Production Skills)
// Agent-agnostic, chainable, and backed by multi-model routing (Gemini + Groq).

import type { SkillDefinition, SkillExecutionContext, SkillExecutionResult } from "./skill-types.ts";
import { routeLLMRequest } from "../models/model-router.ts";

export const SKILLS: Record<string, SkillDefinition> = {
  // ============================================================================
  // SKILL 1: Market Research
  // ============================================================================
  skill_market_research: {
    id: "skill_market_research",
    name: "Market Research & Intelligence",
    description: "Conducts deep market discovery, audience segmentation, macro drivers, and industry landscape teardown.",
    category: "research",
    parameters: [
      { name: "topic", type: "string", description: "Market sector, product category, or domain to investigate.", required: true },
      { name: "targetMarket", type: "string", description: "Geographic or demographic focus (e.g. India Tier-2 students, US SaaS).", required: false, default: "Global / Relevant Regional" },
      { name: "depth", type: "string", description: "Analysis depth ('overview' or 'deep-dive').", required: false, default: "deep-dive" },
    ],
    execute: async (params, context) => {
      const startTime = Date.now();
      const topic = String(params.topic || "");
      const targetMarket = String(params.targetMarket || "Target Demographic");
      const lang = context?.preferredLanguage || "english";

      const systemInstruction = `You are a Senior Market Research Director.
Perform a rigorous, fact-grounded market research teardown.
Ground all statements in industry realities. Avoid fluff or meta commentary.
Structure:
1. Executive Market Summary (TAM/SAM/SOM if applicable, Macro drivers)
2. Target Audience Segmentation & Core Pain Points
3. Regulatory, Cultural & Geographic Catalysts
4. Key Growth Opportunities & Emerging Trends`;

      const prompt = `Conduct comprehensive market research on:
Topic: "${topic}"
Target Segment: "${targetMarket}"
Language Preference: ${lang.toUpperCase()}`;

      const { output, providerUsed } = await routeLLMRequest(prompt, systemInstruction, {
        taskCategory: "research",
        temperature: 0.15,
        maxTokens: 512,
      });

      return {
        skillId: "skill_market_research",
        skillName: "Market Research & Intelligence",
        success: true,
        output,
        executionTimeMs: Date.now() - startTime,
        engineUsed: providerUsed,
      };
    },
  },

  // ============================================================================
  // SKILL 2: Competitor Analysis
  // ============================================================================
  skill_competitor_analysis: {
    id: "skill_competitor_analysis",
    name: "Competitor Analysis & Benchmarking",
    description: "Generates multi-attribute feature comparison matrices, pricing models, SWOT breakdowns, and moat analysis.",
    category: "analysis",
    parameters: [
      { name: "primaryEntity", type: "string", description: "The product/company being evaluated.", required: true },
      { name: "competitors", type: "string", description: "Direct and indirect competitors (comma-separated or list).", required: true },
      { name: "focusAreas", type: "string", description: "Specific dimensions to evaluate (e.g. pricing, features, speed).", required: false, default: "Features, Pricing, Target Segment, Moat" },
    ],
    execute: async (params, context) => {
      const startTime = Date.now();
      const primary = String(params.primaryEntity || "");
      const competitors = String(params.competitors || "");
      const focus = String(params.focusAreas || "Features, Pricing, Strengths, Weaknesses");
      const lang = context?.preferredLanguage || "english";

      const systemInstruction = `You are a Principal Competitive Intelligence Strategist.
Generate a high-density, rigorous competitive analysis.
Structure:
1. Competitive Benchmark Matrix (Markdown Table: Feature/Metric | ${primary} | Competitor 1 | Competitor 2)
2. Pricing Model & Monetization Comparison
3. SWOT & Differentiation Analysis for ${primary}
4. Actionable Competitive Positioning Playbook`;

      const prompt = `Analyze competitive dynamics:
Primary Entity: "${primary}"
Key Competitors: "${competitors}"
Focus Dimensions: "${focus}"
Language Preference: ${lang.toUpperCase()}`;

      const { output, providerUsed } = await routeLLMRequest(prompt, systemInstruction, {
        taskCategory: "analysis",
        temperature: 0.15,
        maxTokens: 512,
      });

      return {
        skillId: "skill_competitor_analysis",
        skillName: "Competitor Analysis & Benchmarking",
        success: true,
        output,
        executionTimeMs: Date.now() - startTime,
        engineUsed: providerUsed,
      };
    },
  },

  // ============================================================================
  // SKILL 3: Financial Modelling
  // ============================================================================
  skill_financial_modelling: {
    id: "skill_financial_modelling",
    name: "Financial Modelling & Unit Economics",
    description: "Calculates unit economics (CAC, LTV, payback period), margin structure, and 3-scenario revenue projections.",
    category: "financial",
    parameters: [
      { name: "businessModel", type: "string", description: "Business model type (SaaS, Marketplace, EdTech B2C, Consulting).", required: true },
      { name: "pricing", type: "string", description: "Pricing tiers, average contract value (ACV), or ticket size.", required: true },
      { name: "cac", type: "string", description: "Customer Acquisition Cost or marketing budget assumptions.", required: false, default: "Estimated industry baseline" },
      { name: "churnRate", type: "string", description: "Monthly/annual churn rate or repeat purchase rate.", required: false, default: "Estimated 5% monthly" },
    ],
    execute: async (params, context) => {
      const startTime = Date.now();
      const model = String(params.businessModel || "");
      const pricing = String(params.pricing || "");
      const cac = String(params.cac || "Estimated baseline");
      const churn = String(params.churnRate || "5%");
      const lang = context?.preferredLanguage || "english";

      const systemInstruction = `You are an institutional Financial Analyst and Venture Modeler.
Build a mathematical unit economics breakdown and scenario model.
Structure:
1. Core Unit Economics Table (CAC, LTV, LTV:CAC Ratio, Gross Margin %, Months to Payback)
2. 3-Scenario Revenue Forecast (Bear Case, Base Case, Bull Case with explicit assumptions)
3. Breakeven & Cash Burn Sensitivity Analysis
4. Strategic Financial Recommendations`;

      const prompt = `Model financials and unit economics for:
Business Model: "${model}"
Pricing Structure: "${pricing}"
CAC Context: "${cac}"
Churn/Retention: "${churn}"
Language Preference: ${lang.toUpperCase()}`;

      const { output, providerUsed } = await routeLLMRequest(prompt, systemInstruction, {
        taskCategory: "analysis",
        temperature: 0.15,
        maxTokens: 512,
      });

      return {
        skillId: "skill_financial_modelling",
        skillName: "Financial Modelling & Unit Economics",
        success: true,
        output,
        executionTimeMs: Date.now() - startTime,
        engineUsed: providerUsed,
      };
    },
  },

  // ============================================================================
  // SKILL 4: Presentation Creation
  // ============================================================================
  skill_presentation_creation: {
    id: "skill_presentation_creation",
    name: "Executive Presentation Deck Creation",
    description: "Structures high-stakes pitch decks, slide layouts, narrative flow, bulleted visual content, and speaker notes.",
    category: "strategy",
    parameters: [
      { name: "topic", type: "string", description: "Subject of the presentation or pitch.", required: true },
      { name: "targetAudience", type: "string", description: "Audience (Investors, University Deans, Board of Directors, Students).", required: true },
      { name: "slideCount", type: "number", description: "Number of slides to outline.", required: false, default: 6 },
    ],
    execute: async (params, context) => {
      const startTime = Date.now();
      const topic = String(params.topic || "");
      const audience = String(params.targetAudience || "Executive Leadership");
      const count = Number(params.slideCount) || 5;
      const lang = context?.preferredLanguage || "english";

      const systemInstruction = `You are an Executive Presentation Designer and Storytelling Consultant.
Create a high-impact, professional slide deck outline with a compelling narrative arc.
For each slide provide:
- **Slide Title & Core Takeaway**
- **Visual/Layout Recommendation** (e.g. 3-column metric cards, split before/after, process flow)
- **High-Density Bullet Content** (concise, factual)
- **Speaker Notes** (what the presenter should verbally emphasize)`;

      const prompt = `Create a ${count}-slide executive presentation outline:
Topic: "${topic}"
Audience: "${audience}"
Language Preference: ${lang.toUpperCase()}`;

      const { output, providerUsed } = await routeLLMRequest(prompt, systemInstruction, {
        taskCategory: "synthesis",
        temperature: 0.15,
        maxTokens: 512,
      });

      return {
        skillId: "skill_presentation_creation",
        skillName: "Executive Presentation Deck Creation",
        success: true,
        output,
        executionTimeMs: Date.now() - startTime,
        engineUsed: providerUsed,
      };
    },
  },

  // ============================================================================
  // SKILL 5: Email Drafting
  // ============================================================================
  skill_email_drafting: {
    id: "skill_email_drafting",
    name: "Context-Aware Email & Professional Drafting",
    description: "Drafts tailored, ready-to-send emails (leave requests, client proposals, partner reachout, escalation).",
    category: "communication",
    parameters: [
      { name: "objective", type: "string", description: "Core purpose of the communication.", required: true },
      { name: "recipient", type: "string", description: "Recipient title or role (e.g. Manager, University Dean, Client VP).", required: true },
      { name: "tone", type: "string", description: "Tone ('formal', 'assertive', 'empathetic', 'persuasive').", required: false, default: "formal" },
      { name: "details", type: "string", description: "Specific dates, deadlines, projects, or attachments to reference.", required: false, default: "" },
    ],
    execute: async (params, context) => {
      const startTime = Date.now();
      const objective = String(params.objective || "");
      const recipient = String(params.recipient || "Colleague / Partner");
      const tone = String(params.tone || "formal");
      const details = String(params.details || "");
      const lang = context?.preferredLanguage || "english";

      const systemInstruction = `You are an Executive Communications Specialist.
Draft a polished, professional email ready for immediate dispatch.
Requirements:
1. Clear, compelling Subject Line.
2. Contextual opening acknowledging recipient's time.
3. Bulleted specifics (dates, deliverables, handover status).
4. Direct Call to Action (CTA).
5. Professional sign-off.`;

      const prompt = `Draft professional email:
Objective: "${objective}"
Recipient: "${recipient}"
Tone: "${tone}"
Specific Details/Dates: "${details}"
Language Preference: ${lang.toUpperCase()}`;

      const { output, providerUsed } = await routeLLMRequest(prompt, systemInstruction, {
        taskCategory: "synthesis",
        temperature: 0.15,
        maxTokens: 512,
      });

      return {
        skillId: "skill_email_drafting",
        skillName: "Context-Aware Email & Professional Drafting",
        success: true,
        output,
        executionTimeMs: Date.now() - startTime,
        engineUsed: providerUsed,
      };
    },
  },

  // ============================================================================
  // SKILL 6: Code Review
  // ============================================================================
  skill_code_review: {
    id: "skill_code_review",
    name: "Automated Code Review & Security Audit",
    description: "Performs static inspection, vulnerability scanning (OWASP), performance profiling, and provides refactoring diffs.",
    category: "engineering",
    parameters: [
      { name: "codeSnippet", type: "string", description: "Source code or function implementation to inspect.", required: true },
      { name: "language", type: "string", description: "Programming language (TypeScript, Python, Go, Rust, SQL).", required: false, default: "TypeScript" },
      { name: "focus", type: "string", description: "Audit focus ('security', 'performance', 'maintainability', 'all').", required: false, default: "all" },
    ],
    execute: async (params, context) => {
      const startTime = Date.now();
      const code = String(params.codeSnippet || "");
      const language = String(params.language || "TypeScript");
      const focus = String(params.focus || "all");
      const lang = context?.preferredLanguage || "english";

      const systemInstruction = `You are a Principal Software Architect and Security Auditor.
Review the submitted code with rigorous engineering standards.
Structure:
1. Executive Quality & Architecture Assessment (Rating: 1-10 with concise verdict)
2. Security & Vulnerability Teardown (Injection, leak, denial of service risks)
3. Performance & Algorithmic Bottlenecks (Time/Space complexity evaluation)
4. Concrete Refactored Code Diff (Ready-to-use production replacement with explanations)`;

      const prompt = `Perform code review on:
Language: "${language}"
Focus: "${focus}"
Code Snippet:
\`\`\`${language}
${code}
\`\`\`
Language Preference: ${lang.toUpperCase()}`;

      const { output, providerUsed } = await routeLLMRequest(prompt, systemInstruction, {
        taskCategory: "coding",
        temperature: 0.15,
        maxTokens: 512,
      });

      return {
        skillId: "skill_code_review",
        skillName: "Automated Code Review & Security Audit",
        success: true,
        output,
        executionTimeMs: Date.now() - startTime,
        engineUsed: providerUsed,
      };
    },
  },

  // ============================================================================
  // SKILL 7: Data Analysis
  // ============================================================================
  skill_data_analysis: {
    id: "skill_data_analysis",
    name: "Quantitative Data Analysis & Insights",
    description: "Evaluates datasets, extracts statistical trends, identifies anomalies, and provides data-backed decisions.",
    category: "analysis",
    parameters: [
      { name: "datasetDescription", type: "string", description: "Data table, schema, or metrics overview to analyze.", required: true },
      { name: "targetMetric", type: "string", description: "Primary KPI under evaluation (e.g. Conversion rate, Churn %, CAC).", required: true },
      { name: "context", type: "string", description: "Business context, timeframe, or baseline benchmarks.", required: false, default: "" },
    ],
    execute: async (params, context) => {
      const startTime = Date.now();
      const data = String(params.datasetDescription || "");
      const metric = String(params.targetMetric || "Core KPI");
      const ctx = String(params.context || "");
      const lang = context?.preferredLanguage || "english";

      const systemInstruction = `You are a Principal Quantitative Data Scientist.
Analyze the dataset metrics and extract clear commercial intelligence.
Structure:
1. Statistical Summary & Baseline Overview
2. Trend & Anomaly Detection (Key spikes, drop-offs, or variances)
3. Root Cause Hypothesis
4. 3 High-Conviction, Data-Backed Business Recommendations`;

      const prompt = `Analyze data metrics:
Target KPI: "${metric}"
Business Context: "${ctx}"
Data Context / Numbers:
${data}
Language Preference: ${lang.toUpperCase()}`;

      const { output, providerUsed } = await routeLLMRequest(prompt, systemInstruction, {
        taskCategory: "analysis",
        temperature: 0.15,
        maxTokens: 512,
      });

      return {
        skillId: "skill_data_analysis",
        skillName: "Quantitative Data Analysis & Insights",
        success: true,
        output,
        executionTimeMs: Date.now() - startTime,
        engineUsed: providerUsed,
      };
    },
  },

  // ============================================================================
  // SKILL 8: Lead Generation
  // ============================================================================
  skill_lead_generation: {
    id: "skill_lead_generation",
    name: "Lead Generation & Outbound Strategy",
    description: "Defines Ideal Customer Profiles (ICP), BANT qualification criteria, and high-conversion outbound hooks.",
    category: "sales",
    parameters: [
      { name: "offering", type: "string", description: "Product or service being sold/offered.", required: true },
      { name: "targetIndustry", type: "string", description: "Target vertical or sector (e.g. Higher Education, B2B SaaS, FinTech).", required: true },
      { name: "geography", type: "string", description: "Target region (e.g. North America, India Tier-1/2, UK).", required: false, default: "Global / Multi-regional" },
    ],
    execute: async (params, context) => {
      const startTime = Date.now();
      const offering = String(params.offering || "");
      const industry = String(params.targetIndustry || "");
      const geography = String(params.geography || "Target Region");
      const lang = context?.preferredLanguage || "english";

      const systemInstruction = `You are a VP of Enterprise Growth and Outbound Lead Generation.
Build an end-to-end outbound acquisition engine.
Structure:
1. Ideal Customer Profile (ICP: Titles, Company Size, Revenue Tier, Tech Stack)
2. BANT Qualification Matrix (Budget, Authority, Need, Timeline scoring)
3. High-Conversion Multi-Touch Outbound Hooks (1 Cold Email + 1 LinkedIn message template)
4. Objections & Rebuttal Playbook`;

      const prompt = `Develop lead generation playbook:
Offering: "${offering}"
Target Industry: "${industry}"
Target Geography: "${geography}"
Language Preference: ${lang.toUpperCase()}`;

      const { output, providerUsed } = await routeLLMRequest(prompt, systemInstruction, {
        taskCategory: "synthesis",
        temperature: 0.15,
        maxTokens: 512,
      });

      return {
        skillId: "skill_lead_generation",
        skillName: "Lead Generation & Outbound Strategy",
        success: true,
        output,
        executionTimeMs: Date.now() - startTime,
        engineUsed: providerUsed,
      };
    },
  },
};

/**
 * Execute a skill by its unique ID.
 */
export async function executeSkill(
  skillId: string,
  params: Record<string, unknown>,
  context?: SkillExecutionContext
): Promise<SkillExecutionResult> {
  const skill = SKILLS[skillId];
  if (!skill) {
    throw new Error(`Skill with ID "${skillId}" not found in Skills Registry. Available skills: ${Object.keys(SKILLS).join(", ")}`);
  }

  // Validate required parameters
  for (const param of skill.parameters) {
    if (param.required && (params[param.name] === undefined || params[param.name] === null || params[param.name] === "")) {
      throw new Error(`Missing required parameter "${param.name}" for skill "${skill.name}" (${skillId}).`);
    }
  }

  return skill.execute(params, context);
}

/**
 * Get all available skill descriptors for agent prompt injection.
 */
export function getSkillsSummary(): string {
  return Object.values(SKILLS)
    .map(
      (s) =>
        `- **${s.name}** (\`${s.id}\`): ${s.description}\n  *Params:* ${s.parameters.map((p) => `${p.name}${p.required ? " [required]" : ""}`).join(", ")}`
    )
    .join("\n");
}

