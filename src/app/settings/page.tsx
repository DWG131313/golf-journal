import {
  getLessons,
  getProcessingLogs,
  getTotalTokensUsed,
} from "@/lib/storage";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export const dynamic = "force-dynamic";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export default function SettingsPage() {
  const totalTokens = getTotalTokensUsed();
  const lessons = getLessons();
  const logs = getProcessingLogs();

  // Per-lesson token breakdown
  const tokensByLesson = new Map<string, number>();
  for (const log of logs) {
    tokensByLesson.set(
      log.lessonId,
      (tokensByLesson.get(log.lessonId) ?? 0) + log.tokensUsed
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>

      {/* Token Usage Summary */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Token Usage</h2>
        <div className="rounded-md border p-4">
          <div className="text-3xl font-bold">{formatTokens(totalTokens)}</div>
          <p className="text-sm text-muted-foreground">total tokens used</p>
        </div>
      </section>

      {/* Per-Lesson Breakdown */}
      {lessons.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Per-Lesson Breakdown</h2>
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium">Date</th>
                  <th className="px-4 py-2 text-left font-medium">File</th>
                  <th className="px-4 py-2 text-left font-medium">Segments</th>
                  <th className="px-4 py-2 text-right font-medium">Tokens</th>
                </tr>
              </thead>
              <tbody>
                {lessons.map((lesson) => (
                  <tr key={lesson.id} className="border-b last:border-0">
                    <td className="px-4 py-2">{lesson.date}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {lesson.filename}
                    </td>
                    <td className="px-4 py-2">{lesson.segmentCount}</td>
                    <td className="px-4 py-2 text-right font-mono">
                      {formatTokens(tokensByLesson.get(lesson.id) ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Separator className="my-6" />

      {/* Processing Log */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Processing Log</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No processing logs yet. Ingest some videos first.
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium">Time</th>
                  <th className="px-4 py-2 text-left font-medium">Stage</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Tokens</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 capitalize">{log.stage}</td>
                    <td className="px-4 py-2">
                      <Badge
                        variant={
                          log.status === "success" ? "default" : "destructive"
                        }
                      >
                        {log.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {formatTokens(log.tokensUsed)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
