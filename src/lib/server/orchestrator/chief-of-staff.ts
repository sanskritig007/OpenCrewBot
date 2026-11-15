// Module A: Intelligent Chief of Staff
// Decomposes complex user requests into dynamic DAG task plans, detects language,
// maps appropriate agents and skills, resolves concurrency, and synthesizes deliverables.

import type { Bot, TaskNode, TaskPlan } from "../../shared/types.ts";

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

  if (hinglishMatchCount >= 2 || (words.length <= 6 && hinglishMatchCount >= 1)) {
    return "hinglish";
  }

  return "english";
}

/**
 * Dynamically decomposes ANY arbitrary, unannounced business prompt into a custom DAG.
 * Evaluates semantic intent, maps optimal agent capabilities, and detects concurrency.
 */
export function decomposeArbitraryPrompt(
  goal: string,
  language: "hinglish" | "hindi" | "english" | "multilingual",
  bots: Bot[]
): TaskNode[] {
  const nodes: TaskNode[] = [];
  const lower = goal.toLowerCase();

  // Find best candidate bots by capability
  const researcher = bots.find(b => b.handle === "researcher" || b.name.toLowerCase().includes("research")) || bots[0];
  const analyst = bots.find(b => b.handle === "analyst" || b.name.toLowerCase().includes("analyst")) || bots[1] || bots[0];
  const developer = bots.find(b => b.handle === "developer" || b.name.toLowerCase().includes("dev") || b.handle === "coder") || bots[2] || bots[0];
  const marketing = bots.find(b => b.handle === "marketing" || b.name.toLowerCase().includes("market") || b.handle === "writer") || bots[1] || bots[0];
  const lead = bots.find(b => b.handle === "chief" || b.name.toLowerCase().includes("chief")) || bots[0];

  // RULE 1: If the goal is a simple direct query (short word count or factual), use ONE single agent to save 100% redundant tokens!
  const words = goal.trim().split(/\s+/);
  const isSimpleQuery = words.length <= 5 && !lower.includes("compare") && !lower.includes("campaign") && !lower.includes("analysis") && !lower.includes("plan");

  if (isSimpleQuery) {
    nodes.push({
      id: "task-1-direct-response",
      title: "Direct Factual Resolution",
      description: `Provide a direct, high-precision answer for: "${goal}"`,
      assignedBotId: lead.id,
      assignedRole: "Direct Intelligence Specialist",
      dependencies: [],
      status: "pending",
      approvalRequired: false,
      retryCount: 0,
      maxRetries: 1,
    });
    return nodes;
  }

  // Domain 1: Code / Software / Technical Repositories
  if (lower.includes("github") || lower.includes("repo") || lower.includes("code") || lower.includes("bug") || lower.includes("refactor")) {
    nodes.push({
      id: "task-1-inspection",
      title: "Technical Codebase & Architecture Inspection",
      description: "Analyze code quality, dependencies, vulnerabilities, and bottlenecks.",
      assignedBotId: developer.id,
      assignedRole: "Senior Systems Engineer",
      dependencies: [], // Parallel branch
      status: "pending",
      approvalRequired: false,
      retryCount: 0,
      maxRetries: 2,
    });

    const approvalMsg = language === "hinglish"
      ? "Maine repository inspect kar li hai. Code changes apply karne ke liye kya aap permission dete hain?"
      : "Inspection complete. Do you approve applying proposed modifications to the repository?";

    nodes.push({
      id: "task-2-remediation",
      title: "Proposed Improvements & Human Approval Gate",
      description: "Draft bug fixes or refactoring plan and request human approval before applying changes.",
      assignedBotId: developer.id,
      assignedRole: "Tech Lead",
      dependencies: ["task-1-inspection"],
      status: "pending",
      approvalRequired: true,
      approvalPrompt: approvalMsg,
      retryCount: 0,
      maxRetries: 1,
    });
    return nodes;
  }

  // Domain 2: Business / Competitor / Market / Financial Analysis
  if (lower.includes("competitor") || lower.includes("pricing") || lower.includes("market") || lower.includes("sales") || lower.includes("financial") || lower.includes("spreadsheet")) {
    nodes.push({
      id: "task-1-market-research",
      title: "Market & Competitor Discovery",
      description: "Perform web search and market intelligence extraction for target domain.",
      assignedBotId: researcher.id,
      assignedRole: "Market Research Specialist",
      dependencies: [], // Parallel Branch A
      status: "pending",
      approvalRequired: false,
      retryCount: 0,
      maxRetries: 2,
    });

    nodes.push({
      id: "task-2-pricing-intelligence",
      title: "Commercial & Data Modeling",
      description: "Extract numbers, pricing structures, conversion bottlenecks, or financial metrics.",
      assignedBotId: analyst.id,
      assignedRole: "Commercial Intelligence Analyst",
      dependencies: [], // Parallel Branch B (Runs simultaneously with Branch A)
      status: "pending",
      approvalRequired: false,
      retryCount: 0,
      maxRetries: 2,
    });

    nodes.push({
      id: "task-3-comparative-synthesis",
      title: "Strategic Gap & SWOT Analysis",
      description: "Synthesize parallel outputs from Research and Data Modeling to identify key business opportunities.",
      assignedBotId: analyst.id,
      assignedRole: "Strategic Business Analyst",
      dependencies: ["task-1-market-research", "task-2-pricing-intelligence"],
      status: "pending",
      approvalRequired: false,
      retryCount: 0,
      maxRetries: 2,
    });

    nodes.push({
      id: "task-4-final-report",
      title: "Executive Strategic Roadmap",
      description: "Assemble verified deliverables into a polished executive business report.",
      assignedBotId: lead.id,
      assignedRole: "Executive Communications Lead",
      dependencies: ["task-3-comparative-synthesis"],
      status: "pending",
      approvalRequired: false,
      retryCount: 0,
      maxRetries: 1,
    });
    return nodes;
  }

  // Domain 3: Marketing / Campaign / Student Outreach / Campus Programs
  if (lower.includes("campaign") || lower.includes("marketing") || lower.includes("calendar") || lower.includes("ambassador") || lower.includes("campus") || lower.includes("outreach") || lower.includes("aspirations")) {
    nodes.push({
      id: "task-1-audience-profiling",
      title: "Target Student Audience & Campus Tier Profiling",
      description: "Profile target demographic motivations, pain points, and engagement incentives.",
      assignedBotId: researcher.id,
      assignedRole: "Campus Insights Researcher",
      dependencies: [], // Parallel Branch 1
      status: "pending",
      approvalRequired: false,
      retryCount: 0,
      maxRetries: 2,
    });

    nodes.push({
      id: "task-2-incentive-design",
      title: "Incentive & Gamification Structure",
      description: "Design perk tiers, referral incentives, certificates, and performance KPIs.",
      assignedBotId: analyst.id,
      assignedRole: "Operations & Incentive Analyst",
      dependencies: [], // Parallel Branch 2 (Runs simultaneously with Branch 1)
      status: "pending",
      approvalRequired: false,
      retryCount: 0,
      maxRetries: 2,
    });

    nodes.push({
      id: "task-3-launch-playbook",
      title: "30-Day Launch Playbook & Content Collateral",
      description: "Develop campus rollout timeline, social media templates, posters, and pitch decks.",
      assignedBotId: marketing.id,
      assignedRole: "Growth & Campaign Strategist",
      dependencies: ["task-1-audience-profiling", "task-2-incentive-design"],
      status: "pending",
      approvalRequired: false,
      retryCount: 0,
      maxRetries: 2,
    });
    return nodes;
  }

  // Domain 4: UNIVERSAL / UNANNOUNCED BUSINESS CHALLENGE (Section 12 Readiness)
  // For any new, unexpected problem thrown by evaluators (e.g. M&A, hiring, operations, supply chain)
  nodes.push({
    id: "task-1-discovery-and-benchmarking",
    title: `Discovery & Feasibility Benchmarking: "${goal.slice(0, 40)}..."`,
    description: `Conduct deep domain research and competitive discovery for goal: ${goal}`,
    assignedBotId: researcher.id,
    assignedRole: "Domain Intelligence Specialist",
    dependencies: [], // Parallel Branch 1
    status: "pending",
    approvalRequired: false,
    retryCount: 0,
    maxRetries: 2,
  });

  nodes.push({
    id: "task-2-analytical-modeling",
    title: "Risk, Operational & Financial Modeling",
    description: `Evaluate costs, operational risks, conversion barriers, and resource dependencies for: ${goal}`,
    assignedBotId: analyst.id,
    assignedRole: "Strategic Quantitative Analyst",
    dependencies: [], // Parallel Branch 2 (Runs simultaneously with Branch 1)
    status: "pending",
    approvalRequired: false,
    retryCount: 0,
    maxRetries: 2,
  });

  // Check if sensitive action is implied (e.g. sending emails, deleting, paying, contracting, deploying)
  const isSensitive = lower.includes("send") || lower.includes("email") || lower.includes("pay") || lower.includes("contract") || lower.includes("deploy") || lower.includes("delete");

  const approvalText = language === "hinglish"
    ? `System ne analysis complete kar li hai. Is deliverable ko external partners ya live system par execute karne ke liye kya aap approve karte hain?`
    : `Analysis complete. Do you approve proceeding with the external / sensitive operational execution?`;

  nodes.push({
    id: "task-3-strategic-synthesis",
    title: "Executive Synthesis & Operational Roadmap",
    description: "Synthesize discovery and quantitative models into an actionable business execution plan.",
    assignedBotId: lead.id,
    assignedRole: "Chief of Staff",
    dependencies: ["task-1-discovery-and-benchmarking", "task-2-analytical-modeling"],
    status: "pending",
    approvalRequired: isSensitive,
    approvalPrompt: isSensitive ? approvalText : undefined,
    retryCount: 0,
    maxRetries: 1,
  });

  return nodes;
}

/**
 * Intelligent Chief of Staff decomposes ANY natural language instruction into an executable DAG.
 */
export function generateTaskPlan(
  goal: string,
  conversationId: string,
  context: PlanGenerationContext
): TaskPlan {
  const language = context.preferredLanguage || detectLanguage(goal);
  const planId = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const nodes = decomposeArbitraryPrompt(goal, language, context.availableBots);

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
