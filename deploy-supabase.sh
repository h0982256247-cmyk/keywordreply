#!/bin/bash

# LINE Portal - Supabase 一鍵部署腳本
# 自動部署 Edge Functions 到 Supabase

set -e  # 遇到錯誤立即停止

echo "🚀 LINE Portal - Supabase 部署腳本"
echo "=================================="
echo ""

# 顏色定義
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 預設專案 ID
DEFAULT_PROJECT_ID="krupsrweryevsevzhxjf"

# 檢查是否安裝 Supabase CLI
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Supabase CLI 未安裝${NC}"
    echo ""
    echo "請執行以下命令安裝："
    echo "  ${BLUE}brew install supabase/tap/supabase${NC}"
    echo ""
    echo "或參考：https://supabase.com/docs/guides/cli"
    exit 1
fi

echo -e "${GREEN}✅ Supabase CLI 已安裝${NC}"
echo ""

# 檢查環境變數
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
    echo -e "${YELLOW}⚠️  未設定 SUPABASE_ACCESS_TOKEN${NC}"
    echo ""
    echo "請先設定 Supabase Access Token："
    echo "  ${BLUE}export SUPABASE_ACCESS_TOKEN='your_token_here'${NC}"
    echo ""
    echo "取得 Token："
    echo "  👉 https://supabase.com/dashboard/account/tokens"
    echo ""
    exit 1
fi

# 使用預設專案 ID 或環境變數
PROJECT_ID="${SUPABASE_PROJECT_ID:-$DEFAULT_PROJECT_ID}"

echo -e "${GREEN}✅ 環境變數已設定${NC}"
echo "  Project ID: ${BLUE}$PROJECT_ID${NC}"
echo "  Project URL: ${BLUE}https://$PROJECT_ID.supabase.co${NC}"
echo ""

# 連結到遠端專案
echo -e "${BLUE}📡 連結到 Supabase 專案...${NC}"
supabase link --project-ref "$PROJECT_ID"

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ 連結專案失敗${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 已連結到專案${NC}"
echo ""

# 部署 Edge Functions
echo -e "${BLUE}🔧 部署 Edge Functions...${NC}"
echo ""

# 部署 broadcast function
echo -e "${BLUE}  📤 部署 broadcast function...${NC}"
supabase functions deploy broadcast --no-verify-jwt
echo -e "${GREEN}     ✓ broadcast 部署完成${NC}"

echo ""
echo -e "${GREEN}✅ Edge Function 部署完成！${NC}"
echo ""

# 設定 Edge Function Secrets
echo -e "${BLUE}🔐 設定 Edge Function Secrets...${NC}"
echo ""

if [ -z "$LINE_CHANNEL_ACCESS_TOKEN" ]; then
    echo -e "${YELLOW}⚠️  未設定 LINE_CHANNEL_ACCESS_TOKEN${NC}"
    echo ""
    echo "請執行以下命令設定 LINE Token："
    echo "  ${BLUE}supabase secrets set LINE_CHANNEL_ACCESS_TOKEN${NC}"
    echo ""
    echo "或手動在 Dashboard 設定："
    echo "  👉 https://supabase.com/dashboard/project/$PROJECT_ID/settings/functions"
    echo ""
else
    echo -e "${BLUE}  🔑 設定 LINE_CHANNEL_ACCESS_TOKEN...${NC}"
    echo "$LINE_CHANNEL_ACCESS_TOKEN" | supabase secrets set LINE_CHANNEL_ACCESS_TOKEN
    echo -e "${GREEN}     ✓ LINE Token 設定完成${NC}"
    echo ""
fi

echo ""
echo -e "${GREEN}🎉 Supabase 部署完成！${NC}"
echo ""
echo "=================================="
echo "📝 下一步："
echo ""
echo "1️⃣  ${YELLOW}設定資料庫${NC}"
echo "   前往 SQL Editor 依序執行："
echo "   👉 https://supabase.com/dashboard/project/$PROJECT_ID/sql/new"
echo "   - supabase/enable_http_extension.sql"
echo "   - supabase/setup.sql"
echo "   - supabase/storage.sql"
echo "   - supabase/security.sql"
echo ""
echo "2️⃣  ${YELLOW}驗證部署${NC}"
echo "   檢查 Edge Functions 狀態："
echo "   👉 https://supabase.com/dashboard/project/$PROJECT_ID/functions"
echo ""
echo "3️⃣  ${YELLOW}部署到 Zeabur${NC}"
echo "   參考：QUICK_DEPLOY.md"
echo ""
echo "=================================="
