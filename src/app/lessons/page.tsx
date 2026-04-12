import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getLessons } from "@/lib/storage";

export const dynamic = "force-dynamic";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "Unknown";
  const m = Math.floor(seconds / 60);
  return `${m} min`;
}

export default function LessonsPage() {
  const lessons = getLessons();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Lessons</h1>
        <Link
          href="/lessons/new"
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          Add Lesson
        </Link>
      </div>

      {lessons.length === 0 ? (
        <p className="text-muted-foreground">
          No lessons yet. Add a video to get started.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {lessons.map((lesson) => (
            <Link key={lesson.id} href={`/lessons/${lesson.id}`}>
              <Card className="hover:bg-accent/50 transition-colors">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{lesson.date}</CardTitle>
                    <Badge variant="outline">{lesson.sourceType}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{lesson.filename}</p>
                  <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                    <span>{formatDuration(lesson.durationSeconds)}</span>
                    <span>{lesson.segmentCount} segments</span>
                    <span className="capitalize">{lesson.processingStatus}</span>
                  </div>
                  {lesson.topicSummary && (
                    <p className="mt-2 text-sm">{lesson.topicSummary}</p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
