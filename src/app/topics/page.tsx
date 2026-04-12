import { getAllCategories, getSegmentsByCategory } from "@/lib/storage";
import { SegmentCard } from "@/components/segment-card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default function TopicsPage() {
  const categories = getAllCategories();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Topics</h1>

      {categories.length === 0 ? (
        <p className="text-muted-foreground">
          No topics yet. Process some videos first.
        </p>
      ) : (
        <div className="space-y-8">
          {categories.map((category) => {
            const segments = getSegmentsByCategory(category);
            return (
              <section key={category} id={category}>
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-lg font-semibold capitalize">
                    {category}
                  </h2>
                  <Badge variant="secondary">{segments.length}</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {segments.map((segment) => (
                    <SegmentCard
                      key={`${segment.lessonId}-${segment.segmentIndex}`}
                      segment={segment}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
