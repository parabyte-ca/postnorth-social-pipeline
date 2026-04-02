// test-sheets4.mjs — create sheet via Drive API instead of Sheets API
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
  console.log("Token OK\n");

  // Get the PostNorth Calendars folder ID
  const listRes = await fetch(
    "https://www.googleapis.com/drive/v3/files?q=name='PostNorth Calendars' and mimeType='application/vnd.google-apps.folder'",
    { headers: { Authorization: `Bearer ${tok.access_token}` } }
  );
  const listData = await listRes.json();
  const folderId = listData.files?.[0]?.id;
  console.log("Folder ID:", folderId ?? "NOT FOUND");

  // Create a Google Sheet via Drive API
  console.log("\nCreating spreadsheet via Drive API...");
  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tok.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "PostNorth Test Sheet",
      mimeType: "application/vnd.google-apps.spreadsheet",
      ...(folderId && { parents: [folderId] }),
    }),
  });
  const created = await createRes.json();
  console.log("Status:", createRes.status);
  console.log("Response:", JSON.stringify(created, null, 2));

  if (created.id) {
    console.log("\n✅ SUCCESS! Sheet created via Drive API");
    console.log("URL: https://docs.google.com/spreadsheets/d/" + created.id);

    // Now try to write data to it via Sheets API
    console.log("\nWriting data via Sheets API...");
    const writeRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${created.id}/values/A1?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${tok.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: [["Date","Platform","Caption"],["May 1","LinkedIn","Test post"]] }),
      }
    );
    console.log("Write status:", writeRes.status);
    console.log("Write response:", JSON.stringify(await writeRes.json(), null, 2));
  }
}

run().catch(console.error);
