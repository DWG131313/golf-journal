import { notFound } from "next/navigation";
import {
  getVideoById,
  getTranscriptForVideo,
  listSegmentsForVideo,
  listTopicMentionsForVideo,
  listDrillMentionsForVideo,
} from "@/lib/db";
import LessonClient from "./LessonClient";

export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const videoId = Number(id);
  if (!Number.isFinite(videoId)) notFound();

  const video = getVideoById(videoId);
  if (!video) notFound();

  const transcript = getTranscriptForVideo(videoId);
  const segments = listSegmentsForVideo(videoId);
  const topicMentions = listTopicMentionsForVideo(videoId);
  const drillMentions = listDrillMentionsForVideo(videoId);

  const initialTime = sp.t ? Number(sp.t) : 0;

  return (
    <LessonClient
      video={video}
      transcript={transcript}
      segments={segments}
      topicMentions={topicMentions}
      drillMentions={drillMentions}
      initialTime={Number.isFinite(initialTime) ? initialTime : 0}
    />
  );
}
