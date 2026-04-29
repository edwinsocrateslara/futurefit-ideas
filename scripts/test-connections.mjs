// Connection test script — run with:
// node --env-file=.env.local scripts/test-connections.mjs

import { createClient } from "@supabase/supabase-js";

const REQUIRED_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
  "CANNY_API_KEY",
  "CRON_SECRET",
];

let allPassed = true;

function pass(label) {
  console.log(`  ✓ ${label}`);
}

function fail(label, detail) {
  console.log(`  ✗ ${label}${detail ? `: ${detail}` : ""}`);
  allPassed = false;
}

// ── 1. Environment variables ─────────────────────────────────────────────────
console.log("\n[1] Environment variables");
for (const key of REQUIRED_VARS) {
  if (process.env[key] && process.env[key].trim() !== "") {
    pass(key);
  } else {
    fail(key, "missing or empty");
  }
}

// ── 2. Supabase connection ────────────────────────────────────────────────────
console.log("\n[2] Supabase");
try {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: boards, error } = await supabase
    .from("boards")
    .select("canny_id, slug, name")
    .order("display_order");

  if (error) {
    fail("boards table query", error.message);
  } else if (!boards || boards.length === 0) {
    fail("boards table", "connected but no rows found — did the migration + seed run?");
  } else {
    pass(`connected — ${boards.length} boards found`);
    for (const b of boards) {
      pass(`  ${b.name} (${b.slug}) → ${b.canny_id}`);
    }
  }

  const { count, error: ideasError } = await supabase
    .from("ideas")
    .select("*", { count: "exact", head: true });

  if (ideasError) {
    fail("ideas table query", ideasError.message);
  } else {
    pass(`ideas table accessible — ${count ?? 0} rows`);
  }
} catch (err) {
  fail("Supabase connection", err.message);
}

// ── 3. Canny API ─────────────────────────────────────────────────────────────
console.log("\n[3] Canny API");
const BOARD_IDS = [
  { id: "69dd91a6101dd51b00677e0c", name: "Customer Ideas" },
  { id: "69dd91d2eef3251ac9c41091", name: "Market Opportunities" },
  { id: "69dd91e37587ef995a08ef54", name: "UI/UX Inspiration" },
  { id: "670c2bce89df784b49c2252e", name: "FutureFit AI" },
];

try {
  const res = await fetch("https://canny.io/api/v1/boards/list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: process.env.CANNY_API_KEY, limit: 100 }),
  });

  if (!res.ok) {
    fail("Canny API", `HTTP ${res.status}`);
  } else {
    const data = await res.json();
    const cannyIds = new Set((data.boards ?? []).map((b) => b.id));

    pass(`API reachable — ${data.boards?.length ?? 0} boards visible`);

    for (const board of BOARD_IDS) {
      if (cannyIds.has(board.id)) {
        pass(`${board.name} (${board.id})`);
      } else {
        fail(`${board.name} (${board.id})`, "ID not found in your Canny account");
      }
    }
  }
} catch (err) {
  fail("Canny API", err.message);
}

// ── 4. Anthropic API ─────────────────────────────────────────────────────────
console.log("\n[4] Anthropic API");
try {
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
  });

  if (res.ok) {
    pass("API key valid and reachable");
  } else {
    const body = await res.json().catch(() => ({}));
    fail("Anthropic API", `HTTP ${res.status} — ${body.error?.message ?? "unknown error"}`);
  }
} catch (err) {
  fail("Anthropic API", err.message);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(50));
if (allPassed) {
  console.log("All checks passed. Ready to proceed.\n");
} else {
  console.log("Some checks failed — fix the items marked ✗ above before continuing.\n");
  process.exit(1);
}
