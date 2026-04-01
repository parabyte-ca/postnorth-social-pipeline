// agents/checker.js
// Agent 4: Review all 30 posts, flag issues, auto-fix minor ones

import { callClaude, parseJSON } from "../utils/claude.js";

export async function runChecker(env, client, brief, writtenPosts) {
  const system = `You are a senior content strategist and editor reviewing a batch of 
social media posts before client delivery. You are direct and specific. 
Always respond with valid JSON only — no preamble, no markdown fences.`;

  const user = `Review these ${writtenPosts.length} social media posts for ${client.clientName}.

Business context: ${brief.businessSummary}
Intended tone: ${brief.toneGuidance}
Target audience: ${brief.audience}

Check every post for:
1. REPETITIVE PHRASING — same openers, same sign-offs, same structural patterns across posts
2. OFF-BRAND TONE — doesn't match the tone guidance
3. OVERLY SALESY CLUSTERING — too many promotional posts in a row
4. WEAK HOOKS — boring first lines that won't stop the scroll
5. MISSING/WEAK CTA — no clear next step for reader
6. AI-SOUNDING LANGUAGE — phrases like "In today's fast-paced world", "I'm excited to share", "game-changer", "leverage", "synergy", "dive in"
7. FACTUAL RED FLAGS — any specific claims that seem unverifiable or risky

For each issue found, provide a specific fix.
Also return a revised version of any post with AI-sounding language (auto-fix those).

Return this JSON:
{
  "overallScore": 85,
  "summary": "one paragraph summary of overall quality",
  "flags": [
    {
      "postId": 3,
      "severity": "minor|major",
      "issue": "specific description of the problem",
      "suggestedFix": "specific suggested fix"
    }
  ],
  "autoFixed": [
    {
      "postId": 7,
      "originalCaption": "original text",
      "revisedCaption": "improved text with AI language removed"
    }
  ],
  "humanReviewRequired": [12, 18]
}

Posts to review:
${JSON.stringify(writtenPosts, null, 2)}`;

  const raw = await callClaude(env, { system, user, maxTokens: 3000 });
  const report = parseJSON(raw);

  // Apply auto-fixes back into the posts array
  const fixedPosts = [...writtenPosts];
  for (const fix of report.autoFixed ?? []) {
    const idx = fixedPosts.findIndex((p) => p.postId === fix.postId);
    if (idx !== -1) {
      fixedPosts[idx].caption = fix.revisedCaption;
      fixedPosts[idx].autoFixed = true;
    }
  }

  console.log(
    `[Checker] Score: ${report.overallScore}/100 | Flags: ${report.flags?.length ?? 0} | Auto-fixed: ${report.autoFixed?.length ?? 0}`
  );

  return { report, posts: fixedPosts };
}
