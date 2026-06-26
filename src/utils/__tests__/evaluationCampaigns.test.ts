import { describe, it, expect } from 'vitest';
import {
  normalizeCampaignType,
  campaignLabel,
  campaignShortLabel,
  campaignDescription,
  CAMPAIGN_TYPE_ORDER,
} from '../evaluationCampaigns';

describe('evaluationCampaigns — hierarchy-lite additions', () => {
  it('normalizes manager_to_supervisors and its alias', () => {
    expect(normalizeCampaignType('manager_to_supervisors')).toBe('manager_to_supervisors');
    expect(normalizeCampaignType('manager_to_supervisor')).toBe('manager_to_supervisors');
  });

  it('normalizes the relabeled types unchanged', () => {
    expect(normalizeCampaignType('manager_to_team')).toBe('manager_to_team');
    expect(normalizeCampaignType('team_to_manager')).toBe('team_to_manager');
    expect(normalizeCampaignType('self_station')).toBe('self_station');
    expect(normalizeCampaignType('cross_station')).toBe('cross_station');
    expect(normalizeCampaignType('cross_department')).toBe('cross_department');
  });

  it('includes manager_to_supervisors in the display order', () => {
    expect(CAMPAIGN_TYPE_ORDER).toContain('manager_to_supervisors');
    // It should come after team_to_manager
    const mgrIdx = CAMPAIGN_TYPE_ORDER.indexOf('manager_to_supervisors');
    const ttmIdx = CAMPAIGN_TYPE_ORDER.indexOf('team_to_manager');
    expect(mgrIdx).toBeGreaterThan(ttmIdx);
  });

  it('returns correct EN/AR labels for manager_to_supervisors', () => {
    expect(campaignLabel('manager_to_supervisors', 'en')).toBe('Manager → Supervisors');
    expect(campaignLabel('manager_to_supervisors', 'ar')).toBe('المدير → المشرفين');
  });

  it('returns updated EN/AR labels for manager_to_team (Supervisor/Manager)', () => {
    expect(campaignLabel('manager_to_team', 'en')).toBe('Supervisor/Manager → Team');
    expect(campaignLabel('manager_to_team', 'ar')).toBe('المشرف/المدير → الفريق');
  });

  it('returns updated EN/AR labels for team_to_manager (Supervisor/Manager)', () => {
    expect(campaignLabel('team_to_manager', 'en')).toBe('Team → Supervisor/Manager');
    expect(campaignLabel('team_to_manager', 'ar')).toBe('الفريق → المشرف/المدير');
  });

  it('returns correct short labels', () => {
    expect(campaignShortLabel('manager_to_supervisors', 'en')).toBe('Manager → Supervisors');
    expect(campaignShortLabel('manager_to_supervisors', 'ar')).toBe('المدير → المشرفين');
    expect(campaignShortLabel('manager_to_team', 'en')).toBe('Supervisor/Mgr → Team');
    expect(campaignShortLabel('team_to_manager', 'ar')).toBe('الفريق للمشرف/المدير');
  });

  it('returns correct descriptions', () => {
    const descEn = campaignDescription('manager_to_supervisors', 'en');
    expect(descEn).toContain('Department managers');
    expect(descEn).toContain('unit/station supervisors');

    const descAr = campaignDescription('manager_to_supervisors', 'ar');
    expect(descAr).toContain('مدراء الأقسام');
  });
});
