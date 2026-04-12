import { Badge } from "@/components/ui/badge";

export function SpeakerLabel({ speaker }: { speaker: string }) {
  const isCoach = speaker.toLowerCase() === "coach";
  return (
    <Badge variant={isCoach ? "default" : "secondary"}>
      {speaker}
    </Badge>
  );
}
