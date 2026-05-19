import { NextRequest } from "next/server";
import { spawn, type ChildProcess } from "node:child_process";
import { writeFile, mkdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export const runtime = "nodejs";

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_BYTES = 1_073_741_824; // 1 GB
const MAX_BODY_OVERHEAD = 1_048_576; // 1 MB multipart framing headroom
const ALLOWED_MIME = new Set(["video/mp4", "video/quicktime"]);
const ALLOWED_EXT = new Set(["mp4", "mov"]);

// CSRF defense: only browser origins that match our dev server are allowed.
// Single-user localhost app — keep this list short.
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:3200",
  "http://localhost:3300",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3200",
  "http://127.0.0.1:3300",
]);

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

// ── Filename sanitization ────────────────────────────────────────────────────
// Strips directory components and rejects names that could escape UPLOADS_DIR
// or shadow hidden files. Called on user-controlled `file.name` before any
// filesystem use.
function sanitizeFilename(name: string): string {
  const base = path.basename(name);
  if (
    !base ||
    base.startsWith(".") ||
    base.includes("/") ||
    base.includes("\\") ||
    base.includes("\0")
  ) {
    throw new Error(`unsafe filename: ${JSON.stringify(name)}`);
  }
  return base;
}

// ── DB query helpers (read-only) ─────────────────────────────────────────────

function getMaxVideoId(): number {
  try {
    const db = new Database(DB_PATH, { readonly: true, fileMustExist: false });
    try {
      const row = db
        .prepare("SELECT COALESCE(MAX(id), 0) AS m FROM videos")
        .get() as { m: number };
      return row.m;
    } finally {
      db.close();
    }
  } catch {
    return 0;
  }
}

// Look up a video by filename, restricted to rows newly inserted by *this*
// upload's triage run. Without the `id > minId` filter, a hash-duplicate that
// triage refuses to re-insert could surface an older video as if it were the
// just-uploaded one.
function findVideoByFilenameAfter(
  filename: string,
  minId: number,
): { video_id: number; session_id: number | null } | null {
  let db: Database.Database | null = null;
  try {
    db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    const video = db
      .prepare(
        "SELECT id FROM videos WHERE filename = ? AND id > ? ORDER BY id DESC LIMIT 1",
      )
      .get(filename, minId) as { id: number } | undefined;
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

// ── Subprocess runner ─────────────────────────────────────────────────────────
//
// `childRef.current` is mutated so the stream's `cancel` hook can SIGTERM the
// active subprocess on client disconnect. `onStdoutLine` is invoked for every
// stdout line so callers can sniff verdicts without re-implementing the buffer.

function runScript(
  args: string[],
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  childRef: { current: ChildProcess | null },
  onStdoutLine?: (line: string) => void,
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(PYTHON, args, { cwd: PROJECT_ROOT });
    childRef.current = child;

    const emit = (line: string) => {
      try {
        controller.enqueue(
          encoder.encode(sseEvent({ type: "log", line: line.trimEnd() })),
        );
      } catch {
        // Controller may already be closed (client disconnected) — drop.
      }
    };

    let stdoutBuf = "";
    let stderrBuf = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop() ?? "";
      for (const l of lines) {
        if (onStdoutLine) onStdoutLine(l);
        emit(l);
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
      const lines = stderrBuf.split("\n");
      stderrBuf = lines.pop() ?? "";
      for (const l of lines) emit(l);
    });

    child.on("close", (code, signal) => {
      if (stdoutBuf) {
        if (onStdoutLine) onStdoutLine(stdoutBuf);
        emit(stdoutBuf);
      }
      if (stderrBuf) emit(stderrBuf);
      if (childRef.current === child) childRef.current = null;
      // SIGTERM from cancel() shows up as a non-zero code — surface a more
      // useful signal than `1` so callers can distinguish disconnect from crash.
      resolve(code ?? (signal ? 130 : 1));
    });

    child.on("error", (err) => {
      emit(`spawn error: ${err.message}`);
      if (childRef.current === child) childRef.current = null;
      resolve(1);
    });
  });
}

// process.py prints lines like:
//   "  [1/1] id=7  (classified) → transcribed  done"
// We sniff stdout for known phrases to emit synthetic stage events so the UI
// progress bar advances without process.py needing to speak SSE.
function runProcessScript(
  args: string[],
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  send: (obj: Record<string, unknown>) => void,
  childRef: { current: ChildProcess | null },
): Promise<number> {
  let sentAnalyzing = false;
  let sentEmbedding = false;

  return runScript(args, controller, encoder, childRef, (line) => {
    const l = line.toLowerCase();
    if (!sentAnalyzing && (l.includes("→ analyzed") || l.includes("analyzing"))) {
      sentAnalyzing = true;
      send({ type: "stage", stage: "analyzing" });
    }
    if (
      !sentEmbedding &&
      (l.includes("→ embedded") ||
        l.includes("embedding") ||
        l.includes("embed_video"))
    ) {
      sentEmbedding = true;
      send({ type: "stage", stage: "embedding" });
    }
  });
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // CSRF defense: reject cross-origin form submissions outright. An origin
  // header is absent on same-origin GET-converted POSTs in some browsers,
  // so we only enforce when it IS present.
  const origin = req.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return new Response(
      JSON.stringify({ error: "Origin not allowed." }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  // DoS defense: cap the body via Content-Length *before* req.formData() reads
  // and buffers the whole thing in memory. A lying client can still stream a
  // chunked giant body, but the common cases (browsers, accidental drops) are
  // covered. True streaming validation would require swapping req.formData()
  // for a streaming multipart parser like busboy — out of scope here.
  const contentLengthHeader = req.headers.get("content-length");
  if (contentLengthHeader) {
    const cl = Number(contentLengthHeader);
    if (Number.isFinite(cl) && cl > MAX_BYTES + MAX_BODY_OVERHEAD) {
      return new Response(
        JSON.stringify({
          error: `Request body is ${(cl / 1_073_741_824).toFixed(2)} GB. Maximum is 1 GB.`,
        }),
        { status: 413, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  const encoder = new TextEncoder();
  const childRef: { current: ChildProcess | null } = { current: null };
  let savedFilePath: string | null = null;
  let succeeded = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(sseEvent(obj)));
        } catch {
          // Controller closed — happens after cancel(). Swallow.
        }
      };

      try {
        // ── 1. Parse multipart ────────────────────────────────────────────
        let formData: FormData;
        try {
          formData = await req.formData();
        } catch {
          send({ type: "error", message: "Could not parse multipart form data." });
          return;
        }

        const file = formData.get("file");
        if (!(file instanceof File)) {
          send({ type: "error", message: "No file field found in the request." });
          return;
        }

        // ── 2. Sanitize filename (path traversal defense) ─────────────────
        let saveName: string;
        try {
          saveName = sanitizeFilename(file.name);
        } catch {
          send({
            type: "error",
            message: "Invalid filename — must not contain path separators.",
          });
          return;
        }

        // ── 3. Validate extension ─────────────────────────────────────────
        const ext = saveName.split(".").pop()?.toLowerCase() ?? "";
        if (!ALLOWED_EXT.has(ext)) {
          send({
            type: "error",
            message: `Unsupported extension .${ext}. Only .mp4 and .mov are accepted.`,
          });
          return;
        }

        // ── 4. Validate MIME type (strict — empty MIME is rejected) ──────
        if (!file.type || !ALLOWED_MIME.has(file.type)) {
          send({
            type: "error",
            message: `Unsupported MIME type: ${file.type || "(empty)"}.`,
          });
          return;
        }

        // ── 5. Validate size (post-parse safety net) ──────────────────────
        if (file.size > MAX_BYTES) {
          send({
            type: "error",
            message: `File is ${(file.size / 1_073_741_824).toFixed(2)} GB. Maximum is 1 GB.`,
          });
          return;
        }

        // ── 6. Save to disk ───────────────────────────────────────────────
        await mkdir(UPLOADS_DIR, { recursive: true });

        if (existsSync(path.join(UPLOADS_DIR, saveName))) {
          const ts = Date.now();
          const dot = saveName.lastIndexOf(".");
          saveName = `${saveName.slice(0, dot)}_${ts}${saveName.slice(dot)}`;
        }
        const savePath = path.join(UPLOADS_DIR, saveName);

        // Defense in depth: verify the resolved path is inside UPLOADS_DIR.
        const resolvedUploads = path.resolve(UPLOADS_DIR);
        const resolvedSave = path.resolve(savePath);
        if (
          resolvedSave !== resolvedUploads &&
          !resolvedSave.startsWith(resolvedUploads + path.sep)
        ) {
          send({ type: "error", message: "Resolved path escapes upload directory." });
          return;
        }

        savedFilePath = savePath;
        const bytes = await file.arrayBuffer();
        await writeFile(savePath, Buffer.from(bytes));

        // ── 7. Triage ─────────────────────────────────────────────────────
        // Capture pre-max video id so we can distinguish a freshly-inserted
        // row from a pre-existing one with the same filename.
        send({ type: "stage", stage: "triaging" });
        const preMaxId = getMaxVideoId();
        let triageDuplicate = false;

        const triageArgs = [
          TRIAGE_SCRIPT,
          UPLOADS_DIR,
          "--db", DB_PATH,
          "--limit", "1",
          "--threshold", "5",
          "--source", "upload",
        ];

        const triageCode = await runScript(
          triageArgs,
          controller,
          encoder,
          childRef,
          (line) => {
            // triage.py prints "DUPLICATE  <filename>" for hash-matched skips.
            if (line.includes("DUPLICATE")) triageDuplicate = true;
          },
        );

        if (triageCode !== 0) {
          send({
            type: "error",
            message: `Triage script exited with code ${triageCode}. Check logs above.`,
          });
          return;
        }

        // ── 8. Look up video + session in DB (must be newly inserted) ────
        const found = findVideoByFilenameAfter(saveName, preMaxId);

        if (!found) {
          if (triageDuplicate) {
            send({
              type: "skipped",
              reason:
                "This video already exists in the library (matched by content hash).",
            });
          } else {
            send({
              type: "skipped",
              reason:
                "This video did not meet the speech threshold and was classified as a silent swing clip.",
            });
          }
          return;
        }

        const { video_id, session_id } = found;

        // ── 9. Process (transcribe → analyze → embed) ─────────────────────
        send({ type: "stage", stage: "transcribing" });

        const processArgs = [
          PROCESS_SCRIPT,
          "--db", DB_PATH,
          "--video-id", String(video_id),
        ];

        const processCode = await runProcessScript(
          processArgs,
          controller,
          encoder,
          send,
          childRef,
        );

        if (processCode !== 0) {
          send({
            type: "error",
            message: `Process script exited with code ${processCode}. Check logs above.`,
          });
          return;
        }

        // ── 10. Done ──────────────────────────────────────────────────────
        succeeded = true;
        send({
          type: "done",
          session_id: session_id ?? 0,
          video_id,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        try {
          controller.enqueue(encoder.encode(sseEvent({ type: "error", message: msg })));
        } catch {
          // Controller already closed.
        }
      } finally {
        // Orphan-file cleanup: on any non-success path, remove the saved
        // upload so /Recordings/_uploads/ doesn't grow with abandoned files.
        // Triage may have already moved the file (to _skipped/ or out of the
        // dir entirely) — unlink failure is fine.
        if (savedFilePath && !succeeded) {
          unlink(savedFilePath).catch(() => {});
        }
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },

    cancel() {
      // Client disconnected mid-stream. Kill the active child to stop wasting
      // CPU on a result nobody will see. Give it 5s to clean up, then SIGKILL.
      const child = childRef.current;
      if (child && child.exitCode === null) {
        try {
          child.kill("SIGTERM");
        } catch {}
        setTimeout(() => {
          try {
            if (child.exitCode === null) child.kill("SIGKILL");
          } catch {}
        }, 5000);
      }
      if (savedFilePath && !succeeded) {
        unlink(savedFilePath).catch(() => {});
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
