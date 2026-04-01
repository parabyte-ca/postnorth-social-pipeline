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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── Health check
    if (url.pathname === "/health") {
      return json({ status: "ok", version: env.PIPELINE_VERSION });
    }

    // ── Tally webhook endpoint
    if (url.pathname === "/webhook/tally" && request.method === "POST") {
      return handleTallyWebhook(request, env);
    }

    // ── Manual trigger (for testing — POST with JSON body)
    if (url.pathname === "/run" && request.method === "POST") {
      const client = await request.json();
      return runPipeline(client, env);
    }

    return new Response("Not found", { status: 404 });
  },
};

// ── Tally Webhook Handler
async function handleTallyWebhook(request, env) {
  // Verify signature if secret is configured
  if (env.TALLY_SIGNING_SECRET) {
    const valid = await verifyTallySignature(request, env.TALLY_SIGNING_SECRET);
    if (!valid) {
      console.error("[Webhook] Invalid Tally signature");
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const client = parseTallyPayload(payload);

  if (!client.clientName || !client.clientEmail) {
    return new Response("Missing required fields: business name and email", { status: 400 });
  }

  // Respond immediately to Tally (webhooks time out if we don't)
  // Then run the pipeline asynchronously via waitUntil
  const ctx = { waitUntil: (p) => p }; // Workers provides this via second arg — see note below

  // Note: In a real Worker, use `ctx.waitUntil(runPipeline(...))` from the fetch handler's
  // third argument. For now we run inline and rely on Cloudflare's generous execution window.
  console.log(`[Webhook] Received submission for: ${client.clientName}`);

  // Fire and return — pipeline runs async
  runPipeline(client, env).catch((err) =>
    console.error("[Pipeline] Fatal error:", err)
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
    // Agent 1: Research
    console.log("[Pipeline] Step 1/5: Researching...");
    const brief = await runResearcher(env, client);

    // Agent 2: Strategy
    console.log("[Pipeline] Step 2/5: Building calendar skeleton...");
    const calendarSkeleton = await runStrategist(env, client, brief);

    // Agent 3: Write
    console.log("[Pipeline] Step 3/5: Writing captions...");
    const writtenPosts = await runWriter(env, client, brief, calendarSkeleton);

    // Agent 4: Quality check
    console.log("[Pipeline] Step 4/5: Quality checking...");
    const { report, posts: checkedPosts } = await runChecker(env, client, brief, writtenPosts);

    // Agent 5: Format
    console.log("[Pipeline] Step 5/5: Formatting outputs...");
    const { sheetHeaders, sheetRows, pdfData } = runFormatter(
      client, brief, checkedPosts, report, client.monthYear
    );

    // Output A: Google Sheet
    let sheetUrl = null;
    try {
      sheetUrl = await createGoogleSheet(
        env, client.clientName, client.monthYear, sheetHeaders, sheetRows
      );
      console.log(`[Pipeline] ✓ Sheet created: ${sheetUrl}`);
    } catch (err) {
      console.error("[Pipeline] Sheet creation failed:", err.message);
    }

    // Output B: PDF
    let pdfResult = null;
    try {
      const html = buildPdfHtml(pdfData);
      pdfResult = await renderPdf(env, html);
      console.log(`[Pipeline] ✓ PDF generated (${pdfResult.type})`);
    } catch (err) {
      console.error("[Pipeline] PDF generation failed:", err.message);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n[Pipeline] ✅ Complete in ${elapsed}s`);
    console.log(`[Pipeline]    Posts: ${checkedPosts.length}`);
    console.log(`[Pipeline]    Quality score: ${report.overallScore}/100`);
    console.log(`[Pipeline]    Flags for review: ${report.humanReviewRequired?.length ?? 0}`);
    console.log(`[Pipeline]    Sheet: ${sheetUrl ?? "failed"}`);

    const result = {
      success: true,
      clientName: client.clientName,
      monthYear: client.monthYear,
      postsGenerated: checkedPosts.length,
      qualityScore: report.overallScore,
      flagsForReview: report.humanReviewRequired ?? [],
      sheetUrl,
      pdfGenerated: !!pdfResult,
      elapsedSeconds: parseFloat(elapsed),
    };

    // TODO: Email results to client.clientEmail and yourself
    // e.g. via Resend, SendGrid, or Cloudflare Email Workers

    return json(result);

  } catch (err) {
    console.error("[Pipeline] ✗ Failed:", err);
    return json({ success: false, error: err.message }, 500);
  }
}

// ── Helpers
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
