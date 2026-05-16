import { NextResponse } from "next/server";
import { askWithRag } from "@/lib/rag";

export const runtime = "nodejs";  // needs better-sqlite3 + sqlite-vec native bindings

export async function POST(req: Request) {
  try {
    const { query, k } = await req.json();
    if (typeof query !== "string" || !query.trim()) {
      return NextResponse.json(
        { error: "query is required and must be a non-empty string" },
        { status: 400 },
      );
    }
    const result = await askWithRag(query.trim(), typeof k === "number" ? k : 5);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("ask error:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
