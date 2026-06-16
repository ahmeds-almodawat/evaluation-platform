import * as XLSX from "xlsx";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportRowsToXlsx(filename: string, sheets: Record<string, any[]>) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.json_to_sheet(rows ?? []);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadBlob(
    new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    filename
  );
}

export function exportRowsToCsvBom(filename: string, rows: any[]) {
  const ws = XLSX.utils.json_to_sheet(rows ?? []);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const bom = "\uFEFF";
  downloadBlob(new Blob([bom + csv], { type: "text/csv;charset=utf-8" }), filename);
}
