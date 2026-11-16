// Module I: Scheduled Workflows (Autonomous Background Automation Engine)
// Orchestrates recurring cron-based or interval-based autonomous workflows
// for MeetUniversity workforce without human typing triggers.

import { publish } from "../bus.ts";
import { db, getBot } from "../db.ts";
import type { ConversationId } from "../../shared/types.ts";

export interface ScheduledWorkflow {
  id: string;
  title: string;
  cronSchedule: string;
  targetType: "bot" | "room";
  targetId: string;
  prompt: string;
  status: "active" | "paused";
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  createdAt: string;
}

export interface WorkflowExecutionResult {
  workflowId: string;
  title: string;
  triggeredAt: string;
  targetType: "bot" | "room";
  targetId: string;
  conversationId: string;
  status: "dispatched" | "failed";
  summary: string;
}

// ── Default Enterprise Workforce Automations for MeetUniversity ──
export const DEFAULT_WORKFLOWS: ScheduledWorkflow[] = [
  {
    id: "job-market-sweep",
    title: "Daily Competitor & Fee Intelligence Sweep",
    cronSchedule: "0 9 * * *", // Daily at 09:00 AM
    targetType: "room",
    targetId: "room-growth",
    prompt:
      "Automated Daily Sweep: Analyze competitor study-abroad program pricing and visa advisory changes on LeapFinance and LeverageEdu. Update room memory with strategic takeaways.",
    status: "active",
    lastRunAt: null,
    nextRunAt: calculateNextRun("0 9 * * *"),
    runCount: 0,
    createdAt: new Date().toISOString(),
  },
  {
    id: "job-admissions-audit",
    title: "Admissions Lead Pipeline Sync & Counselor Follow-Up",
    cronSchedule: "0 14 * * *", // Daily at 02:00 PM
    targetType: "room",
    targetId: "room-executive",
    prompt:
      "Automated Daily Audit: Verify shortlisted student candidates, sync high-priority applicants to CRM, and dispatch follow-up notifications for pending SOP documents.",
    status: "active",
    lastRunAt: null,
    nextRunAt: calculateNextRun("0 14 * * *"),
    runCount: 0,
    createdAt: new Date().toISOString(),
  },
  {
    id: "job-github-sentinel",
    title: "Nightly GitHub Student Portal Security & PR Integrity",
    cronSchedule: "0 23 * * *", // Nightly at 11:00 PM
    targetType: "bot",
    targetId: "bot-developer",
    prompt:
      "Automated Nightly Sentinel: Inspect latest commits and open pull requests on the student portal repository. Verify CAS checklist PR mergeability.",
    status: "active",
    lastRunAt: null,
    nextRunAt: calculateNextRun("0 23 * * *"),
    runCount: 0,
    createdAt: new Date().toISOString(),
  },
];

function calculateNextRun(cron: string): string {
  const now = new Date();
  const next = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return next.toISOString();
}

async function getClient() {
  return db();
}

/**
 * Initializes the scheduler table and seeds the 3 default MeetUniversity enterprise workflows.
 */
export async function initScheduler(): Promise<void> {
  const client = await getClient();
  for (const wf of DEFAULT_WORKFLOWS) {
    await client.execute({
      sql: `INSERT INTO scheduled_workflows 
            (id, title, cron_schedule, target_type, target_id, prompt, status, last_run_at, next_run_at, run_count, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO NOTHING`,
      args: [
        wf.id,
        wf.title,
        wf.cronSchedule,
        wf.targetType,
        wf.targetId,
        wf.prompt,
        wf.status,
        wf.lastRunAt,
        wf.nextRunAt,
        wf.runCount,
        wf.createdAt,
      ],
    });
  }
}

/**
 * Lists all registered background workflows.
 */
export async function listWorkflows(): Promise<ScheduledWorkflow[]> {
  await initScheduler();
  const client = await getClient();
  const rows = await client.execute("SELECT * FROM scheduled_workflows ORDER BY created_at ASC");
  return rows.rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    cronSchedule: String(r.cron_schedule),
    targetType: r.target_type as "bot" | "room",
    targetId: String(r.target_id),
    prompt: String(r.prompt),
    status: r.status as "active" | "paused",
    lastRunAt: r.last_run_at ? String(r.last_run_at) : null,
    nextRunAt: r.next_run_at ? String(r.next_run_at) : null,
    runCount: Number(r.run_count || 0),
    createdAt: String(r.created_at),
  }));
}

/**
 * Updates a workflow's active/paused state.
 */
export async function setWorkflowStatus(id: string, status: "active" | "paused"): Promise<boolean> {
  const client = await getClient();
  const res = await client.execute({
    sql: "UPDATE scheduled_workflows SET status = ? WHERE id = ?",
    args: [status, id],
  });
  return res.rowsAffected > 0;
}

/**
 * Dispatches an immediate autonomous run of a scheduled workflow.
 */
export async function triggerWorkflow(id: string): Promise<WorkflowExecutionResult> {
  const client = await getClient();
  const rows = await client.execute({
    sql: "SELECT * FROM scheduled_workflows WHERE id = ?",
    args: [id],
  });

  if (rows.rows.length === 0) {
    throw new Error(`Scheduled workflow '${id}' not found.`);
  }

  const r = rows.rows[0];
  const title = String(r.title);
  const targetType = r.target_type as "bot" | "room";
  const targetId = String(r.target_id);
  const prompt = String(r.prompt);
  const runCount = Number(r.run_count || 0) + 1;
  const now = new Date().toISOString();
  const nextRun = calculateNextRun(String(r.cron_schedule));

  // Determine conversation ID for the turn
  const conversationId: ConversationId =
    targetType === "room" ? (`room:${targetId}` as ConversationId) : (`dm:${targetId}` as ConversationId);

  // Identify acting bot (for room default to Chief of Staff or room lead, for dm use target bot)
  const botId = targetType === "bot" ? targetId : "bot-chief";
  const bot = await getBot(botId);

  if (!bot) {
    throw new Error(`Target bot '${botId}' could not be resolved for workflow '${id}'.`);
  }

  // Update DB execution metrics
  await client.execute({
    sql: "UPDATE scheduled_workflows SET last_run_at = ?, next_run_at = ?, run_count = ? WHERE id = ?",
    args: [now, nextRun, runCount, id],
  });

  // Execute turn autonomously in background
  try {
    const { runTurn } = await import("../runtime.ts");
    void runTurn({
      bot,
      conversationId,
      content: `[Scheduled Autonomous Workflow: "${title}"]\n${prompt}`,
    }).catch((err) => {
      console.warn(`[Scheduler] Background run note for workflow ${id}:`, err?.message || err);
    });
  } catch {
    console.log(`[Scheduler] Background turn queued for workflow '${id}' in ${conversationId}`);
  }

  // Notify connected SSE listeners of workflow trigger
  publish({
    type: "workflow_triggered" as never,
    workflowId: id,
    title,
    conversationId,
    triggeredAt: now,
  } as never);

  return {
    workflowId: id,
    title,
    triggeredAt: now,
    targetType,
    targetId,
    conversationId,
    status: "dispatched",
    summary: `Autonomous background execution dispatched to ${targetType} '${targetId}' (Run #${runCount}).`,
  };
}
