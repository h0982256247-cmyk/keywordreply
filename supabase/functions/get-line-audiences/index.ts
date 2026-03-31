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
      return jsonResponse({ success: false, error: { code: "TOKEN_NOT_FOUND", message: "LINE Token 未設定" } });
    }

    // Fetch all pages (up to 3 pages × 40 = 120 audiences)
    const allAudiences: any[] = [];
    for (let page = 1; page <= 3; page++) {
      const res = await fetch(
        `https://api.line.me/v2/bot/audienceGroup/list?page=${page}&size=40`,
        { headers: { Authorization: `Bearer ${channelData.access_token_encrypted}` } }
      );
      if (!res.ok) break;
      const data = await res.json().catch(() => ({}));
      const groups: any[] = data.audienceGroups ?? [];
      allAudiences.push(...groups);
      if (groups.length < 40) break; // last page
    }

    const audiences = allAudiences
      .filter((a: any) => a.status === "READY")
      .map((a: any) => ({
        id: a.audienceGroupId,
        name: a.description,
        type: a.type,
        count: a.audienceCount ?? 0,
      }));

    return jsonResponse({ success: true, data: { audiences } });
  } catch (e: unknown) {
    console.error("[get-line-audiences]", e);
    return jsonResponse({ success: false, error: { code: "UNEXPECTED_ERROR", message: "伺服器錯誤" } });
  }
});
