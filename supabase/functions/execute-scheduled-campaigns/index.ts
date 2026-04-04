import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (_req) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Find all campaigns due for broadcast
  const now = new Date().toISOString();
  const { data: dueCampaigns, error } = await admin
    .from("broadcast_campaigns")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_at", now)
    .not("scheduled_messages", "is", null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!dueCampaigns?.length) {
    return new Response(JSON.stringify({ processed: 0 }), { status: 200 });
  }

  const results: any[] = [];

  for (const campaign of dueCampaigns) {
    try {
      // Get user's LINE access token
      const { data: channelData, error: tokenErr } = await admin
        .from("rm_line_channels")
        .select("access_token_encrypted")
        .eq("user_id", campaign.user_id)
        .eq("is_active", true)
        .single();

      if (tokenErr || !channelData?.access_token_encrypted) {
        throw new Error("LINE Token 未設定");
      }

      const messages: any[] = campaign.scheduled_messages;
      if (!messages?.length) throw new Error("沒有排程訊息內容");
      if (messages.length > 5) throw new Error("訊息數量超過 LINE 限制（最多 5 則）");

      // Broadcast via LINE API
      const lineRes = await fetch("https://api.line.me/v2/bot/message/broadcast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${channelData.access_token_encrypted}`,
        },
        body: JSON.stringify({ messages }),
      });

      if (!lineRes.ok) {
        const errText = await lineRes.text();
        throw new Error(`LINE API 錯誤 (${lineRes.status}): ${errText}`);
      }

      // Mark as sent
      await admin
        .from("broadcast_campaigns")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          scheduled_at: null,
          scheduled_messages: null,
        })
        .eq("id", campaign.id);

      results.push({ id: campaign.id, name: campaign.name, success: true });
    } catch (e: any) {
      console.error(`[execute-scheduled-campaigns] Failed for campaign ${campaign.id}:`, e.message);

      // Mark as failed so it doesn't retry endlessly
      await admin
        .from("broadcast_campaigns")
        .update({ status: "failed", scheduled_at: null, scheduled_messages: null })
        .eq("id", campaign.id);

      results.push({ id: campaign.id, name: campaign.name, success: false, error: e.message });
    }
  }

  return new Response(
    JSON.stringify({ processed: dueCampaigns.length, results }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
