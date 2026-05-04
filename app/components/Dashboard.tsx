"use client";

import { useState, useTransition } from "react";
import type { DashboardData, DashboardSelection, DoneItem } from "@/lib/data/dashboard";
import PatternCard from "@/app/components/PatternCard";

// ── Token maps ─────────────────────────────────────────────────────────────────

const BOARD_LABELS: Record<string, string> = {
  "platform-feedback": "Platform",
  "customer-ideas":    "Customer",
  "market-ideas":      "Market",
  "ux-inspiration":    "UX",
};

const BOARD_ACCENTS: Record<string, string> = {
  "platform-feedback": "oklch(0.74 0.14 245)",
  "customer-ideas":    "oklch(0.78 0.14 165)",
  "market-ideas":      "oklch(0.76 0.16 300)",
  "ux-inspiration":    "oklch(0.82 0.14 95)",
};

// ── Atoms ──────────────────────────────────────────────────────────────────────

function BoardTag({ slug }: { slug: string }) {
  const label = BOARD_LABELS[slug] ?? slug;
  const accent = BOARD_ACCENTS[slug] ?? "oklch(0.72 0 0)";
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
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent }} />
      {label}
    </span>
  );
}

// ── Tab bar ────────────────────────────────────────────────────────────────────

type TabId = "signals" | "patterns" | "done";

function TabBar({
  active,
  signalCount,
  patternCount,
  doneCount,
  onSelect,
}: {
  active: TabId;
  signalCount: number;
  patternCount: number;
  doneCount: number;
  onSelect: (id: TabId) => void;
}) {
  const tabs: { id: TabId; label: string }[] = [
    { id: "signals",  label: "Top 10 Signals" },
    { id: "patterns", label: `Patterns · ${patternCount}` },
    { id: "done",     label: `Done · ${doneCount}` },
  ];

  return (
    <div
      role="tablist"
      style={{
        display: "inline-flex",
        background: "oklch(0.145 0 0)",
        padding: 3,
        borderRadius: 9999,
        border: "1px solid oklch(1 0 0 / 0.08)",
        marginBottom: 28,
        gap: 2,
      }}
    >
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(t.id)}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 500,
              lineHeight: 1,
              letterSpacing: 0.1,
              borderRadius: 9999,
              border: "none",
              cursor: "pointer",
              background: isActive ? "oklch(0.27 0 0)" : "transparent",
              color: isActive ? "oklch(0.97 0 0)" : "oklch(0.65 0 0)",
              transition: "background 120ms, color 120ms",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Signal row ─────────────────────────────────────────────────────────────────

function SignalRow({
  item,
  doneSet,
  onToggleDone,
}: {
  item: DashboardSelection;
  doneSet: Set<string>;
  onToggleDone: (item: DashboardSelection) => void;
}) {
  const isDone = doneSet.has(item.canny_id);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "44px 1fr auto",
        gap: 20,
        padding: "20px 24px",
        background: "oklch(0.18 0 0)",
        border: "1px solid oklch(1 0 0 / 0.08)",
        borderRadius: 12,
        alignItems: "start",
        opacity: isDone ? 0.45 : 1,
        transition: "opacity 150ms",
      }}
    >
      {/* Rank */}
      <div style={{ paddingTop: 2 }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 20,
            fontWeight: 500,
            fontVariantNumeric: "tabular-nums",
            color: "oklch(0.32 0 0)",
            lineHeight: 1,
            letterSpacing: -0.5,
          }}
        >
          {String(item.priority_rank).padStart(2, "0")}
        </span>
      </div>

      {/* Content */}
      <div>
        <div style={{ marginBottom: 8 }}>
          <BoardTag slug={item.board_slug} />
        </div>
        <p
          style={{
            margin: "0 0 8px 0",
            fontSize: 16,
            fontWeight: 600,
            lineHeight: 1.4,
            color: "oklch(0.97 0 0)",
            letterSpacing: -0.2,
          }}
        >
          {item.title}
        </p>
        <p
          style={{
            margin: "0 0 8px 0",
            fontSize: 13,
            lineHeight: 1.6,
            color: "oklch(0.85 0 0)",
            textWrap: "pretty",
          }}
        >
          {item.reason}
        </p>
        {item.canny_url && (
          <a
            href={item.canny_url}
            target="_blank"
            rel="noopener noreferrer"
            className="canny-link"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              color: "oklch(0.55 0 0)",
              textDecoration: "none",
              letterSpacing: 0.2,
            }}
          >
            View in Canny →
          </a>
        )}
      </div>

      {/* Done toggle */}
      <div style={{ paddingTop: 2 }}>
        <button
          type="button"
          onClick={() => onToggleDone(item)}
          title={isDone ? "Mark undone" : "Mark done"}
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: isDone
              ? "1.5px solid oklch(0.55 0.16 145)"
              : "1.5px solid oklch(1 0 0 / 0.12)",
            background: isDone ? "oklch(0.24 0.06 145)" : "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transition: "border-color 150ms, background 150ms",
          }}
        >
          {isDone ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="oklch(0.70 0.20 145)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="oklch(0.40 0 0)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Done tab ───────────────────────────────────────────────────────────────────

function DoneTab({
  items,
  onUnmark,
}: {
  items: DoneItem[];
  onUnmark: (cannyId: string) => void;
}) {
  if (items.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "oklch(0.50 0 0)", margin: 0 }}>
        No items marked done yet.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map((item) => (
        <div
          key={item.canny_id}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 16,
            padding: "16px 20px",
            background: "oklch(0.16 0 0)",
            border: "1px solid oklch(1 0 0 / 0.06)",
            borderRadius: 10,
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <BoardTag slug={item.board_slug} />
              {item.selection_week && (
                <span style={{ fontSize: 11, color: "oklch(0.45 0 0)", letterSpacing: 0.2 }}>
                  {item.selection_week}
                </span>
              )}
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 500,
                color: "oklch(0.70 0 0)",
                lineHeight: 1.4,
                textDecoration: "line-through",
                textDecorationColor: "oklch(0.35 0 0)",
              }}
            >
              {item.title}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onUnmark(item.canny_id)}
            title="Mark undone"
            style={{
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: 500,
              borderRadius: 9999,
              border: "1px solid oklch(1 0 0 / 0.10)",
              background: "transparent",
              color: "oklch(0.55 0 0)",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "color 120ms, border-color 120ms",
            }}
          >
            Undo
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function Dashboard({
  data,
  initialDoneItems,
  weekLabel,
}: {
  data: DashboardData;
  initialDoneItems: DoneItem[];
  weekLabel: string;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("signals");
  const [doneItems, setDoneItems] = useState<DoneItem[]>(initialDoneItems);
  const [, startTransition] = useTransition();

  const doneSet = new Set(doneItems.map((d) => d.canny_id));

  async function handleToggleDone(item: DashboardSelection) {
    const wasDone = doneSet.has(item.canny_id);

    // Optimistic update
    if (wasDone) {
      setDoneItems((prev) => prev.filter((d) => d.canny_id !== item.canny_id));
    } else {
      const newDone: DoneItem = {
        canny_id: item.canny_id,
        title: item.title,
        board_slug: item.board_slug,
        board_name: item.board_name,
        priority_rank: item.priority_rank,
        selection_week: data.week_of,
        marked_done_at: new Date().toISOString(),
      };
      setDoneItems((prev) => [newDone, ...prev]);
    }

    startTransition(async () => {
      const res = await fetch(`/api/ideas/${item.canny_id}/done`, { method: "PATCH" });
      if (!res.ok) {
        // Revert on error
        if (wasDone) {
          const reverted: DoneItem = {
            canny_id: item.canny_id,
            title: item.title,
            board_slug: item.board_slug,
            board_name: item.board_name,
            priority_rank: item.priority_rank,
            selection_week: data.week_of,
            marked_done_at: new Date().toISOString(),
          };
          setDoneItems((prev) => [reverted, ...prev]);
        } else {
          setDoneItems((prev) => prev.filter((d) => d.canny_id !== item.canny_id));
        }
      }
    });
  }

  function handleUnmark(cannyId: string) {
    const item = data.selections.find((s) => s.canny_id === cannyId);
    if (!item) return;
    handleToggleDone(item);
  }

  const activeSignals = data.selections.filter((s) => !doneSet.has(s.canny_id));

  return (
    <>
      {/* Header */}
      <header style={{ marginBottom: 32 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 8,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 1.6,
                textTransform: "uppercase",
                color: "oklch(0.65 0 0)",
                marginBottom: 4,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "oklch(0.70 0.22 293)",
                  boxShadow: "0 0 0 3px oklch(0.70 0.22 293 / 0.22)",
                }}
              />
              Generated {weekLabel}
            </div>
            <h1
              style={{
                fontSize: 32,
                fontWeight: 600,
                letterSpacing: -0.6,
                lineHeight: 1.1,
                color: "oklch(0.985 0 0)",
                margin: 0,
              }}
            >
              FutureFit Signals
            </h1>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: "oklch(0.65 0 0)",
          }}
        >
          {data.input_item_count != null && (
            <span>{data.input_item_count} ideas analyzed</span>
          )}
        </div>
      </header>

      {/* Board distribution */}
      <section style={{ marginBottom: 32 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 1.6,
            textTransform: "uppercase",
            color: "oklch(0.65 0 0)",
            marginBottom: 12,
          }}
        >
          Board breakdown
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {Object.entries(data.board_distribution).map(([slug, count]) => {
            const label = BOARD_LABELS[slug] ?? slug;
            const accent = BOARD_ACCENTS[slug] ?? "oklch(0.72 0 0)";
            return (
              <div
                key={slug}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  background: "oklch(0.205 0 0)",
                  border: "1px solid oklch(1 0 0 / 0.08)",
                  borderRadius: 9999,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: "oklch(0.92 0 0)" }}>
                  {label}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: "oklch(0.65 0 0)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Tab navigation */}
      <TabBar
        active={activeTab}
        signalCount={data.selections.length}
        patternCount={data.patterns.length}
        doneCount={doneItems.length}
        onSelect={setActiveTab}
      />

      {/* Tab content */}
      {activeTab === "signals" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {activeSignals.map((item) => (
            <SignalRow
              key={item.canny_id}
              item={item}
              doneSet={doneSet}
              onToggleDone={handleToggleDone}
            />
          ))}
          {activeSignals.length === 0 && (
            <p style={{ fontSize: 13, color: "oklch(0.50 0 0)", margin: 0 }}>
              All signals marked done.
            </p>
          )}
        </div>
      )}

      {activeTab === "patterns" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {data.patterns.map((p) => (
            <PatternCard key={p.id} pattern={p} />
          ))}
          {data.patterns.length === 0 && (
            <p style={{ fontSize: 13, color: "oklch(0.50 0 0)", margin: 0 }}>
              No patterns detected this week.
            </p>
          )}
        </div>
      )}

      {activeTab === "done" && (
        <DoneTab items={doneItems} onUnmark={handleUnmark} />
      )}
    </>
  );
}
