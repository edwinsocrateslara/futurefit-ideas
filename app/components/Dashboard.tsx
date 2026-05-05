"use client";

import { useState, useEffect, useTransition } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DashboardData, DashboardEasyWin, DashboardSelection, DoneItem } from "@/lib/data/dashboard";
import PatternCard from "@/app/components/PatternCard";
import { BOARDS, BOARD_BY_SLUG } from "@/config/boards";
import { Copy, Check } from "lucide-react";

// ── Token maps ─────────────────────────────────────────────────────────────────

const BOARD_ACCENTS: Record<string, string> = {
  "platform-feedback": "oklch(0.74 0.14 245)",
  "customer-ideas":    "oklch(0.78 0.14 165)",
  "market-ideas":      "oklch(0.76 0.16 300)",
  "ux-inspiration":    "oklch(0.82 0.14 95)",
};

// ── Atoms ──────────────────────────────────────────────────────────────────────

function BoardTag({ slug }: { slug: string }) {
  const label = BOARD_BY_SLUG[slug]?.name ?? slug;
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

// ── Metric cards ──────────────────────────────────────────────────────────────

function MetricCard({
  count,
  label,
  accentColor,
  items,
  onItemClick,
  coldStart = false,
}: {
  count: number;
  label: string;
  accentColor: string;
  items: { canny_id: string; title: string }[];
  onItemClick: (cannyId: string) => void;
  coldStart?: boolean;
}) {
  const showItems = !coldStart && items.length > 0;
  return (
    <div
      style={{
        flex: 1,
        padding: "16px 20px",
        background: "oklch(0.16 0 0)",
        border: "1px solid oklch(1 0 0 / 0.06)",
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 28,
          fontWeight: 500,
          fontVariantNumeric: "tabular-nums",
          color: "oklch(0.97 0 0)",
          lineHeight: 1,
          marginBottom: 4,
        }}
      >
        {count}
      </div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 1.0,
          textTransform: "uppercase",
          color: accentColor,
          marginBottom: showItems || coldStart ? 12 : 0,
        }}
      >
        {label}
      </div>
      {showItems && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {items.map((item) => (
            <button
              key={item.canny_id}
              type="button"
              onClick={() => onItemClick(item.canny_id)}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                textAlign: "left",
                fontSize: 12,
                color: "oklch(0.68 0 0)",
                lineHeight: 1.4,
                textWrap: "pretty",
              }}
            >
              {item.title}
            </button>
          ))}
        </div>
      )}
      {coldStart && (
        <p style={{ margin: 0, fontSize: 11, color: "oklch(0.38 0 0)", fontStyle: "italic" }}>
          Comparison data starts next week
        </p>
      )}
    </div>
  );
}

// ── Tab bar ────────────────────────────────────────────────────────────────────

type TabId = "signals" | "easy-wins" | "patterns" | "done";

function TabBar({
  active,
  signalCount,
  easyWinCount,
  patternCount,
  doneCount,
  onSelect,
}: {
  active: TabId;
  signalCount: number;
  easyWinCount: number;
  patternCount: number;
  doneCount: number;
  onSelect: (id: TabId) => void;
}) {
  const tabs: { id: TabId; label: string }[] = [
    { id: "signals",   label: "Top 10 Signals" },
    { id: "easy-wins", label: `Easy Wins · ${easyWinCount}` },
    { id: "patterns",  label: `Patterns · ${patternCount}` },
    { id: "done",      label: `Done · ${doneCount}` },
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
              background: isActive ? "oklch(0.45 0.20 295)" : "transparent",
              color: isActive ? "oklch(1 0 0)" : "oklch(0.65 0 0)",
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
  displayRank,
  isOverridden,
  doneSet,
  onToggleDone,
  suppressNewBadge = false,
  dragHandleListeners,
}: {
  item: DashboardSelection;
  displayRank: number;
  isOverridden: boolean;
  doneSet: Set<string>;
  onToggleDone: (item: DashboardSelection) => void;
  suppressNewBadge?: boolean;
  dragHandleListeners?: Record<string, unknown>;
}) {
  const isDone = doneSet.has(item.canny_id);
  const [copied, setCopied] = useState(false);
  const [jiraHovered, setJiraHovered] = useState(false);
  const [doneHovered, setDoneHovered] = useState(false);

  function handleCopy() {
    if (!item.jira_story) return;
    navigator.clipboard.writeText(item.jira_story).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div
      id={`signal-${item.canny_id}`}
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
      {/* Rank + indicators — drag handle */}
      <div
        {...(dragHandleListeners as React.HTMLAttributes<HTMLDivElement>)}
        style={{
          alignSelf: "stretch",
          position: "relative",
          paddingTop: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          cursor: dragHandleListeners ? "grab" : "default",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        {dragHandleListeners && (
          <svg width="10" height="14" viewBox="0 0 10 14" fill="none" aria-hidden
            style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", opacity: 0.25 }}
          >
            <circle cx="3" cy="2.5" r="1.5" fill="currentColor"/>
            <circle cx="7" cy="2.5" r="1.5" fill="currentColor"/>
            <circle cx="3" cy="7" r="1.5" fill="currentColor"/>
            <circle cx="7" cy="7" r="1.5" fill="currentColor"/>
            <circle cx="3" cy="11.5" r="1.5" fill="currentColor"/>
            <circle cx="7" cy="11.5" r="1.5" fill="currentColor"/>
          </svg>
        )}
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
          {String(displayRank).padStart(2, "0")}
        </span>
        {item.is_persistent && (
          <span
            aria-label="Persistent signal"
            style={{
              display: "block",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "oklch(0.75 0.18 75)",
              flexShrink: 0,
            }}
          />
        )}
        {isOverridden && (
          <span
            style={{
              fontSize: 10,
              color: "oklch(0.38 0 0)",
              lineHeight: 1.2,
              textAlign: "center",
              whiteSpace: "normal",
              width: "100%",
            }}
          >
            Previously
            <br />
            #{item.synthesis_rank}
          </span>
        )}
      </div>

      {/* Content */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          <BoardTag slug={item.board_slug} />
          {item.is_new_this_week && !suppressNewBadge && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "2px 6px",
                fontSize: 11,
                fontWeight: 600,
                lineHeight: 1,
                letterSpacing: 0.1,
                borderRadius: 9999,
                background: "oklch(0.20 0.06 145)",
                color: "oklch(0.72 0.18 145)",
                border: "1px solid oklch(0.72 0.18 145 / 0.25)",
              }}
            >
              New
            </span>
          )}
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
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {item.jira_story && (
            <button
              type="button"
              onClick={handleCopy}
              onMouseEnter={() => setJiraHovered(true)}
              onMouseLeave={() => setJiraHovered(false)}
              disabled={copied}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: 0,
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: 0.2,
                border: "none",
                background: "transparent",
                color: copied
                  ? "oklch(0.70 0.20 145)"
                  : jiraHovered
                  ? "oklch(1 0 0)"
                  : "oklch(0.85 0 0)",
                cursor: copied ? "default" : "pointer",
                transition: "color 120ms",
              }}
            >
              {copied ? "Copied" : "Copy Jira Ticket"}
              {copied ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} strokeWidth={2} />}
            </button>
          )}
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
      </div>

      {/* Done toggle */}
      <div style={{ paddingTop: 2 }}>
        <button
          type="button"
          onClick={() => onToggleDone(item)}
          onMouseEnter={() => setDoneHovered(true)}
          onMouseLeave={() => setDoneHovered(false)}
          title={isDone ? "Mark undone" : "Mark done"}
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: isDone
              ? "1.5px solid oklch(0.55 0.16 145)"
              : doneHovered
              ? "1.5px solid oklch(0.70 0.20 145)"
              : "1.5px solid oklch(1 0 0 / 0.12)",
            background: isDone
              ? "oklch(0.24 0.06 145)"
              : doneHovered
              ? "oklch(0.70 0.20 145)"
              : "transparent",
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
              <path d="M2 6l3 3 5-5" stroke={doneHovered ? "oklch(0.15 0 0)" : "oklch(0.40 0 0)"} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Sortable signal row ────────────────────────────────────────────────────────

function SortableSignalRow(props: {
  item: DashboardSelection;
  displayRank: number;
  isOverridden: boolean;
  doneSet: Set<string>;
  onToggleDone: (item: DashboardSelection) => void;
  suppressNewBadge: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.item.canny_id });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
        position: "relative",
      }}
    >
      <SignalRow {...props} dragHandleListeners={listeners as Record<string, unknown>} />
    </div>
  );
}

// ── Easy win card ──────────────────────────────────────────────────────────────

function EasyWinCard({
  win,
  doneSet,
  onToggleDone,
}: {
  win: DashboardEasyWin;
  doneSet: Set<string>;
  onToggleDone: (win: DashboardEasyWin) => void;
}) {
  const isDone = doneSet.has(win.canny_id);
  const [copied, setCopied] = useState(false);
  const [jiraHovered, setJiraHovered] = useState(false);
  const [doneHovered, setDoneHovered] = useState(false);

  function handleCopy() {
    if (!win.jira_story) return;
    navigator.clipboard.writeText(win.jira_story).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
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
      {/* Content */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          <BoardTag slug={win.board_slug} />
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
          {win.title}
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
          {win.reason}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {win.jira_story && (
            <button
              type="button"
              onClick={handleCopy}
              onMouseEnter={() => setJiraHovered(true)}
              onMouseLeave={() => setJiraHovered(false)}
              disabled={copied}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: 0,
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: 0.2,
                border: "none",
                background: "transparent",
                color: copied
                  ? "oklch(0.70 0.20 145)"
                  : jiraHovered
                  ? "oklch(1 0 0)"
                  : "oklch(0.85 0 0)",
                cursor: copied ? "default" : "pointer",
                transition: "color 120ms",
              }}
            >
              {copied ? "Copied" : "Copy Jira Ticket"}
              {copied ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} strokeWidth={2} />}
            </button>
          )}
          {win.canny_url && (
            <a
              href={win.canny_url}
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
      </div>

      {/* Done toggle */}
      <div style={{ paddingTop: 2 }}>
        <button
          type="button"
          onClick={() => onToggleDone(win)}
          onMouseEnter={() => setDoneHovered(true)}
          onMouseLeave={() => setDoneHovered(false)}
          title={isDone ? "Mark undone" : "Mark done"}
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: isDone
              ? "1.5px solid oklch(0.55 0.16 145)"
              : doneHovered
              ? "1.5px solid oklch(0.70 0.20 145)"
              : "1.5px solid oklch(1 0 0 / 0.12)",
            background: isDone
              ? "oklch(0.24 0.06 145)"
              : doneHovered
              ? "oklch(0.70 0.20 145)"
              : "transparent",
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
              <path d="M2 6l3 3 5-5" stroke={doneHovered ? "oklch(0.15 0 0)" : "oklch(0.40 0 0)"} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
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
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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
            onMouseEnter={() => setHoveredId(item.canny_id)}
            onMouseLeave={() => setHoveredId(null)}
            title="Mark undone"
            style={{
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: 500,
              borderRadius: 6,
              border: hoveredId === item.canny_id
                ? "1px solid oklch(0.70 0.20 145)"
                : "1px solid oklch(1 0 0 / 0.10)",
              background: hoveredId === item.canny_id ? "oklch(0.70 0.20 145)" : "transparent",
              color: hoveredId === item.canny_id ? "oklch(0.15 0 0)" : "oklch(0.55 0 0)",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "background 150ms, border-color 150ms, color 150ms",
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

  // Drag-and-drop state
  const [mounted, setMounted] = useState(false);
  const [confirmHovered, setConfirmHovered] = useState(false);
  const [confirmActive, setConfirmActive] = useState(false);
  useEffect(() => setMounted(true), []);

  const [localOrderIds, setLocalOrderIds] = useState<string[]>(
    () => data.selections.map((s) => s.canny_id)
  );
  const [pendingReorder, setPendingReorder] = useState<{
    movedId: string;
    newRank: number;
    prevOrderIds: string[];
  } | null>(null);
  const [clientOverrides, setClientOverrides] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const s of data.selections) {
      if (s.is_overridden) init[s.canny_id] = true;
    }
    return init;
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

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

  async function handleEasyWinToggleDone(win: DashboardEasyWin) {
    const wasDone = doneSet.has(win.canny_id);

    if (wasDone) {
      setDoneItems((prev) => prev.filter((d) => d.canny_id !== win.canny_id));
    } else {
      setDoneItems((prev) => [
        {
          canny_id: win.canny_id,
          title: win.title,
          board_slug: win.board_slug,
          board_name: win.board_name,
          priority_rank: null,
          selection_week: data.week_of,
          marked_done_at: new Date().toISOString(),
        },
        ...prev,
      ]);
    }

    startTransition(async () => {
      const res = await fetch(`/api/ideas/${win.canny_id}/done`, { method: "PATCH" });
      if (!res.ok) {
        if (wasDone) {
          setDoneItems((prev) => [
            {
              canny_id: win.canny_id,
              title: win.title,
              board_slug: win.board_slug,
              board_name: win.board_name,
              priority_rank: null,
              selection_week: data.week_of,
              marked_done_at: new Date().toISOString(),
            },
            ...prev,
          ]);
        } else {
          setDoneItems((prev) => prev.filter((d) => d.canny_id !== win.canny_id));
        }
      }
    });
  }

  function handleUnmark(cannyId: string) {
    const item = data.selections.find((s) => s.canny_id === cannyId);
    if (item) { handleToggleDone(item); return; }
    const win = data.easy_wins.find((w) => w.canny_id === cannyId);
    if (win) handleEasyWinToggleDone(win);
  }

  function scrollToSignal(cannyId: string) {
    setActiveTab("signals");
    setTimeout(() => {
      document.getElementById(`signal-${cannyId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }

  const selectionMap = new Map(data.selections.map((s) => [s.canny_id, s]));
  const displaySignals = localOrderIds
    .map((id) => selectionMap.get(id))
    .filter((s): s is DashboardSelection => s !== undefined && !doneSet.has(s.canny_id));
  const activeSignalIds = displaySignals.map((s) => s.canny_id);

  const isColdStart = data.selections.length > 0 && data.new_count === data.selections.length;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localOrderIds.indexOf(active.id as string);
    const newIndex = localOrderIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrderIds = arrayMove(localOrderIds, oldIndex, newIndex);
    const newRank = newIndex + 1;

    setPendingReorder({ movedId: active.id as string, newRank, prevOrderIds: localOrderIds });
    setLocalOrderIds(newOrderIds);
  }

  function handleCancelReorder() {
    if (!pendingReorder) return;
    setLocalOrderIds(pendingReorder.prevOrderIds);
    setPendingReorder(null);
  }

  async function handleConfirmReorder() {
    if (!pendingReorder) return;
    const { movedId, newRank } = pendingReorder;
    const item = selectionMap.get(movedId);
    if (!item) { setPendingReorder(null); return; }

    startTransition(async () => {
      await fetch(`/api/selections/${movedId}/override`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week_of: data.week_of,
          original_rank: item.synthesis_rank,
          new_rank: newRank,
        }),
      });
    });

    if (newRank === item.synthesis_rank) {
      setClientOverrides((prev) => { const n = { ...prev }; delete n[movedId]; return n; });
    } else {
      setClientOverrides((prev) => ({ ...prev, [movedId]: true }));
    }
    setPendingReorder(null);
  }

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
              FutureFit Ideas
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
            <span>Synthesized from {data.input_item_count} ideas</span>
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
          {BOARDS.map((board) => {
            const count = data.board_distribution[board.slug] ?? 0;
            const accent = BOARD_ACCENTS[board.slug] ?? "oklch(0.72 0 0)";
            return (
              <div
                key={board.slug}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  background: "oklch(0.205 0 0)",
                  border: "1px solid oklch(1 0 0 / 0.08)",
                  borderRadius: 9999,
                  opacity: count === 0 ? 0.45 : 1,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: "oklch(0.92 0 0)" }}>
                  {board.name}
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

      {/* Metric cards */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <MetricCard
          count={data.persistent_count}
          label="Persistent · 4+ weeks running"
          accentColor="oklch(0.72 0.14 75)"
          items={data.persistent_titles}
          onItemClick={scrollToSignal}
          coldStart={isColdStart}
        />
        <MetricCard
          count={data.new_count}
          label="New this week"
          accentColor="oklch(0.70 0.20 145)"
          items={data.new_titles}
          onItemClick={scrollToSignal}
          coldStart={isColdStart}
        />
      </div>

      {/* Tab navigation */}
      <TabBar
        active={activeTab}
        signalCount={data.selections.length}
        easyWinCount={data.easy_wins.length}
        patternCount={data.patterns.length}
        doneCount={doneItems.length}
        onSelect={setActiveTab}
      />

      {/* Tab content */}
      {activeTab === "signals" && (
        mounted ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={activeSignalIds} strategy={verticalListSortingStrategy}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {displaySignals.map((item, index) => (
                  <SortableSignalRow
                    key={item.canny_id}
                    item={item}
                    displayRank={index + 1}
                    isOverridden={clientOverrides[item.canny_id] ?? item.is_overridden}
                    doneSet={doneSet}
                    onToggleDone={handleToggleDone}
                    suppressNewBadge={isColdStart}
                  />
                ))}
                {displaySignals.length === 0 && (
                  <p style={{ fontSize: 13, color: "oklch(0.50 0 0)", margin: 0 }}>
                    All signals marked done.
                  </p>
                )}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {displaySignals.map((item, index) => (
              <SignalRow
                key={item.canny_id}
                item={item}
                displayRank={index + 1}
                isOverridden={clientOverrides[item.canny_id] ?? item.is_overridden}
                doneSet={doneSet}
                onToggleDone={handleToggleDone}
                suppressNewBadge={isColdStart}
              />
            ))}
          </div>
        )
      )}

      {/* Reorder confirmation modal */}
      {pendingReorder && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "oklch(0 0 0 / 0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: "oklch(0.18 0 0)",
              border: "1px solid oklch(1 0 0 / 0.12)",
              borderRadius: 16,
              padding: "28px 32px",
              maxWidth: 420,
              width: "calc(100% - 48px)",
            }}
          >
            <h2
              style={{
                margin: "0 0 10px 0",
                fontSize: 17,
                fontWeight: 600,
                letterSpacing: -0.3,
                color: "oklch(0.97 0 0)",
              }}
            >
              Reorder Idea
            </h2>
            <p
              style={{
                margin: "0 0 24px 0",
                fontSize: 14,
                lineHeight: 1.6,
                color: "oklch(0.68 0 0)",
              }}
            >
              You&apos;re changing the order for this week. This will inform what gets prioritized in next week&apos;s synthesis as your team&apos;s top priorities.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={handleCancelReorder}
                style={{
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 500,
                  borderRadius: 6,
                  border: "1px solid oklch(1 0 0 / 0.12)",
                  background: "transparent",
                  color: "oklch(0.60 0 0)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReorder}
                onMouseEnter={() => setConfirmHovered(true)}
                onMouseLeave={() => { setConfirmHovered(false); setConfirmActive(false); }}
                onMouseDown={() => setConfirmActive(true)}
                onMouseUp={() => setConfirmActive(false)}
                style={{
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 500,
                  borderRadius: 6,
                  border: "none",
                  background: confirmActive
                    ? "oklch(0.40 0.20 295)"
                    : confirmHovered
                    ? "oklch(0.50 0.20 295)"
                    : "oklch(0.45 0.20 295)",
                  color: "oklch(1 0 0)",
                  cursor: "pointer",
                  transition: "background 120ms",
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "easy-wins" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {data.easy_wins.filter((w) => !doneSet.has(w.canny_id)).map((win) => (
            <EasyWinCard
              key={win.canny_id}
              win={win}
              doneSet={doneSet}
              onToggleDone={handleEasyWinToggleDone}
            />
          ))}
          {data.easy_wins.length > 0 && data.easy_wins.every((w) => doneSet.has(w.canny_id)) && (
            <p style={{ fontSize: 13, color: "oklch(0.50 0 0)", margin: 0 }}>
              All easy wins marked done.
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
