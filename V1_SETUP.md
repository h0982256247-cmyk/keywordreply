# LINE Reply SaaS V1 0-1 部署步驟

## 1. Supabase 建置
1. 建立一個新的 Supabase Project。
2. 進入 SQL Editor，先執行 `supabase/setup.sql`。
3. 如果你的專案原本已經有舊版本資料表，再補跑 `supabase/add_get_channel_status.sql`。
4. 進入 Edge Functions：
   - 部署 `supabase/functions/broadcast`
   - 部署 `supabase/functions/line-webhook`
5. 在 Edge Functions Secrets 設定：
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
6. 確認 Authentication 已開啟 Email/Password。

## 2. Vercel 建置
1. 將此專案推到 GitHub。
2. 在 Vercel 匯入該 repo。
3. Build Command：`npm run build`
4. Output Directory：`dist`
5. Node 版本建議 20。
6. 在 Vercel Environment Variables 設定：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_APP_URL` = 你的 Vercel 網址
   - `VITE_LIFF_ID`（若分享頁需要）
7. 重新部署。

## 3. 系統初次操作流程
1. 打開 Vercel 網址，登入。
2. 第一次登入會先到 LINE 綁定頁：
   - Channel Name
   - Channel ID
   - Channel Secret
   - Channel Access Token
3. 儲存後進入主系統。
4. 左側功能列共有三個：
   - 建立草稿
   - 新增推播文章
   - 關鍵字設定

## 4. 建立草稿
1. 進入「建立草稿」。
2. 使用原本保留的 Bubble / Carousel / Video Bubble 編輯頁建立內容。
3. 儲存後，這份草稿可被推播與關鍵字規則共用。

## 5. 推播發送
1. 進入「新增推播文章」。
2. 輸入推播名稱。
3. 選一份已完成的草稿。
4. 建立後按「立即推播」。
5. 系統會呼叫 Supabase Edge Function `broadcast` 發送到 LINE OA。

## 6. 關鍵字自動回覆
1. 進入「關鍵字設定」。
2. 建立一條規則。
3. 可選：
   - 純文字
   - 連動草稿
4. 儲存後，把 `Settings` 頁顯示的 Webhook URL 貼到 LINE Developers。
5. 在 LINE Developers 開啟 Webhook。
6. 使用者傳入關鍵字後，就會由 `line-webhook` 自動用 Reply API 回覆。

## 7. LINE Developers 設定
1. Messaging API Channel > Messaging API。
2. Webhook URL 貼上：`https://<your-project-ref>.supabase.co/functions/v1/line-webhook`
3. 開啟 Use webhook。
4. 驗證通過後即可使用關鍵字回覆。

## 8. 驗收方式
- 建立一份草稿。
- 在推播頁能選取該草稿並成功發送。
- 在關鍵字頁建立 `優惠` 規則並綁定該草稿。
- 手機對 OA 傳 `優惠`，應收到對應 Reply 訊息。


## 補充（完整版）
- `broadcast_campaigns` 會記錄 `include_quick_reply` 預設值。
- `line_webhook_logs` 會記錄 webhook 命中 / 發送失敗資訊，方便除錯。
- `rm_line_channels` 已改成只允許透過 RPC 與 Edge Function 存取敏感 token，不建議從前端直接查表。
