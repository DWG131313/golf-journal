import { notFound } from "next/navigation";
import {
  getSessionById,
  getTranscriptForVideo,
  listSegmentsForVideo,
  listTopicMentionsForVideo,
  listDrillMentionsForVideo,
} from "@/lib/db";
import LessonClient, { type VideoBlock } from "./LessonClient";

// `[id]` is the session_id (a lesson = a coaching session = a date). The
// session contains one or more video recordings. Deep links from topic /
// ask / drill pages embed `?v={video_id}&t={seconds}` so the page can
// auto-scroll to the right recording and seek to the right moment.
export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string; v?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const sessionId = Number(id);
  if (!Number.isFinite(sessionId)) notFound();

  const session = getSessionById(sessionId);
  if (!session) notFound();

  const videoBlocks: VideoBlock[] = session.videos.map((video) => ({
    video,
    transcript: getTranscriptForVideo(video.id),
    segments: listSegmentsForVideo(video.id),
    topicMentions: listTopicMentionsForVideo(video.id),
    drillMentions: listDrillMentionsForVideo(video.id),
  }));

  const requestedVideoId = sp.v ? Number(sp.v) : null;
  const videoIdsInSession = new Set(session.videos.map((v) => v.id));
  const initialVideoId =
    requestedVideoId !== null &&
    Number.isFinite(requestedVideoId) &&
    videoIdsInSession.has(requestedVideoId)
      ? requestedVideoId
      : session.videos[0]?.id ?? null;

  const requestedTime = sp.t ? Number(sp.t) : 0;
  const initialTime = Number.isFinite(requestedTime) ? requestedTime : 0;

  return (
    <LessonClient
      session={session}
      videoBlocks={videoBlocks}
      initialVideoId={initialVideoId}
      initialTime={initialTime}
    />
  );
}
