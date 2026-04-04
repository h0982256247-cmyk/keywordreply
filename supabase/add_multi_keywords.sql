-- ============================================================
-- 多關鍵字支援
-- 新增 keywords 欄位到 keyword_rules
-- 請在 Supabase Dashboard > SQL Editor 執行此 SQL
-- ============================================================

alter table public.keyword_rules
  add column if not exists keywords text[] null;
