// agents/writer.js
// Agent 3: Write full captions for every post in the calendar skeleton
// Batches posts by platform to keep prompts focused and token-efficient

import { callClaude, parseJSON } from "../utils/claude.js";

const PLATFORM_GUIDANCE = {
  LinkedIn: `
- Professional but human tone
- 150-300 words optimal
- Start with a strong hook line (no "I'm excited to share...")
- Use line breaks generously for readability
- End with a thoughtful question or clear CTA
- 3-5 relevant hashtags at the end`,

  Instagram: `
- Conversational, warm, visual-first tone
- 100-200 words optimal  
- Start with an attention-grabbing first line (it's above the fold)
- Emojis are welcome but not excessive
- CTA: comment, save, or share
- 8-12 hashtags at the end (mix popular + niche)`,

  Facebook: `
- Friendly, community-oriented tone
- 100-250 words optimal
- Conversational, like talking to a neighbour
- Encourage comments and sharing
- 2-3 hashtags max (Facebook doesn't reward hashtag stuffing)`,
};

export async function runWriter(env, client, brief, calendarSkeleton) {
  // Group posts by platform for focused batching
  const byPlatform = {};
  for (const post of calendarSkeleton) {
    if (!byPlatform[post.platform]) byPlatform[post.platform] = [];
    byPlatform[post.platform].push(post);
  }

  const allWrittenPosts = [];

  for (const [platform, posts] of Object.entries(byPlatform)) {
    const system = `You are an expert social media copywriter specialising in ${platform}.
You write in the authentic voice of the business, never sounding like AI-generated content.
Always respond with valid JSON only — no preamble, no markdown fences.`;

    const user = `Write full ${platform} captions for these ${posts.length} posts.

Business: ${client.clientName}
Voice/Tone: ${brief.toneGuidance}
Business Summary: ${brief.businessSummary}
Target Audience: ${brief.audience}
Key Messages: ${brief.keyMessages.join(", ")}
${client.existingSamples ? `Sample of their existing content for voice reference:\n"${client.existingSamples}"` : ""}

Platform guidance for ${platform}:
${PLATFORM_GUIDANCE[platform]}

Posts to write:
${JSON.stringify(posts, null, 2)}

Return an array of objects with this structure:
[
  {
    "postId": <same postId from input>,
    "platform": "${platform}",
    "contentType": "<same as input>",
    "day": <same day>,
    "caption": "full written caption here",
    "hashtags": ["#tag1", "#tag2"],
    "cta": "the specific call to action used",
    "suggestedImagePrompt": "brief description of ideal image/graphic for this post"
  }
]`;

    const raw = await callClaude(env, { system, user, maxTokens: 4000 });
    const written = parseJSON(raw);
    allWrittenPosts.push(...written);

    console.log(`[Writer] Wrote ${written.length} ${platform} posts`);
  }

  // Re-sort by postId to restore original order
  allWrittenPosts.sort((a, b) => a.postId - b.postId);

  return allWrittenPosts;
}
