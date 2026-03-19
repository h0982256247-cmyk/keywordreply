# 🔑 金鑰檢查清單

請依照順序取得以下金鑰，並填寫到相應位置。

---

## 📋 需要提供的金鑰總覽

### 1️⃣ Supabase 相關（必填）
- Supabase Access Token（CLI 部署用）
- Supabase URL：`https://krupsrweryevsevzhxjf.supabase.co`
- Supabase Anon Key（前端用）
- Supabase Service Role Key（後端用）

### 2️⃣ LINE 相關（必填）
- LINE Channel Access Token（長期）

### 3️⃣ LINE LIFF（選填）
- LIFF ID（如需分享功能）

---

## 詳細取得方式

### 🔹 Supabase Access Token（CLI 部署）
**取得位置：** https://supabase.com/dashboard/account/tokens

1. 點擊 "Generate new token"
2. 名稱：`LINE Portal Deployment`
3. 複製生成的 token

**使用方式：**
```bash
export SUPABASE_ACCESS_TOKEN='your_token_here'
```

---

### 🔹 Supabase API Keys
**取得位置：** https://supabase.com/dashboard/project/krupsrweryevsevzhxjf/settings/api

需要複製兩個金鑰：
1. **anon** `public` → 前端使用
2. **service_role** `secret` → 後端使用（⚠️ 保密）

---

### 🔹 LINE Channel Access Token
**取得位置：** LINE Developers Console

1. 前往 https://developers.line.biz/console/
2. 選擇你的 Provider 和 Channel
3. 進入 "Messaging API" 標籤
4. 找到 "Channel access token (long-lived)"
5. 點擊 "Issue" 生成

**設定到 Supabase：**
```bash
supabase secrets set LINE_CHANNEL_ACCESS_TOKEN
# 輸入你的 LINE Token
```

---

## 快速參考

### 環境變數範本（Zeabur）

```bash
VITE_SUPABASE_URL=https://krupsrweryevsevzhxjf.supabase.co
VITE_SUPABASE_ANON_KEY=【從 Supabase API Settings 複製 anon key】
SUPABASE_SERVICE_ROLE_KEY=【從 Supabase API Settings 複製 service_role key】
VITE_LIFF_ID=【選填：從 LINE LIFF 複製】
VITE_APP_URL=【部署後填寫 Zeabur 網址】
```

---

## ✅ 完成檢查

- [ ] 已取得 Supabase Access Token
- [ ] 已取得 Supabase Anon Key
- [ ] 已取得 Supabase Service Role Key
- [ ] 已取得 LINE Channel Access Token
- [ ] 已設定 LINE Token 到 Supabase Secrets
- [ ] 已在 Zeabur 設定所有環境變數

準備好後，請參考 [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) 開始部署！
