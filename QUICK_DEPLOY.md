# 🚀 快速部署指南

**專案：** LINE Portal (Flex Message 編輯器)
**Supabase 專案：** https://krupsrweryevsevzhxjf.supabase.co

---

## ✅ 已完成的清理

### 已刪除的文件：
- ✅ 舊文檔：`ARCHITECTURE_REVIEW.md`, `DEPLOYMENT.md`, `MIGRATION_PLAN.md`, `QUICK_START_IMPROVEMENTS.md`
- ✅ 舊代碼：`src/pages/PreviewDraft_old.tsx`
- ✅ 調試 SQL：`debug_token_issue.sql`, `quick_diagnosis.sql`, `drop_all.sql`, `secure_line_token_migration.sql`, `secure_token_access.sql`
- ✅ 測試 Edge Function：`supabase/functions/test-broadcast/`
- ✅ Rich Menu 相關所有文件和代碼

---

## 🔑 需要的金鑰（請先準備）

### 1. Supabase Access Token
**取得：** https://supabase.com/dashboard/account/tokens
**用途：** CLI 部署 Edge Functions

### 2. Supabase API Keys
**取得：** https://supabase.com/dashboard/project/krupsrweryevsevzhxjf/settings/api

需要兩個：
- `anon` `public` → 前端用（`VITE_SUPABASE_ANON_KEY`）
- `service_role` `secret` → 後端用（`SUPABASE_SERVICE_ROLE_KEY`）

### 3. LINE Channel Access Token
**取得：** LINE Developers Console → Messaging API → Channel access token (long-lived)
**用途：** 發送 LINE 訊息

---

## 📋 部署步驟（三步驟完成）

### 步驟 1: 部署 Supabase Edge Functions

```bash
# 1. 設定環境變數
export SUPABASE_ACCESS_TOKEN='你的_access_token'
export SUPABASE_PROJECT_ID='krupsrweryevsevzhxjf'

# 2. 連結專案
supabase link --project-ref $SUPABASE_PROJECT_ID

# 3. 部署 Edge Functions
supabase functions deploy broadcast --no-verify-jwt
supabase functions deploy validate-token --no-verify-jwt

# 4. 設定 LINE Token Secret
supabase secrets set LINE_CHANNEL_ACCESS_TOKEN
# 輸入你的 LINE Channel Access Token
```

### 步驟 2: 設定資料庫

**使用 Supabase Dashboard（推薦）：**

1. 前往：https://supabase.com/dashboard/project/krupsrweryevsevzhxjf/sql/new
2. 依序執行以下 SQL 文件（複製內容並執行）：
   - `supabase/enable_http_extension.sql`
   - `supabase/setup.sql`
   - `supabase/storage.sql`
   - `supabase/security.sql`

### 步驟 3: 部署到 Zeabur

**方法：GitHub 自動部署（推薦）**

1. 推送到 GitHub：
```bash
git add .
git commit -m "Ready for deployment"
git push origin main
```

2. 在 Zeabur：
   - 新建專案 → Deploy from GitHub
   - 選擇你的 repository
   - 設定環境變數（見下方）

3. **Zeabur 環境變數：**
```bash
VITE_SUPABASE_URL=https://krupsrweryevsevzhxjf.supabase.co
VITE_SUPABASE_ANON_KEY=【從 Supabase API Settings 複製】
SUPABASE_SERVICE_ROLE_KEY=【從 Supabase API Settings 複製】
VITE_LIFF_ID=【選填】
VITE_APP_URL=【部署後填寫你的 Zeabur 網址】
```

4. 部署完成後，取得 Zeabur 網址，回到環境變數更新 `VITE_APP_URL` 並重新部署

---

## ✅ 驗證部署

### Supabase 檢查：
- [ ] Edge Functions 狀態：https://supabase.com/dashboard/project/krupsrweryevsevzhxjf/functions
- [ ] 資料表已建立：https://supabase.com/dashboard/project/krupsrweryevsevzhxjf/editor
- [ ] Storage buckets 已建立

### Zeabur 檢查：
- [ ] 網站可以訪問
- [ ] 可以登入系統
- [ ] 可以設定 LINE Token
- [ ] 可以建立 Flex Message
- [ ] 可以執行廣播

---

## 📚 詳細文檔

- **完整部署指南：** [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
- **金鑰清單：** [KEYS_CHECKLIST.md](./KEYS_CHECKLIST.md)
- **故障排除：** [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

---

## 🎯 現在開始

1. ✅ **準備金鑰**（參考上方清單）
2. ✅ **部署 Supabase**（執行步驟 1 和 2）
3. ✅ **部署 Zeabur**（執行步驟 3）
4. ✅ **測試功能**

**預計時間：** 30-45 分鐘

---

## 💡 小提示

- Supabase CLI 安裝：`brew install supabase/tap/supabase`
- 如果 Edge Function 部署失敗，檢查 Access Token 是否正確
- 建議先在 Supabase Dashboard 手動測試 SQL，確認沒問題後再用 CLI
- Zeabur 環境變數設定錯誤會導致前端無法連接，請仔細核對

---

需要協助？查看 [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) 獲取詳細步驟和故障排除！
