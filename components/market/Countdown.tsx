"use client";

import { useEffect, useState } from "react";

export function Countdown({ closesAt }: { closesAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const remainingMs = Math.max(0, closesAt - now);
  const seconds = Math.ceil(remainingMs / 1000);

  return (
    <span className="font-mono tabular-nums" style={{ color: seconds <= 5 ? "var(--warn)" : "var(--accent)" }}>
      {seconds}s
    </span>
  );
}
