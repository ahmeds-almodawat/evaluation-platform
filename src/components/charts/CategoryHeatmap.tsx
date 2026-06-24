import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

interface HeatmapRow {
  id: string;
  nameEn: string;
  nameAr: string;
  performance: number;
  teamwork: number;
  workload?: number;
}

interface CategoryHeatmapProps {
  data: HeatmapRow[];
  title?: string;
}

const CategoryHeatmap: React.FC<CategoryHeatmapProps> = ({ data, title }) => {
  const { t, language } = useLanguage();

  const getHeatmapColor = (value: number): string => {
    if (value >= 2.5) return 'bg-success/80 text-success-foreground';
    if (value >= 1.8) return 'bg-warning/80 text-warning-foreground';
    return 'bg-danger/80 text-danger-foreground';
  };

  const categories = [
    { key: 'performance', label: t('category.performance') },
    { key: 'teamwork', label: t('category.teamwork') },
    { key: 'workload', label: t('category.workload') },
  ];

  return (
    <div className="chart-container animate-fade-in-up">
      {title && (
        <h3 className="text-lg font-semibold text-foreground mb-4">{title}</h3>
      )}
      
      {/* Legend */}
      <div className="flex items-center justify-end gap-4 mb-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-success/80" />
          <span className="text-muted-foreground">{t('status.high')} (≥2.5)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-warning/80" />
          <span className="text-muted-foreground">{t('status.medium')} (1.8-2.5)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-danger/80" />
          <span className="text-muted-foreground">{t('status.low')} (&lt;1.8)</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-start py-3 px-4 text-sm font-medium text-muted-foreground">
                {t('label.employee')}
              </th>
              {categories.map((cat) => (
                <th
                  key={cat.key}
                  className="text-center py-3 px-4 text-sm font-medium text-muted-foreground"
                >
                  {cat.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, index) => (
              <tr
                key={row.id}
                className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <td className="py-3 px-4 text-sm font-medium text-foreground">
                  {language === 'ar' ? row.nameAr : row.nameEn}
                </td>
                <td className="py-2 px-4">
                  <div
                    className={`heatmap-cell ${getHeatmapColor(row.performance)}`}
                  >
                    {row.performance.toFixed(1)}
                  </div>
                </td>
                <td className="py-2 px-4">
                  <div
                    className={`heatmap-cell ${getHeatmapColor(row.teamwork)}`}
                  >
                    {row.teamwork.toFixed(1)}
                  </div>
                </td>
                <td className="py-2 px-4">
                  {row.workload !== undefined ? (
                    <div
                      className={`heatmap-cell ${getHeatmapColor(row.workload)}`}
                    >
                      {row.workload.toFixed(1)}
                    </div>
                  ) : (
                    <div className="heatmap-cell bg-muted text-muted-foreground">
                      —
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CategoryHeatmap;
