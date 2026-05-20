"use client";

import { useState, useEffect, useTransition, useRef } from "react";
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
import type { AcceptedItem, DashboardData, DashboardEasyWin, DashboardSelection, DoneItem, DoneJiraItem, PinnedItem } from "@/lib/data/dashboard";
import { STATUS_VALUES, IMPACT_RATING_VALUES, CONFIDENCE_RATING_VALUES, TEAM_CLASSIFICATION_VALUES } from "@/lib/synthesis/schema";
import type { StatusValue, TeamClassification } from "@/lib/synthesis/schema";
import { JIRA_STATUS_CATEGORY } from "@/config/jira";
import PatternCard from "@/app/components/PatternCard";
import { BOARDS, BOARD_BY_SLUG } from "@/config/boards";
import { Pin, ArrowUp, AlertTriangle, Compass, Wrench, BarChart2, RotateCcw, ChevronDown, PackageOpen, Zap, FileText, Check, Terminal, Database, GripVertical } from "lucide-react";
import Lottie from "lottie-react";
import headerAnimation from "@/public/animations/header.json";

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
        padding: "4px 8px",
        fontSize: 12,
        fontWeight: 500,
        lineHeight: 1,
        letterSpacing: 0.1,
        borderRadius: 9999,
        color: "oklch(0.72 0 0)",
        background: "oklch(0.20 0 0)",
        boxShadow: "inset 0 0 0 1px oklch(1 0 0 / 0.12)",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent }} />
      {label}
    </span>
  );
}

// ── Tier 1 Customer badge ──────────────────────────────────────────────────

function Tier1Badge({ value }: { value: string | null | undefined }) {
  if (!value) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 8px",
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1,
        letterSpacing: 0.1,
        borderRadius: 9999,
        background: "oklch(0.20 0 0)",
        color: "oklch(0.72 0 0)",
        border: "1px solid oklch(1 0 0 / 0.12)",
        whiteSpace: "nowrap",
      }}
    >
      {value}
    </span>
  );
}

// ── Status badge + override ────────────────────────────────────────────────

const STATUS_OPTIONS = STATUS_VALUES;

const STATUS_STYLES: Record<StatusValue, { bg: string; color: string; border: string }> = {
  "Contractual Requirement": {
    bg:     "oklch(0.20 0.08 25)",
    color:  "oklch(0.75 0.20 25)",
    border: "oklch(0.55 0.20 25 / 0.35)",
  },
  "Renewal Risk": {
    bg:     "oklch(0.20 0.06 75)",
    color:  "oklch(0.78 0.18 75)",
    border: "oklch(0.72 0.18 75 / 0.35)",
  },
  "Strategic": {
    bg:     "oklch(0.20 0.06 235)",
    color:  "oklch(0.70 0.15 235)",
    border: "oklch(0.55 0.15 235 / 0.35)",
  },
  "Need to Do": {
    bg:     "oklch(0.20 0 0)",
    color:  "oklch(0.65 0 0)",
    border: "oklch(1 0 0 / 0.12)",
  },
};

const STATUS_ICONS: Record<StatusValue, React.ReactNode> = {
  "Contractual Requirement": <FileText size={12} strokeWidth={2} />,
  "Renewal Risk":            <AlertTriangle size={12} strokeWidth={2} />,
  "Strategic":               <Compass size={12} strokeWidth={2} />,
  "Need to Do":              <Check size={12} strokeWidth={2} />,
};

function StatusBadge({
  status,
  isOverridden,
  onClick,
}: {
  status: StatusValue;
  isOverridden: boolean;
  onClick: () => void;
}) {
  const s = STATUS_STYLES[status];
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 8px",
        fontSize: 12,
        fontWeight: 500,
        lineHeight: 1,
        letterSpacing: 0.1,
        borderRadius: 9999,
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {status}
      <ChevronDown size={9} strokeWidth={2.5} style={{ opacity: 0.6, flexShrink: 0 }} />
    </button>
  );
}

function StatusOverridePopover({
  cannyId,
  currentStatus,
  synthesisStatus,
  isOverridden,
  onClose,
  onStatusChange,
}: {
  cannyId: string;
  currentStatus: StatusValue | null;
  synthesisStatus: StatusValue | null;
  isOverridden: boolean;
  onClose: () => void;
  onStatusChange: (status: StatusValue | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [onClose]);

  async function selectStatus(value: StatusValue | null) {
    onStatusChange(value);
    onClose();
    await fetch(`/api/ideas/${cannyId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: value }),
    });
  }

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        left: 0,
        zIndex: 50,
        background: "oklch(0.20 0 0)",
        border: "1px solid oklch(1 0 0 / 0.12)",
        borderRadius: 10,
        padding: "6px",
        minWidth: 220,
        boxShadow: "0 8px 24px oklch(0 0 0 / 0.50)",
      }}
    >
      {STATUS_OPTIONS.map((option) => {
        const s = STATUS_STYLES[option];
        const isSelected = currentStatus === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => selectStatus(option)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "8px 10px",
              fontSize: 12,
              fontWeight: isSelected ? 600 : 400,
              borderRadius: 6,
              border: "none",
              background: isSelected ? "oklch(1 0 0 / 0.06)" : "transparent",
              color: isSelected ? s.color : "oklch(0.72 0 0)",
              cursor: "pointer",
              textAlign: "left",
              transition: "background 100ms",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "oklch(1 0 0 / 0.06)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = isSelected ? "oklch(1 0 0 / 0.06)" : "transparent"; }}
          >
            <span style={{ color: s.color, display: "flex" }}>{STATUS_ICONS[option]}</span>
            {option}
          </button>
        );
      })}
      {isOverridden && synthesisStatus && (
        <>
          <div style={{ height: 1, background: "oklch(1 0 0 / 0.08)", margin: "4px 0" }} />
          <button
            type="button"
            onClick={() => selectStatus(null)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "8px 10px",
              fontSize: 12,
              fontWeight: 400,
              borderRadius: 6,
              border: "none",
              background: "transparent",
              color: "oklch(0.55 0 0)",
              cursor: "pointer",
              textAlign: "left",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "oklch(1 0 0 / 0.06)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
          >
            <RotateCcw size={12} strokeWidth={2} />
            Reset to synthesis ({synthesisStatus})
          </button>
        </>
      )}
    </div>
  );
}

function StatusBadgeWithOverride({
  cannyId,
  status,
  synthesisStatus,
  isOverridden,
}: {
  cannyId: string;
  status: string | null;
  synthesisStatus: string | null;
  isOverridden: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [localStatus, setLocalStatus] = useState<StatusValue | null>(status as StatusValue | null);
  const [localOverridden, setLocalOverridden] = useState(isOverridden);

  if (!localStatus) return null;

  function handleStatusChange(value: StatusValue | null) {
    setLocalStatus(value ?? (synthesisStatus as StatusValue | null));
    setLocalOverridden(value !== null);
  }

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <StatusBadge
        status={localStatus}
        isOverridden={localOverridden}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <StatusOverridePopover
          cannyId={cannyId}
          currentStatus={localStatus}
          synthesisStatus={synthesisStatus as StatusValue | null}
          isOverridden={localOverridden}
          onClose={() => setOpen(false)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}

// ── Impact rating modal ────────────────────────────────────────────────────

const IMPACT_CRITERIA: Record<number, string> = {
  1: "Single customer or prospect moves from detractor/passive to promoter",
  2: "2–3 customers or prospects move from detractor/passive to promoter",
  3: "3+ priority customers or prospects move from detractor/passive to promoter",
  4: "All customers or prospects move from detractor/passive to promoter",
};

const CONFIDENCE_CRITERIA: Record<number, string> = {
  1: "No documentation to drive confidence of impact",
  2: "Some emails or conversations to drive confidence of impact",
  3: "Emails AND data to drive confidence of impact",
  4: "Regardless of documentation, would bet $10K of personal funds on the impact",
};

function RatingOption({
  value,
  criteria,
  isSelected,
  onClick,
}: {
  value: number;
  criteria: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "10px 14px",
        borderRadius: 9999,
        border: isSelected
          ? "1px solid oklch(0.55 0.18 295 / 0.40)"
          : "1px solid oklch(1 0 0 / 0.08)",
        background: isSelected ? "oklch(0.24 0.06 295)" : "oklch(0.155 0 0)",
        cursor: "pointer",
        textAlign: "left",
        transition: "background 80ms, border-color 80ms",
      }}
    >
      {/* Circular indicator */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 9999,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isSelected ? "oklch(0.55 0.18 295 / 0.20)" : "transparent",
          border: isSelected
            ? "1px solid oklch(0.55 0.18 295 / 0.40)"
            : "1px solid oklch(1 0 0 / 0.15)",
        }}
      >
        <span
          style={{
            fontSize: 18,
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
            color: isSelected ? "oklch(0.97 0 0)" : "oklch(0.55 0 0)",
            lineHeight: 1,
          }}
        >
          {value}
        </span>
      </div>
      <span
        style={{
          fontSize: 14,
          lineHeight: 1.55,
          color: isSelected ? "oklch(0.85 0 0)" : "oklch(0.65 0 0)",
        }}
      >
        {criteria}
      </span>
    </button>
  );
}

function ImpactRatingModal({
  itemTitle,
  initialImpact,
  initialConfidence,
  synthesisImpact,
  synthesisConfidence,
  isCurrentlyOverridden,
  onSave,
  onReset,
  onClose,
}: {
  itemTitle: string;
  initialImpact: number | null;
  initialConfidence: number | null;
  synthesisImpact: number | null;
  synthesisConfidence: number | null;
  isCurrentlyOverridden: boolean;
  onSave: (impact: number, confidence: number) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [impact, setImpact] = useState<number | null>(initialImpact);
  const [confidence, setConfidence] = useState<number | null>(initialConfidence);

  const combinedScore = impact !== null && confidence !== null ? impact * confidence : null;
  const synthCombined =
    synthesisImpact !== null && synthesisConfidence !== null
      ? synthesisImpact * synthesisConfidence
      : null;
  const hasChangedFromSynthesis =
    impact !== synthesisImpact || confidence !== synthesisConfidence;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "oklch(0 0 0 / 0.60)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: 24,
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "oklch(0.18 0 0)",
          border: "1px solid oklch(1 0 0 / 0.08)",
          borderRadius: 12,
          width: "100%",
          maxWidth: 640,
          maxHeight: "90vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px 0",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: -0.2,
              color: "oklch(0.97 0 0)",
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              paddingRight: 12,
            }}
          >
            {itemTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              borderRadius: 6,
              border: "none",
              background: "transparent",
              color: "oklch(0.45 0 0)",
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
              transition: "background 100ms, color 100ms",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "oklch(1 0 0 / 0.04)";
              (e.currentTarget as HTMLButtonElement).style.color = "oklch(0.78 0 0)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              (e.currentTarget as HTMLButtonElement).style.color = "oklch(0.45 0 0)";
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: "16px 24px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Impact Rating */}
          <div>
            <div style={{ marginBottom: 8 }}>
              <h3
                style={{
                  margin: "0 0 2px 0",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "oklch(0.65 0 0)",
                  letterSpacing: -0.1,
                }}
              >
                Impact Rating
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: "oklch(0.45 0 0)", lineHeight: 1.4 }}>
                How many customers/prospects would move from detractor/passive to promoter?
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {IMPACT_RATING_VALUES.map((n) => (
                <RatingOption
                  key={n}
                  value={n}
                  criteria={IMPACT_CRITERIA[n]}
                  isSelected={impact === n}
                  onClick={() => setImpact(n)}
                />
              ))}
            </div>
          </div>

          {/* Confidence Rating */}
          <div>
            <div style={{ marginBottom: 8 }}>
              <h3
                style={{
                  margin: "0 0 2px 0",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "oklch(0.65 0 0)",
                  letterSpacing: -0.1,
                }}
              >
                Confidence Rating
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: "oklch(0.45 0 0)", lineHeight: 1.4 }}>
                How much evidence supports this impact prediction?
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {CONFIDENCE_RATING_VALUES.map((n) => (
                <RatingOption
                  key={n}
                  value={n}
                  criteria={CONFIDENCE_CRITERIA[n]}
                  isSelected={confidence === n}
                  onClick={() => setConfidence(n)}
                />
              ))}
            </div>
          </div>

          {/* Combined result */}
          <div
            style={{
              padding: "16px 20px",
              background: "oklch(0.145 0 0)",
              borderRadius: 12,
              border: "1px solid oklch(1 0 0 / 0.08)",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div
                style={{
                  fontSize: 48,
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  color: combinedScore !== null ? "oklch(0.97 0 0)" : "oklch(0.35 0 0)",
                  lineHeight: 1,
                  letterSpacing: -1,
                }}
              >
                {combinedScore !== null ? combinedScore : "—"}
              </div>
              <p style={{ margin: 0, fontSize: 12, color: "oklch(0.55 0 0)", lineHeight: 1 }}>
                Impact Score
              </p>
              {combinedScore !== null && impact !== null && confidence !== null && (
                <p style={{ margin: 0, fontSize: 11, color: "oklch(0.45 0 0)", lineHeight: 1.4 }}>
                  Impact {impact} × Confidence {confidence} = {combinedScore}
                </p>
              )}
            </div>
            {hasChangedFromSynthesis && synthCombined !== null && (
              <p
                style={{
                  margin: "8px 0 0",
                  paddingTop: 8,
                  borderTop: "1px solid oklch(1 0 0 / 0.08)",
                  fontSize: 12,
                  color: "oklch(0.45 0 0)",
                  lineHeight: 1.4,
                }}
              >
                Synthesis: Impact {synthesisImpact} × Confidence {synthesisConfidence} = {synthCombined}
              </p>
            )}
          </div>

          {/* Footer */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div>
              {isCurrentlyOverridden && (
                <button
                  type="button"
                  onClick={onReset}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    fontSize: 13,
                    fontWeight: 600,
                    borderRadius: 9999,
                    border: "none",
                    background: "transparent",
                    color: "oklch(0.55 0 0)",
                    cursor: "pointer",
                    transition: "background 100ms",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "oklch(1 0 0 / 0.06)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                >
                  <RotateCcw size={12} strokeWidth={2} />
                  Reset to synthesis
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "8px 18px",
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 9999,
                  border: "none",
                  background: "transparent",
                  color: "oklch(0.65 0 0)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { if (impact !== null && confidence !== null) onSave(impact, confidence); }}
                disabled={impact === null || confidence === null}
                style={{
                  padding: "8px 18px",
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 9999,
                  border: "none",
                  background: impact !== null && confidence !== null
                    ? "oklch(0.45 0.20 295)"
                    : "oklch(0.28 0 0)",
                  color: "oklch(1 0 0)",
                  cursor: impact !== null && confidence !== null ? "pointer" : "default",
                  transition: "background 120ms",
                }}
                onMouseEnter={(e) => {
                  if (impact !== null && confidence !== null)
                    (e.currentTarget as HTMLButtonElement).style.background = "oklch(0.50 0.20 295)";
                }}
                onMouseLeave={(e) => {
                  if (impact !== null && confidence !== null)
                    (e.currentTarget as HTMLButtonElement).style.background = "oklch(0.45 0.20 295)";
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Impact × Confidence pill (opens modal) ────────────────────────────────

function ImpactConfidenceWithOverride({
  cannyId,
  impactRating,
  confidenceRating,
  synthesisImpact,
  synthesisConfidence,
  isImpactOverridden,
  isConfidenceOverridden,
  itemTitle,
}: {
  cannyId: string;
  impactRating: number | null;
  confidenceRating: number | null;
  synthesisImpact: number | null;
  synthesisConfidence: number | null;
  isImpactOverridden: boolean;
  isConfidenceOverridden: boolean;
  itemTitle: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [localImpact, setLocalImpact] = useState<number | null>(impactRating);
  const [localConf, setLocalConf] = useState<number | null>(confidenceRating);
  const [localImpactOverridden, setLocalImpactOverridden] = useState(isImpactOverridden);
  const [localConfOverridden, setLocalConfOverridden] = useState(isConfidenceOverridden);

  if (localImpact === null || localConf === null) return null;

  const combinedScore = localImpact * localConf;
  const isEitherOverridden = localImpactOverridden || localConfOverridden;
  const pillColor = "oklch(0.65 0.18 295)";

  async function handleSave(impact: number, confidence: number) {
    setLocalImpact(impact);
    setLocalConf(confidence);
    setLocalImpactOverridden(true);
    setLocalConfOverridden(true);
    setModalOpen(false);
    await fetch(`/api/ideas/${cannyId}/impact`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ impact_rating: impact, confidence_rating: confidence }),
    });
  }

  async function handleReset() {
    setLocalImpact(synthesisImpact);
    setLocalConf(synthesisConfidence);
    setLocalImpactOverridden(false);
    setLocalConfOverridden(false);
    setModalOpen(false);
    await fetch(`/api/ideas/${cannyId}/impact`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ impact_rating: null, confidence_rating: null }),
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 8px",
          fontSize: 12,
          fontWeight: 500,
          lineHeight: 1,
          borderRadius: 9999,
          background: "oklch(0.20 0.06 295)",
          color: "oklch(0.72 0.18 295)",
          border: "1px solid oklch(0.55 0.20 295 / 0.35)",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <span>Impact Score {combinedScore}</span>
        <ChevronDown size={9} strokeWidth={2.5} style={{ opacity: 0.6, flexShrink: 0 }} />
      </button>

      {modalOpen && (
        <ImpactRatingModal
          itemTitle={itemTitle}
          initialImpact={localImpact}
          initialConfidence={localConf}
          synthesisImpact={synthesisImpact}
          synthesisConfidence={synthesisConfidence}
          isCurrentlyOverridden={isEitherOverridden}
          onSave={handleSave}
          onReset={handleReset}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

// ── Team classification badge + override ──────────────────────────────────

const TEAM_STYLES: Record<TeamClassification, { bg: string; color: string; border: string }> = {
  "Engineering": {
    bg:     "oklch(0.20 0 0)",
    color:  "oklch(0.72 0 0)",
    border: "oklch(1 0 0 / 0.12)",
  },
  "Data": {
    bg:     "oklch(0.20 0 0)",
    color:  "oklch(0.72 0 0)",
    border: "oklch(1 0 0 / 0.12)",
  },
};

const TEAM_ICONS: Record<TeamClassification, React.ReactNode> = {
  "Engineering": <Terminal size={12} strokeWidth={2} />,
  "Data":        <Database size={12} strokeWidth={2} />,
};

function TeamBadge({
  classification,
  isOverridden,
  onClick,
}: {
  classification: TeamClassification;
  isOverridden: boolean;
  onClick: () => void;
}) {
  const s = TEAM_STYLES[classification];
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 8px",
        fontSize: 12,
        fontWeight: 500,
        lineHeight: 1,
        letterSpacing: 0.1,
        borderRadius: 9999,
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {classification}
      <ChevronDown size={9} strokeWidth={2.5} style={{ opacity: 0.6, flexShrink: 0 }} />
    </button>
  );
}

function TeamOverridePopover({
  cannyId,
  current,
  synthesis,
  isOverridden,
  onClose,
  onChange,
}: {
  cannyId: string;
  current: TeamClassification;
  synthesis: TeamClassification | null;
  isOverridden: boolean;
  onClose: () => void;
  onChange: (value: TeamClassification | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [onClose]);

  async function select(value: TeamClassification | null) {
    onChange(value);
    onClose();
    if (value === null) {
      await fetch(`/api/ideas/${cannyId}/team-classification`, { method: "DELETE" });
    } else {
      await fetch(`/api/ideas/${cannyId}/team-classification`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_classification: value }),
      });
    }
  }

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        left: 0,
        zIndex: 50,
        background: "oklch(0.20 0 0)",
        border: "1px solid oklch(1 0 0 / 0.12)",
        borderRadius: 10,
        padding: "6px",
        minWidth: 160,
        boxShadow: "0 8px 24px oklch(0 0 0 / 0.50)",
      }}
    >
      {TEAM_CLASSIFICATION_VALUES.map((option) => {
        const s = TEAM_STYLES[option];
        const isSelected = current === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => select(option)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "8px 10px",
              fontSize: 12,
              fontWeight: isSelected ? 600 : 400,
              borderRadius: 6,
              border: "none",
              background: isSelected ? "oklch(1 0 0 / 0.06)" : "transparent",
              color: isSelected ? s.color : "oklch(0.72 0 0)",
              cursor: "pointer",
              textAlign: "left",
              transition: "background 100ms",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "oklch(1 0 0 / 0.06)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = isSelected ? "oklch(1 0 0 / 0.06)" : "transparent"; }}
          >
            <span style={{ color: s.color, display: "flex" }}>{TEAM_ICONS[option]}</span>
            {option}
          </button>
        );
      })}
      {isOverridden && synthesis && (
        <>
          <div style={{ height: 1, background: "oklch(1 0 0 / 0.08)", margin: "4px 0" }} />
          <button
            type="button"
            onClick={() => select(null)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "8px 10px",
              fontSize: 12,
              fontWeight: 400,
              borderRadius: 6,
              border: "none",
              background: "transparent",
              color: "oklch(0.55 0 0)",
              cursor: "pointer",
              textAlign: "left",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "oklch(1 0 0 / 0.06)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
          >
            <RotateCcw size={12} strokeWidth={2} />
            Reset to synthesis ({synthesis})
          </button>
        </>
      )}
    </div>
  );
}

function TeamClassificationWithOverride({
  cannyId,
  classification,
  synthesisClassification,
  isOverridden,
}: {
  cannyId: string;
  classification: string | null;
  synthesisClassification: string | null;
  isOverridden: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<TeamClassification | null>(classification as TeamClassification | null);
  const [localOverridden, setLocalOverridden] = useState(isOverridden);

  if (!local) return null;

  function handleChange(value: TeamClassification | null) {
    setLocal(value ?? (synthesisClassification as TeamClassification | null));
    setLocalOverridden(value !== null);
  }

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <TeamBadge
        classification={local}
        isOverridden={localOverridden}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <TeamOverridePopover
          cannyId={cannyId}
          current={local}
          synthesis={synthesisClassification as TeamClassification | null}
          isOverridden={localOverridden}
          onClose={() => setOpen(false)}
          onChange={handleChange}
        />
      )}
    </div>
  );
}

// ── Jira status badge ──────────────────────────────────────────────────────

const JIRA_STATUS_STYLES: Record<
  "open" | "in-progress" | "on-hold",
  { bg: string; color: string; border: string }
> = {
  "open":        { bg: "oklch(0.20 0 0)",        color: "oklch(0.65 0 0)",        border: "oklch(1 0 0 / 0.10)" },
  "in-progress": { bg: "oklch(0.20 0.05 295)",   color: "oklch(0.72 0.18 295)",   border: "oklch(0.72 0.18 295 / 0.35)" },
  "on-hold":     { bg: "oklch(0.20 0.05 75)",    color: "oklch(0.78 0.18 75)",    border: "oklch(0.78 0.18 75 / 0.35)" },
};

function JiraStatusBadge({ status }: { status: string }) {
  const category = JIRA_STATUS_CATEGORY[status];
  const style = (category && JIRA_STATUS_STYLES[category]) ?? JIRA_STATUS_STYLES["open"];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 8px",
        fontSize: 12,
        fontWeight: 500,
        lineHeight: 1,
        letterSpacing: 0.1,
        borderRadius: 9999,
        background: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
}

// ── Accept button ──────────────────────────────────────────────────────────

interface JiraAcceptResult {
  key: string;
  url: string;
  status: string;
}

function AcceptButton({
  cannyId,
  onSuccess,
}: {
  cannyId: string;
  onSuccess: (cannyId: string, result: JiraAcceptResult) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ideas/${cannyId}/accept`, { method: "POST" });
      const data = await res.json() as JiraAcceptResult & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to create ticket");
      } else {
        onSuccess(cannyId, { key: data.key, url: data.url, status: data.status });
      }
    } catch {
      setError("Network error — try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        disabled={loading}
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "8px 18px",
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: 0.2,
          borderRadius: 9999,
          border: "none",
          background: loading
            ? "oklch(0.35 0.15 295)"
            : hovered
            ? "oklch(0.50 0.20 295)"
            : "oklch(0.45 0.20 295)",
          color: "oklch(1 0 0)",
          cursor: loading ? "default" : "pointer",
          transition: "background 120ms",
          whiteSpace: "nowrap",
        }}
      >
        {loading ? "Accepting…" : "Accept"}
      </button>
      {error && (
        <span style={{ fontSize: 12, color: "oklch(0.65 0.20 25)", lineHeight: 1.3 }}>
          {error}
        </span>
      )}
    </span>
  );
}

// ── Metric cards ──────────────────────────────────────────────────────────────

function MetricCard({
  count,
  label,
  accentColor,
  icon,
}: {
  count: number;
  label: string;
  accentColor: string;
  icon?: React.ReactNode;
}) {
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
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 4,
        }}
      >
        {icon}
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 28,
            fontWeight: 500,
            fontVariantNumeric: "tabular-nums",
            color: "oklch(0.97 0 0)",
            lineHeight: 1,
          }}
        >
          {count}
        </div>
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: accentColor,
        }}
      >
        {label}
      </div>
    </div>
  );
}

// ── Tab bar ────────────────────────────────────────────────────────────────────

type TabId = "signals" | "easy-wins" | "patterns" | "coming-up" | "accepted" | "deferred" | "done";

function TabBar({
  active,
  signalCount,
  easyWinCount,
  patternCount,
  comingUpCount,
  acceptedCount,
  deferredCount,
  doneCount,
  onSelect,
}: {
  active: TabId;
  signalCount: number;
  easyWinCount: number;
  patternCount: number;
  comingUpCount: number;
  acceptedCount: number;
  deferredCount: number;
  doneCount: number;
  onSelect: (id: TabId) => void;
}) {
  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "signals",    label: "Top 10 Ideas" },
    { id: "easy-wins",  label: "Quick Wins",  count: easyWinCount },
    { id: "coming-up",  label: "Pinned",      count: comingUpCount > 0 ? comingUpCount : undefined },
    { id: "accepted",   label: "Accepted",    count: acceptedCount },
    { id: "deferred",   label: "Deferred",    count: deferredCount },
    { id: "done",       label: "Done",        count: doneCount },
    { id: "patterns",   label: "Patterns",    count: patternCount },
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
            {t.count != null && (
              <span style={{ color: isActive ? "oklch(1 0 0 / 0.50)" : "oklch(0.45 0 0)" }}>
                {` · ${t.count}`}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Signal row ─────────────────────────────────────────────────────────────────

// ── Notes ──────────────────────────────────────────────────────────────────────

interface NoteEntry {
  id: string;
  note_text: string;
  created_at: string;
}

function formatNoteTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " at " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

function NotesModal({
  title,
  cannyId,
  notes,
  loading,
  onClose,
  onNoteAdded,
  onNoteReplaced,
  onNoteDeleted,
}: {
  title: string;
  cannyId: string;
  notes: NoteEntry[];
  loading: boolean;
  onClose: () => void;
  onNoteAdded: (note: NoteEntry) => void;
  onNoteReplaced: (tempId: string, real: NoteEntry) => void;
  onNoteDeleted: (noteId: string) => void;
}) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [notes.length]);

  async function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    const tempId = `temp-${Date.now()}`;
    const tempNote: NoteEntry = { id: tempId, note_text: trimmed, created_at: new Date().toISOString() };
    onNoteAdded(tempNote);
    setText("");
    setSubmitting(true);
    const res = await fetch(`/api/ideas/${cannyId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note_text: trimmed }),
    });
    setSubmitting(false);
    if (res.ok) {
      const real = await res.json() as NoteEntry;
      onNoteReplaced(tempId, real);
    } else {
      onNoteDeleted(tempId);
    }
  }

  async function handleDelete(noteId: string) {
    onNoteDeleted(noteId);
    const res = await fetch(`/api/ideas/${cannyId}/notes/${noteId}`, { method: "DELETE" });
    if (!res.ok) {
      const restored = notes.find((n) => n.id === noteId);
      if (restored) onNoteAdded(restored);
    }
  }

  const remaining = 2000 - text.length;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "oklch(0 0 0 / 0.60)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: 24,
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "oklch(0.18 0 0)",
          border: "1px solid oklch(1 0 0 / 0.08)",
          borderRadius: 12,
          width: "100%",
          maxWidth: 640,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px 0",
            flexShrink: 0,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: -0.2,
              color: "oklch(0.97 0 0)",
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              paddingRight: 12,
            }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              borderRadius: 6,
              border: "none",
              background: "transparent",
              color: "oklch(0.45 0 0)",
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
              flexShrink: 0,
              transition: "background 100ms, color 100ms",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "oklch(1 0 0 / 0.04)";
              (e.currentTarget as HTMLButtonElement).style.color = "oklch(0.78 0 0)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              (e.currentTarget as HTMLButtonElement).style.color = "oklch(0.45 0 0)";
            }}
          >
            ×
          </button>
        </div>

        {/* Section label */}
        <div style={{ padding: "12px 24px 0", flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: "oklch(0.45 0 0)" }}>
            Comments
          </span>
        </div>

        {/* Thread */}
        <div
          ref={threadRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            minHeight: 80,
          }}
        >
          {loading && (
            <p style={{ margin: 0, fontSize: 13, color: "oklch(0.45 0 0)" }}>Loading…</p>
          )}
          {!loading && notes.length === 0 && (
            <p style={{ margin: 0, fontSize: 13, color: "oklch(0.45 0 0)" }}>No comments yet.</p>
          )}
          {notes.map((note) => (
            <div key={note.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "oklch(0.45 0 0)", letterSpacing: 0.1 }}>
                  {formatNoteTime(note.created_at)}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(note.id)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    fontSize: 11,
                    color: "oklch(0.45 0 0)",
                    cursor: "pointer",
                    letterSpacing: 0.1,
                    flexShrink: 0,
                    transition: "color 100ms",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "oklch(0.72 0 0)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "oklch(0.45 0 0)"; }}
                >
                  Delete
                </button>
              </div>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "oklch(0.85 0 0)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {note.note_text}
              </p>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "oklch(1 0 0 / 0.08)", flexShrink: 0 }} />

        {/* Input area */}
        <div style={{ padding: "16px 24px 20px", flexShrink: 0 }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
            placeholder="Add a comment…"
            maxLength={2000}
            rows={3}
            style={{
              width: "100%",
              boxSizing: "border-box",
              resize: "vertical",
              background: "oklch(0.14 0 0)",
              border: "1px solid oklch(1 0 0 / 0.10)",
              borderRadius: 8,
              padding: "10px 12px",
              fontSize: 13,
              lineHeight: 1.6,
              color: "oklch(0.90 0 0)",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <span style={{ fontSize: 11, color: remaining < 200 ? "oklch(0.72 0.18 75)" : "oklch(0.45 0 0)" }}>
              {remaining < 2000 ? `${remaining} remaining` : ""}
            </span>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!text.trim() || submitting}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 18px",
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: 0.2,
                borderRadius: 9999,
                border: "none",
                background: !text.trim() || submitting ? "oklch(0.35 0.15 295)" : "oklch(0.45 0.20 295)",
                color: "oklch(1 0 0)",
                cursor: !text.trim() || submitting ? "default" : "pointer",
                transition: "background 120ms",
              }}
            >
              Add comment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NotesLink({
  cannyId,
  initialCount,
  title,
}: {
  cannyId: string;
  initialCount: number;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<NoteEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [localCount, setLocalCount] = useState(initialCount);

  async function handleOpen() {
    setOpen(true);
    if (notes === null && !loading) {
      setLoading(true);
      const res = await fetch(`/api/ideas/${cannyId}/notes`);
      if (res.ok) {
        const data = await res.json() as { notes: NoteEntry[] };
        setNotes(data.notes);
        setLocalCount(data.notes.length);
      } else {
        setNotes([]);
      }
      setLoading(false);
    }
  }

  function handleNoteAdded(note: NoteEntry) {
    setNotes((prev) => (prev ? [...prev, note] : [note]));
    setLocalCount((c) => c + 1);
  }

  function handleNoteReplaced(tempId: string, real: NoteEntry) {
    setNotes((prev) => prev ? prev.map((n) => (n.id === tempId ? real : n)) : [real]);
  }

  function handleNoteDeleted(noteId: string) {
    setNotes((prev) => (prev ? prev.filter((n) => n.id !== noteId) : []));
    setLocalCount((c) => Math.max(0, c - 1));
  }

  const label = localCount > 0 ? `Comments (${localCount})` : "Comments";

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          fontSize: 12,
          color: "oklch(0.55 0 0)",
          textDecoration: "underline",
          textUnderlineOffset: 3,
          textDecorationThickness: 1,
          letterSpacing: 0.2,
          cursor: "pointer",
          whiteSpace: "nowrap",
          transition: "color 100ms",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "oklch(0.72 0 0)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "oklch(0.55 0 0)"; }}
      >
        {label}
      </button>
      {open && (
        <NotesModal
          title={title}
          cannyId={cannyId}
          notes={notes ?? []}
          loading={loading}
          onClose={() => setOpen(false)}
          onNoteAdded={handleNoteAdded}
          onNoteReplaced={handleNoteReplaced}
          onNoteDeleted={handleNoteDeleted}
        />
      )}
    </>
  );
}

function SignalRow({
  item,
  displayRank,
  isOverridden,
  doneSet,
  onToggleDone,
  onAccepted,
  onPin,
  suppressNewBadge = false,
  dragHandleListeners,
  notesCount = 0,
}: {
  item: DashboardSelection;
  displayRank: number;
  isOverridden: boolean;
  doneSet: Set<string>;
  onToggleDone: (item: DashboardSelection) => void;
  onAccepted: (cannyId: string, result: JiraAcceptResult) => void;
  onPin?: (item: DashboardSelection) => void;
  suppressNewBadge?: boolean;
  dragHandleListeners?: Record<string, unknown>;
  notesCount?: number;
}) {
  const isDone = doneSet.has(item.canny_id);
  const [deferHovered, setDeferHovered] = useState(false);

  return (
    <div
      id={`signal-${item.canny_id}`}
      style={{
        display: "grid",
        gridTemplateColumns: "56px 1fr",
        gap: 20,
        padding: "20px 24px 20px 16px",
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
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          paddingTop: 20,
          paddingBottom: 20,
          marginTop: -20,
          marginBottom: -20,
          borderRight: "0.5px solid oklch(1 0 0 / 0.08)",
          cursor: dragHandleListeners ? "grab" : "default",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        {/* Inner wrapper: centers icon above number on the same axis; marginTop aligns grip center with Board badge center */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginTop: 2 }}>
          {dragHandleListeners && (
            <GripVertical size={16} strokeWidth={1.75} aria-hidden
              style={{ opacity: 0.25 }}
            />
          )}
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 28,
              fontWeight: 500,
              fontVariantNumeric: "tabular-nums",
              color: "oklch(0.65 0 0)",
              lineHeight: 1,
              letterSpacing: -0.5,
            }}
          >
            {String(displayRank).padStart(2, "0")}
          </span>
        </div>
        {isOverridden && (
          <span
            style={{
              fontSize: 12,
              color: "oklch(0.45 0 0)",
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
        {/* Top row: identity badges left, classification badges right */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <BoardTag slug={item.board_slug} />
            {item.is_new_this_week && !suppressNewBadge ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "4px 8px",
                  fontSize: 12,
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
            ) : item.is_persistent ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "4px 8px",
                  fontSize: 12,
                  fontWeight: 600,
                  lineHeight: 1,
                  letterSpacing: 0.1,
                  borderRadius: 9999,
                  background: "oklch(0.20 0.06 75)",
                  color: "oklch(0.72 0.18 75)",
                  border: "1px solid oklch(0.72 0.18 75 / 0.25)",
                }}
              >
                4+ Weeks
              </span>
            ) : null}
            <Tier1Badge value={item.tier_1_customer} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <StatusBadgeWithOverride
              cannyId={item.canny_id}
              status={item.status}
              synthesisStatus={item.synthesis_status}
              isOverridden={item.is_status_overridden}
            />
            <ImpactConfidenceWithOverride
              cannyId={item.canny_id}
              impactRating={item.impact_rating}
              confidenceRating={item.confidence_rating}
              synthesisImpact={item.synthesis_impact_rating}
              synthesisConfidence={item.synthesis_confidence_rating}
              isImpactOverridden={item.is_impact_overridden}
              isConfidenceOverridden={item.is_confidence_overridden}
              itemTitle={item.title}
            />
            <TeamClassificationWithOverride
              cannyId={item.canny_id}
              classification={item.team_classification}
              synthesisClassification={item.synthesis_team_classification}
              isOverridden={item.is_team_overridden}
            />
            {onPin && !isDone && (
              <button
                type="button"
                onClick={() => onPin(item)}
                title="Pin"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  borderRadius: 9999,
                  border: "none",
                  background: "transparent",
                  color: "oklch(0.40 0 0)",
                  cursor: "pointer",
                  padding: 0,
                  transition: "background 100ms, color 100ms",
                  marginLeft: 4,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "oklch(1 0 0 / 0.06)";
                  (e.currentTarget as HTMLButtonElement).style.color = "oklch(0.72 0 0)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  (e.currentTarget as HTMLButtonElement).style.color = "oklch(0.40 0 0)";
                }}
              >
                <Pin size={20} strokeWidth={1.75} aria-hidden />
              </button>
            )}
          </div>
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
            fontSize: 14,
            lineHeight: 1.6,
            color: "oklch(0.85 0 0)",
            textWrap: "pretty",
          }}
        >
          {item.reason}
        </p>

        {/* Callouts — rendered only when content exists */}
        {(item.why_callout || item.customers_prospects_callout || item.hard_deadline_notes_callout) && (
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginTop: 16,
            padding: "12px 16px",
            background: "oklch(0.18 0 0)",
            border: "0.5px solid oklch(1 0 0 / 0.08)",
            borderRadius: 8,
          }}>
            {item.why_callout && (
              <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5 }}>
                <span style={{ color: "oklch(0.55 0 0)" }}>Why: </span>
                <span style={{ color: "oklch(0.85 0 0)" }}>{item.why_callout}</span>
              </p>
            )}
            {item.customers_prospects_callout && (
              <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5 }}>
                <span style={{ color: "oklch(0.55 0 0)" }}>Customers: </span>
                <span style={{ color: "oklch(0.85 0 0)" }}>{item.customers_prospects_callout}</span>
              </p>
            )}
            {item.hard_deadline_notes_callout && (
              <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5 }}>
                <span style={{ color: "oklch(0.55 0 0)" }}>Deadline: </span>
                <span style={{ color: "oklch(0.85 0 0)" }}>{item.hard_deadline_notes_callout}</span>
              </p>
            )}
          </div>
        )}

        {/* Bottom action row: links left, buttons right */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
                  fontSize: 12,
                  color: "oklch(0.55 0 0)",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                  textDecorationThickness: 1,
                  letterSpacing: 0.2,
                }}
              >
                View in Canny →
              </a>
            )}
            <NotesLink cannyId={item.canny_id} initialCount={notesCount} title={item.title} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={() => onToggleDone(item)}
              onMouseEnter={() => setDeferHovered(true)}
              onMouseLeave={() => setDeferHovered(false)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 18px",
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: 0.2,
                borderRadius: 9999,
                border: "none",
                background: deferHovered ? "oklch(1 0 0 / 0.04)" : "transparent",
                color: "oklch(0.85 0 0)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "background 120ms",
              }}
            >
              {isDone ? "Undo" : "Defer"}
            </button>
            {item.jira_story && (
              <AcceptButton cannyId={item.canny_id} onSuccess={onAccepted} />
            )}
          </div>
        </div>
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
  onAccepted: (cannyId: string, result: JiraAcceptResult) => void;
  onPin?: (item: DashboardSelection) => void;
  suppressNewBadge: boolean;
  notesCount?: number;
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
      <SignalRow {...props} dragHandleListeners={listeners as Record<string, unknown>} onAccepted={props.onAccepted} />
    </div>
  );
}

// ── Easy win card ──────────────────────────────────────────────────────────────

function EasyWinCard({
  win,
  doneSet,
  onToggleDone,
  onAccepted,
  notesCount = 0,
}: {
  win: DashboardEasyWin;
  doneSet: Set<string>;
  onToggleDone: (win: DashboardEasyWin) => void;
  onAccepted: (cannyId: string, result: JiraAcceptResult) => void;
  notesCount?: number;
}) {
  const isDone = doneSet.has(win.canny_id);
  const [deferHovered, setDeferHovered] = useState(false);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr",
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
        {/* Top row: identity badges left, team classification right */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <BoardTag slug={win.board_slug} />
            {win.is_new_this_week && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "4px 8px",
                  fontSize: 12,
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
            <Tier1Badge value={win.tier_1_customer} />
          </div>
          <TeamClassificationWithOverride
            cannyId={win.canny_id}
            classification={win.team_classification}
            synthesisClassification={win.synthesis_team_classification}
            isOverridden={win.is_team_overridden}
          />
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
            fontSize: 14,
            lineHeight: 1.6,
            color: "oklch(0.85 0 0)",
            textWrap: "pretty",
          }}
        >
          {win.reason}
        </p>

        {/* Bottom action row: links left, buttons right */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
                  fontSize: 12,
                  color: "oklch(0.55 0 0)",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                  textDecorationThickness: 1,
                  letterSpacing: 0.2,
                }}
              >
                View in Canny →
              </a>
            )}
            <NotesLink cannyId={win.canny_id} initialCount={notesCount} title={win.title} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={() => onToggleDone(win)}
              onMouseEnter={() => setDeferHovered(true)}
              onMouseLeave={() => setDeferHovered(false)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 18px",
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: 0.2,
                borderRadius: 9999,
                border: "none",
                background: deferHovered ? "oklch(1 0 0 / 0.04)" : "transparent",
                color: "oklch(0.85 0 0)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "background 120ms",
              }}
            >
              {isDone ? "Undo" : "Defer"}
            </button>
            {win.jira_story && (
              <AcceptButton cannyId={win.canny_id} onSuccess={onAccepted} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Accepted tab ──────────────────────────────────────────────────────────────

function AcceptedTab({ items, notesCounts }: { items: AcceptedItem[]; notesCounts: Record<string, number> }) {
  if (items.length === 0) {
    return (
      <p style={{ fontSize: 14, color: "oklch(0.45 0 0)", margin: 0 }}>
        No accepted ideas yet. Click Accept on any signal or quick win to create a Jira ticket.
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
            gridTemplateColumns: "1fr",
            padding: "20px 24px",
            background: "oklch(0.18 0 0)",
            border: "1px solid oklch(1 0 0 / 0.08)",
            borderRadius: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            <BoardTag slug={item.board_slug} />
            <JiraStatusBadge status={item.jira_status} />
            <Tier1Badge value={item.tier_1_customer} />
          </div>
          <p
            style={{
              margin: "0 0 8px 0",
              fontSize: 16,
              fontWeight: 600,
              lineHeight: 1.4,
              color: "oklch(0.97 0 0)",
              letterSpacing: -0.2,
              textWrap: "pretty",
            }}
          >
            {item.title}
          </p>
          {item.reason && (
            <p
              style={{
                margin: "0 0 8px 0",
                fontSize: 14,
                lineHeight: 1.6,
                color: "oklch(0.85 0 0)",
                textWrap: "pretty",
              }}
            >
              {item.reason}
            </p>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <NotesLink cannyId={item.canny_id} initialCount={notesCounts[item.canny_id] ?? 0} title={item.title} />
            <a
              href={item.jira_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                color: "oklch(0.55 0 0)",
                textDecoration: "underline",
                textUnderlineOffset: 3,
                textDecorationThickness: 1,
                letterSpacing: 0.2,
              }}
            >
              {item.jira_issue_key} · View in Jira →
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Jira done tab ─────────────────────────────────────────────────────────────

function JiraDoneTab({ items }: { items: DoneJiraItem[] }) {
  if (items.length === 0) {
    return (
      <p style={{ fontSize: 14, color: "oklch(0.45 0 0)", margin: 0 }}>
        No tickets have reached a done-equivalent status yet.
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
            gridTemplateColumns: "1fr",
            padding: "20px 24px",
            background: "oklch(0.18 0 0)",
            border: "1px solid oklch(1 0 0 / 0.08)",
            borderRadius: 12,
            opacity: 0.75,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            <BoardTag slug={item.board_slug} />
            <JiraStatusBadge status={item.jira_status} />
            <Tier1Badge value={item.tier_1_customer} />
          </div>
          <p
            style={{
              margin: "0 0 8px 0",
              fontSize: 16,
              fontWeight: 600,
              lineHeight: 1.4,
              color: "oklch(0.97 0 0)",
              letterSpacing: -0.2,
              textWrap: "pretty",
            }}
          >
            {item.title}
          </p>
          {item.reason && (
            <p
              style={{
                margin: "0 0 8px 0",
                fontSize: 14,
                lineHeight: 1.6,
                color: "oklch(0.85 0 0)",
                textWrap: "pretty",
              }}
            >
              {item.reason}
            </p>
          )}
          <a
            href={item.jira_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              color: "oklch(0.55 0 0)",
              textDecoration: "underline",
              textUnderlineOffset: 3,
              textDecorationThickness: 1,
              letterSpacing: 0.2,
            }}
          >
            {item.jira_issue_key} · View in Jira →
          </a>
        </div>
      ))}
    </div>
  );
}

// ── Done tab ───────────────────────────────────────────────────────────────────

function DoneTab({
  items,
  onUnmark,
  notesCounts = {},
}: {
  items: DoneItem[];
  onUnmark: (cannyId: string) => void;
  notesCounts?: Record<string, number>;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <p style={{ fontSize: 14, color: "oklch(0.45 0 0)", margin: 0 }}>
        No deferred items yet.
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
            alignItems: "start",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <BoardTag slug={item.board_slug} />
              {item.selection_week && (
                <span style={{ fontSize: 12, color: "oklch(0.45 0 0)", letterSpacing: 0.2 }}>
                  {item.selection_week}
                </span>
              )}
            </div>
            <p
              style={{
                margin: "0 0 6px 0",
                fontSize: 16,
                fontWeight: 500,
                color: "oklch(0.72 0 0)",
                lineHeight: 1.4,
                textDecoration: "line-through",
                textDecorationColor: "oklch(0.35 0 0)",
              }}
            >
              {item.title}
            </p>
            <NotesLink cannyId={item.canny_id} initialCount={notesCounts[item.canny_id] ?? 0} title={item.title} />
          </div>
          <button
            type="button"
            onClick={() => onUnmark(item.canny_id)}
            onMouseEnter={() => setHoveredId(item.canny_id)}
            onMouseLeave={() => setHoveredId(null)}
            title="Mark undone"
            style={{
              padding: "4px 10px",
              fontSize: 12,
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

// ── Coming Up tab ──────────────────────────────────────────────────────────────

function formatPinDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ComingUpTab({
  items,
  notesCounts,
  onUnpin,
  onDefer,
  onAccepted,
}: {
  items: PinnedItem[];
  notesCounts: Record<string, number>;
  onUnpin: (item: PinnedItem) => void;
  onDefer: (item: PinnedItem) => void;
  onAccepted: (item: PinnedItem, result: JiraAcceptResult) => void;
}) {
  const [hoveredDefer, setHoveredDefer] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <p style={{ fontSize: 14, color: "oklch(0.45 0 0)", margin: 0 }}>
        No items pinned yet.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {items.map((item) => (
        <div
          key={item.canny_id}
          style={{
            padding: "20px 24px",
            background: "oklch(0.18 0 0)",
            border: "1px solid oklch(1 0 0 / 0.08)",
            borderRadius: 12,
          }}
        >
          {/* Top metadata row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <BoardTag slug={item.board_slug} />
              {item.tier_1_customer && <Tier1Badge value={item.tier_1_customer} />}
              <span style={{ fontSize: 12, color: "oklch(0.45 0 0)", letterSpacing: 0.2 }}>
                Pinned {formatPinDate(item.pinned_at)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onUnpin(item)}
              title="Unpin"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: 9999,
                border: "none",
                background: "transparent",
                color: "oklch(0.75 0.20 25)",
                cursor: "pointer",
                padding: 0,
                transition: "background 100ms, color 100ms",
                marginLeft: 4,
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "oklch(0.20 0.08 25)";
                (e.currentTarget as HTMLButtonElement).style.color = "oklch(0.75 0.20 25)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                (e.currentTarget as HTMLButtonElement).style.color = "oklch(0.75 0.20 25)";
              }}
            >
              <Pin size={20} strokeWidth={1.75} aria-hidden />
            </button>
          </div>

          {/* Title */}
          <p
            style={{
              margin: "0 0 10px 0",
              fontSize: 18,
              fontWeight: 500,
              letterSpacing: -0.3,
              lineHeight: 1.4,
              color: "oklch(0.97 0 0)",
              textWrap: "pretty",
            }}
          >
            {item.title}
          </p>

          {/* Reason */}
          {item.selection_reason && (
            <p
              style={{
                margin: "0 0 8px 0",
                fontSize: 14,
                lineHeight: 1.6,
                color: "oklch(0.85 0 0)",
                textWrap: "pretty",
              }}
            >
              {item.selection_reason}
            </p>
          )}

          {/* Why callout */}
          {item.why_callout && (
            <p style={{ margin: "0 0 8px 0", fontSize: 11, lineHeight: 1.5 }}>
              <span style={{ color: "oklch(0.55 0 0)" }}>Why now: </span>
              <span style={{ color: "oklch(0.85 0 0)" }}>{item.why_callout}</span>
            </p>
          )}

          {/* Bottom action row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
                    fontSize: 12,
                    color: "oklch(0.55 0 0)",
                    textDecoration: "underline",
                    textUnderlineOffset: 3,
                    textDecorationThickness: 1,
                    letterSpacing: 0.2,
                  }}
                >
                  View in Canny →
                </a>
              )}
              <NotesLink cannyId={item.canny_id} initialCount={notesCounts[item.canny_id] ?? 0} title={item.title} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                onClick={() => onDefer(item)}
                onMouseEnter={() => setHoveredDefer(item.canny_id)}
                onMouseLeave={() => setHoveredDefer(null)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "8px 18px",
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: 0.2,
                  borderRadius: 9999,
                  border: "none",
                  background: hoveredDefer === item.canny_id ? "oklch(1 0 0 / 0.04)" : "transparent",
                  color: "oklch(0.85 0 0)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "background 120ms",
                }}
              >
                Defer
              </button>
              <AcceptButton cannyId={item.canny_id} onSuccess={(_, result) => onAccepted(item, result)} />
            </div>
          </div>
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
  const [acceptedItems, setAcceptedItems] = useState<AcceptedItem[]>(
    () => data.accepted_items
  );
  const [pinnedItems, setPinnedItems] = useState<PinnedItem[]>(() => data.pinned_items);
  const [, startTransition] = useTransition();

  // Drag-and-drop state
  const [mounted, setMounted] = useState(false);
  const [confirmHovered, setConfirmHovered] = useState(false);
  const [confirmActive, setConfirmActive] = useState(false);
  useEffect(() => { setMounted(true); }, []);

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
  const acceptedSet = new Set(acceptedItems.map((a) => a.canny_id));
  const pinnedSet = new Set(pinnedItems.map((p) => p.canny_id));

  function handleAccepted(cannyId: string, result: JiraAcceptResult) {
    const signal = data.selections.find((s) => s.canny_id === cannyId);
    const win = data.easy_wins.find((w) => w.canny_id === cannyId);
    const item = signal ?? win;
    if (!item) return;

    setAcceptedItems((prev) => [
      {
        canny_id: cannyId,
        title: item.title,
        board_slug: item.board_slug,
        board_name: item.board_name,
        reason: item.reason,
        jira_issue_key: result.key,
        jira_url: result.url,
        jira_status: result.status,
        accepted_at: new Date().toISOString(),
        tier_1_customer: item.tier_1_customer,
      },
      ...prev,
    ]);
  }

  function handlePinnedAccepted(item: PinnedItem, result: JiraAcceptResult) {
    setPinnedItems((prev) => prev.filter((p) => p.canny_id !== item.canny_id));
    setAcceptedItems((prev) => [
      {
        canny_id: item.canny_id,
        title: item.title,
        board_slug: item.board_slug,
        board_name: item.board_name,
        reason: item.selection_reason ?? "",
        jira_issue_key: result.key,
        jira_url: result.url,
        jira_status: result.status,
        accepted_at: new Date().toISOString(),
        tier_1_customer: item.tier_1_customer,
      },
      ...prev,
    ]);
  }

  function handlePin(item: DashboardSelection) {
    const newPinned: PinnedItem = {
      canny_id: item.canny_id,
      title: item.title,
      board_slug: item.board_slug,
      board_name: item.board_name,
      canny_url: item.canny_url,
      pinned_at: new Date().toISOString(),
      selection_reason: item.reason,
      why_callout: item.why_callout,
      tier_1_customer: item.tier_1_customer,
    };
    setPinnedItems((prev) => [...prev, newPinned]);

    startTransition(async () => {
      const res = await fetch(`/api/ideas/${item.canny_id}/pin`, { method: "PATCH" });
      if (!res.ok) {
        setPinnedItems((prev) => prev.filter((p) => p.canny_id !== item.canny_id));
      }
    });
  }

  function handleUnpin(item: PinnedItem) {
    setPinnedItems((prev) => prev.filter((p) => p.canny_id !== item.canny_id));

    startTransition(async () => {
      const res = await fetch(`/api/ideas/${item.canny_id}/pin`, { method: "PATCH" });
      if (!res.ok) {
        setPinnedItems((prev) => [...prev, item].sort(
          (a, b) => new Date(a.pinned_at).getTime() - new Date(b.pinned_at).getTime()
        ));
      }
    });
  }

  function handlePinnedDefer(item: PinnedItem) {
    setPinnedItems((prev) => prev.filter((p) => p.canny_id !== item.canny_id));
    const newDone: DoneItem = {
      canny_id: item.canny_id,
      title: item.title,
      board_slug: item.board_slug,
      board_name: item.board_name,
      priority_rank: null,
      selection_week: null,
      marked_done_at: new Date().toISOString(),
    };
    setDoneItems((prev) => [newDone, ...prev]);

    startTransition(async () => {
      const res = await fetch(`/api/ideas/${item.canny_id}/done`, { method: "PATCH" });
      if (!res.ok) {
        setDoneItems((prev) => prev.filter((d) => d.canny_id !== item.canny_id));
        setPinnedItems((prev) => [...prev, item].sort(
          (a, b) => new Date(a.pinned_at).getTime() - new Date(b.pinned_at).getTime()
        ));
      }
    });
  }

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
    .filter((s): s is DashboardSelection =>
      s !== undefined && !doneSet.has(s.canny_id) && !acceptedSet.has(s.canny_id) && !pinnedSet.has(s.canny_id)
    );
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
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          width: "100vw",
          marginLeft: "calc(50% - 50vw)",
          marginBottom: 32,
          paddingTop: 6,
          paddingBottom: 6,
          background: "oklch(0.145 0 0 / 0.80)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid oklch(1 0 0 / 0.08)",
        }}
      >
        <div style={{ maxWidth: 1320, margin: "0 auto", padding: "0 40px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 48, height: 48, flexShrink: 0 }}>
              <Lottie animationData={headerAnimation} loop autoplay style={{ width: "100%", height: "100%" }} />
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
      </header>

      {/* Page title */}
      <div style={{ marginBottom: 32 }}>
        <h2
          style={{
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: -0.4,
            lineHeight: 1.1,
            color: "oklch(0.985 0 0)",
            margin: "0 0 6px 0",
          }}
        >
          Synthesized Ideas{data.input_item_count != null ? <span style={{ color: "oklch(0.45 0 0)" }}>{` (${data.input_item_count})`}</span> : ""}
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: "oklch(0.45 0 0)",
            letterSpacing: 0.2,
          }}
        >
          Generated {weekLabel}
        </p>
      </div>

      {/* Board distribution */}
      <section style={{ marginBottom: 32 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 1.2,
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
                  background: "oklch(0.20 0 0)",
                  border: "1px solid oklch(1 0 0 / 0.08)",
                  borderRadius: 9999,
                  opacity: count === 0 ? 0.45 : 1,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: "oklch(0.85 0 0)" }}>
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
        {(
          [
            { section: "Top 10",     count: data.persistent_count,    label: "Persistent Ideas (4+ Weeks)", accentColor: "oklch(0.72 0.18 75)",  icon: <Pin size={20} color="oklch(0.97 0 0)" strokeWidth={1.75} /> },
            { section: "Top 10",     count: data.new_count,           label: "New Ideas this Week",           accentColor: "oklch(0.70 0.20 145)", icon: <PackageOpen size={20} color="oklch(0.97 0 0)" strokeWidth={1.75} /> },
            { section: "Quick Wins", count: data.new_easy_wins_count, label: "New Quick Wins this Week",      accentColor: "oklch(0.70 0.20 145)", icon: <Zap size={20} color="oklch(0.97 0 0)" strokeWidth={1.75} /> },
          ] as const
        ).map(({ count, label, accentColor, icon }, i) => (
          <div key={i} style={{ flex: 1 }}>
            <MetricCard count={count} label={label} accentColor={accentColor} icon={icon} />
          </div>
        ))}
      </div>

      {/* Tab navigation */}
      <TabBar
        active={activeTab}
        signalCount={data.selections.length}
        easyWinCount={data.easy_wins.length}
        patternCount={data.patterns.length}
        comingUpCount={pinnedItems.length}
        acceptedCount={acceptedItems.length}
        deferredCount={doneItems.length}
        doneCount={data.done_jira_items.length}
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
                    onAccepted={handleAccepted}
                    onPin={handlePin}
                    suppressNewBadge={isColdStart}
                    notesCount={data.notes_counts[item.canny_id] ?? 0}
                  />
                ))}
                {displaySignals.length === 0 && (
                  <p style={{ fontSize: 14, color: "oklch(0.45 0 0)", margin: 0 }}>
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
                onAccepted={handleAccepted}
                onPin={handlePin}
                suppressNewBadge={isColdStart}
                notesCount={data.notes_counts[item.canny_id] ?? 0}
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
            background: "oklch(0 0 0 / 0.60)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
          }}
        >
          <div
            style={{
              background: "oklch(0.18 0 0)",
              border: "1px solid oklch(1 0 0 / 0.08)",
              borderRadius: 12,
              padding: "24px 24px",
              maxWidth: 420,
              width: "calc(100% - 48px)",
            }}
          >
            <h2
              style={{
                margin: "0 0 8px 0",
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: -0.2,
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
                color: "oklch(0.85 0 0)",
              }}
            >
              You&apos;re changing the order for this week. This will inform what gets prioritized in next week&apos;s synthesis as your team&apos;s top priorities.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={handleCancelReorder}
                style={{
                  padding: "8px 18px",
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 9999,
                  border: "none",
                  background: "transparent",
                  color: "oklch(0.65 0 0)",
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
                  padding: "8px 18px",
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 9999,
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
              onAccepted={handleAccepted}
              notesCount={data.notes_counts[win.canny_id] ?? 0}
            />
          ))}
          {data.easy_wins.length > 0 && data.easy_wins.every((w) => doneSet.has(w.canny_id)) && (
            <p style={{ fontSize: 14, color: "oklch(0.45 0 0)", margin: 0 }}>
              All quick wins marked done.
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
            <p style={{ fontSize: 14, color: "oklch(0.45 0 0)", margin: 0 }}>
              No patterns detected this week.
            </p>
          )}
        </div>
      )}

      {activeTab === "coming-up" && (
        <ComingUpTab
          items={pinnedItems}
          notesCounts={data.notes_counts}
          onUnpin={handleUnpin}
          onDefer={handlePinnedDefer}
          onAccepted={handlePinnedAccepted}
        />
      )}

      {activeTab === "accepted" && (
        <AcceptedTab items={acceptedItems} notesCounts={data.notes_counts} />
      )}

      {activeTab === "deferred" && (
        <DoneTab items={doneItems} onUnmark={handleUnmark} notesCounts={data.notes_counts} />
      )}

      {activeTab === "done" && (
        <JiraDoneTab items={data.done_jira_items} />
      )}
    </>
  );
}
