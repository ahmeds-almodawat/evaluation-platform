import { apiV1Fetch } from '@/lib/apiV1';

type ExportFormat = 'pdf' | 'excel' | 'xlsx';

export type ExportReportRequest = {
  report: 'reports_overview' | 'company' | 'department' | 'employee';
  format: ExportFormat;
  language: 'en' | 'ar';
  params?: Record<string, any>;
};

function filenameFromContentDisposition(cd: string | null) {
  if (!cd) return null;
  // attachment; filename="foo.pdf"
  const match = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"|filename=([^;]+)/i.exec(cd);
  const raw = match?.[1] || match?.[2] || match?.[3];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw.replace(/"/g, '').trim());
  } catch {
    return raw.replace(/"/g, '').trim();
  }
}

export async function exportReportServer(req: ExportReportRequest) {
  const format = req.format === 'excel' ? 'xlsx' : req.format;

  const res = await apiV1Fetch('/api/v1/reports/export', {
    method: 'POST',
    body: JSON.stringify({ ...req, format }),
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || 'Export failed');
  }

  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition');
  const filename = filenameFromContentDisposition(cd) || `report.${format === 'pdf' ? 'pdf' : 'xlsx'}`;

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
