import { NextRequest, NextResponse } from "next/server";
import { searchSegments } from "@/lib/storage";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");
  if (!query || query.trim().length === 0) {
    return NextResponse.json({ segments: [] });
  }

  const segments = searchSegments(query.trim());
  return NextResponse.json({ segments });
}
