drop extension if exists "pg_net";


  create table "public"."branding_settings" (
    "id" integer not null,
    "branding" jsonb not null default '{}'::jsonb,
    "page_overrides" jsonb not null default '{}'::jsonb,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."branding_settings" enable row level security;

CREATE UNIQUE INDEX branding_settings_pkey ON public.branding_settings USING btree (id);

alter table "public"."branding_settings" add constraint "branding_settings_pkey" PRIMARY KEY using index "branding_settings_pkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.has_permission_helper(p_user_id uuid, p_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.has_permission(p_user_id, p_permission);
$function$
;

CREATE OR REPLACE FUNCTION public.has_permission(p_user_id uuid, p_permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  up_override boolean;
  has_role_key boolean;
  has_custom_role_id boolean;
  crp_has_is_granted boolean;
begin
  if p_user_id is null then
    return false;
  end if;

  -- 1) User-specific override (allow/deny)
  if to_regclass('public.user_permissions') is not null then
    select up.is_granted into up_override
    from public.user_permissions up
    where up.user_id = p_user_id
      and up.permission = p_permission
    order by up.updated_at desc nulls last
    limit 1;

    if up_override is not null then
      return up_override;
    end if;
  end if;

  -- 2) Legacy roles via user_roles + role_permissions
  if to_regclass('public.user_roles') is not null and to_regclass('public.role_permissions') is not null then
    if exists (
      select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role = ur.role
      where ur.user_id = p_user_id
        and rp.permission = p_permission
        and coalesce(rp.is_granted, true) = true
    ) then
      return true;
    end if;
  end if;

  -- 3) Custom roles via user_custom_roles + custom_role_permissions
  if to_regclass('public.user_custom_roles') is not null and to_regclass('public.custom_role_permissions') is not null then
    select exists (
      select 1
      from information_schema.columns
      where table_schema='public' and table_name='user_custom_roles' and column_name='role_key'
    ) into has_role_key;

    select exists (
      select 1
      from information_schema.columns
      where table_schema='public' and table_name='user_custom_roles' and column_name in ('custom_role_id','custom_roles_id')
    ) into has_custom_role_id;

    select exists (
      select 1
      from information_schema.columns
      where table_schema='public' and table_name='custom_role_permissions' and column_name='is_granted'
    ) into crp_has_is_granted;

    if has_role_key then
      if crp_has_is_granted then
        if exists (
          select 1
          from public.user_custom_roles ucr
          join public.custom_role_permissions crp on crp.role_key = ucr.role_key
          where ucr.user_id = p_user_id
            and crp.permission = p_permission
            and crp.is_granted = true
        ) then
          return true;
        end if;
      else
        if exists (
          select 1
          from public.user_custom_roles ucr
          join public.custom_role_permissions crp on crp.role_key = ucr.role_key
          where ucr.user_id = p_user_id
            and crp.permission = p_permission
        ) then
          return true;
        end if;
      end if;
    elsif has_custom_role_id then
      -- Older schema variant (custom_role_id FK)
      if crp_has_is_granted then
        if exists (
          select 1
          from public.user_custom_roles ucr
          join public.custom_role_permissions crp on crp.custom_role_id = ucr.custom_role_id
          where ucr.user_id = p_user_id
            and crp.permission = p_permission
            and crp.is_granted = true
        ) then
          return true;
        end if;
      else
        if exists (
          select 1
          from public.user_custom_roles ucr
          join public.custom_role_permissions crp on crp.custom_role_id = ucr.custom_role_id
          where ucr.user_id = p_user_id
            and crp.permission = p_permission
        ) then
          return true;
        end if;
      end if;
    end if;
  end if;

  -- 4) Fallback: profiles.role can act as either a legacy role OR a custom role_key
  if to_regclass('public.profiles') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema='public'
         and table_name='profiles'
         and column_name='role'
     )
  then
    if to_regclass('public.role_permissions') is not null then
      if exists (
        select 1
        from public.profiles p
        join public.role_permissions rp on rp.role = p.role::text
        where p.id = p_user_id
          and rp.permission = p_permission
          and coalesce(rp.is_granted, true) = true
      ) then
        return true;
      end if;
    end if;

    if to_regclass('public.custom_role_permissions') is not null and exists (
      select 1
      from information_schema.columns
      where table_schema='public' and table_name='custom_role_permissions' and column_name='role_key'
    ) then
      if exists (
        select 1
        from public.profiles p
        join public.custom_role_permissions crp on crp.role_key = p.role::text
        where p.id = p_user_id
          and crp.permission = p_permission
      ) then
        return true;
      end if;
    end if;
  end if;

  return false;
end;
$function$
;

grant delete on table "public"."branding_settings" to "anon";

grant insert on table "public"."branding_settings" to "anon";

grant references on table "public"."branding_settings" to "anon";

grant select on table "public"."branding_settings" to "anon";

grant trigger on table "public"."branding_settings" to "anon";

grant truncate on table "public"."branding_settings" to "anon";

grant update on table "public"."branding_settings" to "anon";

grant delete on table "public"."branding_settings" to "authenticated";

grant insert on table "public"."branding_settings" to "authenticated";

grant references on table "public"."branding_settings" to "authenticated";

grant select on table "public"."branding_settings" to "authenticated";

grant trigger on table "public"."branding_settings" to "authenticated";

grant truncate on table "public"."branding_settings" to "authenticated";

grant update on table "public"."branding_settings" to "authenticated";

grant delete on table "public"."branding_settings" to "service_role";

grant insert on table "public"."branding_settings" to "service_role";

grant references on table "public"."branding_settings" to "service_role";

grant select on table "public"."branding_settings" to "service_role";

grant trigger on table "public"."branding_settings" to "service_role";

grant truncate on table "public"."branding_settings" to "service_role";

grant update on table "public"."branding_settings" to "service_role";


  create policy "branding_settings_read"
  on "public"."branding_settings"
  as permissive
  for select
  to public
using (true);



  create policy "branding_settings_write"
  on "public"."branding_settings"
  as permissive
  for all
  to authenticated
using (((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'admin'::public.app_role)))) OR (EXISTS ( SELECT 1
   FROM (public.user_custom_roles ucr
     JOIN public.custom_role_permissions crp ON ((crp.role_key = ucr.role_key)))
  WHERE ((ucr.user_id = auth.uid()) AND (crp.permission = 'branding.manage'::text))))))
with check (((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = 'admin'::public.app_role)))) OR (EXISTS ( SELECT 1
   FROM (public.user_custom_roles ucr
     JOIN public.custom_role_permissions crp ON ((crp.role_key = ucr.role_key)))
  WHERE ((ucr.user_id = auth.uid()) AND (crp.permission = 'branding.manage'::text))))));



  create policy "branding_admin_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (public.has_permission(auth.uid(), 'branding.manage'::text));



  create policy "branding_admin_insert 1ym05q3_0"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (public.has_permission(auth.uid(), 'branding.manage'::text));



  create policy "branding_admin_update 1ym05q3_0"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (public.has_permission(auth.uid(), 'branding.manage'::text));



  create policy "branding_admin_update 1ym05q3_1"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (public.has_permission(auth.uid(), 'branding.manage'::text));



  create policy "branding_public_read 1ym05q3_0"
  on "storage"."objects"
  as permissive
  for select
  to anon, authenticated
using (true);



