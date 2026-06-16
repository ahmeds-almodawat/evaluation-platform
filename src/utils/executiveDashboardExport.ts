import * as XLSX from "xlsx";
import jsPDF from "jspdf";

export type ExecutiveDashboardExportData = {
  kpis: Array<Record<string, any>>;
  departments: Array<Record<string, any>>;
  peopleTop: Array<Record<string, any>>;
  peopleBottom: Array<Record<string, any>>;
  peopleVolatility: Array<Record<string, any>>;
  ops: Array<Record<string, any>>;
  notes: Array<Record<string, any>>;
};



export type ExecutiveExportPayload = {
  meta: {
    generatedAtIso: string;
    language: "en" | "ar";
    months: number;
    departmentId?: string | null;
    evaluationScope: "all" | "same" | "cross";
  };
  overview: Array<Record<string, any>>;
  trend: Array<Record<string, any>>;
  departments: Array<Record<string, any>>;
  peopleTop: Array<Record<string, any>>;
  peopleBottom: Array<Record<string, any>>;
  peopleVolatility: Array<Record<string, any>>;
  ops: Array<Record<string, any>>;
  notes: Array<Record<string, any>>;
};


function addSheet(
  wb: XLSX.WorkBook,
  name: string,
  rows: Array<Record<string, any>>
) {
  const safeRows = rows && rows.length ? rows : [{ info: "(empty)" }];
  const ws = XLSX.utils.json_to_sheet(safeRows);
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
}

export function exportExecutiveDashboardsToXlsx(payload: ExecutiveExportPayload) {
  const wb = XLSX.utils.book_new();

  addSheet(wb, "Meta", [payload.meta]);
  addSheet(wb, "Overview", payload.overview);
  addSheet(wb, "Trend", payload.trend);
  addSheet(wb, "Departments", payload.departments);
  addSheet(wb, "Top_10", payload.peopleTop);
  addSheet(wb, "Bottom_10", payload.peopleBottom);
  addSheet(wb, "Volatility", payload.peopleVolatility);
  addSheet(wb, "Ops", payload.ops);
  addSheet(wb, "Notes", payload.notes);

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `executive_dashboards_${payload.meta.generatedAtIso.slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportExecutiveDashboardsToPdf(payload: ExecutiveExportPayload) {
  const isAr = payload.meta.language === "ar";
  const doc = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });

  const margin = 40;
  let y = margin;

  const title = isAr ? "لوحات تنفيذية" : "Executive Dashboards";
  doc.setFontSize(18);
  doc.text(title, margin, y);
  y += 22;

  doc.setFontSize(10);
  const metaLine = isAr
    ? `تاريخ التصدير: ${payload.meta.generatedAtIso}`
    : `Exported: ${payload.meta.generatedAtIso}`;
  doc.text(metaLine, margin, y);
  y += 18;

  const writeSection = (sectionTitle: string, lines: string[]) => {
    if (y > 760) {
      doc.addPage();
      y = margin;
    }
    doc.setFontSize(12);
    doc.text(sectionTitle, margin, y);
    y += 14;
    doc.setFontSize(10);
    for (const line of lines) {
      if (y > 780) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += 12;
    }
    y += 8;
  };

  const kpis = payload.overview.map((r) => `${r.label}: ${r.value}`);
  writeSection(isAr ? "المؤشرات" : "KPIs", kpis);

  const notes = payload.notes.map((n) => `- ${n.note}`);
  if (notes.length) writeSection(isAr ? "ملخص تنفيذي" : "Executive Summary", notes);

  const topDepts = payload.departments.slice(0, 10).map((d) => `${d.rank}. ${d.department}: ${d.same_avg}`);
  writeSection(isAr ? "أفضل الأقسام" : "Top Departments", topDepts);

  const bottomDepts = payload.departments
    .slice(-10)
    .reverse()
    .map((d) => `${d.rank}. ${d.department}: ${d.same_avg}`);
  writeSection(isAr ? "الأقسام الأقل" : "Bottom Departments", bottomDepts);

  doc.save(`executive_dashboards_${payload.meta.generatedAtIso.slice(0, 10)}.pdf`);
}
