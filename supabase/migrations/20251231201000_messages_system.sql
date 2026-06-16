-- Messages system
-- 1) Admin & SuperUser can send broadcast messages to all / departments / roles / specific users
-- 2) All users can send a message to admins with optional full anonymity

begin;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  message_type text not null check (message_type in ('broadcast', 'to_admin')),
  title text not null,
  body text not null,
  sender_id uuid null references auth.users(id) on delete set null,
  sender_anonymous boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.message_recipients (
  message_id uuid not null references public.messages(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  read_at timestamptz null,
  primary key (message_id, recipient_id)
);

alter table public.messages enable row level security;
alter table public.message_recipients enable row level security;

-- Helpers
create or replace function public.is_admin_or_superuser()
returns boolean
language sql
stable
as $$
  select public.has_role(auth.uid(), 'admin'::public.app_role)
      or public.has_role(auth.uid(), 'super_user'::public.app_role);
$$;

-- RPC: broadcast message
create or replace function public.send_broadcast_message(
  p_title text,
  p_body text,
  p_department_ids uuid[] default null,
  p_roles public.app_role[] default null,
  p_user_ids uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender uuid;
  v_message_id uuid;
begin
  v_sender := auth.uid();
  if v_sender is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_admin_or_superuser() then
    raise exception 'Not allowed';
  end if;

  insert into public.messages(message_type, title, body, sender_id, sender_anonymous)
  values ('broadcast', p_title, p_body, v_sender, false)
  returning id into v_message_id;

  -- Resolve recipients
  if p_user_ids is not null and array_length(p_user_ids, 1) is not null then
    insert into public.message_recipients(message_id, recipient_id)
    select v_message_id, u
    from unnest(p_user_ids) u;
  else
    insert into public.message_recipients(message_id, recipient_id)
    select distinct v_message_id, p.id
    from public.profiles p
    left join public.user_roles ur on ur.user_id = p.id
    where coalesce(p.is_active, true) = true
      and (
        p_department_ids is null
        or array_length(p_department_ids, 1) is null
        or p.department_id = any(p_department_ids)
      )
      and (
        p_roles is null
        or array_length(p_roles, 1) is null
        or ur.role = any(p_roles)
      );
  end if;

  return v_message_id;
end;
$$;

-- RPC: message to admin (optional anonymous)
create or replace function public.send_message_to_admin(
  p_title text,
  p_body text,
  p_anonymous boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender uuid;
  v_message_id uuid;
begin
  v_sender := auth.uid();
  if v_sender is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.messages(message_type, title, body, sender_id, sender_anonymous)
  values (
    'to_admin',
    p_title,
    p_body,
    case when p_anonymous then null else v_sender end,
    coalesce(p_anonymous, false)
  )
  returning id into v_message_id;

  -- Deliver to all admins
  insert into public.message_recipients(message_id, recipient_id)
  select v_message_id, ur.user_id
  from public.user_roles ur
  where ur.role = 'admin'::public.app_role;

  return v_message_id;
end;
$$;

-- Policies

-- Recipients can read their recipient rows; admins/superusers can read all (for audit/troubleshooting)
drop policy if exists "read_message_recipients" on public.message_recipients;
create policy "read_message_recipients" on public.message_recipients
for select
using (
  recipient_id = auth.uid()
  or public.is_admin_or_superuser()
);

drop policy if exists "update_own_read_at" on public.message_recipients;
create policy "update_own_read_at" on public.message_recipients
for update
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

-- Messages visibility:
-- - visible to recipient
-- - visible to sender
-- - admin/superuser can view all
drop policy if exists "read_messages" on public.messages;
create policy "read_messages" on public.messages
for select
using (
  public.is_admin_or_superuser()
  or sender_id = auth.uid()
  or exists (
    select 1 from public.message_recipients mr
    where mr.message_id = messages.id
      and mr.recipient_id = auth.uid()
  )
);

-- Only via RPCs (security definer). Prevent direct inserts by clients.
drop policy if exists "insert_messages" on public.messages;
create policy "insert_messages" on public.messages
for insert
with check (false);

drop policy if exists "insert_message_recipients" on public.message_recipients;
create policy "insert_message_recipients" on public.message_recipients
for insert
with check (false);

-- Grants for RPCs
grant execute on function public.send_broadcast_message(text,text,uuid[],public.app_role[],uuid[]) to authenticated;
grant execute on function public.send_message_to_admin(text,text,boolean) to authenticated;
grant execute on function public.is_admin_or_superuser() to authenticated;

commit;
