"use client";

import { useState } from "react";
import type { DashboardPattern } from "@/lib/data/dashboard";
import type { RoadmapAlignment } from "@/lib/supabase/types";

const ALIGNMENT_LABELS: Record<RoadmapAlignment, string> = {
  no_match: "No match",
  partial_overlap: "Partial overlap",
  aligned: "Aligned",
  contradicts: "Contradicts",
};

const ALIGNMENT_TONES: Record<RoadmapAlignment, { dot: string; fg: string; bg: string; ring: string }> = {
  no_match:        { dot: "oklch(0.60 0 0)",      fg: "oklch(0.78 0 0)",       bg: "oklch(0.30 0 0 / 0.7)",       ring: "oklch(1 0 0 / 0.10)"         },
  partial_overlap: { dot: "oklch(0.78 0.16 75)",  fg: "oklch(0.88 0.10 75)",   bg: "oklch(0.30 0.08 75 / 0.55)",  ring: "oklch(0.55 0.12 75 / 0.5)"  },
  aligned:         { dot: "oklch(0.78 0.14 165)", fg: "oklch(0.88 0.10 165)",  bg: "oklch(0.30 0.08 165 / 0.55)", ring: "oklch(0.52 0.12 165 / 0.5)" },
  contradicts:     { dot: "oklch(0.72 0.19 25)",  fg: "oklch(0.86 0.10 25)",   bg: "oklch(0.32 0.10 25 / 0.55)",  ring: "oklch(0.55 0.16 25 / 0.5)"  },
};

function AlignmentChip({ alignment }: { alignment: RoadmapAlignment }) {
  const tone = ALIGNMENT_TONES[alignment];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 500,
        lineHeight: 1,
        letterSpacing: 0.1,
        borderRadius: 9999,
        color: tone.fg,
        background: tone.bg,
        boxShadow: `inset 0 0 0 1px ${tone.ring}`,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: tone.dot, flexShrink: 0 }} />
      {ALIGNMENT_LABELS[alignment]}
    </span>
  );
}

function ScopeChip({ scope }: { scope: string }) {
  const isCross = scope === "cross-board";
  const dot = isCross ? "oklch(0.74 0.14 245)" : "oklch(0.55 0 0)";
  const label = isCross ? "Cross-board" : "Single-board";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 500,
        lineHeight: 1,
        letterSpacing: 0.1,
        borderRadius: 9999,
        color: "oklch(0.78 0 0)",
        background: "transparent",
        boxShadow: "inset 0 0 0 1px oklch(1 0 0 / 0.10)",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, flexShrink: 0 }} />
      {label}
    </span>
  );
}

type Tab = "framing" | "questions" | "possibilities";

export default function PatternCard({ pattern }: { pattern: DashboardPattern }) {
  const [tab, setTab] = useState<Tab>("possibilities");

  const tabs: { id: Tab; label: string }[] = [
    { id: "framing", label: "Framing" },
    { id: "questions", label: `Questions · ${pattern.angles.questions.length}` },
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
      {/* Header */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 600,
            lineHeight: 1.4,
            color: "oklch(0.97 0 0)",
            letterSpacing: -0.2,
            flex: "1 1 320px",
            minWidth: 0,
          }}
        >
          {pattern.title}
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <AlignmentChip alignment={pattern.roadmap_alignment} />
        </div>
      </div>

      {/* Scope chip */}
      <div style={{ marginBottom: 16 }}>
        <ScopeChip scope={pattern.board_scope} />
      </div>

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
                  background: active ? "oklch(0.27 0 0)" : "transparent",
                  color: active ? "oklch(0.97 0 0)" : "oklch(0.65 0 0)",
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

        {tab === "questions" && (
          <ol
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {pattern.angles.questions.map((q, i) => (
              <li
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "20px 1fr",
                  gap: 8,
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: "oklch(0.85 0 0)",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    lineHeight: 1,
                    color: "oklch(0.50 0 0)",
                    paddingTop: 2,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  Q{i + 1}
                </span>
                <span style={{ textWrap: "pretty" }}>{q}</span>
              </li>
            ))}
          </ol>
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
