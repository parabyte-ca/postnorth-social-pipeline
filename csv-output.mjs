// csv-output.mjs — save pipeline output as CSV
// Import and call this after the pipeline completes
import fs from "fs";
import path from "path";

export function saveCSV(headers, rows, clientName, monthYear) {
  const escape = (val) => `"${String(val ?? "").replace(/"/g, '""')}"`;
  const lines = [headers, ...rows].map(row => row.map(escape).join(","));
  const filename = `${clientName.replace(/\s+/g, "-")}-${monthYear.replace(/\s+/g, "-")}.csv`;
  const filepath = path.join("C:\\Users\\alan\\social-pipeline", filename);
  fs.writeFileSync(filepath, lines.join("\r\n"), "utf8");
  return filepath;
}
