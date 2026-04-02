// outputs/sheets.js
// Create a new Google Sheet and populate it with the content calendar

async function getAccessToken(env) {
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const claim = btoa(JSON.stringify({
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  }));

  const pemKey = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");
  const keyData = pemKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const binaryKey = Uint8Array.from(atob(keyData), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const signingInput = `${header}.${claim}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`[Sheets] Token error: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

export async function createGoogleSheet(env, clientName, monthYear, sheetHeaders, sheetRows) {
  const token = await getAccessToken(env);
  const title = `${clientName} — Social Media Calendar — ${monthYear}`;

  // Create the spreadsheet
  const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: "Content Calendar" } }],
    }),
  });

  const sheet = await createRes.json();
  if (!sheet.spreadsheetId) {
    throw new Error(`[Sheets] Create failed: ${JSON.stringify(sheet)}`);
  }

  const spreadsheetId = sheet.spreadsheetId;
  const sheetId = sheet.sheets[0].properties.sheetId;
  console.log(`[Sheets] Created spreadsheet: ${spreadsheetId}`);

  // Write headers + data
  const values = [sheetHeaders, ...sheetRows];
  const writeRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    }
  );
  const writeData = await writeRes.json();
  if (writeData.error) {
    console.error(`[Sheets] Write warning: ${JSON.stringify(writeData.error)}`);
  }

  // Format: bold header, freeze row, auto-resize columns
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.067, green: 0.063, blue: 0.063 },
                  textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                },
              },
              fields: "userEnteredFormat(backgroundColor,textFormat)",
            },
          },
          {
            updateSheetProperties: {
              properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
              fields: "gridProperties.frozenRowCount",
            },
          },
          {
            autoResizeDimensions: {
              dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 9 },
            },
          },
        ],
      }),
    }
  );

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
  console.log(`[Sheets] Ready: ${sheetUrl}`);
  return sheetUrl;
}
