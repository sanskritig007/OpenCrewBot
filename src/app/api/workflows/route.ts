import { NextResponse } from "next/server";
import {
  listWorkflows,
  setWorkflowStatus,
  triggerWorkflow,
} from "@/lib/server/scheduler/workflow-scheduler";

export async function GET() {
  try {
    const workflows = await listWorkflows();
    return NextResponse.json({ ok: true, workflows });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, id, status } = body;

    if (action === "trigger" && id) {
      const result = await triggerWorkflow(id);
      return NextResponse.json({ ok: true, result });
    }

    if (action === "toggle" && id && status) {
      const ok = await setWorkflowStatus(id, status);
      return NextResponse.json({ ok, id, status });
    }

    return NextResponse.json({ ok: false, error: "Invalid action or parameters" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

