# Cards Full Information Refactor — Scope

**Principle:** A card carries all its informational fields on every surface it appears. A Top 10 item shows the same information whether it's on Top 10, Pinned/Coming Up, Accepted, or Done. Easy Win cards likewise. The tab is a view over the cards, not a place that strips fields off them.

---

## Already Done (don't redo)

- Coming Up Rule 3 KR gate: `pinned_from === "top_10"` conditional on `KRBadgesWithOverride` in `SortablePinnedCard` — live and correct. Preserve through refactor.

---

## The Rules

**Rule 1** — Informational fields appear on every surface. Contextual controls (drag handle, pin/unpin, defer/undo, accept) are surface-specific.

**Rule 2** — Pin button does NOT render on Accepted, Done, or Deferred. Pinning = "bring forward"; not applicable to terminal states. Available on Top 10 and Easy Wins. Coming Up shows Unpin.

**Rule 3** — KR badges are top_10-type only. Quick Wins never get KR badges or a "+ KR" affordance on any surface. Gate by item type (use `pinned_from` on PinnedItem; item origin elsewhere), not by tab, not by whether the KR array is empty.
- Top 10-type: KR badges on every surface. Editable surfaces (Top 10, Coming Up/top_10) show a subtle "+ KR" affordance when no KRs assigned.
- Quick Win-type: no KR badges, no affordance, ever.

**Rule 4** — Team field is UNIVERSAL. Applies to ALL item types (Top 10 AND Quick Win) on ALL surfaces. The KR exclusion does NOT extend to team.
- KR = strategic OKR linkage (Quick Wins don't advance OKRs → excluded).
- Team = operational ownership (who builds it — Eng or Data), which applies to Quick Wins equally.
- "Engineering & Data" combined option remains manual-only; persists via `manual_team_classification`.

---

## Snapshot — Resolved

Accepted and Done cards display decision-moment values (snapshot), not live values that drift when synthesis re-runs.

`jira_links` already has snapshot columns — `snapshot_status`, `snapshot_impact_rating`, `snapshot_confidence_rating`, `snapshot_team_classification`, `snapshot_reason`, `snapshot_committed_scope`, `snapshot_why_callout`, `snapshot_customers_callout`, `snapshot_deadline_callout` — but only `snapshot_reason` and `snapshot_committed_scope` are currently consumed. The rest are fetched and discarded. The refactor wires them through.

**One gap:** `linked_krs` currently reads live from `ideas.manual_linked_krs ?? ideas.linked_krs`. Fix: add `snapshot_linked_krs TEXT[]` to `jira_links`, write at accept time, consume on Accepted/Done cards.

---

## Current Render Paths (four distinct, zero sharing)

| Surface | Component | Type | Currently Missing |
|---|---|---|---|
| Top 10 | `SignalRow` + `SortableSignalRow` | `DashboardSelection` | — (reference render) |
| Easy Wins | `EasyWinCard` | `DashboardEasyWin` | Status, Impact/Confidence, KR, CommittedScope, callout block |
| Coming Up | `SortablePinnedCard` | `PinnedItem` | New/4+Wks badges |
| Accepted | inline in `AcceptedTab` | `AcceptedItem` | Status, Impact/Confidence, Team, callout block, Canny link; KR is live not snapshot |
| Jira Done | inline in `JiraDoneTab` | `DoneJiraItem` | Nearly everything |
| Deferred | inline in `DoneTab` | `DoneItem` | Nearly everything |

---

## Target Architecture

Extract a shared `CardBody` component:
- **Informational body:** board tag, status pill, impact/confidence, team, KR badges, title, reason, committed scope, callout block (Why / Customers / Deadline)
- **Parameterized controls slot:** drag handle + rank number, pin/unpin button, defer/undo button, accept button, Jira link, Canny link
- **Props:** `item`, `origin: "top_10" | "quick_win"`, `controls` config, `readOnly?: boolean`

Estimated: ~1,200 lines of duplicated structure → ~300 shared lines. Type/surface rules become single conditionals inside one component.

---

## Data Layer Work (do before UI work)

1. **Migration:** add `snapshot_linked_krs TEXT[]` to `jira_links`.
2. **Accept API route:** write `snapshot_linked_krs` at accept time alongside existing snapshot writes.
3. **Verify Quick Win accept path:** confirm it writes `snapshot_team_classification`. If the Quick Win path is thinner and doesn't snapshot team, add it — otherwise Rule 4 (universal team) breaks on accepted/done Quick Win cards.
4. **Update interfaces:** `AcceptedItem`, `DoneJiraItem`, `DoneItem` — add status, impact, confidence, team, KR, callout fields sourced from snapshot columns.
5. **Update loading queries** in `lib/data/dashboard.ts` to supply those fields. Most are already fetched for `AcceptedItem` via `jira_links`; extend to `DoneJiraItem` and `DoneItem` which are currently bare.

---

## Open Design Question — Resolve Before Coding Terminal Tabs

"Full info everywhere" applied to Deferred and Done needs a deliberate decision:

- Does a "+ KR" affordance make sense on a deferred item that's cleared by the next synthesis run? (Probably not — terminal items shouldn't have editable add-affordances.)
- Does showing snapshot impact/confidence on a completed/deferred item add value or become clutter?

**Lean:** Accepted and JiraDone show the full snapshot card (historical record is the value). Deferred is ephemeral (cleared each synthesis cycle) — may warrant a lighter treatment. Decide deliberately rather than forcing every field onto every terminal context.

---

## Staging Order

1. Data layer: interfaces + queries + `snapshot_linked_krs` migration + accept API write + Quick Win team snapshot verification
2. Build `CardBody` with informational fields + parameterized controls
3. Migrate each tab to `CardBody` one at a time, test each before moving to the next
4. Resolve the terminal-tab design question before touching Deferred/Done field sets

**Blast radius note:** `Dashboard.tsx` is 4,100+ lines. `SortablePinnedCard`'s dnd-kit wrapper means drag attributes must be threaded through carefully — can't naively share JSX. Wide diffs in this file are hard to review; stage carefully.
