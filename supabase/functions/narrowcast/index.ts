import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: object) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ success: false, error: { code: "UNAUTHORIZED", message: "請先登入" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await createClient(supabaseUrl, supabaseAnonKey).auth.getUser(jwt);
    if (userError || !user) {
      return jsonResponse({ success: false, error: { code: "AUTH_FAILED", message: "認證失敗" } });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: channelData, error: tokenError } = await admin
      .from("rm_line_channels")
      .select("access_token_encrypted")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (tokenError || !channelData?.access_token_encrypted) {
      return jsonResponse({ success: false, error: { code: "TOKEN_NOT_FOUND", message: "LINE Token 未設定，請先綁定 LINE Channel" } });
    }

    const body = await req.json();
    const { campaignId, audienceGroupId, audienceGroupName, messages } = body;

    if (!messages?.length) {
      return jsonResponse({ success: false, error: { code: "INVALID_REQUEST", message: "沒有提供訊息內容" } });
    }
    if (messages.length > 5) {
      return jsonResponse({ success: false, error: { code: "TOO_MANY_MESSAGES", message: "LINE 限制一次最多 5 則訊息" } });
    }
    if (!audienceGroupId) {
      return jsonResponse({ success: false, error: { code: "INVALID_REQUEST", message: "請選擇受眾清單" } });
    }

    // Call LINE narrowcast API
    const lineRes = await fetch("https://api.line.me/v2/bot/message/narrowcast", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${channelData.access_token_encrypted}`,
      },
      body: JSON.stringify({
        messages,
        recipient: { type: "audienceGroup", audienceGroupId: Number(audienceGroupId) },
      }),
    });

    if (!lineRes.ok) {
      const errText = await lineRes.text();
      const code = lineRes.status === 401 ? "INVALID_LINE_TOKEN"
        : lineRes.status === 403 ? "LINE_API_FORBIDDEN"
        : lineRes.status === 429 ? "RATE_LIMIT_EXCEEDED"
        : "LINE_API_ERROR";
      const msg = lineRes.status === 401 ? "LINE Token 無效或已過期"
        : lineRes.status === 403 ? "沒有權限執行此操作（請確認受眾人數 ≥ 50）"
        : lineRes.status === 429 ? "發送頻率過高，請稍後再試"
        : "LINE API 呼叫失敗";
      console.error("[narrowcast] LINE error:", lineRes.status, errText);
      return jsonResponse({ success: false, error: { code, message: msg, details: { status: lineRes.status, body: errText } } });
    }

    const requestId = lineRes.headers.get("X-Line-Request-Id") ?? "";

    // Update campaign record
    if (campaignId) {
      await admin.from("broadcast_campaigns").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        audience_group_id: String(audienceGroupId),
        audience_group_name: audienceGroupName ?? null,
        narrowcast_request_id: requestId || null,
      }).eq("id", campaignId).eq("user_id", user.id);
    }

    return jsonResponse({ success: true, data: { requestId, sentAt: new Date().toISOString() } });
  } catch (e: unknown) {
    console.error("[narrowcast] Unexpected error:", e);
    return jsonResponse({ success: false, error: { code: "UNEXPECTED_ERROR", message: "伺服器錯誤" } });
  }
});
