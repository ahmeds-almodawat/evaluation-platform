import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

export type DeptMonthHeatmapRow = {
  deptId: string;
  nameEn: string;
  nameAr: string;
  // monthKey -> average score (performance)
  values: Record<string, number | null>;
};

interface DepartmentMonthHeatmapProps {
  months: string[]; // YYYY-MM
  rows: DeptMonthHeatmapRow[];
  title?: string;
  onDepartmentClick?: (deptId: string) => void;
}

const colorClass = (v: number | null) => {
  if (v === null || Number.isNaN(v)) return 'bg-muted text-muted-foreground';
  if (v >= 2.8) return 'bg-success/80 text-success-foreground';
  if (v >= 2.2) return 'bg-success/30 text-foreground';
  if (v >= 1.8) return 'bg-warning/50 text-warning-foreground';
  return 'bg-danger/60 text-danger-foreground';
};

const DepartmentMonthHeatmap: React.FC<DepartmentMonthHeatmapProps> = ({ months, rows, title, onDepartmentClick }) => {
  const { t, language } = useLanguage();

  return (
    <div className="chart-container animate-fade-in-up">
      {title && <h3 className="text-lg font-semibold text-foreground mb-3">{title}</h3>}

      <div className="flex items-center justify-end gap-3 mb-3 text-xs text-muted-foreground">
        <span>{t('reports.heatmap.legend') || 'Legend:'}</span>
        <span className="px-2 py-1 rounded bg-success/80 text-success-foreground">≥ 2.8</span>
        <span className="px-2 py-1 rounded bg-success/30 text-foreground">2.2–2.79</span>
        <span className="px-2 py-1 rounded bg-warning/50 text-warning-foreground">1.8–2.19</span>
        <span className="px-2 py-1 rounded bg-danger/60 text-danger-foreground">&lt; 1.8</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-start py-3 px-4 text-sm font-medium text-muted-foreground whitespace-nowrap">
                {t('label.department') || (language === 'ar' ? 'القسم' : 'Department')}
              </th>
              {months.map((m) => (
                <th key={m} className="text-center py-3 px-3 text-xs font-medium text-muted-foreground whitespace-nowrap">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const name = language === 'ar' ? r.nameAr : r.nameEn;
              return (
                <tr
                  key={r.deptId}
                  className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                  style={{ animationDelay: `${idx * 30}ms` }}
                >
                  <td className="py-3 px-4 text-sm font-medium text-foreground whitespace-nowrap">
                    <button
                      type="button"
                      className="text-start hover:underline"
                      onClick={() => onDepartmentClick?.(r.deptId)}
                    >
                      {name || r.deptId}
                    </button>
                  </td>
                  {months.map((m) => {
                    const v = r.values[m] ?? null;
                    return (
                      <td key={m} className="py-2 px-3">
                        <div className={`heatmap-cell ${colorClass(v)}`} title={v === null ? '—' : v.toFixed(2)}>
                          {v === null ? '—' : v.toFixed(1)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DepartmentMonthHeatmap;
