// test-sheets.mjs — isolated Google Sheets integration test
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createSign } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .dev.vars
const devVars = fs.readFileSync(path.join(__dirname, ".dev.vars"), "utf8");
const env = {};
for (const line of devVars.split("\n")) {
  const idx = line.indexOf("=");
  if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
}

console.log("Service account:", env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
console.log("Key length:", env.GOOGLE_PRIVATE_KEY?.length);

async function test() {
  // Build JWT
  const h64 = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const c64 = btoa(JSON.stringify({
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600, iat: now,
  }));

  const pemKey = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");
  const sign = createSign("RSA-SHA256");
  sign.update(`${h64}.${c64}`);
  const sig = sign.sign(pemKey, "base64url");
  const jwt = `${h64}.${c64}.${sig}`;

  // Get access token
  console.log("\nFetching access token...");
  const tokRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const tokData = await tokRes.json();
  if (!tokData.access_token) {
    console.error("Token failed:", JSON.stringify(tokData, null, 2));
    process.exit(1);
  }
  console.log("Access token OK:", tokData.access_token.slice(0, 20) + "...");

  // Create spreadsheet
  console.log("\nCreating test spreadsheet...");
  const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokData.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      properties: { title: "PostNorth Test Sheet" },
      sheets: [{ properties: { title: "Test" } }],
    }),
  });
  const sheet = await createRes.json();
  console.log("Create response:", JSON.stringify(sheet, null, 2));

  if (sheet.spreadsheetId) {
    console.log("\n✅ SUCCESS!");
    console.log("Sheet URL: https://docs.google.com/spreadsheets/d/" + sheet.spreadsheetId);
  } else {
    console.error("\n✗ FAILED — see error above");
  }
}

test().catch(console.error);
