import { NextResponse } from "next/server";
import { enqueueJob } from "@/lib/qstash";
import { verifyCron } from "@/lib/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Scheduled backup for detecting accepted invitations. */
export async function GET(req: Request) {
  if (!verifyCron(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await enqueueJob("poll-acceptance", {});
  return NextResponse.json({ ok: true });
}
