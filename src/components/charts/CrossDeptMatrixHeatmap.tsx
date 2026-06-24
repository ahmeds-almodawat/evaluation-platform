import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Dept = { id: string; name_en?: string; name_ar?: string };

export type CrossMatrixCell = {
  from_department_id: string;
  to_department_id: string;
  avg_score: number | null;
  n: number;
};

type Props = {
  title: string;
  language: "en" | "ar";
  departmentsById: Record<string, Dept>;
  cells: CrossMatrixCell[];
  minN: number;
};

const fmt = (v: number | null) => (typeof v === "number" ? v.toFixed(2) : "—");

export default function CrossDeptMatrixHeatmap({
  title,
  language,
  departmentsById,
  cells,
  minN,
}: Props) {
  const deptIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of cells) {
      if (c.from_department_id) set.add(c.from_department_id);
      if (c.to_department_id) set.add(c.to_department_id);
    }
    return Array.from(set).sort((a, b) => {
      const an = (departmentsById[a]?.name_en || a).toLowerCase();
      const bn = (departmentsById[b]?.name_en || b).toLowerCase();
      return an.localeCompare(bn);
    });
  }, [cells, departmentsById]);

  const cellMap = useMemo(() => {
    const map = new Map<string, CrossMatrixCell>();
    for (const c of cells) {
      map.set(`${c.from_department_id}__${c.to_department_id}`, c);
    }
    return map;
  }, [cells]);

  const label = (id: string) => {
    const d = departmentsById[id];
    if (!d) return id;
    return language === "ar" ? d.name_ar || d.name_en || id : d.name_en || d.name_ar || id;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>

      <CardContent>
        {deptIds.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {language === "ar" ? "لا توجد بيانات كافية لهذا الشهر." : "No enough data for this month."}
          </div>
        ) : (
          <div className="border rounded-lg overflow-auto max-h-[70vh]">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="sticky top-0 bg-background z-10">
                <tr>
                  <th className="sticky left-0 bg-background z-20 text-left p-2 border-b border-r w-60">
                    {language === "ar" ? "القسم (المُقيِّم) \\ القسم (المُقيَّم)" : "From Dept \\ To Dept"}
                  </th>
                  {deptIds.map((toId) => (
                    <th key={toId} className="p-2 border-b text-left whitespace-nowrap">
                      {label(toId)}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {deptIds.map((fromId) => (
                  <tr key={fromId}>
                    <td className="sticky left-0 bg-background z-10 p-2 border-b border-r font-medium whitespace-nowrap">
                      {label(fromId)}
                    </td>

                    {deptIds.map((toId) => {
                      const c = cellMap.get(`${fromId}__${toId}`);
                      const ok = c && c.n >= minN;
                      return (
                        <td key={toId} className="p-2 border-b align-top">
                          {ok ? (
                            <div className="flex flex-col">
                              <span className="font-semibold">{fmt(c!.avg_score)}</span>
                              <span className="text-xs text-muted-foreground">
                                n={c!.n}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
