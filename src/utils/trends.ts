export type MonthKey = string; // YYYY-MM

export interface MonthlyTrendPoint {
  month: string; // localized label
  monthKey: MonthKey;
  sameDept: number | null;
  crossDept: number | null;
}

const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

export function monthKeyFromDate(d: Date): MonthKey {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function buildLastNMonthKeys(n: number, now = new Date()): MonthKey[] {
  const keys: MonthKey[] = [];
  const d = new Date(now);
  d.setDate(1);
  for (let i = 0; i < n; i++) {
    const key = monthKeyFromDate(d);
    keys.unshift(key);
    d.setMonth(d.getMonth() - 1);
  }
  return keys;
}

export function monthLabelFromKey(key: MonthKey, language: 'en' | 'ar'): string {
  const [, mm] = key.split('-');
  const idx = Math.max(0, Math.min(11, Number(mm) - 1));
  return language === 'ar' ? MONTHS_AR[idx] : MONTHS_EN[idx];
}

/**
 * Calculate % trend between current and previous (e.g. 2.7 vs 2.5 => +8.0%).
 * Returns null if not enough info.
 */
export function calcPctTrend(current: number | null, prev: number | null): number | null {
  if (typeof current !== 'number' || typeof prev !== 'number') return null;
  if (!isFinite(current) || !isFinite(prev)) return null;
  if (prev === 0) return null;
  return ((current - prev) / prev) * 100;
}

type EvalRow = {
  created_at?: string | null;
  evaluation_type?: string | null;
  performance_score?: number | null;
  teamwork_score?: number | null;
};

function safeMonthKeyFromCreatedAt(createdAt?: string | null): MonthKey | null {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return null;
  return monthKeyFromDate(d);
}

/**
 * Builds last N months trend from evaluations using live data.
 * - sameDept is the average performance_score for internal evaluation types.
 * - crossDept is the average teamwork_score for cross-station/cross-department evaluation types.
 */
export function buildTrendFromEvaluations(
  evaluations: EvalRow[] | null | undefined,
  language: 'en' | 'ar',
  months = 12,
): MonthlyTrendPoint[] {
  const keys = buildLastNMonthKeys(months);
  const byKey: Record<string, { sameSum: number; sameN: number; crossSum: number; crossN: number }> = {};
  for (const k of keys) byKey[k] = { sameSum: 0, sameN: 0, crossSum: 0, crossN: 0 };

  for (const e of evaluations || []) {
    const mk = safeMonthKeyFromCreatedAt(e.created_at);
    if (!mk || !(mk in byKey)) continue;

    const type = (e.evaluation_type || 'same').toLowerCase();
    const isCrossType = ['cross', 'cross_individuals', 'cross_managers', 'cross_department', 'cross_station'].includes(type);
    if (!isCrossType) {
      const v = typeof e.performance_score === 'number' ? e.performance_score : null;
      if (typeof v === 'number' && isFinite(v)) {
        byKey[mk].sameSum += v;
        byKey[mk].sameN += 1;
      }
    } else {
      const v = typeof e.teamwork_score === 'number' ? e.teamwork_score : null;
      if (typeof v === 'number' && isFinite(v)) {
        byKey[mk].crossSum += v;
        byKey[mk].crossN += 1;
      }
    }
  }

  return keys.map((k) => {
    const agg = byKey[k];
    const same = agg.sameN > 0 ? Number((agg.sameSum / agg.sameN).toFixed(2)) : null;
    const cross = agg.crossN > 0 ? Number((agg.crossSum / agg.crossN).toFixed(2)) : null;
    return {
      month: monthLabelFromKey(k, language),
      monthKey: k,
      sameDept: same,
      crossDept: cross,
    };
  });
}
