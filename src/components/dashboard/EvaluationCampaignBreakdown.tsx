import React from 'react';
import { ArrowRightLeft, Briefcase, Building2, GitBranch, ShieldCheck, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  type CampaignTypeKey,
  CAMPAIGN_TYPE_ORDER,
  campaignDescription,
  campaignLabel,
  formatScore,
  scoreToneClass,
} from '@/utils/evaluationCampaigns';

export interface CampaignBreakdownItem {
  key: CampaignTypeKey;
  count: number;
  average: number | null;
  evaluatorCount: number;
  evaluateeCount: number;
}

interface Props {
  title: string;
  subtitle?: string;
  items: CampaignBreakdownItem[];
  language: string;
  showLegacy?: boolean;
}

const iconMap: Record<CampaignTypeKey, React.ReactNode> = {
  self_station: <Users className="h-4 w-4" />,
  cross_station: <GitBranch className="h-4 w-4" />,
  cross_department: <Building2 className="h-4 w-4" />,
  manager_to_team: <ShieldCheck className="h-4 w-4" />,
  team_to_manager: <ArrowRightLeft className="h-4 w-4" />,
  manager_to_supervisors: <Briefcase className="h-4 w-4" />,
  legacy_same: <Users className="h-4 w-4" />,
  legacy_cross: <ArrowRightLeft className="h-4 w-4" />,
  other: <ArrowRightLeft className="h-4 w-4" />,
};

const EvaluationCampaignBreakdown: React.FC<Props> = ({ title, subtitle, items, language, showLegacy = true }) => {
  const byKey = new Map(items.map((item) => [item.key, item]));
  const ordered = CAMPAIGN_TYPE_ORDER
    .filter((key) => showLegacy || (key !== 'legacy_same' && key !== 'legacy_cross' && key !== 'other'))
    .map((key) => byKey.get(key) ?? { key, count: 0, average: null, evaluatorCount: 0, evaluateeCount: 0 });

  return (
    <Card className="animate-fade-in-up border-muted/60">
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ordered.map((item) => (
            <div key={item.key} className="rounded-xl border bg-card/80 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-primary/10 p-2 text-primary">{iconMap[item.key]}</div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">{campaignLabel(item.key, language)}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{campaignDescription(item.key, language)}</div>
                  </div>
                </div>
                <Badge variant={item.count > 0 ? 'default' : 'secondary'}>{item.count}</Badge>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-muted/40 p-2">
                  <div className="text-muted-foreground">{language === 'ar' ? 'المتوسط' : 'Avg'}</div>
                  <div className={`text-base font-bold ${scoreToneClass(item.average)}`}>{formatScore(item.average)}</div>
                </div>
                <div className="rounded-lg bg-muted/40 p-2">
                  <div className="text-muted-foreground">{language === 'ar' ? 'المقيّمون' : 'Evaluators'}</div>
                  <div className="text-base font-bold text-foreground">{item.evaluatorCount}</div>
                </div>
                <div className="rounded-lg bg-muted/40 p-2">
                  <div className="text-muted-foreground">{language === 'ar' ? 'المقيَّمون' : 'Evaluatees'}</div>
                  <div className="text-base font-bold text-foreground">{item.evaluateeCount}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default EvaluationCampaignBreakdown;
