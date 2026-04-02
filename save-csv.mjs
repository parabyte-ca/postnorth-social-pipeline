// save-csv.mjs — run this to save CSV from last pipeline run
// Usage: node save-csv.mjs <json-file>
// OR just run the full pipeline which now auto-saves CSV

import fs from "fs";

// Quick standalone CSV test with dummy data
const headers = ["Date","Platform","Content Type","Caption","Hashtags","CTA","Image Prompt","Notes","Status"];
const rows = [
  ["May 2026 Day 1","LinkedIn","Educational","Test caption here","#test","Click here","A bright bakery","","Draft"],
  ["May 2026 Day 2","Instagram","Inspirational","Another test","#bakery #coffee","Follow us","Coffee and croissants","","Draft"],
];

const csvLines = [headers, ...rows].map(row =>
  row.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")
);

fs.writeFileSync("test-output.csv", csvLines.join("\n"), "utf8");
console.log("✓ test-output.csv written");
