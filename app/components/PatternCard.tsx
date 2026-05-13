"use client";

import { useState } from "react";
import type { DashboardPattern } from "@/lib/data/dashboard";

type Tab = "framing" | "possibilities";

export default function PatternCard({ pattern }: { pattern: DashboardPattern }) {
  const [tab, setTab] = useState<Tab>("possibilities");

  const tabs: { id: Tab; label: string }[] = [
    { id: "framing", label: "Framing" },
    { id: "possibilities", label: `Possibilities · ${pattern.angles.possibilities.length}` },
  ];

  return (
    <article
      style={{
        background: "oklch(0.18 0 0)",
        border: "1px solid oklch(1 0 0 / 0.08)",
        borderRadius: 12,
        padding: "20px 24px",
      }}
    >
      {/* Title */}
      <h3
        style={{
          margin: "0 0 6px 0",
          fontSize: 16,
          fontWeight: 600,
          lineHeight: 1.4,
          color: "oklch(0.97 0 0)",
          letterSpacing: -0.2,
        }}
      >
        {pattern.title}
      </h3>

      {/* Lineage indicator — only shown when pattern has recurred */}
      {!pattern.is_first_appearance && (
        <p
          style={{
            margin: "0 0 12px 0",
            fontSize: 11,
            color: "oklch(0.48 0 0)",
            letterSpacing: 0.1,
          }}
        >
          {`Week ${pattern.weeks_active} of this theme`}
        </p>
      )}

      {/* Summary */}
      <p
        style={{
          margin: "0 0 16px 0",
          fontSize: 13,
          lineHeight: 1.6,
          color: "oklch(0.85 0 0)",
          textWrap: "pretty",
        }}
      >
        {pattern.summary}
      </p>

      {/* Angles — segmented tabs */}
      <div style={{ borderTop: "1px solid oklch(1 0 0 / 0.08)", paddingTop: 16 }}>
        <div
          role="tablist"
          style={{
            display: "inline-flex",
            background: "oklch(0.145 0 0)",
            padding: 3,
            borderRadius: 9999,
            border: "1px solid oklch(1 0 0 / 0.08)",
            marginBottom: 12,
            gap: 2,
          }}
        >
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                style={{
                  padding: "5px 11px",
                  fontSize: 11,
                  fontWeight: 500,
                  lineHeight: 1,
                  letterSpacing: 0.1,
                  borderRadius: 9999,
                  border: "none",
                  cursor: "pointer",
                  background: active ? "oklch(0.45 0.20 295)" : "transparent",
                  color: active ? "oklch(1 0 0)" : "oklch(0.65 0 0)",
                  transition: "background 120ms, color 120ms",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === "framing" && (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.6,
              color: "oklch(0.85 0 0)",
              fontStyle: "italic",
              borderLeft: "2px solid oklch(0.55 0.16 293)",
              paddingLeft: 12,
              textWrap: "pretty",
            }}
          >
            {pattern.angles.framing}
          </p>
        )}

        {tab === "possibilities" && (
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {pattern.angles.possibilities.map((p, i) => (
              <li
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "16px 1fr",
                  gap: 8,
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: "oklch(0.85 0 0)",
                }}
              >
                <span aria-hidden style={{ color: "oklch(0.55 0.16 293)", paddingTop: 1 }}>
                  →
                </span>
                <span style={{ textWrap: "pretty" }}>{p}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
