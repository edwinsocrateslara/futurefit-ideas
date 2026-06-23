// Single source of truth for KR identifiers.
// Format: O{n}·KR{n} — objective number + KR number.
// Derived from strategy/okrs.md — update this file when OKRs change.

export const KR_VALUES = [
  // Obj 01 — Reliable data & workflows
  "O1·KR1", "O1·KR2", "O1·KR3", "O1·KR4", "O1·KR5",
  "O1·KR6", "O1·KR7", "O1·KR8", "O1·KR9",
  // Obj 02 — Tools for intermediaries
  "O2·KR1", "O2·KR2", "O2·KR3", "O2·KR4", "O2·KR5",
  // Obj 03 — Talent experience
  "O3·KR1", "O3·KR2", "O3·KR3", "O3·KR4", "O3·KR5",
  // Obj 04 — Human impact
  "O4·KR1", "O4·KR2", "O4·KR3", "O4·KR4",
] as const;

export type KRValue = typeof KR_VALUES[number];

// Short labels for popover display.
export const KR_LABELS: Record<string, string> = {
  "O1·KR1": "PIRL event capture complete",
  "O1·KR2": "Skills & credentials trust; filter accuracy on experience level and job type",
  "O1·KR3": "Decrease time to employer first job posting/claim",
  "O1·KR4": "Candidate recommendations hardened for scale and accuracy",
  "O1·KR5": "Duplicates, gaps, and skills extraction in job data feed",
  "O1·KR6": "SOC2, WCAG 2.2 AA compliance; clear path to NIST 553 / FedRamp",
  "O1·KR7": "Career/role/skill ontology defined; build pipeline clean; baseline model testable",
  "O1·KR8": "Case management integration brings x% of active talent and staff to FFAI",
  "O1·KR9": "Upgrade MyOneFlow; self-serve and permissioning for WCG enables real-time staff assist",
  "O2·KR1": "Routing for customer-specific user groups configurable and automated at scale",
  "O2·KR2": "Employers and providers connected with action-taking tools (JD suggestions, claiming, insights)",
  "O2·KR3": "Regional job demand/supply with skills trends; admin job export included",
  "O2·KR4": "Job placement, training completion, and program success dashboards in 3+ customers' hands",
  "O2·KR5": "Integrations and automations (Revelio, UKG, Workday) cover x% of active users' outcomes",
  "O3·KR1": "Validate AI Coach full beta — decrease time to obvious next step",
  "O3·KR2": "Automate and improve talent UX from AI Coach learnings with nudges on/off platform",
  "O3·KR3": "Work recommender accurate — seniority, salary, skills; decrease wait time and no-results rate",
  "O3·KR4": "Explore and define incentives that systematically move people through the platform",
  "O3·KR5": "Eliminate friction in job seeker registration",
  "O4·KR1": "Knowledge graph and predictive analytics for the broader workforce system",
  "O4·KR2": "Causal evidence from enhanced wage outcomes (NJDOL, JFF/Ohio)",
  "O4·KR3": "Hero metrics with ≥10 human stories published internally",
  "O4·KR4": "Replicate WCG preliminary results in CO Thrives context",
};

// Converts internal identifier (e.g. "O1·KR3") to display label ("OBJ-1-KR3").
export function krDisplayLabel(kr: string): string {
  const [obj, krPart] = kr.split("·");
  const objNum = obj?.replace("O", "") ?? "";
  return `OBJ-${objNum}-${krPart ?? ""}`;
}

// Grouped structure for the KR popover UI.
export const KR_GROUPS: Array<{
  group: string;
  objectives: Array<{
    label: string;
    krs: string[];
  }>;
}> = [
  {
    group: "Obj 01 · Reliable data & workflows",
    objectives: [
      {
        label: "Make data and workflows reliable to grow LX & Employment Services",
        krs: ["O1·KR1", "O1·KR2", "O1·KR3", "O1·KR4", "O1·KR5", "O1·KR6", "O1·KR7", "O1·KR8", "O1·KR9"],
      },
    ],
  },
  {
    group: "Obj 02 · Tools for intermediaries",
    objectives: [
      {
        label: "Decrease bureaucratic burden for regional and industry intermediaries",
        krs: ["O2·KR1", "O2·KR2", "O2·KR3", "O2·KR4", "O2·KR5"],
      },
    ],
  },
  {
    group: "Obj 03 · Talent experience",
    objectives: [
      {
        label: "Transform the talent experience from 'matching' to 'moving'",
        krs: ["O3·KR1", "O3·KR2", "O3·KR3", "O3·KR4", "O3·KR5"],
      },
    ],
  },
  {
    group: "Obj 04 · Human impact",
    objectives: [
      {
        label: "Show human impact with transition graph & outcomes storytelling",
        krs: ["O4·KR1", "O4·KR2", "O4·KR3", "O4·KR4"],
      },
    ],
  },
];
