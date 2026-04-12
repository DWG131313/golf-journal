import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Segment } from "@/lib/storage";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SegmentCard({ segment }: { segment: Segment }) {
  return (
    <Link href={`/lessons/${segment.lessonId}/segments/${segment.segmentIndex}`}>
      <Card className="hover:bg-accent/50 transition-colors">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{segment.topic}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground line-clamp-2">{segment.summary}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {segment.categories.map((cat) => (
              <Badge key={cat} variant="outline" className="text-xs">
                {cat}
              </Badge>
            ))}
          </div>
          {segment.coachTips.length > 0 && (
            <p className="mt-2 text-xs text-green-700 line-clamp-1">
              Tip: {segment.coachTips[0]}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
