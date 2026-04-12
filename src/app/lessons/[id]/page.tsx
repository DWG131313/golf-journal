import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { SegmentCard } from "@/components/segment-card";
import { getLesson, getSegments } from "@/lib/storage";

export const dynamic = "force-dynamic";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "Unknown duration";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default async function LessonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const lesson = getLesson(id);

  if (!lesson) notFound();

  const segments = getSegments(id);
  const meta = lesson.sourceMetadata as { title?: string } | null;

  return (
    <div>
      {/* Back link */}
      <Link
        href="/lessons"
        className="mb-4 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; All Lessons
      </Link>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{lesson.date}</h1>
          <Badge variant="outline">{lesson.sourceType}</Badge>
          <Badge variant="secondary">{lesson.processingStatus}</Badge>
        </div>

        {meta?.title && (
          <p className="mt-1 text-lg text-muted-foreground">{meta.title}</p>
        )}

        <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
          <span>{lesson.filename}</span>
          <span>{formatDuration(lesson.durationSeconds)}</span>
          <span>{lesson.segmentCount} segments</span>
        </div>

        {lesson.topicSummary && (
          <p className="mt-3 text-sm">{lesson.topicSummary}</p>
        )}
      </div>

      {/* Segments */}
      <h2 className="mb-3 text-lg font-semibold">Segments</h2>
      {segments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No segments extracted yet.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {segments.map((segment) => (
            <SegmentCard
              key={segment.segmentIndex}
              segment={segment}
            />
          ))}
        </div>
      )}
    </div>
  );
}
