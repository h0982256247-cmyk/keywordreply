import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LINE_API = "https://api.line.me/v2/bot";
const LINE_DATA_API = "https://api-data.line.me/v2/bot";

async function linePost(path: string, token: string, body: unknown) {
  const res = await fetch(`${LINE_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, json };
}

async function lineUploadImage(richMenuId: string, token: string, imageBlob: Blob, contentType: string) {
  const res = await fetch(`${LINE_DATA_API}/richmenu/${richMenuId}/content`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
    body: imageBlob,
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, text };
}

async function lineGetAliases(token: string) {
  const res = await fetch(`${LINE_API}/richmenu/alias/list`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const j = await res.json().catch(() => ({ aliases: [] }));
  return (j.aliases || []) as { richMenuAliasId: string; richMenuId: string }[];
}

async function publishMenus(draft: any, lineToken: string, adminClient: any) {
  const menus: any[] = draft.data?.menus ?? [];
  if (!menus.length) throw new Error("No menus to publish");

  const existingAliases = await lineGetAliases(lineToken);
  const publishedMenus: any[] = [];

  for (const menu of menus) {
    const menuId = menu.id;
    const menuName = menu.name || "rich-menu";
    const aliasId: string = (menu.aliasId || "").replace(/[^a-z0-9_-]/g, "-").toLowerCase() || `menu-${menuId.slice(0, 8)}`;

    if (!menu.imageUrl) throw new Error(`Menu "${menuName}" has no image`);

    const size = menu.size || { width: 2500, height: 1686 };
    const areas = (menu.areas || []).map((a: any) => {
      let action = { ...a.action };
      if (action.type === "richmenuswitch" && !action.data) {
        action.data = `switch-to-${action.richMenuAliasId || "menu"}`;
      }
      if (action.type === "postback" && action.data) {
        action.inputOption = "openKeyboard";
        action.fillInText = action.data;
      }
      return { bounds: a.bounds, action };
    });

    const rmPayload = {
      size,
      selected: menu.selected ?? false,
      name: menuName,
      chatBarText: menu.chatBarText || "選單",
      areas,
    };

    // Create rich menu
    const createRes = await linePost("/richmenu", lineToken, rmPayload);
    if (!createRes.ok) throw new Error(`LINE API error creating rich menu: ${JSON.stringify(createRes.json)}`);
    const richMenuId: string = createRes.json.richMenuId;

    // Upload image
    const imgRes = await fetch(menu.imageUrl);
    if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`);
    const imageBlob = await imgRes.blob();
    const imageContentType = imgRes.headers.get("content-type") || "image/jpeg";

    const uploadRes = await lineUploadImage(richMenuId, lineToken, imageBlob, imageContentType);
    if (!uploadRes.ok) throw new Error(`Image upload failed: ${uploadRes.text}`);

    // Create/update alias
    const existingAlias = existingAliases.find(a => a.richMenuAliasId === aliasId);
    if (existingAlias) {
      const aliasRes = await fetch(`${LINE_API}/richmenu/alias/${aliasId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${lineToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ richMenuId }),
      });
      if (!aliasRes.ok) throw new Error(`Alias update failed: ${await aliasRes.text()}`);
    } else {
      const aliasRes = await linePost("/richmenu/alias", lineToken, { richMenuAliasId: aliasId, richMenuId });
      if (!aliasRes.ok) throw new Error(`Alias create failed: ${JSON.stringify(aliasRes.json)}`);
    }

    // Set default
    if (menu.isDefault) {
      const defaultRes = await fetch(`${LINE_API}/user/all/richmenu/${richMenuId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${lineToken}` },
      });
      if (!defaultRes.ok) throw new Error(`Set default failed: ${await defaultRes.text()}`);
    }

    publishedMenus.push({ menuId, richMenuId, aliasId, name: menuName, isDefault: !!menu.isDefault });
  }

  // Save version records
  for (const m of publishedMenus) {
    await adminClient.from("rm_rich_menu_versions").insert({
      user_id: draft.user_id,
      draft_id: draft.id,
      alias_id: m.aliasId,
      rich_menu_id: m.richMenuId,
      menu_name: m.name,
      is_main: m.isDefault,
      is_active: true,
    });
  }

  return publishedMenus;
}

serve(async (req) => {
  // Only allow POST from internal cron (verified by service role key)
  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (authHeader !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  // Find all drafts due for publishing
  const now = new Date().toISOString();
  const { data: dueDrafts, error } = await adminClient
    .from("rm_drafts")
    .select("*")
    .not("scheduled_at", "is", null)
    .lte("scheduled_at", now)
    .neq("status", "published");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!dueDrafts?.length) {
    return new Response(JSON.stringify({ processed: 0 }), { status: 200 });
  }

  const results: any[] = [];

  for (const draft of dueDrafts) {
    try {
      // Get user's LINE token
      const { data: tokenRows, error: tokenErr } = await adminClient.rpc("get_channel_secret", {
        p_user_id: draft.user_id,
      });
      if (tokenErr || !tokenRows?.length) throw new Error("LINE token not found");
      const lineToken: string = tokenRows[0].access_token;
      if (!lineToken) throw new Error("LINE access token is empty");

      // Validate token
      const botInfo = await fetch(`${LINE_API}/info`, {
        headers: { Authorization: `Bearer ${lineToken}` },
      });
      if (!botInfo.ok) throw new Error("LINE token is invalid or expired");

      // Publish all menus
      await publishMenus(draft, lineToken, adminClient);

      // Mark as published and clear scheduled_at
      const { scheduled_at: _sa, ...restData } = (draft.data || {}) as any;
      await adminClient
        .from("rm_drafts")
        .update({ status: "published", scheduled_at: null, data: restData })
        .eq("id", draft.id);

      results.push({ id: draft.id, name: draft.name, success: true });
    } catch (e: any) {
      // On failure, clear scheduled_at so it doesn't retry endlessly, record error
      await adminClient
        .from("rm_drafts")
        .update({ scheduled_at: null })
        .eq("id", draft.id);

      results.push({ id: draft.id, name: draft.name, success: false, error: e.message });
      console.error(`Failed to publish draft ${draft.id}:`, e.message);
    }
  }

  return new Response(JSON.stringify({ processed: dueDrafts.length, results }), { status: 200 });
});
