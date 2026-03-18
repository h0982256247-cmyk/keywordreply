-- =========================================
-- LINE Portal - DB Setup
-- Tables: rm_line_channels, rm_folders, rm_drafts,
--         docs, doc_versions, shares, templates,
--         broadcast_campaigns, keyword_rules, line_webhook_logs
-- =========================================

create extension if not exists pgcrypto;

-- helper: updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================
-- 1) LINE Channels
-- =========================================
create table if not exists public.rm_line_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My LINE Channel',
  access_token_encrypted text not null,
  channel_id text,
  channel_secret text,
  bot_user_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

-- add bot_user_id if upgrading from older schema
alter table public.rm_line_channels add column if not exists bot_user_id text;

create unique index if not exists rm_line_channels_channel_id_idx on public.rm_line_channels(channel_id) where channel_id is not null;

drop trigger if exists trg_rm_line_channels_updated_at on public.rm_line_channels;
create trigger trg_rm_line_channels_updated_at
before update on public.rm_line_channels
for each row execute function public.set_updated_at();

alter table public.rm_line_channels enable row level security;
revoke all on public.rm_line_channels from anon, authenticated;

drop policy if exists rm_line_channels_select_own on public.rm_line_channels;
create policy rm_line_channels_select_own on public.rm_line_channels for select using (auth.uid() = user_id);

drop policy if exists rm_line_channels_insert_own on public.rm_line_channels;
create policy rm_line_channels_insert_own on public.rm_line_channels for insert with check (auth.uid() = user_id);

drop policy if exists rm_line_channels_update_own on public.rm_line_channels;
create policy rm_line_channels_update_own on public.rm_line_channels for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists rm_line_channels_delete_own on public.rm_line_channels;
create policy rm_line_channels_delete_own on public.rm_line_channels for delete using (auth.uid() = user_id);

-- RPC: upsert channel
create or replace function public.rm_channel_upsert(
  p_name text,
  p_access_token text,
  p_channel_id text default null,
  p_channel_secret text default null,
  p_bot_user_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.rm_line_channels where user_id = auth.uid();
  if v_id is null then
    insert into public.rm_line_channels (user_id, name, access_token_encrypted, channel_id, channel_secret, bot_user_id, is_active)
    values (auth.uid(), coalesce(p_name,'My LINE Channel'), p_access_token, p_channel_id, p_channel_secret, p_bot_user_id, true)
    returning id into v_id;
  else
    update public.rm_line_channels
      set name = coalesce(p_name, name),
          access_token_encrypted = p_access_token,
          channel_id = coalesce(p_channel_id, channel_id),
          channel_secret = coalesce(p_channel_secret, channel_secret),
          bot_user_id = coalesce(p_bot_user_id, bot_user_id),
          is_active = true,
          updated_at = now()
    where id = v_id;
  end if;
  return v_id;
end;
$$;

grant execute on function public.rm_channel_upsert(text,text,text,text,text) to authenticated;

-- RPC: get_channel_status (non-sensitive info for frontend)
drop function if exists public.get_channel_status();
create or replace function public.get_channel_status()
returns table(has_channel boolean, name text, updated_at timestamptz, channel_id text, channel_secret_masked text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select true, c.name, c.updated_at, c.channel_id,
         case when c.channel_secret is not null then '••••••••' else null end
  from public.rm_line_channels c
  where c.user_id = auth.uid()
  limit 1;
end;
$$;

grant execute on function public.get_channel_status() to authenticated;

-- RPC: get_line_token (for Edge Functions via service_role)
create or replace function public.get_line_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  select access_token_encrypted into v_token
  from public.rm_line_channels
  where user_id = auth.uid()
  order by updated_at desc
  limit 1;
  return v_token;
end;
$$;

revoke all on function get_line_token() from public;
grant execute on function get_line_token() to authenticated;

-- RPC: get_channel_secret (service_role only, for Edge Functions)
create or replace function public.get_channel_secret(p_user_id uuid)
returns table(channel_id text, channel_secret text, access_token text)
language sql
security definer
set search_path = public
as $$
  select c.channel_id, c.channel_secret, c.access_token_encrypted
  from public.rm_line_channels c
  where c.user_id = p_user_id and c.is_active = true
  limit 1;
$$;

revoke all on function public.get_channel_secret(uuid) from public;
grant execute on function public.get_channel_secret(uuid) to service_role;

-- RPC: rm_validate_line_token (calls LINE /v2/bot/info via pg_net http extension)
create or replace function public.rm_validate_line_token(p_access_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_response extensions.http_response;
  v_status_code integer;
  v_body jsonb;
begin
  if p_access_token is null or length(trim(p_access_token)) = 0 then
    return jsonb_build_object('success', false, 'error', jsonb_build_object('code', 'INVALID_REQUEST', 'message', '缺少 accessToken 參數'));
  end if;

  select * into v_response
  from extensions.http((
    'GET',
    'https://api.line.me/v2/bot/info',
    array[extensions.http_header('Authorization', 'Bearer ' || p_access_token)],
    null,
    null
  )::extensions.http_request);

  v_status_code := v_response.status;

  if v_status_code <> 200 then
    return jsonb_build_object(
      'success', false,
      'error', jsonb_build_object(
        'code', case when v_status_code = 401 then 'INVALID_LINE_TOKEN' else 'INVALID_TOKEN' end,
        'message', case when v_status_code = 401 then 'LINE Token 無效或已過期' else '無效的 Token' end,
        'details', jsonb_build_object('status', v_status_code)
      )
    );
  end if;

  begin
    v_body := v_response.content::jsonb;
  exception when others then
    return jsonb_build_object('success', false, 'error', jsonb_build_object('code', 'PARSE_ERROR', 'message', '無法解析 LINE API 回應'));
  end;

  return jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'valid', true,
      'botName', coalesce(v_body->>'displayName', v_body->>'basicId'),
      'basicId', v_body->>'basicId',
      'botUserId', v_body->>'userId'
    )
  );
end;
$$;

grant execute on function public.rm_validate_line_token(text) to authenticated;

-- =========================================
-- 2) Rich Menu: folders / drafts
-- =========================================
create table if not exists public.rm_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '新資料夾',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_rm_folders_updated_at on public.rm_folders;
create trigger trg_rm_folders_updated_at
before update on public.rm_folders
for each row execute function public.set_updated_at();

alter table public.rm_folders enable row level security;

drop policy if exists rm_folders_all_own on public.rm_folders;
create policy rm_folders_all_own on public.rm_folders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.rm_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '未命名專案',
  data jsonb not null default '{"menus":[]}'::jsonb,
  status text not null default 'draft',
  scheduled_at timestamptz null,
  folder_id uuid null references public.rm_folders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_rm_drafts_updated_at on public.rm_drafts;
create trigger trg_rm_drafts_updated_at
before update on public.rm_drafts
for each row execute function public.set_updated_at();

alter table public.rm_drafts enable row level security;

drop policy if exists rm_drafts_all_own on public.rm_drafts;
create policy rm_drafts_all_own on public.rm_drafts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =========================================
-- 3) Flex Message: docs / versions / shares
-- =========================================
create table if not exists public.docs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('bubble','carousel','folder')),
  title text not null default 'Untitled',
  content jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','previewable','publishable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists docs_owner_idx on public.docs(owner_id);
create index if not exists docs_updated_idx on public.docs(updated_at desc);

drop trigger if exists trg_docs_updated_at on public.docs;
create trigger trg_docs_updated_at
before update on public.docs
for each row execute function public.set_updated_at();

alter table public.docs enable row level security;

drop policy if exists docs_select_own on public.docs;
create policy docs_select_own on public.docs for select using (auth.uid() = owner_id);

drop policy if exists docs_insert_own on public.docs;
create policy docs_insert_own on public.docs for insert with check (auth.uid() = owner_id);

drop policy if exists docs_update_own on public.docs;
create policy docs_update_own on public.docs for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists docs_delete_own on public.docs;
create policy docs_delete_own on public.docs for delete using (auth.uid() = owner_id);

create table if not exists public.doc_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  doc_id uuid not null references public.docs(id) on delete cascade,
  version_no int not null,
  flex_json jsonb not null,
  validation_report jsonb not null,
  created_at timestamptz not null default now()
);

create unique index if not exists doc_versions_unique on public.doc_versions(doc_id, version_no);
create index if not exists doc_versions_owner_idx on public.doc_versions(owner_id);

alter table public.doc_versions enable row level security;

drop policy if exists doc_versions_select_own on public.doc_versions;
create policy doc_versions_select_own on public.doc_versions for select using (auth.uid() = owner_id);

drop policy if exists doc_versions_insert_own on public.doc_versions;
create policy doc_versions_insert_own on public.doc_versions for insert with check (auth.uid() = owner_id);

drop policy if exists doc_versions_delete_own on public.doc_versions;
create policy doc_versions_delete_own on public.doc_versions for delete using (auth.uid() = owner_id);

create table if not exists public.shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  doc_id uuid not null references public.docs(id) on delete cascade,
  version_id uuid not null references public.doc_versions(id) on delete cascade,
  token text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists shares_doc_idx on public.shares(doc_id);
create index if not exists shares_active_idx on public.shares(is_active);

alter table public.shares enable row level security;

drop policy if exists shares_select_own on public.shares;
create policy shares_select_own on public.shares for select using (auth.uid() = owner_id);

drop policy if exists shares_insert_own on public.shares;
create policy shares_insert_own on public.shares for insert with check (auth.uid() = owner_id);

drop policy if exists shares_update_own on public.shares;
create policy shares_update_own on public.shares for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists shares_delete_own on public.shares;
create policy shares_delete_own on public.shares for delete using (auth.uid() = owner_id);

-- Harden: anon cannot directly query these tables
revoke all on table public.docs from anon;
revoke all on table public.doc_versions from anon;
revoke all on table public.shares from anon;

-- RPC: get_share (anon can read via function, for share page)
create or replace function public.get_share(p_token text)
returns table (token text, version_no int, flex_json jsonb, doc_model jsonb)
language sql
security definer
set search_path = public
as $$
  select s.token, v.version_no, v.flex_json, d.content as doc_model
  from public.shares s
  join public.doc_versions v on v.id = s.version_id
  join public.docs d on d.id = s.doc_id
  where s.token = p_token and s.is_active = true
  limit 1;
$$;

grant execute on function public.get_share(text) to anon, authenticated;

-- RPC: get_active_token
create or replace function public.get_active_token(p_doc_id uuid)
returns text
language sql
security definer
set search_path = public
as $$
  select token
  from public.shares
  where doc_id = p_doc_id and is_active = true
  order by created_at desc
  limit 1;
$$;

grant execute on function public.get_active_token(uuid) to anon, authenticated;

-- =========================================
-- 4) Templates
-- =========================================
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid null references auth.users(id) on delete set null,
  is_public boolean not null default false,
  name text not null,
  description text null,
  doc_model jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_templates_updated_at on public.templates;
create trigger trg_templates_updated_at
before update on public.templates
for each row execute function public.set_updated_at();

create index if not exists templates_owner_idx on public.templates(owner_id);
create index if not exists templates_public_idx on public.templates(is_public);

alter table public.templates enable row level security;

drop policy if exists templates_select_public_or_own on public.templates;
create policy templates_select_public_or_own on public.templates for select using (is_public = true or auth.uid() = owner_id);

drop policy if exists templates_insert_own on public.templates;
create policy templates_insert_own on public.templates for insert with check (auth.uid() = owner_id);

drop policy if exists templates_update_own on public.templates;
create policy templates_update_own on public.templates for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists templates_delete_own on public.templates;
create policy templates_delete_own on public.templates for delete using (auth.uid() = owner_id);

-- =========================================
-- 5) Broadcast Campaigns
-- =========================================
create table if not exists public.broadcast_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  draft_id uuid not null references public.docs(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','sent','failed')),
  include_quick_reply boolean not null default true,
  sent_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists broadcast_campaigns_user_idx on public.broadcast_campaigns(user_id, updated_at desc);

drop trigger if exists trg_broadcast_campaigns_updated_at on public.broadcast_campaigns;
create trigger trg_broadcast_campaigns_updated_at before update on public.broadcast_campaigns for each row execute function public.set_updated_at();

alter table public.broadcast_campaigns enable row level security;

drop policy if exists broadcast_campaigns_all_own on public.broadcast_campaigns;
create policy broadcast_campaigns_all_own on public.broadcast_campaigns for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =========================================
-- 6) Keyword Rules
-- =========================================
create table if not exists public.keyword_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  keyword text not null,
  match_type text not null default 'exact' check (match_type in ('exact','contains')),
  priority int not null default 100,
  reply_mode text not null default 'draft' check (reply_mode in ('text','draft')),
  reply_text text null,
  draft_id uuid null references public.docs(id) on delete set null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint keyword_rules_exact_unique unique nulls not distinct (user_id, keyword, match_type)
);

create index if not exists keyword_rules_user_idx on public.keyword_rules(user_id, priority, updated_at desc);

drop trigger if exists trg_keyword_rules_updated_at on public.keyword_rules;
create trigger trg_keyword_rules_updated_at before update on public.keyword_rules for each row execute function public.set_updated_at();

alter table public.keyword_rules enable row level security;

drop policy if exists keyword_rules_all_own on public.keyword_rules;
create policy keyword_rules_all_own on public.keyword_rules for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =========================================
-- 7) LINE Webhook Logs
-- =========================================
create table if not exists public.line_webhook_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  channel_id text null,
  event_type text null,
  keyword text null,
  rule_id uuid null references public.keyword_rules(id) on delete set null,
  success boolean not null default true,
  request_body jsonb null,
  response_body jsonb null,
  error_message text null,
  created_at timestamptz not null default now()
);

create index if not exists line_webhook_logs_user_idx on public.line_webhook_logs(user_id, created_at desc);

alter table public.line_webhook_logs enable row level security;
revoke all on public.line_webhook_logs from anon;
grant select on public.line_webhook_logs to authenticated;

drop policy if exists line_webhook_logs_select_own on public.line_webhook_logs;
create policy line_webhook_logs_select_own on public.line_webhook_logs for select using (auth.uid() = user_id);
