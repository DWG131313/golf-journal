import { NextRequest } from "next/server";
import { spawn } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export const runtime = "nodejs";

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_BYTES = 1_073_741_824; // 1 GB
const ALLOWED_MIME = new Set(["video/mp4", "video/quicktime"]);
const ALLOWED_EXT = new Set(["mp4", "mov"]);

// Paths are resolved relative to the Next.js server CWD (src-demo/).
const PROJECT_ROOT = path.resolve(process.cwd(), "..");
const UPLOADS_DIR = path.join(PROJECT_ROOT, "Recordings", "_uploads");
const PYTHON = path.resolve(process.cwd(), ".venv", "bin", "python3");
const TRIAGE_SCRIPT = path.resolve(process.cwd(), "ingest", "triage.py");
const PROCESS_SCRIPT = path.resolve(process.cwd(), "ingest", "process.py");
const DB_PATH =
  process.env.GOLF_DB_PATH ||
  path.join(PROJECT_ROOT, "data", "golf_coach_demo.db");

// ── SSE helpers ───────────────────────────────────────────────────────────────

function sseEvent(obj: Record<string, unknown>): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

// ── Subprocess runner ─────────────────────────────────────────────────────────

/**
 * Spawn a Python subprocess, stream its stdout/stderr to `controller`
 * as { type: "log", line: string } SSE events, and resolve with the exit code.
 */
function runScript(
  args: string[],
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(PYTHON, args, { cwd: PROJECT_ROOT });
    const emit = (line: string) => {
      controller.enqueue(
        encoder.encode(sseEvent({ type: "log", line: line.trimEnd() })),
      );
    };

    let stdoutBuf = "";
    let stderrBuf = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop() ?? "";
      for (const l of lines) emit(l);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
      const lines = stderrBuf.split("\n");
      stderrBuf = lines.pop() ?? "";
      for (const l of lines) emit(l);
    });

    child.on("close", (code) => {
      // Flush any partial lines
      if (stdoutBuf) emit(stdoutBuf);
      if (stderrBuf) emit(stderrBuf);
      resolve(code ?? 1);
    });

    child.on("error", (err) => {
      emit(`spawn error: ${err.message}`);
      resolve(1);
    });
  });
}

// ── DB query helpers (read-only) ─────────────────────────────────────────────

function findVideoByFilename(
  filename: string,
): { video_id: number; session_id: number | null } | null {
  let db: Database.Database | null = null;
  try {
    db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    const video = db
      .prepare("SELECT id FROM videos WHERE filename = ? ORDER BY id DESC LIMIT 1")
      .get(filename) as { id: number } | undefined;
    if (!video) return null;
    const sv = db
      .prepare(
        "SELECT session_id FROM session_videos WHERE video_id = ? LIMIT 1",
      )
      .get(video.id) as { session_id: number } | undefined;
    return { video_id: video.id, session_id: sv?.session_id ?? null };
  } finally {
    db?.close();
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(sseEvent(obj)));

      try {
        // ── 1. Parse multipart ────────────────────────────────────────────
        let formData: FormData;
        try {
          formData = await req.formData();
        } catch {
          send({ type: "error", message: "Could not parse multipart form data." });
          controller.close();
          return;
        }

        const file = formData.get("file");
        if (!(file instanceof File)) {
          send({ type: "error", message: "No file field found in the request." });
          controller.close();
          return;
        }

        // ── 2. Validate extension ─────────────────────────────────────────
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        if (!ALLOWED_EXT.has(ext)) {
          send({
            type: "error",
            message: `Unsupported extension .${ext}. Only .mp4 and .mov are accepted.`,
          });
          controller.close();
          return;
        }

        // ── 3. Validate MIME type ─────────────────────────────────────────
        if (file.type && !ALLOWED_MIME.has(file.type)) {
          send({
            type: "error",
            message: `Unsupported MIME type ${file.type}.`,
          });
          controller.close();
          return;
        }

        // ── 4. Validate size ──────────────────────────────────────────────
        if (file.size > MAX_BYTES) {
          send({
            type: "error",
            message: `File is ${(file.size / 1_073_741_824).toFixed(2)} GB. Maximum is 1 GB.`,
          });
          controller.close();
          return;
        }

        // ── 5. Save to disk ───────────────────────────────────────────────
        await mkdir(UPLOADS_DIR, { recursive: true });

        let saveName = file.name;
        if (existsSync(path.join(UPLOADS_DIR, saveName))) {
          const ts = Date.now();
          const base = saveName.slice(0, saveName.lastIndexOf("."));
          const savExt = saveName.slice(saveName.lastIndexOf("."));
          saveName = `${base}_${ts}${savExt}`;
        }
        const savePath = path.join(UPLOADS_DIR, saveName);
        const bytes = await file.arrayBuffer();
        await writeFile(savePath, Buffer.from(bytes));

        // ── 6. Triage ─────────────────────────────────────────────────────
        send({ type: "stage", stage: "triaging" });

        const triageArgs = [
          TRIAGE_SCRIPT,
          UPLOADS_DIR,
          "--db", DB_PATH,
          "--limit", "1",
          "--threshold", "5",
          "--source", "upload",
        ];

        const triageCode = await runScript(triageArgs, controller, encoder);

        if (triageCode !== 0) {
          send({
            type: "error",
            message: `Triage script exited with code ${triageCode}. Check logs above.`,
          });
          controller.close();
          return;
        }

        // ── 7. Look up video + session in DB ─────────────────────────────
        const found = findVideoByFilename(saveName);

        if (!found) {
          // triage.py classified this as a silent clip and skipped it
          send({
            type: "skipped",
            reason:
              "This video did not meet the speech threshold and was classified as a silent swing clip.",
          });
          controller.close();
          return;
        }

        const { video_id, session_id } = found;

        // ── 8. Process (transcribe → analyze → embed) ─────────────────────
        send({ type: "stage", stage: "transcribing" });

        const processArgs = [
          PROCESS_SCRIPT,
          "--db", DB_PATH,
          "--video-id", String(video_id),
        ];

        // process.py runs all three stages internally and prints stage progress
        // to stdout. We parse the output lines and emit synthetic stage events
        // when we see stage transitions.
        // Because process.py doesn't emit SSE itself, we watch for known keywords.
        const processCode = await runProcessScript(
          processArgs,
          controller,
          encoder,
          send,
        );

        if (processCode !== 0) {
          send({
            type: "error",
            message: `Process script exited with code ${processCode}. Check logs above.`,
          });
          controller.close();
          return;
        }

        // ── 9. Done ───────────────────────────────────────────────────────
        send({
          type: "done",
          session_id: session_id ?? 0,
          video_id,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        controller.enqueue(
          encoder.encode(sseEvent({ type: "error", message: msg })),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// ── process.py wrapper with stage-transition detection ────────────────────────
//
// process.py prints lines like:
//   "  [1/1] id=7  (classified) → transcribed  done"
//   "loading embedding model ..."
// We sniff for these to emit synthetic stage SSE events to the client,
// so the progress bar advances visually without modifying process.py.

function runProcessScript(
  args: string[],
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  send: (obj: Record<string, unknown>) => void,
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(PYTHON, args, { cwd: PROJECT_ROOT });
    const emitLog = (line: string) => {
      controller.enqueue(
        encoder.encode(sseEvent({ type: "log", line: line.trimEnd() })),
      );
    };

    let stdoutBuf = "";
    let stderrBuf = "";
    let sentAnalyzing = false;
    let sentEmbedding = false;

    const checkLine = (line: string) => {
      const l = line.toLowerCase();
      // Detect when we transition from transcribed → analyze stage
      if (!sentAnalyzing && (l.includes("→ analyzed") || l.includes("analyzing"))) {
        sentAnalyzing = true;
        send({ type: "stage", stage: "analyzing" });
      }
      // Detect when we transition into embedding stage
      if (!sentEmbedding && (l.includes("→ embedded") || l.includes("embedding") || l.includes("embed_video"))) {
        sentEmbedding = true;
        send({ type: "stage", stage: "embedding" });
      }
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop() ?? "";
      for (const l of lines) {
        checkLine(l);
        emitLog(l);
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
      const lines = stderrBuf.split("\n");
      stderrBuf = lines.pop() ?? "";
      for (const l of lines) emitLog(l);
    });

    child.on("close", (code) => {
      if (stdoutBuf) { checkLine(stdoutBuf); emitLog(stdoutBuf); }
      if (stderrBuf) emitLog(stderrBuf);
      resolve(code ?? 1);
    });

    child.on("error", (err) => {
      emitLog(`spawn error: ${err.message}`);
      resolve(1);
    });
  });
}
