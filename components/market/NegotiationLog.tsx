"use client";

import { useEffect, useRef } from "react";
import type { LogEntry } from "@/lib/protocol";

const KIND_COLOR: Record<LogEntry["kind"], string> = {
  rfo: "var(--accent)",
  offer: "var(--foreground)",
  accept: "var(--good)",
};

export function NegotiationLog({ entries }: { entries: LogEntry[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [entries.length]);

  return (
    <div className="flex h-96 flex-col gap-2 overflow-y-auto rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
      {entries.length === 0 && (
        <p className="m-auto text-sm" style={{ color: "var(--muted)" }}>
          No activity yet — waiting for a Festival-Goer to open a round.
        </p>
      )}
      {entries.map((entry) => (
        <div key={entry.id} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--hairline)", background: "var(--surface)" }}>
          <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: KIND_COLOR[entry.kind] }}>
            {entry.actor}
          </div>
          <div>{entry.text}</div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
