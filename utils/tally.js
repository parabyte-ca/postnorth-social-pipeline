// utils/tally.js
// Parse and verify incoming Tally.so webhook payloads

import { createHmac } from "crypto";

// Verify Tally's HMAC signature
export async function verifyTallySignature(request, secret) {
  const signature = request.headers.get("tally-signature");
  if (!signature || !secret) return false;

  const body = await request.clone().text();
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return signature === expected;
}

// Extract our intake fields from Tally's nested payload format
// Tally sends fields as an array of {key, label, value} objects
export function parseTallyPayload(payload) {
  const fields = payload?.data?.fields ?? [];

  const get = (label) =>
    fields.find((f) => f.label?.toLowerCase().includes(label.toLowerCase()))
      ?.value ?? "";

  return {
    clientName:     get("business name"),
    clientUrl:      get("website"),
    clientEmail:    get("email"),
    industry:       get("industry"),
    targetAudience: get("target audience"),
    tone:           get("tone"),
    monthYear:      get("month") || getCurrentMonthYear(),
    platforms:      ["LinkedIn", "Instagram", "Facebook"],
    existingSamples: get("sample post") || "",
    googleSheetId:  get("sheet id") || "", // optional: client provides their own sheet
  };
}

function getCurrentMonthYear() {
  return new Date().toLocaleString("en-CA", { month: "long", year: "numeric" });
}
