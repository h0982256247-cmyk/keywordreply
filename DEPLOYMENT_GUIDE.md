# 🚀 LINE Portal 部署指南

完整的 0-1 部署流程，包含 Supabase 和 Zeabur 部署。

---

## 📋 事前準備

### 需要的金鑰清單

請先準備好以下金鑰（全部都可以從相關平台的 Dashboard 取得）：

#### Supabase 相關
- [ ] **Supabase Access Token** - 用於 CLI 部署
- [ ] **Supabase Project Reference ID** - 專案 ID（你的是：`krupsrweryevsevzhxjf`）
- [ ] **Supabase URL** - 專案網址（你的是：`https://krupsrweryevsevzhxjf.supabase.co`）
- [ ] **Supabase Anon Key** - 前端使用的公開金鑰
- [ ] **Supabase Service Role Key** - 後端使用的機密金鑰
- [ ] **Database Password** - 資料庫密碼

#### LINE 相關
- [ ] **LINE Channel Access Token** - LINE Messaging API 的 Token（長期）
- [ ] **LINE LIFF ID** - LINE LIFF 應用 ID（選填，如需分享功能）

#### Zeabur 相關
- [ ] Zeabur 帳號（可用 GitHub 登入）

---

## 1️⃣ Supabase 部署

### 步驟 1: 安裝 Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# 驗證安裝
supabase --version
```

### 步驟 2: 登入 Supabase CLI

```bash
# 使用 Access Token 登入
supabase login

# 或者直接設定環境變數
export SUPABASE_ACCESS_TOKEN='your_access_token_here'
```

**取得 Access Token：**
1. 前往 https://supabase.com/dashboard/account/tokens
2. 點擊 "Generate new token"
3. 輸入名稱（例如：LINE Portal Deployment）
4. 複製生成的 token

### 步驟 3: 連結到專案

```bash
# 設定專案 ID
export SUPABASE_PROJECT_ID='krupsrweryevsevzhxjf'

# 連結到遠端專案
supabase link --project-ref $SUPABASE_PROJECT_ID
```

### 步驟 4: 部署 Edge Functions

```bash
# 部署所有 Edge Functions
supabase functions deploy broadcast --no-verify-jwt
supabase functions deploy validate-token --no-verify-jwt
supabase functions deploy test-broadcast --no-verify-jwt
```

**驗證部署：**
前往 https://supabase.com/dashboard/project/krupsrweryevsevzhxjf/functions
確認三個 functions 都顯示為 "Active"

### 步驟 5: 執行資料庫設定

有兩種方式：

#### 方式 A：使用 Supabase Dashboard（推薦 ✅）

1. 前往 SQL Editor：https://supabase.com/dashboard/project/krupsrweryevsevzhxjf/sql/new
2. 依序執行以下 SQL 檔案（複製貼上並執行）：
   - `supabase/enable_http_extension.sql` - 啟用 HTTP 擴充
   - `supabase/setup.sql` - 建立資料表
   - `supabase/storage.sql` - 設定儲存空間
   - `supabase/security.sql` - 設定 RLS 安全規則

#### 方式 B：使用 CLI

```bash
# 取得資料庫密碼
# 前往：https://supabase.com/dashboard/project/krupsrweryevsevzhxjf/settings/database
# 複製 "Database password" 或重設密碼

# 設定資料庫連線
export DB_PASSWORD='your_database_password'
export DB_URL="postgresql://postgres:${DB_PASSWORD}@db.krupsrweryevsevzhxjf.supabase.co:5432/postgres"

# 執行 SQL 檔案
psql $DB_URL -f supabase/enable_http_extension.sql
psql $DB_URL -f supabase/setup.sql
psql $DB_URL -f supabase/storage.sql
psql $DB_URL -f supabase/security.sql
```

### 步驟 6: 設定 Edge Function Secrets

Edge Functions 需要存取 LINE Channel Access Token。

```bash
# 設定 LINE Token（會提示輸入）
supabase secrets set LINE_CHANNEL_ACCESS_TOKEN

# 或者直接從環境變數設定
echo "your_line_channel_access_token" | supabase secrets set LINE_CHANNEL_ACCESS_TOKEN
```

**驗證設定：**
前往 https://supabase.com/dashboard/project/krupsrweryevsevzhxjf/settings/functions
確認 "LINE_CHANNEL_ACCESS_TOKEN" 已設定

### 步驟 7: 驗證部署

執行驗證 SQL 確認所有設定正確：

```sql
-- 在 SQL Editor 執行
-- https://supabase.com/dashboard/project/krupsrweryevsevzhxjf/sql/new

-- 檢查資料表
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 檢查儲存桶
SELECT name, public
FROM storage.buckets;

-- 檢查 RLS 政策
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public';
```

預期結果：
- 資料表：`line_channels`, `flex_messages` 等
- 儲存桶：`broadcast-videos`, `broadcast-images` 等
- RLS 政策：每個資料表都應該有政策

---

## 2️⃣ Zeabur 部署

### 步驟 1: 準備環境變數

建立一個 `.env.production` 檔案（本地測試用，不要提交到 Git）：

```bash
# Supabase 設定
VITE_SUPABASE_URL=https://krupsrweryevsevzhxjf.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# LINE LIFF（選填）
VITE_LIFF_ID=your_liff_id

# 應用程式網域（部署後更新）
VITE_APP_URL=https://your-app.zeabur.app
```

**取得 Supabase Keys：**
1. 前往 https://supabase.com/dashboard/project/krupsrweryevsevzhxjf/settings/api
2. 複製 `anon` `public` key → `VITE_SUPABASE_ANON_KEY`
3. 複製 `service_role` `secret` key → `SUPABASE_SERVICE_ROLE_KEY`

### 步驟 2: 使用 GitHub 部署（推薦 ✅）

1. **推送代碼到 GitHub**

```bash
# 初始化 Git（如果尚未初始化）
git init
git add .
git commit -m "Initial commit - LINE Portal"

# 推送到 GitHub
git remote add origin https://github.com/your-username/line-portal.git
git branch -M main
git push -u origin main
```

2. **在 Zeabur 建立專案**

- 前往 https://zeabur.com/
- 登入（可用 GitHub）
- 點擊 "New Project"
- 選擇 "Deploy from GitHub"
- 選擇你的 repository

3. **設定環境變數**

在 Zeabur Dashboard：
- 點擊你的服務
- 進入 "Environment Variables"
- 添加上述所有環境變數

4. **設定建置命令（自動偵測）**

Zeabur 會自動讀取 `zeabur.json`：
```json
{
  "serviceName": "line-portal",
  "buildCommand": "npm install && npm run build",
  "startCommand": "node server.js",
  "outputDirectory": "dist"
}
```

5. **部署**

- 點擊 "Deploy"
- 等待建置完成（約 2-3 分鐘）
- 取得部署網址（例如：`https://line-portal.zeabur.app`）

6. **更新 VITE_APP_URL**

取得 Zeabur 網址後，回到環境變數更新：
```
VITE_APP_URL=https://line-portal.zeabur.app
```

然後重新部署。

### 步驟 3: 驗證部署

1. 開啟 Zeabur 提供的網址
2. 測試登入功能
3. 測試 LINE Token 設定
4. 測試建立 Flex Message
5. 測試廣播功能

---

## 3️⃣ 後續設定

### LINE LIFF 設定（如需分享功能）

1. **建立 LIFF App**
   - 前往 LINE Developers Console
   - 選擇你的 Provider
   - 進入 Messaging API Channel
   - 點擊 "LIFF" 標籤
   - 點擊 "Add"

2. **LIFF 設定**
   - Name: `LINE Portal Share`
   - Size: `Full`
   - Endpoint URL: `https://your-zeabur-url.zeabur.app/share`
   - Scope: `profile`, `openid`
   - Bot link feature: `On (Aggressive)`

3. **取得 LIFF ID**
   - 複製生成的 LIFF ID（格式：`1234567890-AbCdEfGh`）
   - 更新 Zeabur 環境變數：`VITE_LIFF_ID`

### Webhook 設定（如需接收訊息）

如果未來需要接收 LINE 訊息：

1. 前往 LINE Developers Console
2. 進入 Messaging API Settings
3. 設定 Webhook URL：`https://your-zeabur-url.zeabur.app/webhook`
4. 啟用 "Use webhook"

---

## 🔧 自動化腳本

我已經為你準備了自動化部署腳本：

### 快速部署 Supabase（一鍵執行）

```bash
# 設定環境變數
export SUPABASE_ACCESS_TOKEN='your_token'
export SUPABASE_PROJECT_ID='krupsrweryevsevzhxjf'

# 執行部署腳本
chmod +x deploy-supabase.sh
./deploy-supabase.sh
```

---

## 📊 驗證檢查清單

部署完成後，請確認：

### Supabase
- [ ] 三個 Edge Functions 都是 Active 狀態
- [ ] 資料表都已建立（line_channels, flex_messages 等）
- [ ] Storage buckets 都已建立
- [ ] RLS 政策都已啟用
- [ ] LINE_CHANNEL_ACCESS_TOKEN Secret 已設定

### Zeabur
- [ ] 網站可以正常訪問
- [ ] 登入功能正常
- [ ] 可以設定 LINE Token
- [ ] 可以建立 Flex Message
- [ ] 可以執行廣播（發送到 LINE）

### LINE
- [ ] Channel Access Token 已設定並驗證
- [ ] LIFF App 已建立（如需要）
- [ ] Webhook 已設定（如需要）

---

## 🐛 常見問題排查

### Edge Function 部署失敗
```bash
# 檢查 Supabase CLI 版本
supabase --version

# 重新登入
supabase login

# 檢查連結狀態
supabase projects list
```

### 資料庫連線失敗
- 確認密碼正確
- 檢查 IP 白名單設定（Supabase 預設允許所有）
- 確認 Database 處於 Active 狀態

### Zeabur 建置失敗
- 檢查 Node.js 版本（需要 >= 20）
- 檢查環境變數是否都已設定
- 查看建置日誌找出錯誤

### LINE Token 驗證失敗
- 確認 Token 是 Channel Access Token（長期）
- 確認 Token 有完整複製
- 確認 Channel 狀態為 Published

---

## 📞 需要協助？

如果遇到問題：
1. 查看建置日誌（Supabase Functions Logs / Zeabur Logs）
2. 檢查瀏覽器 Console 錯誤訊息
3. 確認所有環境變數都已正確設定
4. 執行驗證 SQL 確認資料庫狀態

---

## 🎉 完成！

恭喜！你的 LINE Portal 已經成功部署到生產環境。

現在你可以：
- ✅ 登入系統
- ✅ 設定 LINE Channel Token
- ✅ 建立 Flex Message 模板
- ✅ 廣播訊息給 LINE 好友
- ✅ 使用 LIFF 分享功能（如已設定）

祝使用愉快！🚀
