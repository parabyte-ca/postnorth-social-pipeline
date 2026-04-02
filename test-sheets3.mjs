// test-sheets3.mjs — verbose response headers diagnosis
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
    scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive",
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
  console.log("Token OK\n");

  // Test 1: List files (should work if Drive API is enabled)
  console.log("--- Test 1: List Drive files ---");
  const listRes = await fetch("https://www.googleapis.com/drive/v3/files?pageSize=5", {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  });
  console.log("Status:", listRes.status);
  console.log("Body:", JSON.stringify(await listRes.json(), null, 2));

  // Test 2: Create sheet with full headers logged
  console.log("\n--- Test 2: Create spreadsheet (verbose) ---");
  const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tok.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: { title: "PostNorth Test" },
      sheets: [{ properties: { title: "Sheet1" } }],
    }),
  });
  console.log("Status:", createRes.status);
  console.log("Headers:");
  for (const [k, v] of createRes.headers) console.log(" ", k, ":", v);
  console.log("Body:", JSON.stringify(await createRes.json(), null, 2));
}

run().catch(console.error);
