# 🔄 Vercel 重新部署指南

## 快速步驟

### 方式 1: 觸發自動部署（推薦）

1. **進行一個空提交並推送**
   ```bash
   cd "/Users/edwin/MGM OA版"
   git commit --allow-empty -m "trigger vercel redeploy"
   git push origin main
   ```

2. **等待 Vercel 自動部署**
   - Vercel 會自動偵測到新的 commit 並重新部署
   - 前往 Vercel Dashboard 查看部署進度
   - 通常需要 2-5 分鐘

### 方式 2: 手動觸發部署

1. **前往 Vercel Dashboard**
   - 登入 https://vercel.com/dashboard
   - 找到你的專案

2. **重新部署**
   - 點擊最新的 Deployment
   - 點擊右上角的 "..." 選單
   - 選擇 "Redeploy"
   - 確認 "Redeploy"

3. **等待完成**
   - 部署完成後會自動更新

---

## ✅ 驗證部署成功

部署完成後，開啟網站並按 F12 查看 Console：

**✅ 正確（新版本）：**
```
[Broadcast] 🚀 開始廣播流程（使用 Edge Function）
```

**❌ 錯誤（舊版本）：**
```
[Broadcast] 🚀 開始廣播流程（使用 RPC）
```

---

## 🐛 如果還是舊版本

清除瀏覽器緩存：
- 按 `Cmd + Shift + R` (Mac) 或 `Ctrl + Shift + R` (Windows)
- 或開啟無痕模式測試

---

## 📝 注意事項

- **本地開發 vs 線上部署**
  - `localhost:5173` = 本地開發（即時更新）
  - `*.vercel.app` = 線上部署（需要重新部署才會更新）

- **自動部署**
  - 每次 `git push` 到 `main` 分支，Vercel 都會自動重新部署
  - 確保本地代碼已提交並推送到 GitHub

---

最後更新：2024-03-03
