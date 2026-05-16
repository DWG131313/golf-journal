"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function QuickAsk() {
  const router = useRouter();
  const [q, setQ] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = q.trim();
    if (!trimmed) return;
    router.push(`/ask?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="group relative border-b-2 border-stone-800 transition-colors focus-within:border-moss-500"
    >
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ask anything in plain English…"
        className="w-full bg-transparent py-5 pr-32 font-serif text-2xl italic text-stone-100 placeholder:text-stone-700 focus:outline-none md:text-3xl"
      />
      <button
        type="submit"
        disabled={!q.trim()}
        className="small-caps absolute right-0 top-1/2 -translate-y-1/2 text-xs text-moss-300 transition-colors hover:text-moss-300/70 disabled:cursor-not-allowed disabled:text-stone-700"
      >
        Ask →
      </button>
    </form>
  );
}
