import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { SpeakerLabel } from "@/components/speaker-label";
import { FrameGallery } from "@/components/frame-gallery";
import { getLesson, getSegment } from "@/lib/storage";

export const dynamic = "force-dynamic";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Parse transcript text into speaker/line pairs using the speaker map. */
function parseTranscript(
  transcript: string,
  speakerMap: Record<string, string> | null
): { speaker: string; text: string }[] {
  const lines = transcript.split("\n").filter((l) => l.trim());
  return lines.map((line) => {
    // Expected format: "SPEAKER_00: some text" or "Coach: some text"
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0 && colonIdx < 30) {
      const rawSpeaker = line.slice(0, colonIdx).trim();
      const text = line.slice(colonIdx + 1).trim();
      const speaker = speakerMap?.[rawSpeaker] ?? rawSpeaker;
      return { speaker, text };
    }
    return { speaker: "", text: line.trim() };
  });
}

export default async function SegmentDetailPage({
  params,
}: {
  params: Promise<{ id: string; index: string }>;
}) {
  const { id: rawId, index } = await params;
  const id = decodeURIComponent(rawId);
  const segmentIndex = parseInt(index, 10);

  if (isNaN(segmentIndex)) notFound();

  const lesson = getLesson(id);
  if (!lesson) notFound();

  const segment = getSegment(id, segmentIndex);
  if (!segment) notFound();

  const transcriptLines = parseTranscript(
    segment.transcript,
    segment.speakerMap
  );

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/lessons" className="hover:text-foreground">
          Lessons
        </Link>
        <span>/</span>
        <Link href={`/lessons/${id}`} className="hover:text-foreground">
          {lesson.date}
        </Link>
        <span>/</span>
        <span className="text-foreground">Segment {segmentIndex + 1}</span>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{segment.topic}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatTime(segment.startTime)} &ndash;{" "}
          {formatTime(segment.endTime)}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {segment.categories.map((cat) => (
            <Badge key={cat} variant="outline">
              {cat}
            </Badge>
          ))}
        </div>
      </div>

      {/* Summary */}
      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Summary</h2>
        <p className="text-sm leading-relaxed">{segment.summary}</p>
      </section>

      {/* Coach Tips */}
      {segment.coachTips.length > 0 && (
        <section className="mb-6 rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950">
          <h2 className="mb-2 text-lg font-semibold text-green-800 dark:text-green-200">
            Coach Tips
          </h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-green-900 dark:text-green-100">
            {segment.coachTips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Student Observations */}
      {segment.studentObservations.length > 0 && (
        <section className="mb-6 rounded-md border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
          <h2 className="mb-2 text-lg font-semibold text-blue-800 dark:text-blue-200">
            Student Observations
          </h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-blue-900 dark:text-blue-100">
            {segment.studentObservations.map((obs, i) => (
              <li key={i}>{obs}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Visual Context */}
      {segment.visualContext && (
        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold">Visual Context</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {segment.visualContext}
          </p>
        </section>
      )}

      {/* Frame Gallery */}
      {segment.frames.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold">Keyframes</h2>
          <FrameGallery lessonId={id} frames={segment.frames} />
        </section>
      )}

      {/* Transcript */}
      {transcriptLines.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold">Transcript</h2>
          <div className="space-y-2 rounded-md border p-4">
            {transcriptLines.map((line, i) => (
              <div key={i} className="flex gap-3 text-sm">
                {line.speaker ? (
                  <>
                    <div className="w-20 shrink-0">
                      <SpeakerLabel speaker={line.speaker} />
                    </div>
                    <p className="leading-relaxed">{line.text}</p>
                  </>
                ) : (
                  <p className="leading-relaxed text-muted-foreground">
                    {line.text}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
