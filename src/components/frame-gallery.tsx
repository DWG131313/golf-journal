"use client";

import Image from "next/image";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

export function FrameGallery({
  lessonId,
  frames,
}: {
  lessonId: string;
  frames: string[];
}) {
  if (frames.length === 0) return null;

  return (
    <ScrollArea className="w-full whitespace-nowrap">
      <div className="flex gap-3 pb-4">
        {frames.map((filename) => (
          <div
            key={filename}
            className="relative h-40 w-64 shrink-0 overflow-hidden rounded-md border"
          >
            <Image
              src={`/api/frames/${lessonId}/${filename}`}
              alt={filename.replace(".png", "")}
              fill
              className="object-cover"
              sizes="256px"
            />
          </div>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
