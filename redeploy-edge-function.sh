#!/bin/bash

# 快速重新部署 broadcast Edge Function

set -e

echo "🚀 重新部署 broadcast Edge Function..."
echo ""

# 檢查 SUPABASE_ACCESS_TOKEN
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
    echo "❌ 未設定 SUPABASE_ACCESS_TOKEN"
    echo ""
    echo "請先設定："
    echo "  export SUPABASE_ACCESS_TOKEN='your_token_here'"
    echo ""
    exit 1
fi

# 專案 ID
PROJECT_ID="krupsrweryevsevzhxjf"

# 連結專案
echo "📡 連結到 Supabase 專案..."
supabase link --project-ref "$PROJECT_ID"

# 部署 Edge Function
echo ""
echo "🔧 部署 broadcast function..."
supabase functions deploy broadcast --no-verify-jwt

echo ""
echo "✅ 部署完成！"
echo ""
echo "📝 驗證部署："
echo "   前往 https://supabase.com/dashboard/project/$PROJECT_ID/functions"
echo ""
