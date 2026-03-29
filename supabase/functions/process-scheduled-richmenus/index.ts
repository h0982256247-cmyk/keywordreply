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

function getImageDimensions(buffer: ArrayBuffer, contentType: string): { width: number; height: number } | null {
  const view = new DataView(buffer);
  if (contentType.includes("png")) {
    if (view.byteLength < 24) return null;
    return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
  }
  if (contentType.includes("jpeg") || contentType.includes("jpg")) {
    let i = 2;
    while (i < view.byteLength - 9) {
      if (view.getUint8(i) !== 0xFF) break;
      const marker = view.getUint8(i + 1);
      if ((marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC5 && marker <= 0xC7) ||
          (marker >= 0xC9 && marker <= 0xCB) || (marker >= 0xCD && marker <= 0xCF)) {
        return { width: view.getUint16(i + 7, false), height: view.getUint16(i + 5, false) };
      }
      if (i + 3 >= view.byteLength) break;
      i += 2 + view.getUint16(i + 2, false);
    }
  }
  return null;
}

async function lineDeleteRichMenu(richMenuId: string, token: string) {
  const res = await fetch(`${LINE_API}/richmenu/${richMenuId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return { ok: res.ok, status: res.status };
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

  // ── Phase 1: Pre-fetch & validate all images ────────────────────────────
  type PreparedMenu = {
    menu: any; menuId: string; menuName: string; aliasId: string;
    imageBuffer: ArrayBuffer; imageContentType: string; rmPayload: any;
  };
  const prepared: PreparedMenu[] = [];

  for (const menu of menus) {
    const menuId = menu.id;
    const menuName = menu.name || "rich-menu";
    const aliasId: string = (menu.aliasId || "").replace(/[^a-z0-9_-]/g, "-").toLowerCase() || `menu-${menuId.slice(0, 8)}`;

    if (!menu.imageUrl) throw new Error(`Menu "${menuName}" has no image`);

    const imgRes = await fetch(menu.imageUrl);
    if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`);
    const imageContentType = imgRes.headers.get("content-type") || "image/jpeg";
    const imageBuffer = await imgRes.arrayBuffer();

    const MAX_SIZE = 1024 * 1024;
    if (imageBuffer.byteLength > MAX_SIZE) {
      const sizeMB = (imageBuffer.byteLength / MAX_SIZE).toFixed(1);
      throw new Error(`「${menuName}」的圖片大小為 ${sizeMB}MB，超過 LINE 上限（1MB）。請先壓縮圖片後再發布。`);
    }

    const detectedSize = getImageDimensions(imageBuffer, imageContentType);
    const size = detectedSize || menu.size || { width: 2500, height: 1686 };
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
      size, selected: menu.selected ?? false,
      name: menuName, chatBarText: menu.chatBarText || "選單", areas,
    };
    prepared.push({ menu, menuId, menuName, aliasId, imageBuffer, imageContentType, rmPayload });
  }

  // ── Phase 2: Full cleanup (cancel default → delete aliases → delete richMenuIds) ──

  // Step 2-1: Cancel default
  await fetch(`${LINE_API}/user/all/richmenu`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${lineToken}` },
  });

  // Step 2-2: Delete all aliases
  for (const alias of existingAliases) {
    await fetch(`${LINE_API}/richmenu/alias/${alias.richMenuAliasId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${lineToken}` },
    });
  }

  // Step 2-3: Get ALL richMenuIds on channel and delete every one
  const allMenusRes = await fetch(`${LINE_API}/richmenu/list`, {
    headers: { Authorization: `Bearer ${lineToken}` },
  });
  const allMenusJson = allMenusRes.ok ? await allMenusRes.json().catch(() => ({ richmenus: [] })) : { richmenus: [] };
  const allRichMenuIds: string[] = (allMenusJson.richmenus ?? []).map((m: any) => m.richMenuId);
  for (const oldId of allRichMenuIds) {
    await lineDeleteRichMenu(oldId, lineToken);
    await adminClient.from("rm_rich_menu_versions").update({ is_active: false }).eq("rich_menu_id", oldId);
  }

  // ── Phase 3: Create all new menus ───────────────────────────────────────
  for (const { menu, menuId, menuName, aliasId, imageBuffer, imageContentType, rmPayload } of prepared) {
    const createRes = await linePost("/richmenu", lineToken, rmPayload);
    if (!createRes.ok) throw new Error(`LINE API error creating rich menu: ${JSON.stringify(createRes.json)}`);
    const richMenuId: string = createRes.json.richMenuId;

    const imageBlob = new Blob([imageBuffer], { type: imageContentType });
    const uploadRes = await lineUploadImage(richMenuId, lineToken, imageBlob, imageContentType);
    if (!uploadRes.ok) throw new Error(`Image upload failed: ${uploadRes.text}`);

    // Alias was deleted in Phase 2 — always create fresh
    const aliasRes = await linePost("/richmenu/alias", lineToken, { richMenuAliasId: aliasId, richMenuId });
    if (!aliasRes.ok) throw new Error(`Alias create failed: ${JSON.stringify(aliasRes.json)}`);

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
