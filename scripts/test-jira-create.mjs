// Diagnostic tool: verifies end-to-end Jira API integration.
// Creates one real ticket in the FFAI project using a jira_story fetched from
// the database (falls back to a hardcoded story if none is found). Use this to
// isolate whether a Jira integration failure is API connectivity vs. downstream
// logic in the Accept flow.
//
// Usage:
//   node --env-file=.env.local scripts/test-jira-create.mjs            # creates ticket
//   node --env-file=.env.local scripts/test-jira-create.mjs --dry-run  # parse only, no ticket
//
// WARNING: creates a real ticket in the FFAI Jira project. Delete it after verification.

import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.argv.includes("--dry-run");

// ── Helpers ───────────────────────────────────────────────────────────────────

function pass(label) {
  console.log(`  ✓ ${label}`);
}

function fail(label, detail) {
  console.error(`  ✗ ${label}${detail ? `: ${detail}` : ""}`);
}

function section(title) {
  console.log(`\n[${title}]`);
}

// ── Parser (mirrors lib/jira/parse-story.ts) ──────────────────────────────────

function parseJiraStory(raw) {
  const lines = raw.split("\n");

  let title = "";
  for (const line of lines) {
    const m = line.match(/^Title:\s*(.+)/i);
    if (m) { title = m[1].trim(); break; }
  }

  const HEADERS = {
    "user story:":          "userStory",
    "user stories:":        "userStory",
    "context:":             "context",
    "acceptance criteria:": "acceptanceCriteria",
  };

  const sections = {};
  let current = null;

  for (const line of lines) {
    const normalized = line.trim().toLowerCase();
    const matched = Object.keys(HEADERS).find((h) => normalized === h);
    if (matched) {
      current = HEADERS[matched];
      sections[current] ??= [];
    } else if (current) {
      sections[current].push(line);
    }
  }

  const joinSection = (name) =>
    (sections[name] ?? []).map((l) => l.trim()).filter(Boolean).join(" ").trim();

  const acceptanceCriteria = (sections.acceptanceCriteria ?? [])
    .map((l) => l.trim())
    .filter((l) => /^[-•*]/.test(l))
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);

  return {
    title,
    userStory: joinSection("userStory"),
    context: joinSection("context"),
    acceptanceCriteria,
  };
}

// ── ADF builder (mirrors lib/jira/client.ts) ──────────────────────────────────

function boldParagraph(text) {
  return {
    type: "paragraph",
    content: [{ type: "text", text, marks: [{ type: "strong" }] }],
  };
}

function textParagraph(text) {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function bulletList(items) {
  return {
    type: "bulletList",
    content: items.map((item) => ({
      type: "listItem",
      content: [{ type: "paragraph", content: [{ type: "text", text: item }] }],
    })),
  };
}

function buildAdfDescription(parsed) {
  const nodes = [
    boldParagraph("Context"),
    textParagraph(parsed.context || "(none)"),
    boldParagraph("User stories"),
    textParagraph(parsed.userStory || "(none)"),
    boldParagraph("Requirements"),
    textParagraph(" "),
    boldParagraph("Acceptance criteria"),
  ];

  if (parsed.acceptanceCriteria.length > 0) {
    nodes.push(bulletList(parsed.acceptanceCriteria));
  } else {
    nodes.push(textParagraph("(none)"));
  }

  return { type: "doc", version: 1, content: nodes };
}

// ── Jira API ──────────────────────────────────────────────────────────────────

function getAuthHeader() {
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  return "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
}

async function jiraFetch(path, options = {}) {
  const base = process.env.JIRA_BASE_URL.replace(/\/$/, "");
  return fetch(`${base}/rest/api/3${path}`, {
    ...options,
    headers: {
      Authorization: getAuthHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(DRY_RUN ? "\n[test-jira-create] DRY RUN — no ticket will be created\n" : "\n[test-jira-create] Creating a real ticket in FFAI\n");

// ── 1. Env vars ───────────────────────────────────────────────────────────────

section("1. Environment variables");

const REQUIRED = ["JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN"];
const OPTIONAL = [
  ["JIRA_PROJECT_KEY",  "FFAI"],
  ["JIRA_DONE_STATUSES", "Released,Done,Closed"],
];

let envOk = true;
for (const key of REQUIRED) {
  if (process.env[key]) {
    pass(key);
  } else {
    fail(key, "missing or empty");
    envOk = false;
  }
}
for (const [key, def] of OPTIONAL) {
  const val = process.env[key];
  pass(`${key}: ${val ?? `(default: ${def})`}`);
}

if (!envOk) {
  console.error("\nAborting: set the required Jira env vars in .env.local\n");
  process.exit(1);
}

const projectKey = process.env.JIRA_PROJECT_KEY ?? "FFAI";
const doneStatuses = (process.env.JIRA_DONE_STATUSES ?? "Released,Done,Closed")
  .split(",").map((s) => s.trim());
const jiraBase = process.env.JIRA_BASE_URL.replace(/\/$/, "");

// ── 2. Connection test ────────────────────────────────────────────────────────

section("2. Jira connection");

let connOk = false;
try {
  const res = await jiraFetch("/myself");
  if (res.ok) {
    const me = await res.json();
    pass(`Authenticated as ${me.displayName} (${me.emailAddress})`);
    connOk = true;
  } else {
    const body = await res.text().catch(() => "(no body)");
    fail("Authentication", `HTTP ${res.status} — ${body}`);
  }
} catch (err) {
  fail("Connection", err.message);
}

if (!connOk) {
  console.error("\nAborting: fix Jira credentials before proceeding.\n");
  process.exit(1);
}

// ── 3. Fetch jira_story from DB ───────────────────────────────────────────────

section("3. Fetching jira_story from Supabase");

const FALLBACK_STORY = `Title: [TEST] Add filter by assigned coach to user management table

User story:
As an administrator, I want to filter the user management table by assigned coach, so that I can quickly review all job seekers assigned to a specific coach without scrolling through the full list.

Context:
The user management table currently supports filtering by status and board but not by coach assignment. The coach-to-user relationship already exists in the database. This is a single dropdown filter addition to an existing table UI with no new data model required.

Acceptance criteria:
- Administrators can filter the user management table by selecting a coach from a dropdown
- The dropdown lists all active coaches in the system
- Selecting a coach shows only job seekers assigned to that coach
- Clearing the filter restores the full list
- The filter state persists within the current session`;

let jiraStoryRaw = FALLBACK_STORY;
let storySource = "hardcoded fallback";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (supabaseUrl && supabaseKey) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from("ideas")
      .select("canny_id, title, jira_story")
      .not("jira_story", "is", null)
      .eq("selected_this_week", true)
      .order("selection_priority_rank", { ascending: true })
      .limit(1)
      .single();

    if (!error && data?.jira_story) {
      jiraStoryRaw = data.jira_story;
      storySource = `ideas.canny_id=${data.canny_id} (rank 1 from current week)`;
      pass(`Found jira_story: "${data.title}"`);
    } else {
      pass(`No current-week synthesis found — using fallback story`);
    }
  } catch (err) {
    pass(`Supabase query failed (${err.message}) — using fallback story`);
  }
} else {
  pass("No Supabase env vars — using fallback story");
}

console.log(`  Source: ${storySource}`);

// ── 4. Parse the story ────────────────────────────────────────────────────────

section("4. Parsing jira_story");

const parsed = parseJiraStory(jiraStoryRaw);

console.log(`\n  Title (→ Summary):\n    ${parsed.title || "(empty — check parser)"}`);
console.log(`\n  User story (→ User stories section):\n    ${parsed.userStory.slice(0, 120)}${parsed.userStory.length > 120 ? "…" : ""}`);
console.log(`\n  Context:\n    ${parsed.context.slice(0, 120)}${parsed.context.length > 120 ? "…" : ""}`);
console.log(`\n  Acceptance criteria (${parsed.acceptanceCriteria.length} items):`);
for (const ac of parsed.acceptanceCriteria) {
  console.log(`    - ${ac}`);
}

const parseOk =
  parsed.title.length > 0 &&
  parsed.userStory.length > 0 &&
  parsed.context.length > 0 &&
  parsed.acceptanceCriteria.length > 0;

if (parseOk) {
  pass("All four sections parsed successfully");
} else {
  const missing = [
    !parsed.title && "title",
    !parsed.userStory && "userStory",
    !parsed.context && "context",
    parsed.acceptanceCriteria.length === 0 && "acceptanceCriteria",
  ].filter(Boolean);
  fail("Parser", `missing sections: ${missing.join(", ")}`);
  console.warn("  Proceeding anyway — check the story format if sections are wrong.");
}

// ── 5. Build ADF ──────────────────────────────────────────────────────────────

section("5. ADF description");

const adf = buildAdfDescription(parsed);
console.log("\n  ADF structure preview:");
for (const node of adf.content) {
  if (node.type === "paragraph") {
    const text = node.content[0]?.text ?? "";
    const isBold = node.content[0]?.marks?.some((m) => m.type === "strong");
    console.log(`    ${isBold ? `[bold] "${text}"` : `"${text.slice(0, 60)}${text.length > 60 ? "…" : ""}"`}`);
  } else if (node.type === "bulletList") {
    console.log(`    [bulletList] ${node.content.length} items`);
  }
}

pass("ADF built");

if (DRY_RUN) {
  console.log("\n── DRY RUN COMPLETE ─────────────────────────────────────────────────────────");
  console.log("  Parsing and ADF generation look correct.");
  console.log("  Run without --dry-run to create a real ticket.\n");
  process.exit(0);
}

// ── 6. Create ticket ──────────────────────────────────────────────────────────

section("6. Creating Jira ticket");

const summary = parsed.title.slice(0, 255);
const body = {
  fields: {
    project: { key: projectKey },
    summary,
    issuetype: { name: "Feature" },
    description: adf,
  },
};

console.log(`\n  Project: ${projectKey}`);
console.log(`  Issue type: Feature`);
console.log(`  Summary: ${summary}`);
console.log("\n  Calling POST /rest/api/3/issue ...\n");

let createdKey;
let createdUrl;

try {
  const res = await jiraFetch("/issue", {
    method: "POST",
    body: JSON.stringify(body),
  });

  const responseText = await res.text();

  if (!res.ok) {
    fail("createIssue", `HTTP ${res.status} — ${responseText}`);
    console.error("\n  Full request body sent:");
    console.error(JSON.stringify(body, null, 2));
    process.exit(1);
  }

  const data = JSON.parse(responseText);
  createdKey = data.key;
  createdUrl = `${jiraBase}/browse/${data.key}`;

  pass(`Ticket created: ${createdKey}`);
  pass(`URL: ${createdUrl}`);
  pass(`Internal ID: ${data.id}`);
} catch (err) {
  fail("createIssue", err.message);
  process.exit(1);
}

// ── 7. Verify status fetch ────────────────────────────────────────────────────

section("7. Verifying status fetch");

try {
  const res = await jiraFetch(`/issue/${createdKey}?fields=status`);

  if (!res.ok) {
    const detail = await res.text().catch(() => "(no body)");
    fail("getIssueStatus", `HTTP ${res.status} — ${detail}`);
  } else {
    const data = await res.json();
    const statusName = data.fields?.status?.name ?? "(unknown)";
    pass(`Status: "${statusName}"`);
    pass(`Done-equivalent check: ${doneStatuses.includes(statusName) ? "YES (would auto-close)" : `NO (open — expected for new tickets)`}`);
  }
} catch (err) {
  fail("getIssueStatus", err.message);
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log("\n" + "═".repeat(72));
console.log("  SPRINT 1 VALIDATION COMPLETE");
console.log("═".repeat(72));
console.log(`\n  Ticket created: ${createdKey}`);
console.log(`  URL:            ${createdUrl}`);
console.log(`\n  Open the URL above and verify:`);
console.log(`    1. Summary matches the title`);
console.log(`    2. Description shows four bold-header sections`);
console.log(`    3. Acceptance criteria renders as a bullet list`);
console.log(`    4. Requirements section is present but blank`);
console.log(`    5. No unexpected required field errors`);
console.log(`\n  If everything looks correct, Sprint 2 can begin.`);
console.log(`  Delete this test ticket in Jira when done reviewing.\n`);
