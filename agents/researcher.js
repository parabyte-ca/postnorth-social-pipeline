// agents/researcher.js
// Agent 1: Build a rich context brief about the client's business and niche

import { callClaude, parseJSON } from "../utils/claude.js";

export async function runResearcher(env, client) {
  const system = `You are a marketing research API. You ONLY output raw JSON — never prose, 
never markdown, never explanations. Your entire response must be a single valid JSON object 
starting with { and ending with }. No other characters before or after.`;

  const user = `Research this business and return a JSON brief.

Business: ${client.clientName}
Website: ${client.clientUrl}
Industry: ${client.industry}
Target Audience: ${client.targetAudience}
Tone preference: ${client.tone}

Use web search to find trending topics in their industry, then return ONLY this JSON:
{
  "businessSummary": "2-3 sentence plain-English summary of what they do",
  "audience": "who their customers are",
  "toneGuidance": "how posts should sound (formal/casual/inspiring/etc)",
  "trendingTopics": ["topic1", "topic2", "topic3", "topic4", "topic5", "topic6"],
  "performingFormats": ["format1", "format2", "format3", "format4"],
  "competitorAngles": ["angle1", "angle2", "angle3"],
  "keyMessages": ["message1", "message2", "message3"]
}`;

  const raw = await callClaude(env, { system, user, maxTokens: 1500, webSearch: true });
  const brief = parseJSON(raw);

  console.log(`[Researcher] Brief built for ${client.clientName}`);
  return brief;
}
