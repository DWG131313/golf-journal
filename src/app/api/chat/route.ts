import { streamText, convertToModelMessages } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { buildSystemPrompt } from "@/lib/rag";
import type { UIMessage } from "ai";

export async function POST(request: Request) {
  const { messages } = (await request.json()) as { messages: UIMessage[] };

  // Extract the latest user message text for RAG retrieval
  const lastUserMessage = [...messages]
    .reverse()
    .find((m) => m.role === "user");

  const queryText =
    lastUserMessage?.parts
      ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" ") ?? "";

  const systemPrompt = buildSystemPrompt(queryText);

  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
