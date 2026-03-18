# 🗄️ SQL 執行流程指南

**專案：** LINE Portal
**Supabase 專案：** https://krupsrweryevsevzhxjf.supabase.co

---

## 📋 執行順序（必須按照順序）

### 步驟 1: 啟用 HTTP Extension ⭐ 最重要！
**文件：** `supabase/enable_http_extension.sql`
**必須最先執行**

```sql
-- 啟用 HTTP extension for Token 驗證
CREATE EXTENSION IF NOT EXISTS http SCHEMA extensions;

-- 驗證 extension 已啟用
SELECT * FROM pg_extension WHERE extname = 'http';

-- 測試 http 函數是否可用
SELECT exists(
  SELECT 1
  FROM pg_proc
  WHERE proname = 'http_get'
) AS http_functions_available;
```

**為什麼重要？**
- `rm_validate_line_token` RPC 函數需要用到 `http` extension
- 必須先啟用才能創建使用它的函數

---

### 步驟 2: 建立資料表和 RPC 函數
**文件：** `supabase/setup.sql`

**包含：**
- ✅ 資料表：`rm_line_channels`（LINE Token 儲存）
- ✅ 資料表：`docs`, `doc_versions`（Flex Message 草稿）
- ✅ 資料表：`shares`（分享連結）
- ✅ 資料表：`templates`（Flex Message 範本）
- ✅ RPC 函數：`rm_validate_line_token`（驗證 Token）⭐ 新增
- ✅ RPC 函數：`get_line_token`（取得加密 Token）
- ✅ RPC 函數：`rm_channel_upsert`（儲存 Channel）
- ✅ RPC 函數：`get_channel_status`（檢查狀態）

**執行方式：**
1. 打開文件 `supabase/setup.sql`
2. 全選複製所有內容（Cmd+A, Cmd+C）
3. 到 SQL Editor 貼上並執行

---

### 步驟 3: 設定 Storage Buckets
**文件：** `supabase/storage.sql`

**包含：**
- ✅ Bucket：`broadcast-videos`（廣播影片）
- ✅ Bucket：`broadcast-images`（廣播圖片）
- ✅ Storage 存取政策

**執行方式：**
1. 打開文件 `supabase/storage.sql`
2. 全選複製所有內容
3. 到 SQL Editor 貼上並執行

---

### 步驟 4: 設定 Row Level Security (RLS)
**文件：** `supabase/security.sql`

**包含：**
- ✅ RLS 政策：確保用戶只能存取自己的資料
- ✅ 安全限制：前端無法讀取 `access_token_encrypted`

**執行方式：**
1. 打開文件 `supabase/security.sql`
2. 全選複製所有內容
3. 到 SQL Editor 貼上並執行

---

## 🖥️ 在 Supabase Dashboard 執行

### 1. 前往 SQL Editor
👉 https://supabase.com/dashboard/project/krupsrweryevsevzhxjf/sql/new

### 2. 依序執行 SQL 文件

```
第 1 步：enable_http_extension.sql  ⭐ 最重要
   ↓
第 2 步：setup.sql
   ↓
第 3 步：storage.sql
   ↓
第 4 步：security.sql
   ↓
完成！ ✅
```

### 3. 執行每個文件的步驟

1. **在本地打開 SQL 文件**
   ```bash
   # 使用你的編輯器打開
   code supabase/enable_http_extension.sql
   ```

2. **複製全部內容**
   - 全選：`Cmd + A` (Mac) 或 `Ctrl + A` (Windows)
   - 複製：`Cmd + C` (Mac) 或 `Ctrl + C` (Windows)

3. **到 Supabase SQL Editor**
   - 貼上：`Cmd + V` (Mac) 或 `Ctrl + V` (Windows)
   - 點擊右下角的 **"Run"** 按鈕（或按 `Cmd + Enter`）

4. **確認執行成功**
   - 看到綠色的 "Success" 訊息
   - 沒有紅色的錯誤訊息

5. **重複步驟** 1-4 執行下一個 SQL 文件

---

## ✅ 驗證執行結果

執行完畢後，在 SQL Editor 執行以下 SQL 驗證：

```sql
-- 1. 檢查 HTTP Extension
SELECT * FROM pg_extension WHERE extname = 'http';
-- 應該有一筆資料

-- 2. 檢查資料表
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
-- 應該看到：rm_line_channels, docs, doc_versions, shares, templates

-- 3. 檢查 RPC 函數
SELECT proname
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname LIKE 'rm_%' OR proname LIKE 'get_%'
ORDER BY proname;
-- 應該看到：rm_validate_line_token, get_line_token, rm_channel_upsert, get_channel_status

-- 4. 檢查 Storage Buckets
SELECT name, public
FROM storage.buckets;
-- 應該看到：broadcast-videos, broadcast-images

-- 5. 檢查 RLS 政策
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
-- 每個資料表都應該有 RLS 政策
```

---

## ⚠️ 常見問題

### Q1: HTTP Extension 啟用失敗
**錯誤：** `extension "http" is not available`

**解決方法：**
1. 確認你的 Supabase 專案支援 Extensions
2. 聯繫 Supabase 支援啟用 http extension
3. 或者在 Dashboard → Database → Extensions 中手動啟用

### Q2: RPC 函數創建失敗
**錯誤：** `function extensions.http does not exist`

**原因：** 沒有先執行 `enable_http_extension.sql`

**解決方法：**
1. 先執行 `enable_http_extension.sql`
2. 再重新執行 `setup.sql`

### Q3: Storage Bucket 已存在
**錯誤：** `bucket "broadcast-videos" already exists`

**解決方法：**
這是正常的，表示之前已經創建過。可以忽略此錯誤。

### Q4: RLS 政策衝突
**錯誤：** `policy "xxx" already exists`

**解決方法：**
SQL 文件中已經包含 `DROP POLICY IF EXISTS`，如果還是出現錯誤，可以：
1. 手動刪除舊的政策
2. 或者修改政策名稱

---

## 📝 執行檢查清單

執行前確認：
- [ ] 已登入 Supabase Dashboard
- [ ] 已進入正確的專案（krupsrweryevsevzhxjf）
- [ ] 已開啟 SQL Editor

執行步驟：
- [ ] ✅ 步驟 1：執行 `enable_http_extension.sql`
- [ ] ✅ 步驟 2：執行 `setup.sql`
- [ ] ✅ 步驟 3：執行 `storage.sql`
- [ ] ✅ 步驟 4：執行 `security.sql`

執行後驗證：
- [ ] HTTP Extension 已啟用
- [ ] 所有資料表已建立
- [ ] 所有 RPC 函數已建立
- [ ] Storage Buckets 已建立
- [ ] RLS 政策已設定

---

## 🎯 下一步

SQL 執行完成後：
1. ✅ 部署 Edge Function（使用 `./deploy-supabase.sh`）
2. ✅ 設定 LINE Token Secret
3. ✅ 部署前端到 Zeabur
4. ✅ 測試完整流程

---

需要協助？查看 [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) 或聯繫支援。

**最後更新：** 2024-03-03
