import { searchSegments } from "@/lib/storage";
import { SegmentCard } from "@/components/segment-card";
import { Input } from "@/components/ui/input";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() || "";
  const segments = query ? searchSegments(query) : [];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Search</h1>

      <form action="/search" method="GET" className="mb-6">
        <Input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Search tips, topics, transcripts..."
        />
      </form>

      {query && (
        <p className="mb-4 text-sm text-muted-foreground">
          {segments.length} result{segments.length !== 1 ? "s" : ""} for
          &quot;{query}&quot;
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {segments.map((segment) => (
          <SegmentCard
            key={`${segment.lessonId}-${segment.segmentIndex}`}
            segment={segment}
          />
        ))}
      </div>
    </div>
  );
}
