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

  // ── Step 1: 清掉舊預設 ──────────────────────────────────────────────────
  await fetch(`${LINE_API}/user/all/richmenu`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${lineToken}` },
  });

  // ── Step 2: 刪除所有舊 Alias ────────────────────────────────────────────
  const existingAliases = await lineGetAliases(lineToken);
  for (const alias of existingAliases) {
    await fetch(`${LINE_API}/richmenu/alias/${alias.richMenuAliasId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${lineToken}` },
    });
  }

  // ── Step 3: 刪除所有舊 Rich Menu ────────────────────────────────────────
  const oldListRes = await fetch(`${LINE_API}/richmenu/list`, {
    headers: { Authorization: `Bearer ${lineToken}` },
  });
  const oldListJson = oldListRes.ok
    ? await oldListRes.json().catch(() => ({ richmenus: [] }))
    : { richmenus: [] };
  const oldIds: string[] = (oldListJson.richmenus ?? []).map((m: any) => m.richMenuId);
  for (const oldId of oldIds) {
    await fetch(`${LINE_API}/richmenu/${oldId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${lineToken}` },
    });
    await adminClient.from("rm_rich_menu_versions").update({ is_active: false }).eq("rich_menu_id", oldId);
  }

  const results: { aliasId: string; richMenuId: string; name: string; isMain: boolean }[] = [];

  for (const menu of menus) {
    const menuId = menu.id;
    const menuName = menu.name || "rich-menu";
    const aliasId: string = (menu.aliasId || "").replace(/[^a-z0-9_-]/g, "-").toLowerCase() || `menu-${menuId.slice(0, 8)}`;
    const isMain: boolean = !!(menu.isDefault);

    if (!menu.imageUrl) throw new Error(`Menu "${menuName}" has no image`);

    // ── Step 4: 建立 Rich Menu ──────────────────────────────────────────
    const imgRes = await fetch(menu.imageUrl);
    if (!imgRes.ok) throw new Error(`Failed to fetch image for "${menuName}": ${imgRes.status}`);
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

    const createRes = await linePost("/richmenu", lineToken, {
      size, selected: menu.selected ?? false,
      name: menuName, chatBarText: menu.chatBarText || "選單", areas,
    });
    if (!createRes.ok) throw new Error(`建立 rich menu 失敗：${JSON.stringify(createRes.json)}`);
    const richMenuId: string = createRes.json.richMenuId;

    // ── Step 5: 上傳圖片 ────────────────────────────────────────────────
    const imageBlob = new Blob([imageBuffer], { type: imageContentType });
    const uploadRes = await lineUploadImage(richMenuId, lineToken, imageBlob, imageContentType);
    if (!uploadRes.ok) throw new Error(`圖片上傳失敗：${uploadRes.text}`);

    // ── Step 6: 建立 Alias ──────────────────────────────────────────────
    const createAliasRes = await linePost("/richmenu/alias", lineToken, { richMenuAliasId: aliasId, richMenuId });
    if (!createAliasRes.ok) throw new Error(`Alias 建立失敗：${JSON.stringify(createAliasRes.json)}`);

    // 寫入新版本到 DB
    await adminClient.from("rm_rich_menu_versions").insert({
      user_id: draft.user_id,
      draft_id: draft.id,
      alias_id: aliasId,
      rich_menu_id: richMenuId,
      menu_name: menuName,
      is_main: isMain,
      is_active: true,
    });

    // ── Step 7: 設定新預設（主選單才執行）──────────────────────────────
    if (isMain) {
      const defaultRes = await fetch(`${LINE_API}/user/all/richmenu/${richMenuId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${lineToken}` },
      });
      if (!defaultRes.ok) {
        console.error(`Set default failed for richMenuId ${richMenuId}: ${await defaultRes.text()}`);
      }
    }

    results.push({ aliasId, richMenuId, name: menuName, isMain });
  }

  return results;
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

      // Publish all menus (Phase 2–5)
      await publishMenus(draft, lineToken, adminClient);

      // Phase 6: Mark as published and clear scheduled_at
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
