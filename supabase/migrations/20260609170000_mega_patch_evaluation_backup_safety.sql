-- Mega Patch: evaluation campaign preview safety, backup health cleanup, and org unit code protection.
-- This migration is additive/safe: it does not touch completed evaluations.

-- 1) Normalize known OUTPATIENT spelling in org units/stations.
update public.org_units
set name_en = regexp_replace(name_en, 'OUT\s*PAI?TIENT|OUTPAITENT', 'OUTPATIENT', 'gi'),
    updated_at = now()
where name_en ~* 'OUT\s*PAI?TIENT|OUTPAITENT';

-- 2) Clean legacy fallback questions so old workload/comment questions do not appear again.
-- Template-based default evaluations remain the source of truth; this only hardens fallback data.
update public.evaluation_questions
set is_active = false,
    updated_at = now()
where is_active = true
  and (
    lower(coalesce(category, '')) = 'workload'
    or lower(coalesce(answer_type, '')) = 'text'
    or coalesce(text_en, '') ilike '%comment%'
    or coalesce(text_ar, '') ilike '%تعليق%'
  );

update public.evaluation_questions
set is_active = true,
    updated_at = now()
where lower(coalesce(text_en, '')) in ('quality of work', 'communication & coordination')
  and lower(coalesce(answer_type, '')) in ('choices', 'scale');

-- 3) Normalize unit/station codes by trimming + uppercase before unique protection.
update public.org_units
set code = nullif(upper(trim(regexp_replace(coalesce(code, ''), '\s+', ' ', 'g'))), ''),
    updated_at = now()
where code is not null;

-- 4) If active duplicates exist before this migration, keep the earliest created one unchanged
-- and suffix later active duplicate codes to let the unique index be created without data loss.
with ranked as (
  select
    id,
    code,
    row_number() over (
      partition by department_id, lower(trim(code))
      order by created_at nulls last, id
    ) as rn
  from public.org_units
  where is_active = true
    and code is not null
    and trim(code) <> ''
)
update public.org_units u
set code = concat(r.code, '-DUP-', r.rn),
    updated_at = now()
from ranked r
where u.id = r.id
  and r.rn > 1;

-- 5) Database protection: one active unit/station code per department.
create unique index if not exists uq_org_units_department_code_active
on public.org_units (department_id, lower(trim(code)))
where is_active = true and code is not null and trim(code) <> '';

comment on index public.uq_org_units_department_code_active is
'Prevents duplicate active unit/station codes inside the same department. Inactive historical duplicates are allowed for audit/cleanup.';
