// Module G: Approval Audit Logger
// Persists all human authorization decisions into SQLite for compliance and auditability.

import { randomUUID } from "node:crypto";
import { db } from "@/lib/server/db";
import type { RiskLevel } from "./permission-matrix";
import type { ApprovalMode } from "@/lib/shared/types";

export interface ApprovalAuditEntry {
  id?: string;
  conversationId: string;
  botId: string;
  actionName: string;
  riskLevel: RiskLevel;
  tier: ApprovalMode;
  decision: "approved" | "rejected";
  parameters: Record<string, unknown>;
  operatorNotes?: string;
  createdAt?: string;
}

// In-memory buffer for instant access and unit testing
const inMemoryAuditTrail: ApprovalAuditEntry[] = [];

/**
 * Persists an approval or rejection event to the audit trail.
 */
export async function logApprovalEvent(entry: ApprovalAuditEntry): Promise<ApprovalAuditEntry> {
  const fullEntry: ApprovalAuditEntry = {
    id: entry.id || randomUUID(),
    conversationId: entry.conversationId,
    botId: entry.botId,
    actionName: entry.actionName,
    riskLevel: entry.riskLevel,
    tier: entry.tier,
    decision: entry.decision,
    parameters: entry.parameters || {},
    operatorNotes: entry.operatorNotes || "",
    createdAt: entry.createdAt || new Date().toISOString(),
  };

  inMemoryAuditTrail.unshift(fullEntry);
  if (inMemoryAuditTrail.length > 200) inMemoryAuditTrail.pop();

  try {
    const client = await db();
    await client.execute({
      sql: `INSERT INTO approval_audit_log (
        id, conversation_id, bot_id, action_name, risk_level, tier, decision, parameters, operator_notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        fullEntry.id!,
        fullEntry.conversationId,
        fullEntry.botId,
        fullEntry.actionName,
        fullEntry.riskLevel,
        fullEntry.tier,
        fullEntry.decision,
        JSON.stringify(fullEntry.parameters),
        fullEntry.operatorNotes || "",
        fullEntry.createdAt!,
      ],
    });
  } catch (err) {
    console.warn("[AuditLogger] Could not persist audit log to LibSQL (using in-memory fallback):", err);
  }

  return fullEntry;
}

/**
 * Retrieves audit entries for a conversation or global history.
 */
export async function getAuditHistory(conversationId?: string, limit = 50): Promise<ApprovalAuditEntry[]> {
  try {
    const client = await db();
    const query = conversationId
      ? {
          sql: `SELECT * FROM approval_audit_log WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?`,
          args: [conversationId, limit],
        }
      : {
          sql: `SELECT * FROM approval_audit_log ORDER BY created_at DESC LIMIT ?`,
          args: [limit],
        };

    const res = await client.execute(query);
    if (res.rows && res.rows.length > 0) {
      return res.rows.map((r) => ({
        id: String(r.id),
        conversationId: String(r.conversation_id),
        botId: String(r.bot_id),
        actionName: String(r.action_name),
        riskLevel: String(r.risk_level) as RiskLevel,
        tier: String(r.tier) as ApprovalMode,
        decision: String(r.decision) as "approved" | "rejected",
        parameters: JSON.parse(String(r.parameters || "{}")),
        operatorNotes: r.operator_notes ? String(r.operator_notes) : undefined,
        createdAt: String(r.created_at),
      }));
    }
  } catch (err) {
    console.warn("[AuditLogger] Reading from LibSQL failed, falling back to memory:", err);
  }

  return conversationId
    ? inMemoryAuditTrail.filter((e) => e.conversationId === conversationId).slice(0, limit)
    : inMemoryAuditTrail.slice(0, limit);
}

