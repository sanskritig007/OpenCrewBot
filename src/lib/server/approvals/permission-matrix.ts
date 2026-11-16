// Module G: 3-Tier Permissions & Approval Centre
// Defines the 3-Tier permission hierarchy, risk categorizer, and anti-hallucination validation rules.

import type { ApprovalMode } from "@/lib/shared/types";

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type ActionCategory = "read" | "draft" | "mutate_internal" | "mutate_external" | "financial" | "system";

export interface ActionRiskAssessment {
  actionName: string;
  category: ActionCategory;
  riskLevel: RiskLevel;
  tierRequired: ApprovalMode;
  requiresApproval: boolean;
  reason: string;
  multilingualPrompt: {
    english: string;
    hinglish: string;
  };
  missingContextRequired?: {
    field: string;
    description: string;
    promptMessage: string;
  }[];
}

/**
 * Assesses the risk and approval requirements of any tool action.
 * Enforces Zero-Hallucination directives on sensitive external communications.
 */
export function assessActionRisk(
  actionName: string,
  parameters: Record<string, unknown> = {},
  botTier: ApprovalMode = "ask"
): ActionRiskAssessment {
  const normName = actionName.toLowerCase();

  // 1. Critical / High Risk: External Email Dispatches (e.g. to prospective students or partner universities)
  if (normName.includes("email") || normName.includes("send_mail") || normName.includes("dispatch")) {
    const missing: { field: string; description: string; promptMessage: string }[] = [];
    const recipient = parameters.recipient || parameters.to || parameters.email;
    const context = parameters.context || parameters.objective || parameters.subject;

    if (!recipient || String(recipient).trim().length < 3) {
      missing.push({
        field: "recipient",
        description: "Student or University Recipient email/name",
        promptMessage: "Kisko email bhejna hai? (Student, Admissions Dean, ya International Office?)",
      });
    }

    if (!context || String(context).trim().length < 5) {
      missing.push({
        field: "context",
        description: "Exact email context and purpose",
        promptMessage: "Email ka specific context kya hai? (Application ID, Scholarship query, ya Offer Letter?)",
      });
    }

    const isSending = normName.includes("send") || normName.includes("dispatch");

    return {
      actionName,
      category: isSending ? "mutate_external" : "draft",
      riskLevel: isSending ? "high" : "medium",
      tierRequired: isSending ? "ask" : "controlled",
      requiresApproval: isSending ? true : botTier === "ask",
      reason: isSending
        ? "Outbound email communication reaches external individuals and requires human verification."
        : "Drafting email for review.",
      multilingualPrompt: {
        english: `Action '${actionName}' requires authorization before external transmission.`,
        hinglish: `External email bhejne se pehle aapka approval zaroori hai taaki koi galat information na jaye.`,
      },
      missingContextRequired: missing.length > 0 ? missing : undefined,
    };
  }

  // 2. High Risk: Code Mutation, Production Pushes, PRs, File Deletions
  if (
    normName.includes("push") ||
    normName.includes("pull_request") ||
    normName.includes("pr") ||
    normName.includes("deploy") ||
    normName.includes("delete") ||
    normName.includes("drop") ||
    normName.includes("write_file")
  ) {
    const isCritical = normName.includes("main") || normName.includes("deploy") || normName.includes("drop");
    return {
      actionName,
      category: "mutate_internal",
      riskLevel: isCritical ? "critical" : "high",
      tierRequired: "ask",
      requiresApproval: botTier !== "full",
      reason: "Filesystem or code repository mutations can impact production systems.",
      multilingualPrompt: {
        english: `Action '${actionName}' modifies codebase or files and requires human sign-off.`,
        hinglish: `'${actionName}' repository ya files ko modify karega. Kripya change review karke approve karein.`,
      },
    };
  }

  // 3. Medium Risk: Internal Drafts, Analysis Reports, Memory Writes
  if (
    normName.includes("draft") ||
    normName.includes("memory_add") ||
    normName.includes("task_write") ||
    normName.includes("create_issue")
  ) {
    return {
      actionName,
      category: "draft",
      riskLevel: "medium",
      tierRequired: "controlled",
      requiresApproval: botTier === "ask",
      reason: "Internal drafting and state updates under controlled policy.",
      multilingualPrompt: {
        english: `Review internal draft creation for action '${actionName}'.`,
        hinglish: `'${actionName}' internal draft create kar raha hai. Approval mode: ${botTier}.`,
      },
    };
  }

  // 4. Low Risk: Read-Only Actions (Web Search, Memory Lookup, Market Research, Document Reading)
  return {
    actionName,
    category: "read",
    riskLevel: "low",
    tierRequired: "full",
    requiresApproval: false,
    reason: "Read-only inspection and research actions carry no execution risk.",
    multilingualPrompt: {
      english: `Read action '${actionName}' executes autonomously.`,
      hinglish: `'${actionName}' read-only research action hai aur safely autonomously execute hota hai.`,
    },
  };
}

