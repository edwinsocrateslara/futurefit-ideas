import type { ReactNode } from "react";
import { getDashboardData } from "@/lib/data/dashboard";
import type { DashboardData, DashboardSelection } from "@/lib/data/dashboard";
import type { StatusBadge } from "@/lib/supabase/types";
import PatternCard from "@/app/components/PatternCard";

export const dynamic = "force-dynamic";

// ── Token maps ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<StatusBadge, string> = {
  critical:   "Critical",
  gap:        "Gap",
  on_roadmap: "On roadmap",
  aligned:    "Aligned",
  in_flight:  "In flight",
  watch:      "Watch",
  new:        "New",
};

// halo: proper oklch alpha syntax for the dot glow — was previously a broken `${dot}1a` string concat
const STATUS_TONES: Record<StatusBadge, { dot: string; fg: string; bg: string; ring: string; halo: string }> = {
  critical:   { dot: "oklch(0.72 0.19 25)",  fg: "oklch(0.86 0.10 25)",  bg: "oklch(0.32 0.10 25 / 0.55)",  ring: "oklch(0.55 0.16 25 / 0.5)",  halo: "oklch(0.72 0.19 25 / 0.10)"  },
  gap:        { dot: "oklch(0.78 0.16 75)",  fg: "oklch(0.88 0.10 75)",  bg: "oklch(0.32 0.08 75 / 0.55)",  ring: "oklch(0.55 0.13 75 / 0.5)",  halo: "oklch(0.78 0.16 75 / 0.10)"  },
  on_roadmap: { dot: "oklch(0.74 0.14 245)", fg: "oklch(0.88 0.07 245)", bg: "oklch(0.30 0.08 245 / 0.55)", ring: "oklch(0.52 0.12 245 / 0.5)", halo: "oklch(0.74 0.14 245 / 0.10)" },
  aligned:    { dot: "oklch(0.78 0.14 165)", fg: "oklch(0.88 0.10 165)", bg: "oklch(0.30 0.08 165 / 0.55)", ring: "oklch(0.52 0.12 165 / 0.5)", halo: "oklch(0.78 0.14 165 / 0.10)" },
  in_flight:  { dot: "oklch(0.76 0.16 300)", fg: "oklch(0.88 0.10 300)", bg: "oklch(0.30 0.10 300 / 0.55)", ring: "oklch(0.55 0.16 300 / 0.5)", halo: "oklch(0.76 0.16 300 / 0.10)" },
  watch:      { dot: "oklch(0.82 0.14 95)",  fg: "oklch(0.88 0.10 95)",  bg: "oklch(0.30 0.08 95 / 0.55)",  ring: "oklch(0.55 0.12 95 / 0.5)",  halo: "oklch(0.82 0.14 95 / 0.10)"  },
  new:        { dot: "oklch(0.72 0 0)",       fg: "oklch(0.88 0 0)",       bg: "oklch(0.30 0 0 / 0.7)",       ring: "oklch(1 0 0 / 0.18)",         halo: "oklch(0.72 0 0 / 0.10)"       },
};

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

function StatusChip({ badge }: { badge: StatusBadge }) {
  const tone = STATUS_TONES[badge];
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
        borderRadius: 9999,
        color: tone.fg,
        background: tone.bg,
        boxShadow: `inset 0 0 0 1px ${tone.ring}`,
        letterSpacing: 0.1,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: tone.dot,
          boxShadow: `0 0 0 2px ${tone.halo}`,
        }}
      />
      {STATUS_LABELS[badge]}
    </span>
  );
}

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

function SectionLabel({ children, count }: { children: ReactNode; count?: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 12,
      }}
    >
      <h2
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 1.6,
          textTransform: "uppercase",
          color: "oklch(0.65 0 0)",
          margin: 0,
          whiteSpace: "nowrap",
        }}
      >
        {children}
      </h2>
      {count != null && (
        <span
          style={{
            fontSize: 11,
            color: "oklch(0.50 0 0)",
            fontWeight: 500,
            letterSpacing: 0.2,
            whiteSpace: "nowrap",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {count}
        </span>
      )}
    </div>
  );
}

// ── Header ─────────────────────────────────────────────────────────────────────

function DashboardHeader({ data, weekLabel }: { data: DashboardData; weekLabel: string }) {
  return (
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
  );
}

// ── Board distribution ─────────────────────────────────────────────────────────

function BoardDistribution({ distribution }: { distribution: Record<string, number> }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <SectionLabel>Board breakdown</SectionLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {Object.entries(distribution).map(([slug, count]) => {
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
  );
}

// ── Signal list ────────────────────────────────────────────────────────────────

function SignalRow({ item }: { item: DashboardSelection }) {
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

      {/* Middle: board + title + reason + canny */}
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

      {/* Status badge */}
      <div style={{ paddingTop: 2 }}>
        <StatusChip badge={item.status_badge} />
      </div>
    </div>
  );
}

function SignalSection({ items }: { items: DashboardSelection[] }) {
  return (
    <section>
      <SectionLabel>Top 10 signals</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {items.map((item) => (
          <SignalRow key={item.canny_id} item={item} />
        ))}
      </div>
    </section>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const { data, error } = await getDashboardData();

  if (error || !data) {
    return (
      <main
        style={{
          maxWidth: 640,
          margin: "0 auto",
          padding: "80px 24px",
          textAlign: "center",
        }}
      >
        <p style={{ color: "oklch(0.55 0 0)", fontSize: 14 }}>
          {error ?? "No synthesis results found."}
        </p>
      </main>
    );
  }

  const generatedLabel = new Date(data.generated_at ?? data.week_of + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <main className="dashboard-main">
      <DashboardHeader data={data} weekLabel={generatedLabel} />
      <BoardDistribution distribution={data.board_distribution} />
      <div className="grid grid-cols-1 gap-6 items-start min-[920px]:[grid-template-columns:minmax(0,1.5fr)_minmax(0,1fr)]">
        <SignalSection items={data.selections} />

        <section>
          <SectionLabel count={`${data.patterns.length} patterns`}>
            Pattern insights
          </SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {data.patterns.map((p) => (
              <PatternCard key={p.id} pattern={p} />
            ))}
          </div>
        </section>
      </div>

      <footer
        style={{
          marginTop: 56,
          paddingTop: 20,
          borderTop: "1px solid oklch(1 0 0 / 0.08)",
          fontSize: 11,
          color: "oklch(0.45 0 0)",
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <span>FutureFit Signals</span>
      </footer>
    </main>
  );
}
