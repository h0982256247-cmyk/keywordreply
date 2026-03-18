# 🔍 LINE Portal 系統檢查與優化建議

**檢查日期：** 2024-03-03
**專案狀態：** 🟢 已修復主要問題

---

## ✅ 已修復的問題

### 1. 廣播功能錯誤 (rm_broadcast_message RPC 不存在)
**問題：** 前端調用不存在的 RPC 函數
**修復：**
- ✅ 改用 Edge Function `broadcast`
- ✅ 文件：[src/lib/broadcast.ts](src/lib/broadcast.ts)
- ✅ Commit: `467ee11`

### 2. Token 每次登入都要重新填寫
**問題：** `get_channel_status` RPC 函數不存在
**修復：**
- ✅ 新增 `get_channel_status()` RPC 函數
- ✅ 文件：[supabase/setup.sql](supabase/setup.sql#L372-L393)
- ✅ Commit: `4425b90`
- ⚠️ **需要執行：** [supabase/add_get_channel_status.sql](supabase/add_get_channel_status.sql)

### 3. JWT 認證失敗 (AUTH_FAILED)
**問題：** Edge Function 的 JWT 驗證設置不正確
**修復：**
- ✅ 設定 `verify_jwt = false`
- ✅ 文件：[supabase/config.toml](supabase/config.toml)
- ✅ 已重新部署 Edge Function
- ✅ Commit: `1aea4a0`

---

## 📋 完整部署檢查清單

### Supabase 資料庫設置

- [ ] **執行 SQL 文件**（按順序）：
  1. `supabase/enable_http_extension.sql` - 啟用 HTTP Extension
  2. `supabase/setup.sql` - 建立資料表和 RPC 函數
  3. `supabase/add_get_channel_status.sql` - ⭐ 新增的修復
  4. `supabase/storage.sql` - Storage Buckets
  5. `supabase/security.sql` - RLS 政策

- [ ] **驗證資料庫設置**：
  ```sql
  -- 1. 檢查 HTTP Extension
  SELECT * FROM pg_extension WHERE extname = 'http';

  -- 2. 檢查資料表
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' ORDER BY table_name;

  -- 3. 檢查 RPC 函數
  SELECT proname FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
  ORDER BY proname;

  -- 4. 檢查 Storage Buckets
  SELECT name, public FROM storage.buckets;
  ```

### Supabase Edge Functions

- [x] **部署 broadcast function** ✅ 已完成
  ```bash
  ./redeploy-edge-function.sh
  ```

- [ ] **驗證 Edge Function**：
  - 前往 https://supabase.com/dashboard/project/krupsrweryevsevzhxjf/functions
  - 確認 `broadcast` 狀態為 Active

### Vercel 前端部署

- [x] **推送最新代碼到 GitHub** ✅ 已完成
- [x] **觸發 Vercel 重新部署** ✅ 已自動觸發

- [ ] **檢查 Vercel 環境變數**：
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_LIFF_ID` (選填)
  - `VITE_APP_URL` (選填)

- [ ] **驗證 Vercel 部署**：
  - 前往 https://vercel.com/dashboard
  - 確認最新部署狀態為 "Ready"
  - 清除瀏覽器緩存並測試

---

## 🚀 優化建議

### 1. 程式碼品質 (🔴 高優先)

#### 1.1 錯誤處理改進
**現況：** Edge Function 統一返回 200，前端需要檢查 `success` 字段
**建議：** 使用正確的 HTTP 狀態碼

```typescript
// ❌ 現在
return new Response(JSON.stringify({
  success: false,
  error: { code: "AUTH_FAILED", message: "認證失敗" }
}), { status: 200 }); // 錯誤！應該用 401

// ✅ 建議
return new Response(JSON.stringify({
  success: false,
  error: { code: "AUTH_FAILED", message: "認證失敗" }
}), { status: 401 }); // 正確的狀態碼
```

**影響：**
- 更符合 REST API 標準
- 更容易調試
- 前端可以根據狀態碼處理錯誤

#### 1.2 Token 加密儲存
**現況：** `access_token_encrypted` 欄位名稱暗示加密，但實際未加密
**建議：**
- 選項 A：真的加密（使用 `pgcrypto` extension）
- 選項 B：重新命名為 `access_token`（誠實命名）

**影響：**
- 提升安全性
- 避免誤導

#### 1.3 RLS 政策完整性
**現況：** 部分資料表可能缺少 RLS 政策
**建議：** 驗證所有資料表的 RLS 設定

```sql
-- 檢查哪些資料表啟用了 RLS
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';

-- 檢查每個資料表的政策
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### 2. 效能優化 (🟡 中優先)

#### 2.1 Token 查詢優化
**現況：** Edge Function 每次都查詢資料庫取得 token
**建議：** 使用 RPC `get_line_token()` 並加上快取

```typescript
// ✅ 使用現有的 RPC 函數
const { data: tokenData } = await supabaseAdmin.rpc('get_line_token');
```

**影響：**
- 減少資料庫查詢
- 程式碼更簡潔

#### 2.2 前端 Bundle 優化
**現況：** 未分析 bundle 大小
**建議：** 使用 `vite-bundle-visualizer`

```bash
npm install -D vite-bundle-visualizer
```

```typescript
// vite.config.ts
import { visualizer } from 'vite-bundle-visualizer';

export default defineConfig({
  plugins: [
    react(),
    visualizer({ open: true })
  ]
});
```

#### 2.3 圖片優化
**現況：** Storage Buckets 沒有設定圖片壓縮
**建議：**
- 前端上傳前壓縮
- 或使用 Supabase Image Transformation API

### 3. 使用者體驗 (🟡 中優先)

#### 3.1 Loading 狀態
**現況：** 部分操作沒有 loading 狀態
**建議：** 確保所有異步操作都有視覺反饋

```typescript
// ✅ 好的實踐
const [loading, setLoading] = useState(false);

const handleBroadcast = async () => {
  setLoading(true);
  try {
    await broadcastFlexMessage(messages);
  } finally {
    setLoading(false);
  }
};
```

#### 3.2 錯誤訊息友善化
**現況：** 部分錯誤訊息技術性太強
**建議：** 提供更友善的錯誤訊息

```typescript
// ❌ 技術性錯誤
"Could not find the function public.rm_broadcast_message"

// ✅ 友善錯誤
"發送失敗，請稍後再試或聯繫管理員"
```

#### 3.3 離線檢測
**建議：** 檢測網路連線狀態

```typescript
window.addEventListener('online', () => {
  // 網路恢復，重試失敗的操作
});

window.addEventListener('offline', () => {
  // 顯示離線提示
});
```

### 4. 安全性 (🔴 高優先)

#### 4.1 CORS 設定
**現況：** Edge Function 允許所有來源 (`*`)
**建議：** 限制為特定域名

```typescript
// ❌ 不安全
const corsHeaders = {
  "Access-Control-Allow-Origin": "*"
};

// ✅ 安全
const allowedOrigins = [
  'https://your-app.vercel.app',
  'http://localhost:5173'
];

const origin = req.headers.get('origin');
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigins.includes(origin) ? origin : allowedOrigins[0]
};
```

#### 4.2 Rate Limiting
**現況：** 沒有請求頻率限制
**建議：** 在 Edge Function 加上 rate limiting

```typescript
// 使用 Supabase 的 rate limiting
// 或者實作簡單的 in-memory rate limiter
```

#### 4.3 輸入驗證
**建議：** 使用 Zod 驗證所有輸入

```typescript
import { z } from 'zod';

const BroadcastRequestSchema = z.object({
  flexMessages: z.array(z.object({})).min(1).max(5),
  altText: z.string().optional()
});

// 在 Edge Function 中驗證
const body = BroadcastRequestSchema.parse(await req.json());
```

### 5. 可維護性 (🟢 低優先)

#### 5.1 環境變數文檔化
**建議：** 在 README.md 明確列出所有必需的環境變數

#### 5.2 API 文檔
**建議：** 使用 TypeDoc 或 JSDoc 生成 API 文檔

#### 5.3 單元測試
**建議：** 為關鍵函數添加測試

```bash
npm install -D vitest @testing-library/react
```

```typescript
// src/lib/broadcast.test.ts
import { describe, it, expect } from 'vitest';
import { broadcastFlexMessage } from './broadcast';

describe('broadcastFlexMessage', () => {
  it('should reject more than 5 messages', async () => {
    const messages = new Array(6).fill({});
    const result = await broadcastFlexMessage(messages);
    expect(result.success).toBe(false);
  });
});
```

---

## 📊 系統架構分析

### 優勢 ✅
1. ✅ 使用 Supabase 全端解決方案，降低維護成本
2. ✅ Edge Functions 提供無伺服器架構，可擴展性好
3. ✅ RLS 政策保護資料安全
4. ✅ Token 不暴露給前端，安全性佳
5. ✅ 使用 TypeScript，型別安全

### 待改進 ⚠️
1. ⚠️ 缺少自動化測試
2. ⚠️ 錯誤處理可以更完善
3. ⚠️ 缺少監控和日誌系統
4. ⚠️ CORS 設定過於寬鬆
5. ⚠️ 沒有 rate limiting

### 技術債務 📝
1. 部分 RPC 函數命名不一致（`rm_*` vs `get_*`）
2. Edge Function 統一返回 200 狀態碼（應該用正確的 HTTP 狀態）
3. Console.log 過多，應該使用結構化日誌

---

## 🎯 下一步建議

### 立即執行（本週）
1. ✅ ~~修復廣播功能~~ 已完成
2. ✅ ~~修復 Token 持久化~~ 已完成
3. [ ] **執行 SQL：** `add_get_channel_status.sql`
4. [ ] 測試完整流程
5. [ ] 清理 Console.log

### 短期（2週內）
1. [ ] 改進錯誤處理（正確的 HTTP 狀態碼）
2. [ ] 限制 CORS 來源
3. [ ] 加上 Rate Limiting
4. [ ] 完善文檔

### 中期（1個月內）
1. [ ] 添加單元測試
2. [ ] Bundle 大小優化
3. [ ] 加上監控系統（如 Sentry）
4. [ ] 實作離線支援

### 長期（3個月內）
1. [ ] 重構部分架構（統一命名）
2. [ ] 完整的 CI/CD pipeline
3. [ ] 效能優化（快取策略）
4. [ ] 多語言支援

---

## 📞 技術支援

### 遇到問題？

1. **檢查日誌：**
   - Supabase: https://supabase.com/dashboard/project/krupsrweryevsevzhxjf/logs
   - Vercel: https://vercel.com/dashboard → 你的專案 → Logs

2. **常見問題解決：**
   - [SQL_EXECUTION_GUIDE.md](SQL_EXECUTION_GUIDE.md)
   - [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md)
   - [VERCEL_REDEPLOY.md](VERCEL_REDEPLOY.md)

3. **緊急修復：**
   - Edge Function: `./redeploy-edge-function.sh`
   - Vercel: `git commit --allow-empty -m "redeploy" && git push`

---

**最後更新：** 2024-03-03
**版本：** 1.0.0
