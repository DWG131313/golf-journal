import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { NextResponse } from "next/server";

const FRAMES_DIR = path.join(process.cwd(), "data", "frames");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lessonId: string; filename: string }> }
) {
  const { lessonId, filename } = await params;

  // Prevent path traversal
  if (lessonId.includes("..") || filename.includes("..")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const filePath = path.join(FRAMES_DIR, lessonId, filename);

  if (!existsSync(filePath) || !filename.endsWith(".png")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const buffer = await readFile(filePath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
