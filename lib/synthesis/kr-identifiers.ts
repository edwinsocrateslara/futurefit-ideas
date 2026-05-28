// Single source of truth for KR identifiers.
// Format: {group}·O{n}·KR{n} where group is D (Data), P (Product), or Eng (Engineering).
// Derived from strategy/okrs.md — update this file when OKRs change.

export const KR_VALUES = [
  "D·O1·KR1", "D·O1·KR2", "D·O1·KR3",
  "D·O2·KR1", "D·O2·KR2", "D·O2·KR3", "D·O2·KR4",
  "D·O3·KR1", "D·O3·KR2", "D·O3·KR3", "D·O3·KR4", "D·O3·KR5",
  "P·O1·KR1", "P·O1·KR2", "P·O1·KR3", "P·O1·KR4", "P·O1·KR5", "P·O1·KR6",
  "P·O2·KR1", "P·O2·KR2", "P·O2·KR3",
  "Eng·O1·KR1", "Eng·O1·KR2", "Eng·O1·KR3",
  "Eng·O2·KR1", "Eng·O2·KR2", "Eng·O2·KR3",
  "Eng·O3·KR1", "Eng·O3·KR2", "Eng·O3·KR3",
] as const;

export type KRValue = typeof KR_VALUES[number];

// Short labels for popover display.
export const KR_LABELS: Record<string, string> = {
  "D·O1·KR1": "Worker profiles matched to wage records + wage data services",
  "D·O1·KR2": "Candidate-to-placement outcomes for CO Thrives; Snowflake for MA",
  "D·O1·KR3": "Curriculum↔job outcome match score for ActivateWork",
  "D·O2·KR1": "Skills taxonomy cleanup — remove COVID artifacts, add AI skills",
  "D·O2·KR2": "AI Coach V2 shipped; 70 users/week across 10+ customers",
  "D·O2·KR3": "LMI on Revelio data — demand trends viewed by 3+ customers",
  "D·O2·KR4": "Engagement & conversion funnel metrics shared in All Hands",
  "D·O3·KR1": "Security vulnerabilities in ffai-data repo closed",
  "D·O3·KR2": "Intercom data added to data lake",
  "D·O3·KR3": "PIRL solved with Heap↔user mapping or alternative mechanism",
  "D·O3·KR4": "Nightly gold layer updates running without errors",
  "D·O3·KR5": "5 discovery spike decisions documented for Q3",
  "P·O1·KR1": "Snowflake integration live for MA job seeker portal",
  "P·O1·KR2": "MA job seeker portal: self-sign up & SSO for July launch",
  "P·O1·KR3": "Job seeker portal KR & roadmap confirmed with management",
  "P·O1·KR4": "Employer portal KR & roadmap confirmed with management",
  "P·O1·KR5": "Granular permissions for multi-tenant deployments",
  "P·O1·KR6": '"Apply to job" saved data accessible to job seekers & coaches',
  "P·O2·KR1": "PMs and UX using Claude Code for 10 small UI win tickets",
  "P·O2·KR2": "User journey maps complete for all personas",
  "P·O2·KR3": "Networking study learnings shared on socials",
  "Eng·O1·KR1": "WCAG 2.2 AA accessibility gap documented and sized",
  "Eng·O1·KR2": "Critical/high SOC2 vulnerabilities remediated",
  "Eng·O1·KR3": "NIST gap analysis + FedRamp go/no-go decision complete",
  "Eng·O2·KR1": "Manual WCG integration failure processes documented",
  "Eng·O2·KR2": "Top 80% of automatable WCG processes automated",
  "Eng·O2·KR3": "Shared WCG roadmap based on Empyra-scope bugs",
  "Eng·O3·KR1": "Health dashboard deployed with central monitoring",
  "Eng·O3·KR2": "Completed:committed sprint ratio improved 18:26 → 18:21",
  "Eng·O3·KR3": "Claude-automated first-pass fixes for 50% of non-critical bugs",
};

// Grouped structure for the override popover UI.
export const KR_GROUPS: Array<{
  group: string;
  objectives: Array<{
    label: string;
    krs: string[];
  }>;
}> = [
  {
    group: "Data",
    objectives: [
      { label: "Obj 1 — Customer outcome standards", krs: ["D·O1·KR1", "D·O1·KR2", "D·O1·KR3"] },
      { label: "Obj 2 — High learning rate data", krs: ["D·O2·KR1", "D·O2·KR2", "D·O2·KR3", "D·O2·KR4"] },
      { label: "Obj 3 — Stable BI / recommenders / PIRL", krs: ["D·O3·KR1", "D·O3·KR2", "D·O3·KR3", "D·O3·KR4", "D·O3·KR5"] },
    ],
  },
  {
    group: "Engineering",
    objectives: [
      { label: "Obj 1 — SOC2 / NIST / accessibility", krs: ["Eng·O1·KR1", "Eng·O1·KR2", "Eng·O1·KR3"] },
      { label: "Obj 2 — WCG integration", krs: ["Eng·O2·KR1", "Eng·O2·KR2", "Eng·O2·KR3"] },
      { label: "Obj 3 — Operational health", krs: ["Eng·O3·KR1", "Eng·O3·KR2", "Eng·O3·KR3"] },
    ],
  },
  {
    group: "Product",
    objectives: [
      { label: "Obj 1 — MA go-live", krs: ["P·O1·KR1", "P·O1·KR2", "P·O1·KR3", "P·O1·KR4", "P·O1·KR5", "P·O1·KR6"] },
      { label: "Obj 2 — Build team velocity", krs: ["P·O2·KR1", "P·O2·KR2", "P·O2·KR3"] },
    ],
  },
];
