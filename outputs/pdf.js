// outputs/pdf.js
// Generate a branded HTML content calendar PDF
// Uses Cloudflare Browser Rendering API (workers-og or @cloudflare/puppeteer)
// Falls back to returning HTML if browser rendering isn't available

export function buildPdfHtml(pdfData) {
  const { clientName, monthYear, generatedAt, overallScore, summary,
          strategySummary, platformBreakdown, flagsForReview, posts } = pdfData;

  const platformColors = {
    LinkedIn:  "#0077B5",
    Instagram: "#E1306C",
    Facebook:  "#1877F2",
  };

  const postsHtml = posts.map((post) => `
    <div class="post-card">
      <div class="post-header">
        <span class="platform-badge" style="background:${platformColors[post.platform] ?? '#888'}">${post.platform}</span>
        <span class="post-meta">Day ${post.day} · ${post.contentType}</span>
        ${post.autoFixed ? '<span class="auto-fixed">✓ Edited</span>' : ""}
      </div>
      <div class="caption">${post.caption.replace(/\n/g, "<br>")}</div>
      <div class="post-footer">
        <span class="hashtags">${(post.hashtags ?? []).join(" ")}</span>
        <span class="cta">CTA: ${post.cta}</span>
      </div>
      ${post.suggestedImagePrompt ? `<div class="image-prompt">🖼 ${post.suggestedImagePrompt}</div>` : ""}
    </div>
  `).join("");

  const flagsHtml = flagsForReview.length > 0
    ? `<div class="flags-section">
        <h3>⚠️ Items Requiring Your Review</h3>
        ${flagsForReview.map((f) => `
          <div class="flag">
            <strong>Post #${f.postId}:</strong> ${f.issue}<br>
            <em>Suggestion: ${f.suggestedFix}</em>
          </div>
        `).join("")}
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${clientName} — Content Calendar — ${monthYear}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap');

  :root {
    --black:  #111010;
    --violet: #8B62C8;
    --gold:   #A8883A;
    --white:  #FAFAF8;
    --grey:   #F2F0EC;
    --text:   #2A2A2A;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'DM Sans', sans-serif;
    background: var(--white);
    color: var(--text);
    font-size: 13px;
    line-height: 1.6;
  }

  /* ── Cover Page ── */
  .cover {
    background: var(--black);
    color: var(--white);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 60px;
    page-break-after: always;
  }

  .cover-logo {
    font-family: 'DM Serif Display', serif;
    font-size: 14px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--gold);
  }

  .cover-title {
    font-family: 'DM Serif Display', serif;
    font-size: 52px;
    line-height: 1.1;
    font-weight: 400;
    margin-bottom: 16px;
  }

  .cover-subtitle {
    font-size: 18px;
    color: rgba(255,255,255,0.6);
    font-weight: 300;
  }

  .cover-accent {
    display: inline-block;
    width: 60px;
    height: 3px;
    background: var(--violet);
    margin-bottom: 24px;
  }

  .cover-meta {
    font-size: 12px;
    color: rgba(255,255,255,0.4);
  }

  .cover-score {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    background: rgba(139,98,200,0.2);
    border: 1px solid var(--violet);
    border-radius: 8px;
    padding: 12px 20px;
    margin-top: 24px;
  }

  .score-number {
    font-family: 'DM Serif Display', serif;
    font-size: 40px;
    color: var(--violet);
  }

  /* ── Strategy Page ── */
  .strategy-page {
    padding: 60px;
    page-break-after: always;
  }

  h2 {
    font-family: 'DM Serif Display', serif;
    font-size: 28px;
    font-weight: 400;
    color: var(--black);
    margin-bottom: 8px;
  }

  .section-rule {
    width: 40px;
    height: 2px;
    background: var(--violet);
    margin-bottom: 24px;
  }

  .strategy-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-top: 24px;
  }

  .strategy-card {
    background: var(--grey);
    border-radius: 8px;
    padding: 20px;
  }

  .strategy-card h4 {
    font-size: 10px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--gold);
    margin-bottom: 10px;
    font-weight: 600;
  }

  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .tag {
    background: var(--black);
    color: var(--white);
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 11px;
  }

  .platform-stats {
    display: flex;
    gap: 16px;
    margin-top: 24px;
  }

  .platform-stat {
    flex: 1;
    text-align: center;
    padding: 16px;
    border-radius: 8px;
    color: white;
  }

  .platform-stat .count {
    font-family: 'DM Serif Display', serif;
    font-size: 32px;
    display: block;
  }

  .platform-stat .label {
    font-size: 11px;
    opacity: 0.85;
  }

  /* ── Posts ── */
  .posts-section { padding: 60px; }

  .posts-section h2 { margin-bottom: 8px; }

  .posts-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-top: 24px;
  }

  .post-card {
    border: 1px solid #E5E3DF;
    border-radius: 10px;
    padding: 16px;
    break-inside: avoid;
  }

  .post-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }

  .platform-badge {
    color: white;
    padding: 2px 10px;
    border-radius: 20px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.05em;
  }

  .post-meta {
    font-size: 11px;
    color: #888;
  }

  .auto-fixed {
    font-size: 10px;
    color: var(--gold);
    margin-left: auto;
  }

  .caption {
    font-size: 12px;
    line-height: 1.7;
    margin-bottom: 10px;
    color: var(--text);
  }

  .post-footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
    font-size: 11px;
    flex-wrap: wrap;
  }

  .hashtags { color: #0077B5; flex: 1; word-break: break-word; }

  .cta {
    font-size: 10px;
    background: var(--grey);
    padding: 3px 8px;
    border-radius: 4px;
    white-space: nowrap;
  }

  .image-prompt {
    margin-top: 8px;
    font-size: 10px;
    color: #999;
    font-style: italic;
    border-top: 1px solid #F0EDE8;
    padding-top: 8px;
  }

  /* ── Flags ── */
  .flags-section {
    margin: 0 60px 40px;
    background: #FFF8F0;
    border: 1px solid var(--gold);
    border-radius: 10px;
    padding: 24px;
    page-break-inside: avoid;
  }

  .flags-section h3 {
    font-family: 'DM Serif Display', serif;
    font-weight: 400;
    font-size: 18px;
    margin-bottom: 16px;
    color: var(--gold);
  }

  .flag {
    padding: 10px 0;
    border-bottom: 1px solid #F0E8D8;
    font-size: 12px;
  }

  .flag:last-child { border-bottom: none; }

  /* ── Footer ── */
  .doc-footer {
    text-align: center;
    padding: 40px 60px;
    font-size: 11px;
    color: #BBB;
    border-top: 1px solid var(--grey);
  }

  .doc-footer strong { color: var(--gold); }

  @media print {
    .cover { min-height: 100vh; }
  }
</style>
</head>
<body>

<!-- Cover Page -->
<div class="cover">
  <div class="cover-logo">POSTNORTH</div>
  <div>
    <div class="cover-accent"></div>
    <div class="cover-title">${clientName}<br><em style="color:rgba(255,255,255,0.5)">Social Content</em></div>
    <div class="cover-subtitle">${monthYear}</div>
    <div class="cover-score">
      <span class="score-number">${overallScore}</span>
      <div>
        <div style="font-weight:500">Quality Score</div>
        <div style="font-size:11px;opacity:0.6">out of 100</div>
      </div>
    </div>
  </div>
  <div class="cover-meta">
    Generated ${new Date(generatedAt).toLocaleDateString("en-CA", { dateStyle: "long" })} · 
    Confidential · POSTNORTH
  </div>
</div>

<!-- Strategy Page -->
<div class="strategy-page">
  <h2>Strategy Overview</h2>
  <div class="section-rule"></div>
  <p style="max-width:600px;color:#555">${summary}</p>

  <div class="platform-stats">
    <div class="platform-stat" style="background:#0077B5">
      <span class="count">${platformBreakdown.LinkedIn}</span>
      <span class="label">LinkedIn Posts</span>
    </div>
    <div class="platform-stat" style="background:#E1306C">
      <span class="count">${platformBreakdown.Instagram}</span>
      <span class="label">Instagram Posts</span>
    </div>
    <div class="platform-stat" style="background:#1877F2">
      <span class="count">${platformBreakdown.Facebook}</span>
      <span class="label">Facebook Posts</span>
    </div>
  </div>

  <div class="strategy-grid">
    <div class="strategy-card">
      <h4>About ${clientName}</h4>
      <p>${strategySummary.businessSummary}</p>
    </div>
    <div class="strategy-card">
      <h4>Voice & Tone</h4>
      <p>${strategySummary.toneGuidance}</p>
    </div>
    <div class="strategy-card">
      <h4>Key Messages</h4>
      <div class="tag-list">
        ${strategySummary.keyMessages.map((m) => `<span class="tag">${m}</span>`).join("")}
      </div>
    </div>
    <div class="strategy-card">
      <h4>Trending Topics Used</h4>
      <div class="tag-list">
        ${strategySummary.trendingTopics.map((t) => `<span class="tag">${t}</span>`).join("")}
      </div>
    </div>
  </div>
</div>

<!-- Quality Flags -->
${flagsHtml}

<!-- Posts -->
<div class="posts-section">
  <h2>Content Calendar</h2>
  <div class="section-rule"></div>
  <div class="posts-grid">
    ${postsHtml}
  </div>
</div>

<!-- Footer -->
<div class="doc-footer">
  <strong>POSTNORTH</strong> · postnorth.ca · 
  Prepared exclusively for ${clientName} · ${monthYear}
</div>

</body>
</html>`;
}

// Render HTML to PDF via Cloudflare Browser Rendering
// Requires @cloudflare/puppeteer binding in wrangler.toml
export async function renderPdf(env, html) {
  if (!env.BROWSER) {
    // Fallback: return HTML as a string if browser rendering not configured
    console.warn("[PDF] Browser binding not found — returning HTML");
    return { type: "html", content: html };
  }

  const browser = await env.BROWSER.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });

  const pdf = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
  });

  await browser.close();
  return { type: "pdf", content: pdf };
}
