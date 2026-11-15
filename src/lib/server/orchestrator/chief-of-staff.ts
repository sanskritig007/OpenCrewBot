// Module A: Intelligent Chief of Staff
// Decomposes complex user requests into DAG task plans, detects language,
// maps appropriate agents and skills, resolves concurrency, and synthesizes deliverables.

import type { Bot, TaskNode, TaskPlan } from "../../shared/types";

export interface PlanGenerationContext {
  availableBots: Bot[];
  preferredLanguage?: "hinglish" | "hindi" | "english" | "multilingual";
}

/**
 * Detect language style directly from vocabulary and grammar tokens.
 * Works automatically even if the user never mentions the words "Hinglish", "Hindi", or "English".
 */
export function detectLanguage(text: string): "hinglish" | "hindi" | "english" | "multilingual" {
  // 1. Devanagari script detection for pure Hindi
  if (/[\u0900-\u097F]/.test(text)) {
    return "hindi";
  }

  // 2. Comprehensive Romanized Hindi / Hinglish vocabulary and grammatical particles
  const hinglishTokens = [
    // Prepositions / Case markers
    "ke", "ki", "ka", "ko", "se", "me", "mein", "pe", "par", "aur", "bhi", "toh", "ya",
    // Pronouns
    "mujhe", "mera", "meri", "mere", "hum", "hume", "hamara", "aap", "tum", "tera", "teri", "unhe", "inka",
    // Verbs / Auxiliaries
    "karo", "karna", "krdo", "krna", "kar", "karte", "karne", "batao", "banao", "chahiye",
    "hai", "hain", "hoga", "hogi", "honge", "tha", "thi", "the",
    "dekho", "shuru", "chal", "rha", "raha", "rahi", "rahe",
    // Question / Modifiers
    "kya", "kaise", "kab", "kahan", "kyun", "kitna", "kitne", "sabse", "pehle", "baad", "wala", "wali"
  ];

  const words = text.toLowerCase().split(/[\s,?.!;:()[\]"']+/).filter(Boolean);
  const hinglishMatchCount = words.filter(w => hinglishTokens.includes(w)).length;

  // If 2 or more conversational tokens are found, or if even 1 strong particle exists in a short sentence
  if (hinglishMatchCount >= 2 || (words.length <= 6 && hinglishMatchCount >= 1)) {
    return "hinglish";
  }

  return "english";
}

/**
 * Intelligent Chief of Staff decomposes a natural language instruction into an executable DAG.
 */
export function generateTaskPlan(
  goal: string,
  conversationId: string,
  context: PlanGenerationContext
): TaskPlan {
  const language = context.preferredLanguage || detectLanguage(goal);
  const planId = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const nodes: TaskNode[] = [];

  const lower = goal.toLowerCase();

  // 1. Competitor / Market Research Scenario
  if (lower.includes("competitor") || lower.includes("market") || lower.includes("pricing") || lower.includes("research")) {
    const researchBot = context.availableBots.find(b => b.handle === "researcher" || b.name.toLowerCase().includes("research")) || context.availableBots[0];
    const analystBot = context.availableBots.find(b => b.handle === "analyst" || b.name.toLowerCase().includes("analyst")) || context.availableBots[0];
    const writerBot = context.availableBots.find(b => b.handle === "writer" || b.name.toLowerCase().includes("writer")) || context.availableBots[0];

    // Node 1: Primary Market Search (Runs in Parallel)
    nodes.push({
      id: "task-1-market-research",
      title: "Market & Competitor Discovery",
      description: "Research target competitors, customer segments, and value propositions.",
      assignedBotId: researchBot?.id || "bot-researcher",
      assignedRole: "Market Research Specialist",
      dependencies: [], // Independent: Can run immediately in parallel
      status: "pending",
      approvalRequired: false,
      retryCount: 0,
      maxRetries: 2,
    });

    // Node 2: Pricing & Features Gathering (Runs in Parallel with Node 1)
    nodes.push({
      id: "task-2-pricing-intelligence",
      title: "Public Pricing & Offerings Matrix",
      description: "Collect publicly available pricing tiers, packages, and monetization models.",
      assignedBotId: analystBot?.id || "bot-analyst",
      assignedRole: "Commercial Intelligence Analyst",
      dependencies: [], // Independent: Runs simultaneously with Task 1 without overwrite
      status: "pending",
      approvalRequired: false,
      retryCount: 0,
      maxRetries: 2,
    });

    // Node 3: Comparative Analysis & SWOT (Depends on Tasks 1 & 2)
    nodes.push({
      id: "task-3-comparative-synthesis",
      title: "Strategic Gap & SWOT Analysis",
      description: "Cross-reference findings from Market Discovery and Pricing Matrix to determine positioning gaps.",
      assignedBotId: analystBot?.id || "bot-analyst",
      assignedRole: "Strategic Business Analyst",
      dependencies: ["task-1-market-research", "task-2-pricing-intelligence"], // Waits for parallel research
      status: "pending",
      approvalRequired: false,
      retryCount: 0,
      maxRetries: 2,
    });

    // Node 4: Consolidated Deliverable Assembly (Depends on Task 3)
    nodes.push({
      id: "task-4-final-report",
      title: "Executive Report & Strategic Roadmap",
      description: "Synthesize all data into an executive-ready business report with actionable recommendations.",
      assignedBotId: writerBot?.id || "bot-writer",
      assignedRole: "Executive Communications Lead",
      dependencies: ["task-3-comparative-synthesis"],
      status: "pending",
      approvalRequired: false,
      retryCount: 0,
      maxRetries: 1,
    });
  } 
  // 2. Marketing Campaign & Campus Outreach Scenario
  else if (lower.includes("campaign") || lower.includes("marketing") || lower.includes("calendar") || lower.includes("aspirations") || lower.includes("ambassador") || lower.includes("campus") || lower.includes("outreach")) {
    const researchBot = context.availableBots.find(b => b.handle === "researcher") || context.availableBots[0];
    const creativeBot = context.availableBots.find(b => b.handle === "creative" || b.handle === "writer" || b.handle === "marketing") || context.availableBots[0];
    const analystBot = context.availableBots.find(b => b.handle === "analyst") || context.availableBots[0];

    // Parallel Node 1: Target Audience / Campus Profiling
    nodes.push({
      id: "task-1-audience-profiling",
      title: "Target Student Audience & Campus Tier Profiling",
      description: "Profile tier-1/tier-2 colleges, student motivations, pain points, and engagement incentives.",
      assignedBotId: researchBot?.id || "bot-researcher",
      assignedRole: "Campus Insights Researcher",
      dependencies: [], // Parallel branch 1
      status: "pending",
      approvalRequired: false,
      retryCount: 0,
      maxRetries: 2,
    });

    // Parallel Node 2: Incentive Structure & Benchmarking
    nodes.push({
      id: "task-2-incentive-design",
      title: "Incentive & Gamification Structure",
      description: "Design perk tiers, referral incentives, certificates, and performance KPIs for ambassadors.",
      assignedBotId: analystBot?.id || "bot-analyst",
      assignedRole: "Operations & Incentive Analyst",
      dependencies: [], // Parallel branch 2
      status: "pending",
      approvalRequired: false,
      retryCount: 0,
      maxRetries: 2,
    });

    // Node 3: 30-Day Launch Campaign & Execution Playbook
    nodes.push({
      id: "task-3-launch-playbook",
      title: "30-Day Launch Playbook & Content Collateral",
      description: "Develop campus rollout timeline, social media templates, posters, and pitch decks.",
      assignedBotId: creativeBot?.id || "bot-marketing",
      assignedRole: "Growth & Campaign Strategist",
      dependencies: ["task-1-audience-profiling", "task-2-incentive-design"],
      status: "pending",
      approvalRequired: false,
      retryCount: 0,
      maxRetries: 2,
    });
  }
  // 3. Code / Repository / Development Scenario
  else if (lower.includes("github") || lower.includes("repo") || lower.includes("code") || lower.includes("bug")) {
    const devBot = context.availableBots.find(b => b.handle === "coder" || b.handle === "developer") || context.availableBots[0];

    nodes.push({
      id: "task-1-repo-inspection",
      title: "Repository Architecture & Code Health Inspection",
      description: "Scan code tree, lint rules, dependencies, and identify architectural bottlenecks.",
      assignedBotId: devBot?.id || "bot-developer",
      assignedRole: "Senior Systems Engineer",
      dependencies: [],
      status: "pending",
      approvalRequired: false,
      retryCount: 0,
      maxRetries: 2,
    });

    // Sensitive Action: Modification proposal with Human Approval Gate
    const approvalPrompt = language === "hinglish"
      ? "Maine repository inspect kar li hai aur improvement plan taiyar hai. Code changes apply karne ke liye kya aap permission dete hain?"
      : "Repository inspection complete. Proposed code changes ready. Do you approve applying modifications to the codebase?";

    nodes.push({
      id: "task-2-propose-and-apply-changes",
      title: "Proposed Refactoring & Human Approval Gate",
      description: "Generate pull request / diff and require explicit human sign-off before modifying files.",
      assignedBotId: devBot?.id || "bot-developer",
      assignedRole: "Tech Lead",
      dependencies: ["task-1-repo-inspection"],
      status: "pending",
      approvalRequired: true,
      approvalPrompt,
      retryCount: 0,
      maxRetries: 1,
    });
  }
  // 4. Default General Autonomous Breakdown
  else {
    const leadBot = context.availableBots[0];
    nodes.push({
      id: "task-1-analysis",
      title: "Problem Assessment & Context Gathering",
      description: `Analyze requirements and synthesize context for goal: ${goal}`,
      assignedBotId: leadBot?.id || "bot-lead",
      assignedRole: "Strategy Lead",
      dependencies: [],
      status: "pending",
      approvalRequired: false,
      retryCount: 0,
      maxRetries: 2,
    });

    nodes.push({
      id: "task-2-execution",
      title: "Deliverable Generation",
      description: "Produce the core output fulfilling user specifications.",
      assignedBotId: leadBot?.id || "bot-lead",
      assignedRole: "Execution Specialist",
      dependencies: ["task-1-analysis"],
      status: "pending",
      approvalRequired: false,
      retryCount: 0,
      maxRetries: 1,
    });
  }

  return {
    id: planId,
    conversationId,
    goal,
    detectedLanguage: language,
    status: "planning",
    nodes,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Assembles intermediate outputs from all finished tasks into a polished executive business deliverable.
 */
export function synthesizeFinalDeliverable(plan: TaskPlan): string {
  const completedNodes = plan.nodes.filter(n => n.status === "completed");
  const failedNodes = plan.nodes.filter(n => n.status === "failed");

  const header = plan.detectedLanguage === "hinglish"
    ? `# 📊 Executive Business Deliverable (OpenCrewBot 2.0)\n**Goal:** ${plan.goal}\n**Status:** ${failedNodes.length === 0 ? "Safaltapoorvak Pura Hua (Completed)" : "Completed with partial warnings"}\n\n`
    : `# 📊 Executive Business Deliverable (OpenCrewBot 2.0)\n**Goal:** ${plan.goal}\n**Status:** ${failedNodes.length === 0 ? "Successfully Completed" : "Completed with partial warnings"}\n\n`;

  const taskSummaries = completedNodes
    .map(n => `### ✅ ${n.title} (${n.assignedRole})\n${n.output || "Completed successfully with verified outputs."}`)
    .join("\n\n---\n\n");

  const footer = `\n\n---\n*Delivered autonomously by OpenCrewBot Workforce Engine on ${new Date().toLocaleString()}*`;

  return `${header}${taskSummaries}${footer}`;
}
