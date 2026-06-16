import { supabase } from "@/integrations/supabase/client";

function toCsv(rows: any[]) {
  if (!rows.length) return "";

  const headers = Object.keys(rows[0]);

  const escapeValue = (value: any) => {
    if (value === null || value === undefined) return "";
    const str = String(value).replace(/"/g, '""');
    return /[",\n]/.test(str) ? `"${str}"` : str;
  };

  const csvRows = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((h) => escapeValue(row[h])).join(",")
    ),
  ];

  return csvRows.join("\n");
}

export async function exportEmployeesCsv() {
  const PAGE_SIZE = 500;
  let from = 0;
  let allRows: any[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error("Export error:", error);
      throw error;
    }

    if (!data || data.length === 0) break;

    allRows.push(...data);

    if (data.length < PAGE_SIZE) break;

    from += PAGE_SIZE;
  }

  const csv = toCsv(allRows);

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `employees_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();

  URL.revokeObjectURL(url);
}
