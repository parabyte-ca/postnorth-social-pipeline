// run-pipeline.mjs
// Standalone Node.js pipeline runner — no Cloudflare needed
// Usage: node run-pipeline.mjs
// Reads secrets from .dev.vars

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load .dev.vars as env
const devVars = fs.readFileSync(path.join(__dirname, ".dev.vars"), "utf8");
const env = {};
for (const line of devVars.split("\n")) {
  const parts = line.split("=");
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join("=").trim();
  }
}

// ── Test client
const client = {
  clientName:      "Maple & Main Bakery",
  clientUrl:       "https://example.com",
  clientEmail:     "owner@maplemain.ca",
  industry:        "Artisan bakery and cafe",
  targetAudience:  "Local families, remote workers, brunch lovers aged 25-45",
  tone:            "Warm, friendly, community-focused. Not corporate.",
  monthYear:       "May 2026",
  platforms:       ["LinkedIn", "Instagram", "Facebook"],
  existingSamples: "Nothing beats a Saturday morning with a fresh croissant and good coffee. Come say hi.",
  googleSheetId:   "",
};


const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const AGENT_DELAY_MS = 65000;
const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 20000;

// ── Claude API wrapper with retry
async function callClaude({ system, user, maxTokens = 2000, webSearch = false }) {
  const tools = webSearch ? [{ type: "web_search_20250305", name: "web_search" }] : undefined;
  const body = {
    model: "claude-sonnet-4-20250514",
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
    ...(tools && { tools }),
  };
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    ...(webSearch && { "anthropic-beta": "web-search-2025-03-05" }),
  };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers, body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      return data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    }
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const waitMs = BASE_BACKOFF_MS * (attempt + 1);
      console.log(`  [Claude] Rate limited — waiting ${waitMs/1000}s (retry ${attempt+1}/${MAX_RETRIES})...`);
      await sleep(waitMs);
      continue;
    }
    throw new Error(`Claude API error ${res.status}: ${await res.text()}`);
  }
}


// ── JSON parser with repair
function parseJSON(raw) {
  let clean = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  if (!clean.startsWith("{") && !clean.startsWith("[")) {
    const obj = clean.match(/\{[\s\S]*\}/);
    const arr = clean.match(/\[[\s\S]*\]/);
    if (obj) clean = obj[0]; else if (arr) clean = arr[0];
    else throw new Error(`No JSON found: ${clean.slice(0,200)}`);
  }
  try { return JSON.parse(clean); } catch {
    // Repair literal newlines inside strings
    let out = "", inStr = false, esc = false;
    for (const ch of clean) {
      if (esc)         { out += ch; esc = false; continue; }
      if (ch === "\\") { out += ch; esc = true;  continue; }
      if (ch === '"')  { out += ch; inStr = !inStr; continue; }
      if (inStr && ch === "\n") { out += "\\n"; continue; }
      if (inStr && ch === "\r") { out += "\\r"; continue; }
      if (inStr && ch === "\t") { out += "\\t"; continue; }
      out += ch;
    }
    return JSON.parse(out);
  }
}

// ── Agent 1: Researcher
async function runResearcher() {
  console.log("\n[1/5] Researching...");
  const raw = await callClaude({
    system: "You are a marketing research API. Output raw JSON only — no prose, no markdown.",
    user: `Research this business and return JSON only.
Business: ${client.clientName}, Industry: ${client.industry}
Audience: ${client.targetAudience}, Tone: ${client.tone}

Return ONLY this JSON:
{"businessSummary":"...","audience":"...","toneGuidance":"...","trendingTopics":["..."],"performingFormats":["..."],"competitorAngles":["..."],"keyMessages":["..."]}`,
    maxTokens: 1500, webSearch: true,
  });
  const brief = parseJSON(raw);
  console.log("  ✓ Brief built");
  return brief;
}


const CONTENT_MIX = {
  LinkedIn:  ["Educational","Educational","Thought Leadership","Industry News","Engagement Question","Behind the Scenes","Social Proof","Promotional","Educational","Engagement Question"],
  Instagram: ["Educational","Inspirational","Behind the Scenes","Product Spotlight","Engagement Question","Seasonal","Promotional","Inspirational","Behind the Scenes","Educational"],
  Facebook:  ["Educational","Community Question","Behind the Scenes","Promotional","Industry News","Engagement Question","Social Proof","Educational","Seasonal","Promotional"],
};

// ── Agent 2: Strategist
async function runStrategist(brief) {
  console.log("[2/5] Building calendar skeleton...");
  const platformPlan = client.platforms.map((p) => ({ platform: p, contentTypes: CONTENT_MIX[p] }));
  const raw = await callClaude({
    system: "You are a social media strategist. JSON only — no prose, no markdown.",
    user: `Create a 30-post content calendar for ${client.monthYear}.
Brief: ${JSON.stringify(brief)}
Platforms: ${JSON.stringify(platformPlan)}
Return exactly 30 objects: [{"postId":1,"platform":"LinkedIn","contentType":"Educational","day":1,"topicHook":"...","anchorHashtag":"#..."}]`,
    maxTokens: 4000,
  });
  const skeleton = parseJSON(raw);
  console.log(`  ✓ ${skeleton.length} posts planned`);
  return skeleton;
}

// ── Agent 3: Writer (batches of 5)
const PLATFORM_GUIDANCE = {
  LinkedIn:  "Professional, 150-300 words, strong hook, 3-5 hashtags",
  Instagram: "Conversational, 100-200 words, emojis ok, 8-12 hashtags",
  Facebook:  "Friendly, 100-250 words, community feel, 2-3 hashtags",
};

async function runWriter(brief, skeleton) {
  console.log("[3/5] Writing captions...");
  const byPlatform = {};
  for (const post of skeleton) {
    if (!byPlatform[post.platform]) byPlatform[post.platform] = [];
    byPlatform[post.platform].push(post);
  }
  const allPosts = [];
  for (const [platform, posts] of Object.entries(byPlatform)) {
    for (let i = 0; i < posts.length; i += 5) {
      const batch = posts.slice(i, i + 5);
      const raw = await callClaude({
        system: `Social media copywriter for ${platform}. JSON only.`,
        user: `Write ${platform} captions. Business: ${client.clientName}. Tone: ${brief.toneGuidance}.
Rules: ${PLATFORM_GUIDANCE[platform]}
Posts: ${JSON.stringify(batch)}
Return array: [{"postId":<id>,"platform":"${platform}","contentType":"<same>","day":<day>,"caption":"...","hashtags":["#..."],"cta":"...","suggestedImagePrompt":"..."}]`,
        maxTokens: 5000,
      });
      const written = parseJSON(raw);
      allPosts.push(...written);
      console.log(`  ✓ ${platform} batch ${Math.floor(i/5)+1}: ${written.length} posts`);
      if (i + 5 < posts.length) await sleep(2000);
    }
  }
  allPosts.sort((a, b) => a.postId - b.postId);
  return allPosts;
}


// ── Agent 4: Checker
async function runChecker(brief, posts) {
  console.log("[4/5] Quality checking...");
  const raw = await callClaude({
    system: "Senior content editor. JSON only.",
    user: `Review these ${posts.length} posts for ${client.clientName}.
Tone: ${brief.toneGuidance}. Check for: repetition, weak hooks, AI language, missing CTAs.
Return: {"overallScore":85,"summary":"...","flags":[{"postId":1,"severity":"minor","issue":"...","suggestedFix":"..."}],"autoFixed":[{"postId":2,"revisedCaption":"..."}],"humanReviewRequired":[]}
Posts: ${JSON.stringify(posts)}`,
    maxTokens: 3000,
  });
  const report = parseJSON(raw);
  // Apply auto-fixes
  const fixed = [...posts];
  for (const fix of report.autoFixed ?? []) {
    const idx = fixed.findIndex((p) => p.postId === fix.postId);
    if (idx !== -1) { fixed[idx].caption = fix.revisedCaption; fixed[idx].autoFixed = true; }
  }
  console.log(`  ✓ Score: ${report.overallScore}/100 | Flags: ${report.flags?.length ?? 0} | Auto-fixed: ${report.autoFixed?.length ?? 0}`);
  return { report, posts: fixed };
}

// ── Google Sheets output
async function createGoogleSheet(headers, rows) {
  // Build JWT
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const claim = btoa(JSON.stringify({
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600, iat: now,
  }));

  const pemKey = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");
  const keyData = pemKey.replace("-----BEGIN PRIVATE KEY-----","").replace("-----END PRIVATE KEY-----","").replace(/\s/g,"");

  const { createSign } = await import("crypto");
  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${claim}`);
  const sig = sign.sign(`-----BEGIN PRIVATE KEY-----\n${keyData}\n-----END PRIVATE KEY-----`, "base64");
  const jwt = `${header}.${claim}.${sig.replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const { access_token, error } = await tokenRes.json();
  if (!access_token) throw new Error(`Token error: ${error}`);

  const title = `${client.clientName} — Social Media Calendar — ${client.monthYear}`;
  const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ properties: { title }, sheets: [{ properties: { title: "Content Calendar" } }] }),
  });
  const sheet = await createRes.json();
  if (!sheet.spreadsheetId) throw new Error(`Create failed: ${JSON.stringify(sheet)}`);

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheet.spreadsheetId}/values/A1?valueInputOption=RAW`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: [headers, ...rows] }),
  });

  return `https://docs.google.com/spreadsheets/d/${sheet.spreadsheetId}`;
}


// ── Main
async function main() {
  const start = Date.now();
  console.log(`\n═══ PostNorth Pipeline ═══`);
  console.log(`Client: ${client.clientName}`);
  console.log(`Month:  ${client.monthYear}\n`);

  const brief    = await runResearcher();
  await sleep(AGENT_DELAY_MS);
  const skeleton = await runStrategist(brief);
  await sleep(AGENT_DELAY_MS);
  const posts    = await runWriter(brief, skeleton);
  await sleep(AGENT_DELAY_MS);
  const { report, posts: checked } = await runChecker(brief, posts);

  // Format for sheets
  console.log("\n[5/5] Formatting and delivering...");
  const headers = ["Date","Platform","Content Type","Caption","Hashtags","CTA","Image Prompt","Notes","Status"];
  const rows = checked
    .sort((a, b) => a.day - b.day || a.platform.localeCompare(b.platform))
    .map((p) => [
      `${client.monthYear} Day ${p.day}`,
      p.platform, p.contentType, p.caption,
      (p.hashtags ?? []).join(" "), p.cta,
      p.suggestedImagePrompt ?? "",
      p.autoFixed ? "✓ Auto-edited" : "", "Draft",
    ]);

  let sheetUrl = null;
  try {
    sheetUrl = await createGoogleSheet(headers, rows);
    console.log(`  ✓ Sheet: ${sheetUrl}`);
  } catch (err) {
    console.error(`  ✗ Sheet failed: ${err.message}`);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n═══ Complete in ${elapsed}s ═══`);
  console.log(`Posts:    ${checked.length}`);
  console.log(`Score:    ${report.overallScore}/100`);
  console.log(`Flags:    ${report.humanReviewRequired?.length ?? 0} for review`);
  console.log(`Sheet:    ${sheetUrl ?? "failed — check error above"}`);

  if (sheetUrl) {
    console.log(`\n✅ Open your Google Sheet:`);
    console.log(`   ${sheetUrl}`);
  }
}

main().catch((err) => {
  console.error("\n✗ Pipeline failed:", err.message);
  process.exit(1);
});
