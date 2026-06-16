import React from 'react';
import { Building2, GitBranch } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { formatScore, scoreToneClass } from '@/utils/evaluationCampaigns';

export interface UnitRollupRow {
  id: string;
  departmentName: string;
  unitName: string;
  employeeCount: number;
  evaluationCount: number;
  average: number | null;
  selfStationAverage?: number | null;
  crossStationAverage?: number | null;
  managerToTeamAverage?: number | null;
  teamToManagerAverage?: number | null;
}

interface Props {
  title: string;
  subtitle?: string;
  rows: UnitRollupRow[];
  language: string;
  limit?: number;
}

const UnitRollupTable: React.FC<Props> = ({ title, subtitle, rows, language, limit = 12 }) => {
  const visibleRows = rows.slice(0, limit);

  return (
    <Card className="animate-fade-in-up border-muted/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <GitBranch className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </CardHeader>
      <CardContent>
        {visibleRows.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {language === 'ar' ? 'لا توجد بيانات وحدات / محطات بعد.' : 'No unit / station dashboard data yet.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-muted-foreground">
                  <th className="py-3 text-start">{language === 'ar' ? 'القسم' : 'Department'}</th>
                  <th className="py-3 text-start">{language === 'ar' ? 'الوحدة / المحطة' : 'Unit / Station'}</th>
                  <th className="py-3 text-center">{language === 'ar' ? 'الموظفون' : 'Employees'}</th>
                  <th className="py-3 text-center">{language === 'ar' ? 'التقييمات' : 'Evaluations'}</th>
                  <th className="py-3 text-center">{language === 'ar' ? 'المتوسط' : 'Average'}</th>
                  <th className="py-3 text-start">{language === 'ar' ? 'تفصيل سريع' : 'Quick split'}</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="py-3">
                      <div className="flex items-center gap-2 font-medium">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {row.departmentName}
                      </div>
                    </td>
                    <td className="py-3 font-medium text-foreground">{row.unitName}</td>
                    <td className="py-3 text-center">{row.employeeCount}</td>
                    <td className="py-3 text-center">
                      <Badge variant="secondary">{row.evaluationCount}</Badge>
                    </td>
                    <td className="py-3 text-center">
                      <div className={`font-bold ${scoreToneClass(row.average)}`}>{formatScore(row.average)}</div>
                      <Progress value={typeof row.average === 'number' ? (row.average / 3) * 100 : 0} className="mt-1 h-1.5" />
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2 text-xs">
                        <Badge variant="outline">{language === 'ar' ? 'داخلي' : 'Self'} {formatScore(row.selfStationAverage, 1)}</Badge>
                        <Badge variant="outline">{language === 'ar' ? 'بين وحدات' : 'Cross Station'} {formatScore(row.crossStationAverage, 1)}</Badge>
                        <Badge variant="outline">{language === 'ar' ? 'مدير→فريق' : 'Mgr→Team'} {formatScore(row.managerToTeamAverage, 1)}</Badge>
                        <Badge variant="outline">{language === 'ar' ? 'فريق→مدير' : 'Team→Mgr'} {formatScore(row.teamToManagerAverage, 1)}</Badge>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default UnitRollupTable;
