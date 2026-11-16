// Module G: Central Approval Centre & Gate Coordinator
// Manages pending approvals, rejection recovery, and human clarification flows.

import { randomUUID } from "node:crypto";
import { assessActionRisk, type ActionRiskAssessment } from "./permission-matrix";
import { logApprovalEvent, type ApprovalAuditEntry } from "./audit-logger";
import type { ApprovalMode } from "@/lib/shared/types";

export interface PendingApprovalRequest {
  id: string;
  conversationId: string;
  botId: string;
  toolCallId: string;
  actionName: string;
  parameters: Record<string, unknown>;
  assessment: ActionRiskAssessment;
  status: "pending" | "approved" | "rejected" | "clarification-needed";
  clarificationQuestions?: string[];
  createdAt: string;
}

// Global in-memory pending approval registry
const pendingApprovals = new Map<string, PendingApprovalRequest>();

/**
 * Creates or evaluates an approval request for a tool call.
 */
export function evaluateAndQueueApproval(
  conversationId: string,
  botId: string,
  toolCallId: string,
  actionName: string,
  parameters: Record<string, unknown>,
  botTier: ApprovalMode
): {
  approvedDirectly: boolean;
  request?: PendingApprovalRequest;
  clarificationRequired?: boolean;
  clarificationQuestions?: string[];
} {
  const assessment = assessActionRisk(actionName, parameters, botTier);

  // If critical fields are missing (e.g. Email without recipient or context), halt for clarification!
  if (assessment.missingContextRequired && assessment.missingContextRequired.length > 0) {
    const questions = assessment.missingContextRequired.map((m) => m.promptMessage);
    const req: PendingApprovalRequest = {
      id: randomUUID(),
      conversationId,
      botId,
      toolCallId,
      actionName,
      parameters,
      assessment,
      status: "clarification-needed",
      clarificationQuestions: questions,
      createdAt: new Date().toISOString(),
    };
    pendingApprovals.set(toolCallId, req);
    return {
      approvedDirectly: false,
      request: req,
      clarificationRequired: true,
      clarificationQuestions: questions,
    };
  }

  // If action requires no approval according to Tier policy, allow direct execution
  if (!assessment.requiresApproval) {
    return { approvedDirectly: true };
  }

  // Otherwise, queue as pending human authorization
  const req: PendingApprovalRequest = {
    id: randomUUID(),
    conversationId,
    botId,
    toolCallId,
    actionName,
    parameters,
    assessment,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  pendingApprovals.set(toolCallId, req);
  return {
    approvedDirectly: false,
    request: req,
    clarificationRequired: false,
  };
}

/**
 * Resolves an approval request with human decision ('approved' or 'rejected').
 */
export async function resolveApproval(
  toolCallId: string,
  decision: "approved" | "rejected",
  operatorNotes?: string
): Promise<{
  success: boolean;
  request?: PendingApprovalRequest;
  auditEntry?: ApprovalAuditEntry;
  recoveryGuidance?: string;
}> {
  const req = pendingApprovals.get(toolCallId);
  if (!req) {
    return { success: false };
  }

  req.status = decision;
  pendingApprovals.delete(toolCallId);

  // Persist to audit logger
  const auditEntry = await logApprovalEvent({
    conversationId: req.conversationId,
    botId: req.botId,
    actionName: req.actionName,
    riskLevel: req.assessment.riskLevel,
    tier: req.assessment.tierRequired,
    decision,
    parameters: req.parameters,
    operatorNotes,
  });

  // Rejection recovery guidance in user's natural language
  let recoveryGuidance: string | undefined;
  if (decision === "rejected") {
    recoveryGuidance = `Action '${req.actionName}' was declined by the operator. Fallback: No changes applied, state preserved safely.`;
  }

  return {
    success: true,
    request: req,
    auditEntry,
    recoveryGuidance,
  };
}

/**
 * Retrieves all pending approvals.
 */
export function getPendingApprovals(conversationId?: string): PendingApprovalRequest[] {
  const all = Array.from(pendingApprovals.values());
  return conversationId ? all.filter((r) => r.conversationId === conversationId) : all;
}

