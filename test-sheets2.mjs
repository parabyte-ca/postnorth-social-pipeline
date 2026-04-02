// test-sheets2.mjs — step by step diagnosis
import { createSign } from "crypto";
import fs from "fs";

const devVars = fs.readFileSync(".dev.vars", "utf8");
const env = {};
for (const line of devVars.split("\n")) {
  const idx = line.indexOf("=");
  if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
}

async function getToken(scope) {
  const h = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const c = btoa(JSON.stringify({
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, scope,
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
  // Test 1: sheets scope only
  console.log("\n--- Test 1: Sheets scope only ---");
  const tok1 = await getToken("https://www.googleapis.com/auth/spreadsheets");
  console.log("Token:", tok1.access_token ? "OK" : "FAILED", tok1.error ?? "");

  if (tok1.access_token) {
    const r = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok1.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ properties: { title: "Test" }, sheets: [{ properties: { title: "Sheet1" } }] }),
    });
    const d = await r.json();
    console.log("Create sheets-only:", r.status, d.spreadsheetId ? "✅ SUCCESS: " + d.spreadsheetId : JSON.stringify(d.error));
  }

  // Test 2: drive scope only
  console.log("\n--- Test 2: Drive scope only ---");
  const tok2 = await getToken("https://www.googleapis.com/auth/drive");
  console.log("Token:", tok2.access_token ? "OK" : "FAILED", tok2.error ?? "");

  if (tok2.access_token) {
    const r = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok2.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ properties: { title: "Test" }, sheets: [{ properties: { title: "Sheet1" } }] }),
    });
    const d = await r.json();
    console.log("Create drive-scope:", r.status, d.spreadsheetId ? "✅ SUCCESS: " + d.spreadsheetId : JSON.stringify(d.error));
  }

  // Test 3: both scopes
  console.log("\n--- Test 3: Both scopes ---");
  const tok3 = await getToken("https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive");
  console.log("Token:", tok3.access_token ? "OK" : "FAILED", tok3.error ?? "");

  if (tok3.access_token) {
    const r = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok3.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ properties: { title: "Test" }, sheets: [{ properties: { title: "Sheet1" } }] }),
    });
    const d = await r.json();
    console.log("Create both-scopes:", r.status, d.spreadsheetId ? "✅ SUCCESS: " + d.spreadsheetId : JSON.stringify(d.error));
  }
}

run().catch(console.error);
