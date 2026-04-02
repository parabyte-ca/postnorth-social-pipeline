// empty-trash.mjs — empty service account Drive trash to free quota
import { createSign } from "crypto";
import fs from "fs";

const devVars = fs.readFileSync("C:\\Users\\alan\\social-pipeline\\.dev.vars", "utf8");
const env = {};
for (const line of devVars.split("\n")) {
  const idx = line.indexOf("=");
  if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
}

async function getToken() {
  const h = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const c = btoa(JSON.stringify({
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600, iat: now,
  }));
  const pem = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");
  const sign = createSign("RSA-SHA256");
  sign.update(`${h}.${c}`);
  const sig = sign.sign(pem, "base64url");
  const jwt = `${h}.${c}.${sig}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  return res.json();
}

async function run() {
  const tok = await getToken();
  if (!tok.access_token) { console.error("Token failed:", tok); return; }

  // Check quota first
  console.log("Checking Drive quota...");
  const aboutRes = await fetch("https://www.googleapis.com/drive/v3/about?fields=storageQuota", {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  });
  const about = await aboutRes.json();
  if (about.storageQuota) {
    const used = (parseInt(about.storageQuota.usage) / 1024 / 1024).toFixed(1);
    const limit = about.storageQuota.limit
      ? (parseInt(about.storageQuota.limit) / 1024 / 1024 / 1024).toFixed(1) + "GB"
      : "unlimited";
    console.log(`  Used: ${used}MB of ${limit}`);
  }

  // Empty trash
  console.log("\nEmptying trash...");
  const trashRes = await fetch("https://www.googleapis.com/drive/v3/files/trash", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${tok.access_token}` },
  });
  console.log("Trash empty status:", trashRes.status, trashRes.status === 204 ? "✓ Done" : "");

  // List all files to see what's there
  console.log("\nChecking remaining files...");
  const listRes = await fetch(
    "https://www.googleapis.com/drive/v3/files?pageSize=20&fields=files(id,name,size,mimeType)",
    { headers: { Authorization: `Bearer ${tok.access_token}` } }
  );
  const list = await listRes.json();
  if (list.files?.length) {
    console.log(`Found ${list.files.length} files:`);
    list.files.forEach(f => console.log(`  ${f.name} (${f.mimeType}) ${f.size ? (parseInt(f.size)/1024).toFixed(0)+'KB' : ''}`));
  } else {
    console.log("  Drive is empty");
  }

  // Try creating a sheet now
  console.log("\nTesting sheet creation...");
  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "PostNorth Test",
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: ["1zB_TjfALI_-DhvZKmPH5ZpFBQFUqwBKE"],
    }),
  });
  const created = await createRes.json();
  if (created.id) {
    console.log("✅ Sheet created successfully!");
    console.log("   URL: https://docs.google.com/spreadsheets/d/" + created.id);
    // Clean up test sheet
    await fetch(`https://www.googleapis.com/drive/v3/files/${created.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    console.log("   (Test sheet deleted)");
  } else {
    console.log("✗ Still failing:", JSON.stringify(created.error));
  }
}

run().catch(console.error);
