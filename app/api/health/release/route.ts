import { NextResponse } from "next/server";
import { GENERATED_BUILD_ID } from "@/lib/generated-build-id";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    service: "shouldbuild",
    mode: process.env.NODE_ENV,
    buildId: GENERATED_BUILD_ID,
    checkedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
