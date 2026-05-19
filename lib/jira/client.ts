import { getJiraConfig } from "@/config/jira";
import { parseJiraStory } from "./parse-story";
import type { ParsedJiraStory } from "./parse-story";

// ── Minimal ADF types ─────────────────────────────────────────────────────────

interface AdfText {
  type: "text";
  text: string;
  marks?: Array<{ type: "strong" }>;
}

interface AdfParagraph {
  type: "paragraph";
  content: AdfText[];
}

interface AdfListItem {
  type: "listItem";
  content: [AdfParagraph];
}

interface AdfBulletList {
  type: "bulletList";
  content: AdfListItem[];
}

type AdfNode = AdfParagraph | AdfBulletList;

interface AdfDoc {
  type: "doc";
  version: 1;
  content: AdfNode[];
}

// ── ADF builders ──────────────────────────────────────────────────────────────

function boldParagraph(text: string): AdfParagraph {
  return {
    type: "paragraph",
    content: [{ type: "text", text, marks: [{ type: "strong" }] }],
  };
}

function textParagraph(text: string): AdfParagraph {
  return {
    type: "paragraph",
    content: [{ type: "text", text }],
  };
}

function bulletList(items: string[]): AdfBulletList {
  return {
    type: "bulletList",
    content: items.map((item) => ({
      type: "listItem",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: item }],
        },
      ],
    })),
  };
}

// Builds the four-section ADF description that matches Jira's template.
// Requirements is left blank for v1 — the team fills it in Jira.
export function buildAdfDescription(parsed: ParsedJiraStory): AdfDoc {
  const nodes: AdfNode[] = [];

  nodes.push(boldParagraph("Context"));
  nodes.push(textParagraph(parsed.context || "(none)"));

  nodes.push(boldParagraph("User stories"));
  nodes.push(textParagraph(parsed.userStory || "(none)"));

  nodes.push(boldParagraph("Requirements"));
  nodes.push(textParagraph(" "));

  nodes.push(boldParagraph("Acceptance criteria"));
  if (parsed.acceptanceCriteria.length > 0) {
    nodes.push(bulletList(parsed.acceptanceCriteria));
  } else {
    nodes.push(textParagraph("(none)"));
  }

  return { type: "doc", version: 1, content: nodes };
}

// ── Jira REST API client ──────────────────────────────────────────────────────

export interface CreatedIssue {
  key: string;   // e.g. FFAI-42
  id: string;    // Jira's internal numeric ID
  url: string;   // https://yoursite.atlassian.net/browse/FFAI-42
}

function getAuthHeader(): string {
  const { email, apiToken } = getJiraConfig();
  return "Basic " + Buffer.from(`${email}:${apiToken}`).toString("base64");
}

async function jiraFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const { baseUrl } = getJiraConfig();
  return fetch(`${baseUrl}/rest/api/3${path}`, {
    ...options,
    headers: {
      Authorization: getAuthHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
}

// Creates a Jira ticket in the FFAI project.
// Easy-win tickets receive the "quick_wins" label so they appear on board 219.
// summary defaults to the Title parsed from jiraStoryRaw.
export async function createIssue(params: {
  jiraStoryRaw: string;
  summaryOverride?: string;
  isEasyWin?: boolean;
}): Promise<CreatedIssue> {
  const config = getJiraConfig();
  const parsed = parseJiraStory(params.jiraStoryRaw);
  const summary = (params.summaryOverride ?? parsed.title).slice(0, 255);
  const description = buildAdfDescription(parsed);

  const body = {
    fields: {
      project: { key: config.projectKey },
      summary,
      issuetype: { name: config.issueType },
      description,
      ...(params.isEasyWin ? { labels: ["quick_wins"] } : {}),
    },
  };

  const res = await jiraFetch("/issue", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "(no body)");
    throw new Error(`Jira createIssue failed: HTTP ${res.status} — ${detail}`);
  }

  const data = (await res.json()) as { id: string; key: string };
  return { key: data.key, id: data.id, url: `${config.baseUrl}/browse/${data.key}` };
}

// Returns the raw Jira status name for a given issue key.
export async function getIssueStatus(issueKey: string): Promise<string> {
  const res = await jiraFetch(`/issue/${issueKey}?fields=status`);

  if (!res.ok) {
    const detail = await res.text().catch(() => "(no body)");
    throw new Error(`Jira getIssueStatus failed: HTTP ${res.status} — ${detail}`);
  }

  const data = (await res.json()) as {
    fields: { status: { name: string } };
  };
  return data.fields.status.name;
}

// Verifies credentials work and the Jira instance is reachable.
export async function validateConnection(): Promise<{ displayName: string; email: string }> {
  const res = await jiraFetch("/myself");

  if (!res.ok) {
    const detail = await res.text().catch(() => "(no body)");
    throw new Error(`Jira connection failed: HTTP ${res.status} — ${detail}`);
  }

  const data = (await res.json()) as { displayName: string; emailAddress: string };
  return { displayName: data.displayName, email: data.emailAddress };
}
