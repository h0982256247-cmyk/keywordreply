-- ============================================================
-- 排程推播欄位
-- 請在 Supabase Dashboard > SQL Editor 執行此 SQL
-- ============================================================

alter table public.broadcast_campaigns
  add column if not exists scheduled_at timestamptz null;
