export type CampaignTypeKey =
  | 'legacy_same'
  | 'self_station'
  | 'cross_station'
  | 'cross_department'
  | 'manager_to_team'
  | 'team_to_manager'
  | 'manager_to_supervisors'
  | 'legacy_cross'
  | 'other';

export type DashboardLanguage = 'en' | 'ar' | string;

export interface EvaluationLike {
  evaluation_type?: string | null;
  performance_score?: number | string | null;
  teamwork_score?: number | string | null;
}

const TYPE_ALIASES: Record<string, CampaignTypeKey> = {
  same: 'legacy_same',
  self: 'legacy_same',
  self_department: 'legacy_same',
  self_dept: 'legacy_same',
  self_station: 'self_station',
  unit_peer: 'self_station',
  cross_station: 'cross_station',
  cross_unit: 'cross_station',
  cross: 'legacy_cross',
  cross_individuals: 'legacy_cross',
  cross_managers: 'legacy_cross',
  cross_department: 'cross_department',
  manager_to_team: 'manager_to_team',
  manager_team: 'manager_to_team',
  team_to_manager: 'team_to_manager',
  upward_manager: 'team_to_manager',
  manager_to_supervisors: 'manager_to_supervisors',
  manager_to_supervisor: 'manager_to_supervisors',
};

export const CAMPAIGN_TYPE_ORDER: CampaignTypeKey[] = [
  'self_station',
  'cross_station',
  'cross_department',
  'manager_to_team',
  'team_to_manager',
  'manager_to_supervisors',
  'legacy_same',
  'legacy_cross',
  'other',
];

export function normalizeCampaignType(value?: string | null): CampaignTypeKey {
  const type = (value || 'same').trim().toLowerCase();
  return TYPE_ALIASES[type] ?? (type.includes('cross') ? 'legacy_cross' : 'other');
}

export function isCrossCampaign(value?: string | null): boolean {
  const key = normalizeCampaignType(value);
  return key === 'cross_station' || key === 'cross_department' || key === 'legacy_cross';
}

export function isLegacyCampaign(value?: string | null): boolean {
  const key = normalizeCampaignType(value);
  return key === 'legacy_same' || key === 'legacy_cross';
}

export function campaignLabel(keyOrValue: CampaignTypeKey | string | null | undefined, language: DashboardLanguage): string {
  const key = normalizeCampaignType(keyOrValue);
  const ar = language === 'ar';
  const labels: Record<CampaignTypeKey, { en: string; ar: string }> = {
    self_station: { en: 'Self Station / Unit', ar: 'تقييم داخلي للوحدة / المحطة' },
    cross_station: { en: 'Cross Station', ar: 'تقييم بين الوحدات / المحطات' },
    cross_department: { en: 'Cross Department', ar: 'تقييم بين الأقسام' },
    manager_to_team: { en: 'Supervisor/Manager → Team', ar: 'المشرف/المدير → الفريق' },
    team_to_manager: { en: 'Team → Supervisor/Manager', ar: 'الفريق → المشرف/المدير' },
    manager_to_supervisors: { en: 'Manager → Supervisors', ar: 'المدير → المشرفين' },
    legacy_same: { en: 'Legacy Self Dept', ar: 'تقييم القسم القديم' },
    legacy_cross: { en: 'Legacy Cross', ar: 'تقييم خارجي قديم' },
    other: { en: 'Other', ar: 'أخرى' },
  };
  return ar ? labels[key].ar : labels[key].en;
}

export function campaignShortLabel(keyOrValue: CampaignTypeKey | string | null | undefined, language: DashboardLanguage): string {
  const key = normalizeCampaignType(keyOrValue);
  const ar = language === 'ar';
  const labels: Record<CampaignTypeKey, { en: string; ar: string }> = {
    self_station: { en: 'Self Station', ar: 'داخلي الوحدة' },
    cross_station: { en: 'Cross Station', ar: 'بين الوحدات' },
    cross_department: { en: 'Cross Dept', ar: 'بين الأقسام' },
    manager_to_team: { en: 'Supervisor/Mgr → Team', ar: 'المشرف/المدير للفريق' },
    team_to_manager: { en: 'Team → Supervisor/Mgr', ar: 'الفريق للمشرف/المدير' },
    manager_to_supervisors: { en: 'Manager → Supervisors', ar: 'المدير → المشرفين' },
    legacy_same: { en: 'Legacy Self', ar: 'داخلي قديم' },
    legacy_cross: { en: 'Legacy Cross', ar: 'خارجي قديم' },
    other: { en: 'Other', ar: 'أخرى' },
  };
  return ar ? labels[key].ar : labels[key].en;
}

export function campaignDescription(keyOrValue: CampaignTypeKey | string | null | undefined, language: DashboardLanguage): string {
  const key = normalizeCampaignType(keyOrValue);
  const ar = language === 'ar';
  const descriptions: Record<CampaignTypeKey, { en: string; ar: string }> = {
    self_station: {
      en: 'Peers inside the same station/unit.',
      ar: 'زملاء داخل نفس الوحدة / المحطة.',
    },
    cross_station: {
      en: 'One station/unit evaluates another station/unit.',
      ar: 'وحدة / محطة تقيم وحدة / محطة أخرى.',
    },
    cross_department: {
      en: 'One department evaluates another department.',
      ar: 'قسم يقيم قسمًا آخر.',
    },
    manager_to_team: {
      en: 'Assigned supervisors/managers evaluate their team members.',
      ar: 'المشرفون/المدراء المكلّفون يقيمون أعضاء الفريق.',
    },
    team_to_manager: {
      en: 'Team members evaluate their assigned supervisor/manager.',
      ar: 'أعضاء الفريق يقيمون المشرف/المدير المكلّف.',
    },
    manager_to_supervisors: {
      en: 'Department managers evaluate unit/station supervisors in their department.',
      ar: 'مدراء الأقسام يقيمون مشرفي الوحدات/المحطات في قسمهم.',
    },
    legacy_same: {
      en: 'Old self-department records kept for history.',
      ar: 'سجلات التقييم الداخلي القديمة محفوظة للتاريخ.',
    },
    legacy_cross: {
      en: 'Old cross-evaluation records kept for history.',
      ar: 'سجلات التقييم الخارجي القديمة محفوظة للتاريخ.',
    },
    other: {
      en: 'Unclassified evaluation records.',
      ar: 'سجلات تقييم غير مصنفة.',
    },
  };
  return ar ? descriptions[key].ar : descriptions[key].en;
}

export function evaluationScore(row: EvaluationLike): number | null {
  const values = [row.performance_score, row.teamwork_score]
    .map((v) => Number(v ?? 0))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function averageEvaluationScore(rows: EvaluationLike[]): number | null {
  const values = rows
    .map(evaluationScore)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function formatScore(value: number | null | undefined, decimals = 2): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(decimals) : '—';
}

export function scoreToneClass(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'text-muted-foreground';
  if (value >= 2.5) return 'text-success';
  if (value >= 1.8) return 'text-warning';
  return 'text-danger';
}
