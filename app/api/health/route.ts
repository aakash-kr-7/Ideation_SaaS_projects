import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const startedAt = new Date().toISOString();

/**
 * Public application health endpoint.
 * Returns service name, status, deployment info, and uptime.
 * Does NOT expose database internals or secrets.
 */
export function GET() {
  return NextResponse.json({
    service: "shouldbuild",
    status: "ok",
    deploymentEnv: process.env.SHOULDBUILD_DEPLOYMENT_ENV || "development",
    startedAt,
    checkedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
