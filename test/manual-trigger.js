// test/manual-trigger.js
// Fires the pipeline and returns immediately — check Cloudflare logs for progress

const WORKER_URL = "https://social-pipeline.the-moog.workers.dev";

const testClient = {
  clientName:     "Maple & Main Bakery",
  clientUrl:      "https://example.com",
  clientEmail:    "owner@maplemain.ca",
  industry:       "Artisan bakery and cafe",
  targetAudience: "Local families, remote workers, brunch lovers aged 25-45",
  tone:           "Warm, friendly, community-focused. Not corporate.",
  monthYear:      "May 2026",
  platforms:      ["LinkedIn", "Instagram", "Facebook"],
  existingSamples: "Nothing beats a Saturday morning with a fresh croissant and good coffee. Come say hi.",
  googleSheetId:  "",
};

async function run() {
  console.log("Triggering pipeline for: " + testClient.clientName);
  console.log("Worker: " + WORKER_URL + "\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300000); // 5 min timeout

  try {
    const res = await fetch(WORKER_URL + "/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testClient),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const result = await res.json();
    console.log("\n── Pipeline Result ──");
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      console.log("Request timed out after 5 minutes — check Cloudflare logs for result.");
    } else {
      console.error("Error:", err.message);
    }
  }
}

run();
