import * as XLSX from "xlsx";

export type XlsxSheet = {
  name: string;
  rows: Array<Record<string, any>>;
};

function safeSheetName(name: string) {
  const cleaned = name.replace(/[\\/*?:\[\]]/g, " ").trim();
  return cleaned.length ? cleaned.slice(0, 31) : "Sheet";
}

export function downloadXlsx(filename: string, sheets: XlsxSheet[]) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows || []);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(s.name));
  }
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
