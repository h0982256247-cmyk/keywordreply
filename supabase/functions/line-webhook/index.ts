import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-line-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function hmacSHA256Base64(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function safeHttpsUrl(url?: string | null) {
  if (!url || typeof url !== "string") return null;
  if (url.startsWith("https://")) return url;
  if (url.startsWith("http://")) return url.replace("http://", "https://");
  return null;
}

function actionToFlex(a: any, label?: string) {
  const common = label ? { label } : {};
  if (!a) return { type: "uri", uri: "https://line.me", ...common };
  if (a.type === "message") return { type: "message", text: a.text || label || "了解", ...common };
  if (a.type === "uri") return { type: "uri", uri: safeHttpsUrl(a.uri) || "https://line.me", ...common };
  if (a.type === "share") return { type: "uri", uri: "https://line.me", ...common };
  return { type: "uri", uri: "https://line.me", ...common };
}

function compileQuickReply(config: any) {
  const items = (config?.items || [])
    .filter((item: any) => item?.action?.label && ((item.action.type === "message" && item.action.text) || (item.action.type === "uri" && item.action.uri)))
    .slice(0, 13)
    .map((item: any) => ({
      type: "action",
      action: item.action.type === "message"
        ? { type: "message", label: item.action.label, text: item.action.text }
        : { type: "uri", label: item.action.label, uri: safeHttpsUrl(item.action.uri) || "https://line.me" },
    }));
  return items.length ? { items } : undefined;
}

function sectionToBubble(section: any, bubbleSize: string) {
  const heroVideo = (section.hero || []).find((x: any) => x.enabled && x.kind === "hero_video");
  const heroImage = (section.hero || []).find((x: any) => x.enabled && x.kind === "hero_image");
  const bodyContents = (section.body || []).filter((x: any) => x.enabled).map((c: any) => {
    if (c.kind === "title" || c.kind === "paragraph") {
      return { type: "text", text: c.text || " ", wrap: true, size: c.size || "md", weight: c.weight === "bold" ? "bold" : "regular", color: c.color || "#111111", align: c.align || "start" };
    }
    if (c.kind === "divider") return { type: "separator", margin: "md" };
    if (c.kind === "spacer") return { type: "spacer", size: c.size || "md" };
    if (c.kind === "list") return { type: "box", layout: "vertical", spacing: "sm", contents: (c.items || []).map((it: any) => ({ type: "text", text: `• ${it.text}`, wrap: true, size: "sm", color: "#111111" })) };
    if (c.kind === "key_value") {
      const row: any = {
        type: "box", layout: "baseline", spacing: "sm",
        contents: [
          { type: "text", text: c.label || "", size: "sm", color: "#8E8E93", flex: 2, wrap: true },
          { type: "text", text: c.value || "", size: "sm", color: "#111111", flex: 5, wrap: true },
        ],
      };
      if (c.action) row.action = actionToFlex(c.action);
      return row;
    }
    return { type: "text", text: " ", size: "xs", color: "#FFFFFF" };
  });

  const bubble: any = { type: "bubble", size: bubbleSize || "kilo" };
  const videoUrl = safeHttpsUrl(heroVideo?.video?.url);
  const previewUrl = safeHttpsUrl(heroVideo?.video?.previewUrl);
  const imageUrl = safeHttpsUrl(heroImage?.image?.url);
  if (videoUrl && previewUrl) {
    bubble.hero = {
      type: "video",
      url: videoUrl,
      previewUrl,
      aspectRatio: heroVideo.ratio || "16:9",
      altContent: { type: "image", url: previewUrl, size: "full", aspectRatio: heroVideo.ratio || "16:9", aspectMode: "cover" },
      action: actionToFlex(heroVideo.action, heroVideo.action?.label || "查看"),
    };
  } else if (imageUrl) {
    bubble.hero = { type: "image", url: imageUrl, size: "full", aspectRatio: heroImage?.ratio || "20:13", aspectMode: heroImage?.mode || "cover" };
  }
  if (bodyContents.length > 0) {
    bubble.body = { type: "box", layout: "vertical", spacing: "md", contents: bodyContents, backgroundColor: section.styles?.body?.backgroundColor, paddingAll: "20px" };
  }
  const buttons = (section.footer || []).filter((x: any) => x.enabled).slice(0, 3);
  if (buttons.length) {
    bubble.footer = {
      type: "box", layout: "vertical", spacing: "sm",
      contents: buttons.map((b: any) => ({
        type: "box", layout: "vertical", justifyContent: "center", alignItems: "center", cornerRadius: "md", paddingAll: "10px",
        backgroundColor: b.bgColor || "#0A84FF",
        action: actionToFlex(b.action),
        contents: [{ type: "text", text: b.label || "按鈕", color: b.textColor || "#FFFFFF", align: "center", weight: "bold" }],
      })),
    };
  }
  return bubble;
}

function specialSectionToBubble(section: any, bubbleSize: string) {
  const imageUrl = safeHttpsUrl(section.image?.url) || "https://placehold.co/600x900/png";
  const overlayContents = (section.body || []).filter((x: any) => x.enabled).map((c: any) => {
    if (c.kind === "title" || c.kind === "paragraph") return { type: "text", text: c.text || " ", wrap: true, size: c.size || "md", weight: c.weight === "bold" ? "bold" : "regular", color: c.color || "#FFFFFF", align: c.align || "start" };
    if (c.kind === "divider") return { type: "separator", margin: "md", color: "#FFFFFF33" };
    if (c.kind === "spacer") return { type: "spacer", size: c.size || "md" };
    if (c.kind === "list") return { type: "box", layout: "vertical", spacing: "sm", contents: (c.items || []).map((it: any) => ({ type: "text", text: `• ${it.text}`, wrap: true, size: "sm", color: "#FFFFFF" })) };
    if (c.kind === "key_value") return { type: "box", layout: "baseline", spacing: "sm", contents: [{ type: "text", text: c.label || "", size: "sm", color: "#CCCCCC", flex: 2, wrap: true }, { type: "text", text: c.value || "", size: "sm", color: "#FFFFFF", flex: 5, wrap: true }] };
    return { type: "text", text: " ", size: "xs", color: "#FFFFFF" };
  });
  const overlayBox: any = { type: "box", layout: "vertical", contents: overlayContents, position: "absolute", offsetBottom: "0px", offsetStart: "0px", offsetEnd: "0px", backgroundColor: section.overlay?.backgroundColor || "#03303Acc", paddingAll: "20px", paddingTop: "18px" };
  if (section.overlay?.height && section.overlay.height !== "auto") {
    overlayBox.height = section.overlay.height;
    overlayBox.justifyContent = "flex-end";
  }
  return { type: "bubble", size: bubbleSize || "kilo", body: { type: "box", layout: "vertical", paddingAll: "0px", contents: [{ type: "image", url: imageUrl, size: "full", aspectMode: "cover", aspectRatio: section.ratio || "2:3", gravity: "top" }, overlayBox] } };
}

function compileFlex(doc: any) {
  if (doc.type === "carousel") {
    return { type: "carousel", contents: (doc.cards || []).slice(0, 10).map((card: any) => card.section?.kind === "special" ? specialSectionToBubble(card.section, doc.bubbleSize || "kilo") : sectionToBubble(card.section, doc.bubbleSize || "kilo")) };
  }
  return doc.section?.kind === "special" ? specialSectionToBubble(doc.section, doc.bubbleSize || "kilo") : sectionToBubble(doc.section, doc.bubbleSize || "kilo");
}

async function logWebhook(admin: any, payload: any) {
  try {
    await admin.from("line_webhook_logs").insert(payload);
  } catch (e) {
    console.error("[line-webhook] log insert failed", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const rawBody = await req.text();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const payload = JSON.parse(rawBody);
    const destination = payload.destination;
    if (!destination) throw new Error("Missing destination");

    const { data: channel, error: channelError } = await admin
      .from("rm_line_channels")
      .select("user_id, channel_id, channel_secret, access_token_encrypted")
      .eq("bot_user_id", destination)
      .eq("is_active", true)
      .maybeSingle();

    if (channelError || !channel) {
      console.error("[line-webhook] Channel not found for destination:", destination);
      return new Response(JSON.stringify({ success: false, error: "Channel not found" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const provided = req.headers.get("x-line-signature") || "";
    const expected = await hmacSHA256Base64(channel.channel_secret, rawBody);
    if (provided !== expected) {
      await logWebhook(admin, { user_id: channel.user_id, channel_id: destination, success: false, event_type: "signature", request_body: payload, error_message: "Invalid signature" });
      return new Response(JSON.stringify({ success: false, error: "Invalid signature" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    for (const event of payload.events || []) {
      if (event.type !== "message" || event.message?.type !== "text") continue;
      const text = (event.message.text || "").trim();
      const replyToken = event.replyToken;
      if (!text || !replyToken) continue;

      // Fetch all enabled rules in one query and match in memory
      const { data: allRules } = await admin
        .from("keyword_rules")
        .select("*")
        .eq("user_id", channel.user_id)
        .eq("is_enabled", true)
        .order("priority", { ascending: true });

      let rule = (allRules || []).find((r: any) => {
        const kws: string[] = r.keywords && r.keywords.length > 0 ? r.keywords : r.keyword ? [r.keyword] : [];
        return r.match_type === "exact" && kws.includes(text);
      }) ?? null;

      if (!rule) {
        rule = (allRules || []).find((r: any) => {
          const kws: string[] = r.keywords && r.keywords.length > 0 ? r.keywords : r.keyword ? [r.keyword] : [];
          return r.match_type === "contains" && kws.some((k: string) => text.includes(k));
        }) ?? null;
      }

      if (!rule) continue;

      let messages: any[] = [];
      if (rule.reply_mode === "text") {
        messages = [{ type: "text", text: rule.reply_text || "您好" }];
      } else {
        const draftIds: string[] = (rule.draft_ids && rule.draft_ids.length > 0)
          ? rule.draft_ids
          : rule.draft_id ? [rule.draft_id] : [];
        if (draftIds.length === 0) {
          await logWebhook(admin, { user_id: channel.user_id, channel_id: destination, event_type: event.type, keyword: text, rule_id: rule.id, success: false, request_body: event, error_message: "No draft configured" });
          continue;
        }
        for (const draftId of draftIds) {
          const { data: docRow } = await admin.from("docs").select("content, title").eq("id", draftId).eq("owner_id", channel.user_id).maybeSingle();
          if (!docRow?.content) continue;
          const quickReply = compileQuickReply(docRow.content?.quickReply);

          if (docRow.content.type === "imagemap") {
            // Build imagemap message using serve-imagemap Edge Function as base URL
            const baseUrl = `${supabaseUrl}/functions/v1/serve-imagemap/${draftId}`;
            const areas = (docRow.content.areas || []).map((area: any) => ({
              type: area.action?.type === "uri" ? "uri" : "message",
              area: {
                x: Math.round(area.bounds?.x ?? 0),
                y: Math.round(area.bounds?.y ?? 0),
                width: Math.round(area.bounds?.width ?? 0),
                height: Math.round(area.bounds?.height ?? 0),
              },
              ...(area.action?.type === "uri"
                ? { linkUri: area.action.linkUri }
                : { text: area.action?.text || "" }),
            }));
            messages.push({
              type: "imagemap",
              baseUrl,
              altText: (docRow.content.altText || docRow.title || "熱區圖片").slice(0, 400),
              baseSize: docRow.content.baseSize || { width: 1040, height: 1040 },
              actions: areas,
            });
          } else if (docRow.content.type === "text") {
            // Build text message
            messages.push({
              type: "text",
              text: docRow.content.text || "您好",
              ...(quickReply ? { quickReply } : {}),
            });
          } else {
            // Default: build flex message (bubble / carousel)
            messages.push({ type: "flex", altText: (docRow.title || "LINE 訊息").slice(0, 400), contents: compileFlex(docRow.content), ...(quickReply ? { quickReply } : {}) });
          }
        }
        if (messages.length === 0) {
          await logWebhook(admin, { user_id: channel.user_id, channel_id: destination, event_type: event.type, keyword: text, rule_id: rule.id, success: false, request_body: event, error_message: "Draft not found" });
          continue;
        }
      }

      if (!messages.length) continue;

      const lineResponse = await fetch("https://api.line.me/v2/bot/message/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${channel.access_token_encrypted}` },
        body: JSON.stringify({ replyToken, messages }),
      });

      const responseText = await lineResponse.text();
      logWebhook(admin, {
        user_id: channel.user_id,
        channel_id: destination,
        event_type: event.type,
        keyword: text,
        rule_id: rule.id,
        success: lineResponse.ok,
        request_body: { replyToken, messages },
        response_body: responseText ? { raw: responseText } : { ok: true },
        error_message: lineResponse.ok ? null : `LINE reply failed: ${lineResponse.status}`,
      });

      if (!lineResponse.ok) {
        console.error("[line-webhook] reply failed", lineResponse.status, responseText);
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const message = (e as Error).message;
    console.error("[line-webhook] fatal", message);
    return new Response(JSON.stringify({ success: false, error: message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
