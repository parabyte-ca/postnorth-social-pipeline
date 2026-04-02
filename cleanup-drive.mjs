// cleanup-drive.mjs — delete all files from service account Drive to free quota
import { createSign } from "crypto";
import fs from "fs";

const devVars = fs.readFileSync(".dev.vars", "utf8");
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

  // List all files owned by service account
  let pageToken = null;
  let totalDeleted = 0;

  do {
    const url = `https://www.googleapis.com/drive/v3/files?pageSize=100&fields=files(id,name,size)${pageToken ? "&pageToken=" + pageToken : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${tok.access_token}` } });
    const data = await res.json();

    if (!data.files || data.files.length === 0) {
      console.log("No files found.");
      break;
    }

    console.log(`Found ${data.files.length} files — deleting...`);
    for (const file of data.files) {
      const delRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tok.access_token}` },
      });
      if (delRes.status === 204) {
        console.log(`  ✓ Deleted: ${file.name}`);
        totalDeleted++;
      } else {
        console.log(`  ✗ Failed: ${file.name} (${delRes.status})`);
      }
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  console.log(`\n✅ Done — deleted ${totalDeleted} files`);
  console.log("Quota should be freed within a few minutes.");
}

run().catch(console.error);
