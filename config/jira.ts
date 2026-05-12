// Jira integration configuration.
// To update done-equivalent statuses, set JIRA_DONE_STATUSES in .env.local or Vercel env vars.
// Default covers all six green-category statuses in the FFAI workflow.

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable: ${name}`);
  return val;
}

// Lazy function so missing vars only throw when the integration is actually
// called, not at module import time during build.
export function getJiraConfig() {
  return {
    baseUrl: requireEnv("JIRA_BASE_URL").replace(/\/$/, ""),
    email: requireEnv("JIRA_EMAIL"),
    apiToken: requireEnv("JIRA_API_TOKEN"),
    projectKey: process.env.JIRA_PROJECT_KEY ?? "FFAI",
    issueType: "Feature" as const,
    doneStatuses: (
      process.env.JIRA_DONE_STATUSES ??
      "Release Backlog,Released,Resolved,Closed,Can't Reproduce,Not a Bug"
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

// Display categories for known Jira status names.
// Used for badge color in the Accepted/Done tabs.
// Done-equivalent statuses are handled separately via JIRA_DONE_STATUSES.
// Any status not listed here renders as a neutral "unknown" badge.
export type JiraStatusCategory = "open" | "in-progress" | "on-hold";

export const JIRA_STATUS_CATEGORY: Record<string, JiraStatusCategory> = {
  // Open / triage states
  "Triage":             "open",
  "Triage Failed":      "open",
  "Design Backlog":     "open",
  "Discovery Backlog":  "open",
  "In Discovery":       "open",
  "In Design":          "open",
  "Roadmap Backlog":    "open",
  // In-progress states
  "Ready":              "in-progress",
  "Work in Progress":   "in-progress",
  "Code Review":        "in-progress",
  "Verification":       "in-progress",
  // On-hold states
  "On Hold":            "on-hold",
  "Product On Hold":    "on-hold",
};
