import { NextResponse } from "next/server";
import { loadPublicVerificationCard } from "@/lib/verification-card";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const card = await loadPublicVerificationCard(id);
  if (!card) {
    return NextResponse.json(
      { error: "Verification card not found" },
      { status: 404 },
    );
  }
  return NextResponse.json(card, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=86400, immutable",
    },
  });
}
