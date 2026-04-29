// node --env-file=.env.local scripts/diagnose-supabase.mjs

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

console.log("\n[Config]");
console.log("  URL:          ", url);
console.log("  Anon key:     ", anon.slice(0, 20) + "...");
console.log("  Service key:  ", service.slice(0, 20) + "...");

// Try raw REST call to boards table using service role key
console.log("\n[Raw REST — service role]");
try {
  const res = await fetch(`${url}/rest/v1/boards?select=id,name&limit=5`, {
    headers: {
      "apikey": service,
      "Authorization": `Bearer ${service}`,
    },
  });
  const body = await res.text();
  console.log("  Status:", res.status);
  console.log("  Body:  ", body.slice(0, 300));
} catch (err) {
  console.log("  Error:", err.message);
}

// Try raw REST call using anon key
console.log("\n[Raw REST — anon key]");
try {
  const res = await fetch(`${url}/rest/v1/boards?select=id,name&limit=5`, {
    headers: {
      "apikey": anon,
      "Authorization": `Bearer ${anon}`,
    },
  });
  const body = await res.text();
  console.log("  Status:", res.status);
  console.log("  Body:  ", body.slice(0, 300));
} catch (err) {
  console.log("  Error:", err.message);
}
