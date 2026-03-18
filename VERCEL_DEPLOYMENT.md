# 🚀 Vercel 部署指南

**專案：** LINE Portal
**GitHub：** https://github.com/h0982256247-cmyk/MGMLINEOA
**Supabase：** https://krupsrweryevsevzhxjf.supabase.co

---

## 📋 部署步驟

### 步驟 1: 連接 GitHub Repository 到 Vercel

1. **前往 Vercel Dashboard**
   👉 https://vercel.com/dashboard

2. **點擊 "Add New Project"**
   - 或直接訪問：https://vercel.com/new

3. **匯入 GitHub Repository**
   - 選擇 `h0982256247-cmyk/MGMLINEOA`
   - 點擊 "Import"

4. **配置專案設定**
   - **Project Name:** `line-portal`（或你想要的名稱）
   - **Framework Preset:** Vite
   - **Root Directory:** `./`（使用根目錄）

---

### 步驟 2: 設定環境變數 ⭐ 重要

在 Vercel 專案設定中，前往 **Settings → Environment Variables**，新增以下變數：

#### 必填環境變數

```bash
# Supabase 配置
VITE_SUPABASE_URL=https://krupsrweryevsevzhxjf.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtydXBzcndlcnlldnNldnpoeGpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMTEyMjgsImV4cCI6MjA4NTc4NzIyOH0.-zA0-1R6DLv67q6LFWCzksHZzcZbdSUqxUTa8BjAAbA
```

#### 選填環境變數（如果需要 LIFF 功能）

```bash
# LINE LIFF 配置（可選）
VITE_LIFF_ID=your-liff-id-here

# 應用程式 URL（部署後設定）
VITE_APP_URL=https://your-app.vercel.app
```

**設定方式：**
1. 在 Environment Variables 頁面點擊 "Add New"
2. **Name:** 輸入變數名稱（例如 `VITE_SUPABASE_URL`）
3. **Value:** 貼上對應的值
4. **Environment:** 選擇 `Production`, `Preview`, `Development`（全選）
5. 點擊 "Save"
6. 重複步驟 1-5 完成所有環境變數

---

### 步驟 3: 建置設定

Vercel 通常會自動偵測 Vite 專案，但你可以確認以下設定：

**Build & Development Settings:**
- **Framework Preset:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Install Command:** `npm install`

**Node.js Version:**
- 確認使用 `20.x` 或更高版本（專案要求 Node >= 20）

---

### 步驟 4: 部署

1. **點擊 "Deploy" 按鈕**
   - Vercel 會開始建置和部署

2. **等待部署完成**
   - 通常需要 2-5 分鐘
   - 可以在 "Deployments" 頁面查看建置日誌

3. **取得部署 URL**
   - 部署成功後，會得到一個 URL：`https://your-project.vercel.app`

---

## ✅ 部署後驗證

### 1. 檢查環境變數是否正確載入

打開部署的網站，按 `F12` 開啟開發者工具，在 Console 應該看到：

```
[Supabase Client Init] 🔧 初始化 Supabase Client...
[Supabase Client Init] 📍 URL: https://krupsrweryevsevzhxjf.supabase.co
[Supabase Client Init] 🔑 Anon Key (前 50 字元): eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJz...
```

❌ **如果看到錯誤訊息：**
```
Supabase 環境變數未設定！請檢查 .env 文件
```
→ 表示環境變數設定錯誤，請檢查步驟 2

### 2. 測試登入功能

1. 前往部署的網站
2. 嘗試登入或註冊
3. 如果成功登入且沒有錯誤，表示 Supabase 連接正常

### 3. 測試 LINE Token 設定

1. 登入後，應該會看到 LINE Token 設定頁面
2. 輸入 LINE Channel Access Token
3. 點擊驗證，應該能成功驗證並進入草稿列表

---

## 🔄 更新部署

### 方式 1: 自動部署（推薦）

Vercel 預設會自動監聽 GitHub Repository：
- 每次 `git push` 到 `main` 分支 → 自動部署到 Production
- Push 到其他分支 → 自動建立 Preview 部署

### 方式 2: 手動重新部署

1. 前往 Vercel Dashboard → Deployments
2. 選擇最新的部署
3. 點擊 "Redeploy"

---

## ⚙️ 進階設定

### 設定自訂網域

1. 前往 **Settings → Domains**
2. 點擊 "Add Domain"
3. 輸入你的網域（例如：`line-portal.example.com`）
4. 按照指示設定 DNS 記錄

### 設定 CORS（如果需要）

如果前端和 Supabase 有 CORS 問題，在 Supabase Dashboard 設定：
1. 前往 **Settings → API**
2. 在 "CORS" 區域新增你的 Vercel URL

---

## 🐛 常見問題

### Q1: 部署成功但顯示空白頁面

**原因：** 環境變數未正確設定

**解決方法：**
1. 檢查環境變數名稱是否正確（必須有 `VITE_` 前綴）
2. 重新部署（Settings → Deployments → Redeploy）

### Q2: Supabase 連接失敗

**錯誤訊息：** `Failed to fetch` 或 `Network error`

**解決方法：**
1. 確認 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY` 正確
2. 檢查 Supabase 專案是否啟用
3. 檢查瀏覽器 Console 的詳細錯誤訊息

### Q3: 環境變數更新後沒有生效

**解決方法：**
1. 更新環境變數後必須**重新部署**
2. 前往 Deployments → 選擇最新部署 → Redeploy

### Q4: Build 失敗

**常見錯誤：**
- `Module not found`: 檢查 package.json 中的依賴是否完整
- `TypeScript error`: 檢查型別錯誤

**解決方法：**
1. 查看 Build Logs 找到具體錯誤
2. 確認本地 `npm run build` 能成功執行
3. 確認 Node.js 版本符合要求（>= 20）

---

## 📝 環境變數設定檢查清單

部署前確認：
- [ ] ✅ `VITE_SUPABASE_URL` 已設定
- [ ] ✅ `VITE_SUPABASE_ANON_KEY` 已設定
- [ ] ✅ 所有環境變數都選擇了 Production, Preview, Development
- [ ] ✅ 環境變數名稱有 `VITE_` 前綴

部署後驗證：
- [ ] ✅ 網站能正常訪問
- [ ] ✅ Console 沒有 Supabase 環境變數錯誤
- [ ] ✅ 能成功登入/註冊
- [ ] ✅ LINE Token 驗證功能正常

---

## 🎯 下一步

部署完成後：
1. ✅ 測試完整的使用者流程
2. ✅ 設定自訂網域（可選）
3. ✅ 設定 LIFF ID（如果需要分享功能）
4. ✅ 更新 `VITE_APP_URL` 為正式的 Vercel URL

---

## 📞 需要協助？

- **Vercel 文檔：** https://vercel.com/docs
- **Vite 部署指南：** https://vitejs.dev/guide/static-deploy.html
- **Supabase 文檔：** https://supabase.com/docs

**最後更新：** 2024-03-03
