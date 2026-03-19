-- Patch for LINE Rich Menu Editor
-- 補齊 publish jobs / version history / 基本索引 / RLS

create extension if not exists pgcrypto;

-- rm_publish_jobs
create table if not exists public.rm_publish_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  draft_id uuid null references public.rm_drafts(id) on delete set null,
  status text not null default 'publishing',
  current_step text,
  progress jsonb not null default '[]'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rm_publish_jobs enable row level security;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rm_publish_jobs' AND policyname='Users can view their own publish jobs') THEN
    CREATE POLICY "Users can view their own publish jobs" ON public.rm_publish_jobs FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rm_publish_jobs' AND policyname='Users can insert their own publish jobs') THEN
    CREATE POLICY "Users can insert their own publish jobs" ON public.rm_publish_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rm_publish_jobs' AND policyname='Users can update their own publish jobs') THEN
    CREATE POLICY "Users can update their own publish jobs" ON public.rm_publish_jobs FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rm_publish_jobs' AND policyname='Users can delete their own publish jobs') THEN
    CREATE POLICY "Users can delete their own publish jobs" ON public.rm_publish_jobs FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

create index if not exists idx_rm_publish_jobs_user_id on public.rm_publish_jobs(user_id);
create index if not exists idx_rm_publish_jobs_draft_id on public.rm_publish_jobs(draft_id);
create index if not exists idx_rm_publish_jobs_status on public.rm_publish_jobs(status);

-- rm_rich_menu_versions
create table if not exists public.rm_rich_menu_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  draft_id uuid null references public.rm_drafts(id) on delete set null,
  job_id uuid null references public.rm_publish_jobs(id) on delete set null,
  alias_id text not null,
  rich_menu_id text not null,
  menu_name text not null,
  is_main boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.rm_rich_menu_versions enable row level security;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rm_rich_menu_versions' AND policyname='Users can view their own rich menu versions') THEN
    CREATE POLICY "Users can view their own rich menu versions" ON public.rm_rich_menu_versions FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rm_rich_menu_versions' AND policyname='Users can insert their own rich menu versions') THEN
    CREATE POLICY "Users can insert their own rich menu versions" ON public.rm_rich_menu_versions FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rm_rich_menu_versions' AND policyname='Users can update their own rich menu versions') THEN
    CREATE POLICY "Users can update their own rich menu versions" ON public.rm_rich_menu_versions FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rm_rich_menu_versions' AND policyname='Users can delete their own rich menu versions') THEN
    CREATE POLICY "Users can delete their own rich menu versions" ON public.rm_rich_menu_versions FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

create index if not exists idx_rm_rich_menu_versions_user_id on public.rm_rich_menu_versions(user_id);
create index if not exists idx_rm_rich_menu_versions_draft_id on public.rm_rich_menu_versions(draft_id);
create index if not exists idx_rm_rich_menu_versions_job_id on public.rm_rich_menu_versions(job_id);
create index if not exists idx_rm_rich_menu_versions_alias_id on public.rm_rich_menu_versions(alias_id);

-- updated_at trigger helper
create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_rm_publish_jobs_updated_at'
  ) THEN
    CREATE TRIGGER set_rm_publish_jobs_updated_at
    BEFORE UPDATE ON public.rm_publish_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.set_current_timestamp_updated_at();
  END IF;
END $$;
