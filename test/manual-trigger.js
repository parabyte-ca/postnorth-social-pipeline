// test/manual-trigger.js
// Run this locally to test the pipeline without a Tally form
// Usage: node test/manual-trigger.js

const WORKER_URL = "http://localhost:8787"; // wrangler dev default

const testClient = {
  clientName:     "Maple & Main Bakery",
  clientUrl:      "https://example.com",
  clientEmail:    "owner@maplemain.ca",
  industry:       "Artisan bakery and café",
  targetAudience: "Local families, remote workers, brunch lovers aged 25-45",
  tone:           "Warm, friendly, community-focused. Not corporate.",
  monthYear:      "May 2026",
  platforms:      ["LinkedIn", "Instagram", "Facebook"],
  existingSamples: "Nothing beats a Saturday morning with a fresh croissant and a good coffee. Come say hi. 🥐",
  googleSheetId:  "",
};

async function run() {
  console.log(`Triggering pipeline for: ${testClient.clientName}\n`);

  const res = await fetch(`${WORKER_URL}/run`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(testClient),
  });

  const result = await res.json();
  console.log("\n── Pipeline Result ──");
  console.log(JSON.stringify(result, null, 2));
}

run().catch(console.error);
