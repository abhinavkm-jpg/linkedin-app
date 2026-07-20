import { NextResponse } from "next/server";
import { enqueueJob } from "@/lib/qstash";
import { verifyCron } from "@/lib/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Periodic tick: run the send worker to process any due follow-ups. */
export async function GET(req: Request) {
  if (!verifyCron(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await enqueueJob("send", {});
  return NextResponse.json({ ok: true });
}
