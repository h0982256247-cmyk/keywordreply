# 🏗️ LINE Portal 架構說明

## 系統架構概覽

```
┌─────────────────────────────────────────────────────────────┐
│                         前端 (React)                         │
│  - Vite + React + TypeScript                                │
│  - TailwindCSS                                              │
│  - React Router                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Supabase (Backend)                        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  PostgreSQL Database                                  │  │
│  │  - rm_line_channels (加密的 Token 儲存)              │  │
│  │  - docs / doc_versions (Flex Message 草稿)           │  │
│  │  - shares (分享連結)                                  │  │
│  │  - templates (Flex Message 範本)                     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Edge Functions                                       │  │
│  │  - broadcast: 發送 Flex Message 給 LINE 好友         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  PostgreSQL RPC Functions                            │  │
│  │  - rm_validate_line_token: 驗證 LINE Token          │  │
│  │  - get_line_token: 取得加密的 Token (Edge 用)       │  │
│  │  - rm_channel_upsert: 儲存 LINE Channel             │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Storage Buckets                                      │  │
│  │  - broadcast-videos: 廣播影片                        │  │
│  │  - broadcast-images: 廣播圖片                        │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │   LINE Messaging  │
                    │       API         │
                    └──────────────────┘
```

---

## 核心功能

### 1. **Flex Message 編輯器**
- 視覺化建立 Flex Message 模板
- 即時預覽（模擬 LINE 聊天室）
- 支援影片、圖片、按鈕等元素
- 雲端儲存草稿

### 2. **LINE OA 廣播**
- 一鍵發送 Flex Message 給所有 LINE 好友
- 使用 Supabase Edge Function 確保安全
- LINE Token 加密儲存在資料庫

### 3. **LIFF 分享功能**
- 生成分享連結
- 支援在 LINE 內開啟
- 分享次數統計

---

## 安全設計

### Token 管理
```
用戶設定 Token
     │
     ▼
前端發送到 Supabase
     │
     ▼
rm_channel_upsert RPC
     │
     ▼
加密儲存在 PostgreSQL
(access_token_encrypted)
     │
     ▼
Edge Function 需要時
透過 get_line_token() 取得
```

**關鍵安全特性：**
- ✅ Token 加密儲存（使用 PostgreSQL `pgcrypto`）
- ✅ 前端永遠無法讀取 Token（RLS 政策保護）
- ✅ 只有 Edge Functions 能透過 `security definer` RPC 取得
- ✅ 每個用戶只能存取自己的 Channel

### Row Level Security (RLS)
所有資料表都啟用 RLS，確保：
- 用戶只能看到自己的資料
- 前端無法直接操作敏感資料
- 所有操作都需要認證

---

## Edge Functions vs RPC

### Edge Function: `broadcast`
**用途：** 發送 Flex Message 到 LINE
**原因使用 Edge Function：**
- 需要調用外部 LINE API
- 需要處理大量資料（Flex Message JSON）
- 獨立的運行環境，不影響資料庫效能

### RPC: `rm_validate_line_token`
**用途：** 驗證 LINE Token 是否有效
**原因使用 RPC：**
- 簡單的 HTTP 請求（使用 `http` extension）
- 在資料庫層驗證，更安全
- 不需要額外的 Edge Function 資源

### RPC: `get_line_token`
**用途：** 供 Edge Functions 取得加密的 Token
**原因使用 RPC：**
- `security definer` 確保只有授權的函數能存取
- 避免 Token 暴露給前端

---

## 資料流程

### 使用者登入流程
```
1. 用戶輸入 Email/密碼
2. Supabase Auth 驗證
3. 檢查是否有 LINE Token (hasChannel RPC)
4. 如果沒有 Token → 顯示 Token 設定頁面
5. 如果有 Token → 導向草稿列表 (/drafts)
```

### LINE Token 設定流程
```
1. 用戶輸入 Channel Name 和 Access Token
2. 前端調用 rm_validate_line_token RPC 驗證
3. 驗證成功後調用 rm_channel_upsert RPC 儲存
4. Token 加密儲存在 rm_line_channels 表
5. 導向草稿列表
```

### Flex Message 廣播流程
```
1. 用戶在前端編輯 Flex Message
2. 點擊「發送廣播」
3. 前端調用 broadcast Edge Function
4. Edge Function 透過 get_line_token() 取得 Token
5. Edge Function 調用 LINE Messaging API
6. 訊息發送給所有好友
```

---

## 部署架構

### 前端部署 (Zeabur)
- Node.js 20+ 環境
- 自動從 GitHub 部署
- 環境變數透過 Zeabur Dashboard 設定

### 後端部署 (Supabase)
- PostgreSQL Database (自動管理)
- Edge Functions (Deno 環境)
- Storage Buckets (自動管理)

---

## 技術棧總覽

### 前端
- **框架：** React 18 + TypeScript
- **建置工具：** Vite
- **樣式：** TailwindCSS
- **路由：** React Router v6
- **狀態管理：** React Hooks (useState, useEffect)

### 後端
- **資料庫：** PostgreSQL (Supabase)
- **認證：** Supabase Auth
- **儲存：** Supabase Storage
- **無伺服器函數：** Supabase Edge Functions (Deno)
- **RPC：** PostgreSQL Functions (PL/pgSQL)

### 外部 API
- **LINE Messaging API：** 發送訊息、驗證 Token
- **LINE LIFF：** 分享功能（選用）

---

## 為什麼這樣設計？

### 為什麼用 RPC 而不是 Edge Function 驗證 Token？
1. **效能：** 簡單的 HTTP 請求不需要 Edge Function 的開銷
2. **成本：** Edge Functions 有調用次數限制
3. **安全：** 在資料庫層處理，Token 不經過多個系統

### 為什麼 Token 要加密儲存？
1. **法規遵從：** 敏感資料應加密儲存
2. **防止洩漏：** 即使資料庫被攻破，Token 也無法直接使用
3. **最小權限原則：** 前端永遠不應該能讀取 Token

### 為什麼移除 Rich Menu 功能？
1. **簡化架構：** 專注於核心的 Flex Message 功能
2. **降低複雜度：** 減少維護成本
3. **用戶體驗：** Token 設定後直接進入主要功能

---

## 未來擴展

可能的功能擴展：
- 📊 訊息發送統計
- 👥 用戶分群管理
- 📅 定時發送
- 🎨 更多 Flex Message 範本
- 📱 Webhook 接收訊息

---

最後更新：2024-03-03
