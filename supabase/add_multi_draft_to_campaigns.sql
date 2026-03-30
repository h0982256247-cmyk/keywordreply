-- ============================================================
-- 多草稿推播支援
-- 新增 draft_ids 欄位到 broadcast_campaigns
-- 請在 Supabase Dashboard > SQL Editor 執行此 SQL
-- ============================================================

alter table public.broadcast_campaigns
  add column if not exists draft_ids uuid[] null;
