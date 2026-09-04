"use client";

import { useEffect } from "react";

export default function AgentError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    const t = setInterval(reset, 1500);
    return () => clearInterval(t);
  }, [reset]);

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        gap: 12,
        padding: 40,
        textAlign: "center",
        fontFamily: "inherit",
      }}
    >
      <div aria-hidden="true" style={{ width: 42, height: 42, borderRadius: 21, background: "#425ee8", boxShadow: "0 0 0 8px #425ee818" }} />
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
        Persona is reconnecting…
      </h2>
      <p
        style={{ color: "#6b7280", maxWidth: 420, lineHeight: 1.5, margin: 0 }}
      >
        The local agent or live data connection briefly dropped. This page will
        retry automatically, or you can retry now.
      </p>
      <button onClick={reset} style={{ border: 0, borderRadius: 8, background: "#171b28", color: "white", padding: "9px 14px", cursor: "pointer" }}>Retry now</button>
    </main>
  );
}
