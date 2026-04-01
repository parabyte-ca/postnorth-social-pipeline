// agents/strategist.js
// Agent 2: Build a balanced 30-post content calendar skeleton

import { callClaude, parseJSON } from "../utils/claude.js";

// Content type distribution for a healthy, non-spammy feed
const CONTENT_MIX = {
  LinkedIn:  ["Educational","Educational","Thought Leadership","Industry News","Engagement Question","Behind the Scenes","Social Proof","Promotional","Educational","Engagement Question"],
  Instagram: ["Educational","Inspirational","Behind the Scenes","Product/Service Spotlight","User Generated Content Prompt","Engagement Question","Seasonal/Trend","Promotional","Inspirational","Behind the Scenes"],
  Facebook:  ["Educational","Community Question","Behind the Scenes","Promotional","Industry News","Engagement Question","Social Proof","Educational","Seasonal/Trend","Promotional"],
};

export async function runStrategist(env, client, brief) {
  const system = `You are a social media strategist. You create structured content calendars 
that balance value, engagement, and promotion. Always respond with valid JSON only — 
no preamble, no markdown fences.`;

  // Build platform distribution: 10 posts each across 3 platforms = 30 total
  const platformPlan = client.platforms.map((platform) => ({
    platform,
    contentTypes: CONTENT_MIX[platform] || CONTENT_MIX["LinkedIn"],
  }));

  const user = `Create a 30-post content calendar skeleton for ${client.monthYear}.

Business Context:
${JSON.stringify(brief, null, 2)}

Platform distribution:
${JSON.stringify(platformPlan, null, 2)}

For each post, assign:
- A specific topic hook (not generic — make it concrete and relevant to this business)
- The best day of the month to post it (1-28, spread evenly, avoid clustering same platform)
- One trending topic or hashtag from the brief to anchor it

Return this exact JSON structure — an array of exactly 30 objects:
[
  {
    "postId": 1,
    "platform": "LinkedIn",
    "contentType": "Educational",
    "day": 1,
    "topicHook": "specific compelling hook for this post",
    "anchorHashtag": "#relevant"
  }
]`;

  const raw = await callClaude(env, { system, user, maxTokens: 3000 });
  const calendar = parseJSON(raw);

  console.log(`[Strategist] Calendar skeleton built: ${calendar.length} posts`);
  return calendar;
}
