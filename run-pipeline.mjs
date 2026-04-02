// run-pipeline.mjs â€” standalone Node.js pipeline runner
import fs from "fs";
import { saveCSV } from "./csv-output.mjs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .dev.vars
const devVars = fs.readFileSync(path.join(__dirname, ".dev.vars"), "utf8");
const env = {};
for (const line of devVars.split("\n")) {
  const idx = line.indexOf("=");
  if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
}

const testClient = {
  clientName:      "Maple & Main Bakery",
  clientUrl:       "https://example.com",
  clientEmail:     "owner@maplemain.ca",
  industry:        "Artisan bakery and cafe",
  targetAudience:  "Local families, remote workers, brunch lovers aged 25-45",
  tone:            "Warm, friendly, community-focused. Not corporate.",
  monthYear:       "May 2026",
  platforms:       ["LinkedIn", "Instagram", "Facebook"],
  existingSamples: "Nothing beats a Saturday morning with a fresh croissant and coffee. Come say hi.",
  googleSheetId:   "",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_RETRIES    = 5;
const BASE_BACKOFF   = 20000;
const AGENT_DELAY    = 65000;
const BATCH_SIZE     = 5;

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
      const wait = BASE_BACKOFF * (attempt + 1);
      console.log(`  [Claude] Rate limited â€” waiting ${wait/1000}s (retry ${attempt+1}/${MAX_RETRIES})...`);
      await sleep(wait);
      continue;
    }
    throw new Error(`Claude API error ${res.status}: ${await res.text()}`);
  }
  throw new Error("Max retries exceeded");
}

function repairJSON(str) {
  let out = "", inStr = false, esc = false;
  for (const ch of str) {
    if (esc)         { out += ch; esc = false; continue; }
    if (ch === "\\") { out += ch; esc = true;  continue; }
    if (ch === '"')  { out += ch; inStr = !inStr; continue; }
    if (inStr && ch === "\n") { out += "\\n"; continue; }
    if (inStr && ch === "\r") { out += "\\r"; continue; }
    if (inStr && ch === "\t") { out += "\\t"; continue; }
    out += ch;
  }
  return out;
}

function parseJSON(raw) {
  // Strip markdown fences
  let clean = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  // Find outermost { } or [ ]
  const firstBrace   = clean.indexOf("{");
  const firstBracket = clean.indexOf("[");
  let start = -1, isObj = false;
  if (firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket)) {
    start = firstBrace; isObj = true;
  } else if (firstBracket >= 0) {
    start = firstBracket; isObj = false;
  }

  if (start >= 0) {
    const openCh = isObj ? "{" : "[";
    const closeCh = isObj ? "}" : "]";
    let depth = 0, inStr2 = false, esc2 = false, end = -1;
    for (let i = start; i < clean.length; i++) {
      const c = clean[i];
      if (esc2) { esc2 = false; continue; }
      if (c === "\\") { esc2 = true; continue; }
      if (c === '"') { inStr2 = !inStr2; continue; }
      if (!inStr2) {
        if (c === openCh) depth++;
        else if (c === closeCh) { depth--; if (depth === 0) { end = i; break; } }
      }
    }
    if (end >= 0) clean = clean.slice(start, end + 1);
  }

  try { return JSON.parse(clean); }
  catch { return JSON.parse(repairJSON(clean)); }
}

// â”€â”€ Agents
async function runResearcher() {
  console.log("\n[1/5] Researching...");
  const raw = await callClaude({
    system: "You are a marketing research API. Your ENTIRE response must be a single valid JSON object. No prose. No markdown. Start with { and end with }.",
    user: `Research this business. Return ONLY a JSON object with these exact keys:
{"businessSummary":"...","audience":"...","toneGuidance":"...","trendingTopics":["...","...","..."],"performingFormats":["...","..."],"competitorAngles":["...","..."],"keyMessages":["...","..."]}

Business: ${testClient.clientName}
Industry: ${testClient.industry}
Audience: ${testClient.targetAudience}
Tone: ${testClient.tone}`,
    maxTokens: 1500, webSearch: true,
  });
  const brief = parseJSON(raw);
  console.log("  âœ“ Brief built:", brief.businessSummary?.slice(0, 60) + "...");
  return brief;
}

const CONTENT_MIX = {
  LinkedIn:  ["Educational","Educational","Thought Leadership","Industry News","Engagement Question","Behind the Scenes","Social Proof","Promotional","Educational","Engagement Question"],
  Instagram: ["Educational","Inspirational","Behind the Scenes","Product Spotlight","Engagement Question","Seasonal","Promotional","Inspirational","Behind the Scenes","Educational"],
  Facebook:  ["Educational","Community Question","Behind the Scenes","Promotional","Industry News","Engagement Question","Social Proof","Educational","Seasonal","Promotional"],
};

async function runStrategist(brief) {
  console.log("[2/5] Building calendar skeleton...");
  const platformPlan = testClient.platforms.map((p) => ({ platform: p, contentTypes: CONTENT_MIX[p] }));
  const raw = await callClaude({
    system: "You are a social media strategist. Return ONLY a valid JSON array. No prose. No markdown.",
    user: `Create a 30-post calendar for ${testClient.monthYear}.
Business: ${testClient.clientName}. Summary: ${brief.businessSummary}
Platforms (10 posts each): ${JSON.stringify(platformPlan)}
Return ONLY a JSON array of exactly 30 objects:
[{"postId":1,"platform":"LinkedIn","contentType":"Educational","day":1,"topicHook":"specific hook","anchorHashtag":"#tag"}]`,
    maxTokens: 4000,
  });
  const skeleton = parseJSON(raw);
  console.log(`  âœ“ ${skeleton.length} posts planned`);
  return skeleton;
}

const PLATFORM_GUIDANCE = {
  LinkedIn:  "Professional, 150-300 words, strong hook first, 3-5 hashtags",
  Instagram: "Conversational, 100-200 words, emojis ok, 8-12 hashtags",
  Facebook:  "Friendly community feel, 100-250 words, 2-3 hashtags max",
};

async function runWriter(brief, skeleton) {
  console.log("[3/5] Writing captions...");
  const byPlatform = {};
  for (const p of skeleton) {
    if (!byPlatform[p.platform]) byPlatform[p.platform] = [];
    byPlatform[p.platform].push(p);
  }
  const all = [];
  for (const [platform, posts] of Object.entries(byPlatform)) {
    for (let i = 0; i < posts.length; i += BATCH_SIZE) {
      const batch = posts.slice(i, i + BATCH_SIZE);
      const raw = await callClaude({
        system: `Social media copywriter for ${platform}. Return ONLY a valid JSON array. No prose.`,
        user: `Write captions for these ${batch.length} ${platform} posts.
Business: ${testClient.clientName}. Tone: ${brief.toneGuidance}.
Rules: ${PLATFORM_GUIDANCE[platform]}
Posts: ${JSON.stringify(batch)}
Return ONLY a JSON array:
[{"postId":<id>,"platform":"${platform}","contentType":"<same>","day":<day>,"caption":"full text","hashtags":["#tag"],"cta":"action","suggestedImagePrompt":"image description"}]`,
        maxTokens: 5000,
      });
      const written = parseJSON(raw);
      all.push(...written);
      console.log(`  âœ“ ${platform} batch ${Math.floor(i/BATCH_SIZE)+1}: ${written.length} posts`);
      if (i + BATCH_SIZE < posts.length) await sleep(2000);
    }
  }
  all.sort((a, b) => a.postId - b.postId);
  return all;
}

async function runChecker(brief, posts) {
  console.log("[4/5] Quality checking...");
  const raw = await callClaude({
    system: "Senior content editor. Return ONLY a valid JSON object. No prose.",
    user: `Review ${posts.length} posts for ${testClient.clientName}. Tone: ${brief.toneGuidance}.
Check: repetition, weak hooks, AI-sounding language, missing CTAs.
Return ONLY this JSON object:
{"overallScore":85,"summary":"one sentence","flags":[{"postId":1,"severity":"minor","issue":"...","suggestedFix":"..."}],"autoFixed":[{"postId":2,"revisedCaption":"..."}],"humanReviewRequired":[]}
Posts: ${JSON.stringify(posts)}`,
    maxTokens: 3000,
  });
  const report = parseJSON(raw);
  const fixed = [...posts];
  for (const f of report.autoFixed ?? []) {
    const idx = fixed.findIndex((p) => p.postId === f.postId);
    if (idx >= 0) { fixed[idx].caption = f.revisedCaption; fixed[idx].autoFixed = true; }
  }
  console.log(`  âœ“ Score: ${report.overallScore}/100 | Flags: ${report.flags?.length ?? 0}`);
  return { report, posts: fixed };
}

async function createSheet(headers, rows) {
  const h64 = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now  = Math.floor(Date.now() / 1000);
  const c64  = btoa(JSON.stringify({
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600, iat: now,
  }));
  const pemKey = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");
  const { createSign } = await import("crypto");
  const sign = createSign("RSA-SHA256");
  sign.update(`${h64}.${c64}`);
  const sig = sign.sign(pemKey, "base64url");
  const jwt = `${h64}.${c64}.${sig}`;

  const tokRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const { access_token, error } = await tokRes.json();
  if (!access_token) throw new Error(`Token error: ${error}`);

  // Find PostNorth Calendars folder
  const listRes = await fetch(
    "https://www.googleapis.com/drive/v3/files?q=name='PostNorth Calendars' and mimeType='application/vnd.google-apps.folder'",
    { headers: { Authorization: `Bearer ${access_token}` } }
  );
  const listData = await listRes.json();
  const folderId = listData.files?.[0]?.id;
  console.log(`  [Sheets] Folder: ${folderId ?? "not found â€” will use root"}`);

  // Create spreadsheet via Drive API (uses folder owner's quota, not service account's)
  const title = `${testClient.clientName} â€” Social Media Calendar â€” ${testClient.monthYear}`;
  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: title,
      mimeType: "application/vnd.google-apps.spreadsheet",
      ...(folderId && { parents: [folderId] }),
    }),
  });
  const created = await createRes.json();
  if (!created.id) throw new Error(`Drive create failed: ${JSON.stringify(created)}`);
  console.log(`  [Sheets] Created: ${created.id}`);

  // Write data via Sheets API
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${created.id}/values/A1?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [headers, ...rows] }),
    }
  );

  return `https://docs.google.com/spreadsheets/d/${created.id}`;
}

async function main() {
  const start = Date.now();
  console.log(`\nâ•â•â• PostNorth Pipeline â•â•â•`);
  console.log(`Client: ${testClient.clientName} | Month: ${testClient.monthYear}\n`);

  const brief              = await runResearcher();
  await sleep(AGENT_DELAY);
  const skeleton           = await runStrategist(brief);
  await sleep(AGENT_DELAY);
  const posts              = await runWriter(brief, skeleton);
  await sleep(AGENT_DELAY);
  const { report, posts: checked } = await runChecker(brief, posts);

  console.log("\n[5/5] Formatting and delivering...");
  const headers = ["Date","Platform","Content Type","Caption","Hashtags","CTA","Image Prompt","Notes","Status"];
  const rows = checked
    .sort((a, b) => a.day - b.day || a.platform.localeCompare(b.platform))
    .map((p) => [
      `${testClient.monthYear} Day ${p.day}`, p.platform, p.contentType,
      p.caption, (p.hashtags ?? []).join(" "), p.cta,
      p.suggestedImagePrompt ?? "", p.autoFixed ? "âœ“ Auto-edited" : "", "Draft",
    ]);

  let sheetUrl = null;
  try {
    sheetUrl = await createSheet(headers, rows);
    console.log(`  âœ“ Sheet: ${sheetUrl}`);
  } catch (err) {
    console.error(`  âœ— Sheet failed: ${err.message}`);
  }

  // Always save CSV as guaranteed local deliverable
  const csvPath = saveCSV(headers, rows, testClient.clientName, testClient.monthYear);
  console.log(`  [CSV] Saved: ${csvPath}`);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•`);
  console.log(`âœ… Complete in ${elapsed}s`);
  console.log(`   Posts:  ${checked.length}`);
  console.log(`   Score:  ${report.overallScore}/100`);
  console.log(`   Flags:  ${report.humanReviewRequired?.length ?? 0} for review`);
  if (sheetUrl) {
    console.log(`\n   ðŸ“Š Open your Google Sheet:`);
    console.log(`   ${sheetUrl}`);
  }
}

main().catch((err) => { console.error("\nâœ— Pipeline failed:", err.message); process.exit(1); });
