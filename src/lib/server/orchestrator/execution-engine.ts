// Module D: Autonomous Task Execution Engine
// Executes DAG task plans with true parallel dispatch, dependency resolution,
// safe intermediate context passing, human approval gates, and resilient failure recovery.

import type { TaskNode, TaskPlan } from "../../shared/types";
import { synthesizeFinalDeliverable } from "./chief-of-staff.ts";

export type NodeExecutor = (node: TaskNode, upstreamOutputs: Record<string, string>) => Promise<string>;

export interface ExecutionEvents {
  onNodeStart?: (node: TaskNode) => void;
  onNodeComplete?: (node: TaskNode) => void;
  onNodeAwaitingApproval?: (node: TaskNode) => void;
  onNodeFailed?: (node: TaskNode, error: Error) => void;
  onPlanComplete?: (plan: TaskPlan) => void;
}

export class TaskExecutionEngine {
  private activePlans = new Map<string, TaskPlan>();

  /**
   * Retrieves an active or stored execution plan.
   */
  getPlan(planId: string): TaskPlan | undefined {
    return this.activePlans.get(planId);
  }

  /**
   * Registers a plan into the engine.
   */
  registerPlan(plan: TaskPlan): void {
    this.activePlans.set(plan.id, plan);
  }

  /**
   * Human approval decision handler.
   */
  resolveApproval(planId: string, nodeId: string, approved: boolean, note?: string): boolean {
    const plan = this.activePlans.get(planId);
    if (!plan) return false;

    const node = plan.nodes.find(n => n.id === nodeId);
    if (!node || node.status !== "awaiting-approval") return false;

    if (approved) {
      node.approvalStatus = "approved";
      node.status = "pending"; // Ready to be executed in the next cycle
    } else {
      node.approvalStatus = "rejected";
      node.status = "cancelled";
      node.error = note || "Action rejected by human operator. Execution blocked.";
    }
    return true;
  }

  /**
   * Main DAG execution loop: evaluates dependencies and dispatches ready tasks in parallel.
   */
  async runPlan(
    plan: TaskPlan,
    executeNode: NodeExecutor,
    events?: ExecutionEvents
  ): Promise<TaskPlan> {
    this.registerPlan(plan);
    plan.status = "executing";

    let madeProgress = true;

    while (madeProgress) {
      madeProgress = false;

      // Find all nodes ready for execution:
      // Status must be 'pending', and all dependencies must be 'completed'
      const readyNodes = plan.nodes.filter(node => {
        if (node.status !== "pending") return false;
        
        // Check if all parent dependency tasks are completed
        const depsSatisfied = node.dependencies.every(depId => {
          const parent = plan.nodes.find(n => n.id === depId);
          return parent && parent.status === "completed";
        });

        // If any dependency failed or was cancelled, cancel this node safely
        const depFailed = node.dependencies.some(depId => {
          const parent = plan.nodes.find(n => n.id === depId);
          return parent && (parent.status === "failed" || parent.status === "cancelled");
        });

        if (depFailed) {
          node.status = "cancelled";
          node.error = "Cancelled due to dependency failure.";
          return false;
        }

        return depsSatisfied;
      });

      if (readyNodes.length === 0) {
        break;
      }

      madeProgress = true;

      // Execute ready nodes simultaneously (Parallel Dispatch)
      const executionPromises = readyNodes.map(async node => {
        // Human Approval Gate Check
        if (node.approvalRequired && node.approvalStatus !== "approved") {
          node.status = "awaiting-approval";
          events?.onNodeAwaitingApproval?.(node);
          return;
        }

        node.status = "running";
        node.startedAt = new Date().toISOString();
        events?.onNodeStart?.(node);

        // Gather upstream intermediate outputs without overwriting
        const upstreamOutputs: Record<string, string> = {};
        for (const depId of node.dependencies) {
          const parent = plan.nodes.find(n => n.id === depId);
          if (parent && parent.output) {
            upstreamOutputs[depId] = parent.output;
          }
        }

        // Resilient Execution with Retry Mechanism
        let attempt = 0;
        let success = false;
        let lastError: Error | null = null;

        while (attempt <= node.maxRetries && !success) {
          try {
            const result = await executeNode(node, upstreamOutputs);
            node.output = result;
            node.status = "completed";
            node.completedAt = new Date().toISOString();
            success = true;
            events?.onNodeComplete?.(node);
          } catch (err: unknown) {
            attempt++;
            node.retryCount = attempt;
            lastError = err instanceof Error ? err : new Error(String(err));
            if (attempt <= node.maxRetries) {
              // Wait briefly before retrying
              await new Promise(r => setTimeout(r, 100));
            }
          }
        }

        if (!success) {
          node.status = "failed";
          node.error = lastError?.message || "Execution failed after maximum retries.";
          node.completedAt = new Date().toISOString();
          events?.onNodeFailed?.(node, lastError || new Error(node.error));
        }
      });

      // Wait for current parallel batch to complete
      await Promise.allSettled(executionPromises);
    }

    // Check overall plan completion
    const hasAwaiting = plan.nodes.some(n => n.status === "awaiting-approval");
    const allFinished = plan.nodes.every(n => ["completed", "failed", "cancelled"].includes(n.status));

    if (hasAwaiting) {
      plan.status = "paused";
    } else if (allFinished) {
      plan.status = plan.nodes.some(n => n.status === "failed") ? "failed" : "completed";
      plan.completedAt = new Date().toISOString();
      plan.finalDeliverable = synthesizeFinalDeliverable(plan);
      events?.onPlanComplete?.(plan);
    }

    return plan;
  }
}

export const globalExecutionEngine = new TaskExecutionEngine();
