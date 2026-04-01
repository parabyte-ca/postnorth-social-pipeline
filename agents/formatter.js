// agents/formatter.js
// Agent 5: Structure the final output payload for delivery handlers

export function runFormatter(client, brief, posts, qualityReport, monthYear) {
  // Sort posts by day, then platform
  const sorted = [...posts].sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    return a.platform.localeCompare(b.platform);
  });

  // Build rows for Google Sheets
  const sheetRows = sorted.map((post) => [
    `${monthYear} Day ${post.day}`,
    post.platform,
    post.contentType,
    post.caption,
    (post.hashtags ?? []).join(" "),
    post.cta,
    post.suggestedImagePrompt ?? "",
    post.autoFixed ? "✓ Auto-edited" : "",
    "Draft", // Status column — client updates this
  ]);

  const sheetHeaders = [
    "Date",
    "Platform",
    "Content Type",
    "Caption",
    "Hashtags",
    "CTA",
    "Image Prompt",
    "Notes",
    "Status",
  ];

  // Build structured data for PDF
  const pdfData = {
    clientName: client.clientName,
    monthYear,
    generatedAt: new Date().toISOString(),
    overallScore: qualityReport.overallScore,
    summary: qualityReport.summary,
    strategySummary: {
      businessSummary: brief.businessSummary,
      toneGuidance: brief.toneGuidance,
      keyMessages: brief.keyMessages,
      trendingTopics: brief.trendingTopics,
    },
    platformBreakdown: {
      LinkedIn:  posts.filter((p) => p.platform === "LinkedIn").length,
      Instagram: posts.filter((p) => p.platform === "Instagram").length,
      Facebook:  posts.filter((p) => p.platform === "Facebook").length,
    },
    flagsForReview: qualityReport.flags?.filter((f) => f.severity === "major") ?? [],
    posts: sorted,
  };

  console.log(`[Formatter] Formatted ${sorted.length} posts for delivery`);

  return { sheetHeaders, sheetRows, pdfData };
}
