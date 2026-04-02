// src/index.js
// Main Cloudflare Worker — receives Tally webhook, runs all 5 agents, delivers outputs

import { verifyTallySignature, parseTallyPayload } from "../utils/tally.js";
import { runResearcher }  from "../agents/researcher.js";
import { runStrategist }  from "../agents/strategist.js";
import { runWriter }      from "../agents/writer.js";
import { runChecker }     from "../agents/checker.js";
import { runFormatter }   from "../agents/formatter.js";
import { createGoogleSheet } from "../outputs/sheets.js";
import { buildPdfHtml, renderPdf } from "../outputs/pdf.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const AGENT_DELAY_MS = 3000;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ status: "ok", version: env.PIPELINE_VERSION });
    }

    if (url.pathname === "/webhook/tally" && request.method === "POST") {
      return handleTallyWebhook(request, env, ctx);
    }

    // ── Manual trigger — returns immediately, runs pipeline in background
    if (url.pathname === "/run" && request.method === "POST") {
      const client = await request.json();
      if (!client.clientName) {
        return json({ error: "Missing clientName" }, 400);
      }
      console.log(`[Run] Accepted: ${client.clientName}`);
      ctx.waitUntil(
        runPipeline(client, env).catch((err) =>
          console.error("[Pipeline] Fatal error:", err)
        )
      );
      return json({
        status: "accepted",
        message: `Pipeline started for ${client.clientName}. Check Cloudflare logs for progress.`,
        clientName: client.clientName,
        monthYear: client.monthYear,
      });
    }

    return new Response("Not found", { status: 404 });
  },
};

// ── Tally Webhook Handler
async function handleTallyWebhook(request, env, ctx) {
  if (env.TALLY_SIGNING_SECRET) {
    const valid = await verifyTallySignature(request, env.TALLY_SIGNING_SECRET);
    if (!valid) {
      console.error("[Webhook] Invalid Tally signature");
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let payload;
  try { payload = await request.json(); }
  catch { return new Response("Invalid JSON", { status: 400 }); }

  const client = parseTallyPayload(payload);
  if (!client.clientName || !client.clientEmail) {
    return new Response("Missing required fields", { status: 400 });
  }

  console.log(`[Webhook] Received: ${client.clientName}`);
  ctx.waitUntil(
    runPipeline(client, env).catch((err) =>
      console.error("[Pipeline] Fatal error:", err)
    )
  );

  return json({
    status: "accepted",
    message: `Pipeline started for ${client.clientName}. Delivery will follow via email.`,
  });
}

// ── Main Pipeline Orchestrator
async function runPipeline(client, env) {
  const startTime = Date.now();
  console.log(`\n[Pipeline] ▶ Starting for: ${client.clientName}`);

  try {
    console.log("[Pipeline] Step 1/5: Researching...");
    const brief = await runResearcher(env, client);
    console.log("[Pipeline] ✓ Research complete — pausing...");
    await sleep(AGENT_DELAY_MS);

    console.log("[Pipeline] Step 2/5: Building calendar skeleton...");
    const calendarSkeleton = await runStrategist(env, client, brief);
    console.log("[Pipeline] ✓ Strategy complete — pausing...");
    await sleep(AGENT_DELAY_MS);

    console.log("[Pipeline] Step 3/5: Writing captions...");
    const writtenPosts = await runWriter(env, client, brief, calendarSkeleton);
    console.log("[Pipeline] ✓ Writing complete — pausing...");
    await sleep(AGENT_DELAY_MS);

    console.log("[Pipeline] Step 4/5: Quality checking...");
    const { report, posts: checkedPosts } = await runChecker(env, client, brief, writtenPosts);
    console.log("[Pipeline] ✓ Quality check complete — pausing...");
    await sleep(AGENT_DELAY_MS);

    console.log("[Pipeline] Step 5/5: Formatting outputs...");
    const { sheetHeaders, sheetRows, pdfData } = runFormatter(
      client, brief, checkedPosts, report, client.monthYear
    );

    let sheetUrl = null;
    try {
      sheetUrl = await createGoogleSheet(env, client.clientName, client.monthYear, sheetHeaders, sheetRows);
      console.log(`[Pipeline] ✓ Sheet: ${sheetUrl}`);
    } catch (err) {
      console.error("[Pipeline] Sheet failed:", err.message);
    }

    let pdfResult = null;
    try {
      const html = buildPdfHtml(pdfData);
      pdfResult = await renderPdf(env, html);
      console.log(`[Pipeline] ✓ PDF (${pdfResult.type})`);
    } catch (err) {
      console.error("[Pipeline] PDF failed:", err.message);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n[Pipeline] ✅ Complete in ${elapsed}s | Posts: ${checkedPosts.length} | Score: ${report.overallScore}/100 | Sheet: ${sheetUrl ?? "failed"}`);

  } catch (err) {
    console.error("[Pipeline] ✗ Failed:", err.message);
  }
}

// ── Helpers
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
