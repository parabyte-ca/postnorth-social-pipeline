// agents/researcher.js
// Agent 1: Build a rich context brief about the client's business and niche

import { callClaude, parseJSON } from "../utils/claude.js";

export async function runResearcher(env, client) {
  const system = `You are a sharp marketing researcher. Your job is to build a concise 
business context brief that will be used to generate a month of social media content.
Always respond with valid JSON only — no preamble, no markdown fences.`;

  const user = `Research this business and return a JSON brief.

Business: ${client.clientName}
Website: ${client.clientUrl}
Industry: ${client.industry}
Target Audience: ${client.targetAudience}
Tone preference: ${client.tone}

Use web search to:
1. Find 6-8 trending topics/hashtags in their industry this month
2. Identify what content formats (tips, stories, stats, questions, etc.) perform well in this niche
3. Note 2-3 content angles their competitors commonly use
4. Summarise what their website says they do (if URL provided)

Return this exact JSON structure:
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
