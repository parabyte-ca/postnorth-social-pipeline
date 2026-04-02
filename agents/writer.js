// agents/writer.js
// Writes captions in batches of 5 per API call to avoid token truncation

import { callClaude, parseJSON } from "../utils/claude.js";

const BATCH_SIZE = 5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PLATFORM_GUIDANCE = {
  LinkedIn: `- Professional but human tone
- 150-300 words optimal
- Strong hook first line (no "I'm excited to share...")
- Line breaks for readability
- End with question or clear CTA
- 3-5 hashtags at the end`,
  Instagram: `- Conversational, warm, visual-first tone
- 100-200 words optimal
- Attention-grabbing first line above the fold
- Emojis welcome but not excessive
- CTA: comment, save, or share
- 8-12 hashtags (mix popular + niche)`,
  Facebook: `- Friendly, community-oriented tone
- 100-250 words optimal
- Conversational, like talking to a neighbour
- Encourage comments and sharing
- 2-3 hashtags max`,
};

export async function runWriter(env, client, brief, calendarSkeleton) {
  const byPlatform = {};
  for (const post of calendarSkeleton) {
    if (!byPlatform[post.platform]) byPlatform[post.platform] = [];
    byPlatform[post.platform].push(post);
  }

  const allWrittenPosts = [];

  for (const [platform, posts] of Object.entries(byPlatform)) {
    // Split into batches of BATCH_SIZE to stay well under output token limit
    for (let i = 0; i < posts.length; i += BATCH_SIZE) {
      const batch = posts.slice(i, i + BATCH_SIZE);

      const system = `You are an expert social media copywriter for ${platform}.
Write in the authentic voice of the business. JSON only — no prose, no markdown fences.`;

      const user = `Write ${platform} captions for these ${batch.length} posts.
Business: ${client.clientName}
Tone: ${brief.toneGuidance}
Summary: ${brief.businessSummary}
Audience: ${brief.audience}
Key messages: ${brief.keyMessages.join(", ")}
${client.existingSamples ? `Voice sample: "${client.existingSamples}"` : ""}

Platform rules:
${PLATFORM_GUIDANCE[platform]}

Posts:
${JSON.stringify(batch, null, 2)}

Return a JSON array with exactly ${batch.length} objects:
[{"postId":<id>,"platform":"${platform}","contentType":"<same>","day":<day>,"caption":"full caption","hashtags":["#tag"],"cta":"call to action","suggestedImagePrompt":"image description"}]`;

      const raw = await callClaude(env, { system, user, maxTokens: 5000 });
      const written = parseJSON(raw);
      allWrittenPosts.push(...written);
      console.log(`[Writer] Wrote ${written.length} ${platform} posts (batch ${Math.floor(i/BATCH_SIZE)+1})`);

      // Small pause between batches to ease rate limit pressure
      if (i + BATCH_SIZE < posts.length) await sleep(2000);
    }
  }

  allWrittenPosts.sort((a, b) => a.postId - b.postId);
  return allWrittenPosts;
}
