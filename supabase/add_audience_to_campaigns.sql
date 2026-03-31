-- ============================================================
-- 受眾推播欄位
-- 請在 Supabase Dashboard > SQL Editor 執行此 SQL
-- ============================================================

alter table public.broadcast_campaigns
  add column if not exists audience_group_id text null,
  add column if not exists audience_group_name text null,
  add column if not exists narrowcast_request_id text null;
