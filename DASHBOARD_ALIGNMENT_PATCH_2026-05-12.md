# Dashboard Alignment Patch — Explicit Evaluation Campaigns

This patch aligns the dashboards with the new evaluation campaign model while preserving legacy history.

## Added

- Shared evaluation campaign utility helpers in `src/utils/evaluationCampaigns.ts`.
- New dashboard component: `EvaluationCampaignBreakdown`.
- New dashboard component: `UnitRollupTable`.
- Company dashboard now shows:
  - Internal / Unit score
  - Cross / Coordination score
  - Manager → Team score
  - Team → Manager score
  - Evaluation campaign type breakdown
  - Unit / Station rollup table
- Department dashboard now shows:
  - Internal / Unit score
  - Cross / Coordination score
  - Manager → Team score
  - Team → Manager score
  - Department campaign breakdown
  - Department unit/station rollup table
  - Updated employee heatmap without workload dependence
- Employee dashboard now shows:
  - Internal / Unit score
  - Cross / Coordination score
  - Manager → You score
  - Team → Manager score, applicable when the employee is a manager
  - Personal evaluation type breakdown
  - Score breakdown by evaluation type
  - Employee unit/station badge when available
- Executive dashboard overview now includes evaluation campaign type breakdown.

## Safety notes

- No legacy evaluations are deleted or mutated.
- Legacy `same` and `cross*` records remain visible as legacy categories.
- Dashboard queries use fallback selects when the org-unit columns are not available yet.
- Workload is no longer used in new dashboard score summaries because the default evaluation is now 2 scored questions only.

## Validation

- `npm run typecheck` passed.
- `npm run build` passed.
- `npm run test` passed.
- `npm run lint` passed with 0 errors and existing warnings only.
