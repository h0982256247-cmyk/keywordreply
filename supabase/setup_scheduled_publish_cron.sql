-- ============================================================
-- 排程自動發布設定
-- 請在 Supabase Dashboard > SQL Editor 執行此 SQL
--
-- 步驟：
-- 1. 到 Supabase Dashboard > Settings > API
-- 2. 複製 service_role (secret) key
-- 3. 將下方 <SERVICE_ROLE_KEY> 替換為實際的 key
-- 4. 將 <PROJECT_REF> 替換為你的 project ref (例如 muxidyqytadccnwstpsw)
-- 5. 在 SQL Editor 執行
-- ============================================================

-- 啟用必要的擴充功能
create extension if not exists pg_cron;
create extension if not exists pg_net schema extensions;

-- 刪除舊的 cron job（若存在）
select cron.unschedule('process-scheduled-richmenus')
where exists (select 1 from cron.job where jobname = 'process-scheduled-richmenus');

-- 建立每分鐘執行一次的排程任務
select cron.schedule(
  'process-scheduled-richmenus',
  '* * * * *',
  $$
  select extensions.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/process-scheduled-richmenus',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 確認 cron job 已建立
select jobname, schedule, command from cron.job where jobname = 'process-scheduled-richmenus';
