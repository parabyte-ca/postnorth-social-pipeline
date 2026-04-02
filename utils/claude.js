// utils/claude.js
// Shared wrapper for all Anthropic API calls
// Includes retry with exponential backoff on 429, and robust JSON repair

const MAX_RETRIES = 4;
const BASE_BACKOFF_MS = 15000;

export async function callClaude(env, { system, user, maxTokens = 2000, webSearch = false }) {
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
    const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify(body) });
    if (res.ok) {
      const data = await res.json();
      return data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    }
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const waitMs = BASE_BACKOFF_MS * (attempt + 1);
      console.log(`[Claude] Rate limited — waiting ${waitMs / 1000}s (retry ${attempt + 1}/${MAX_RETRIES})...`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }
  throw new Error("Claude API: max retries exceeded");
}

// Walk string char-by-char, escaping bare newlines/tabs inside JSON strings
function repairJSON(str) {
  let out = "", inStr = false, esc = false;
  for (const ch of str) {
    if (esc)           { out += ch; esc = false; continue; }
    if (ch === "\\")   { out += ch; esc = true;  continue; }
    if (ch === '"')    { out += ch; inStr = !inStr; continue; }
    if (inStr && ch === "\n") { out += "\\n"; continue; }
    if (inStr && ch === "\r") { out += "\\r"; continue; }
    if (inStr && ch === "\t") { out += "\\t"; continue; }
    out += ch;
  }
  return out;
}

// Parse JSON from Claude — strips fences, extracts from prose, repairs bad newlines
export function parseJSON(raw) {
  let clean = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  if (!clean.startsWith("{") && !clean.startsWith("[")) {
    const obj = clean.match(/\{[\s\S]*\}/);
    const arr = clean.match(/\[[\s\S]*\]/);
    if (obj) clean = obj[0];
    else if (arr) clean = arr[0];
    else throw new Error(`No JSON found: ${clean.slice(0, 200)}`);
  }
  try { return JSON.parse(clean); } catch { return JSON.parse(repairJSON(clean)); }
}
