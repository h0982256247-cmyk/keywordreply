-- ============================================================
-- 關鍵字多草稿觸發支援
-- 新增 draft_ids 欄位到 keyword_rules
-- 請在 Supabase Dashboard > SQL Editor 執行此 SQL
-- ============================================================

alter table public.keyword_rules
  add column if not exists draft_ids uuid[] null;
