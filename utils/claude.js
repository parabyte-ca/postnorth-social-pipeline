// utils/claude.js
// Shared wrapper for all Anthropic API calls

export async function callClaude(env, { system, user, maxTokens = 2000, webSearch = false }) {
  const tools = webSearch
    ? [{ type: "web_search_20250305", name: "web_search" }]
    : undefined;

  const body = {
    model: "claude-sonnet-4-20250514",
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
    ...(tools && { tools }),
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      ...(webSearch && { "anthropic-beta": "web-search-2025-03-05" }),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }

  const data = await res.json();

  // Extract text from all content blocks (handles tool_use + text mixed responses)
  const text = data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return text;
}

// Parse JSON safely from Claude's response (strips markdown fences if present)
export function parseJSON(raw) {
  const clean = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(clean);
}
