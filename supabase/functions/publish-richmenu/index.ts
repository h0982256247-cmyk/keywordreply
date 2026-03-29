import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LINE_API = "https://api.line.me/v2/bot";
const LINE_DATA_API = "https://api-data.line.me/v2/bot";

// ── Error codes ──────────────────────────────────────────────────────────────
type ErrCode =
  | "TOKEN_MISSING" | "TOKEN_INVALID" | "DRAFT_NOT_FOUND"
  | "IMAGE_MISSING" | "IMAGE_INVALID" | "PAYLOAD_INVALID"
  | "LINE_API_ERROR" | "DB_ERROR" | "UNAUTHORIZED";

function err(code: ErrCode, msg: string, detail?: unknown) {
  return new Response(
    JSON.stringify({ success: false, error: { code, message: msg, detail } }),
    { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
  );
}
function ok(data: unknown) {
  return new Response(
    JSON.stringify({ success: true, data }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
  );
}

// ── LINE API helpers ──────────────────────────────────────────────────────────
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

async function lineDeleteRichMenu(richMenuId: string, token: string) {
  const res = await fetch(`${LINE_API}/richmenu/${richMenuId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return { ok: res.ok, status: res.status };
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

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // ── Auth ─────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return err("UNAUTHORIZED", "Missing auth token");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, serviceKey);

  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return err("UNAUTHORIZED", "Invalid user token");

  // ── Parse body ───────────────────────────────────────────────────────────
  let body: { draftId: string; menuIndex?: number; cleanOldMenus?: boolean };
  try { body = await req.json(); } catch { return err("PAYLOAD_INVALID", "Invalid JSON body"); }
  const { draftId, menuIndex, cleanOldMenus = false } = body;
  if (!draftId) return err("PAYLOAD_INVALID", "draftId is required");

  // ── Fetch draft ──────────────────────────────────────────────────────────
  const { data: draft, error: draftErr } = await adminClient
    .from("rm_drafts")
    .select("*")
    .eq("id", draftId)
    .eq("user_id", user.id)
    .single();
  if (draftErr || !draft) return err("DRAFT_NOT_FOUND", `Draft ${draftId} not found`);

  const menus: any[] = (draft.data?.menus ?? []);
  const targets = menuIndex !== undefined ? [menus[menuIndex]].filter(Boolean) : menus;
  if (targets.length === 0) return err("PAYLOAD_INVALID", "No menus to publish");

  // ── Get LINE token ───────────────────────────────────────────────────────
  const { data: tokenRows, error: tokenErr } = await adminClient.rpc("get_channel_secret", {
    p_user_id: user.id,
  });
  if (tokenErr || !tokenRows?.length) return err("TOKEN_MISSING", "LINE token not found. Please configure your channel.");
  const lineToken: string = tokenRows[0].access_token;
  if (!lineToken) return err("TOKEN_MISSING", "LINE access token is empty");

  // ── Validate token ───────────────────────────────────────────────────────
  const botInfo = await fetch(`${LINE_API}/info`, {
    headers: { Authorization: `Bearer ${lineToken}` },
  });
  if (!botInfo.ok) return err("TOKEN_INVALID", "LINE token is invalid or expired");

  // ── Create publish job ───────────────────────────────────────────────────
  const { data: job, error: jobErr } = await adminClient
    .from("rm_publish_jobs")
    .insert({ user_id: user.id, draft_id: draftId, status: "publishing", current_step: "start", progress: [] })
    .select()
    .single();
  if (jobErr || !job) return err("DB_ERROR", "Failed to create publish job: " + jobErr?.message);

  const steps: any[] = [];
  const results: { aliasId: string; richMenuId: string; name: string; isMain: boolean }[] = [];
  let mainMenuId: string | null = null;

  async function log(step: string, extra?: object) {
    steps.push({ step, ts: new Date().toISOString(), ...extra });
    await adminClient.from("rm_publish_jobs").update({ current_step: step, progress: steps }).eq("id", job.id);
  }

  try {
    // ── Phase 0: 初始化 ───────────────────────────────────────────────────
    await log("init", { totalMenus: targets.length, cleanOldMenus });
    const existingAliases = await lineGetAliases(lineToken);

    // 記錄發布前已存在的 richMenuId，發布完成後再刪除
    const oldMenusRes = await fetch(`${LINE_API}/richmenu/list`, {
      headers: { Authorization: `Bearer ${lineToken}` },
    });
    const oldMenusJson = oldMenusRes.ok
      ? await oldMenusRes.json().catch(() => ({ richmenus: [] }))
      : { richmenus: [] };
    const oldRichMenuIds: string[] = (oldMenusJson.richmenus ?? []).map((m: any) => m.richMenuId);

    await log("aliases_fetched", { count: existingAliases.length, oldRichMenuIds });

    // ── Phase 1: Full Wipe（可選，只有 cleanOldMenus = true 才執行）────────
    if (cleanOldMenus) {
      await log("phase1_full_wipe_start");

      // 1-1. 取消所有預設選單
      await fetch(`${LINE_API}/user/all/richmenu`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${lineToken}` },
      });
      await log("p1_default_cancelled");

      // 1-2. 刪除所有 alias
      for (const alias of existingAliases) {
        await fetch(`${LINE_API}/richmenu/alias/${alias.richMenuAliasId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${lineToken}` },
        });
        await log("p1_alias_deleted", { aliasId: alias.richMenuAliasId });
      }

      // 1-3. 取得所有 richMenuId 並全部刪除
      const allMenusRes = await fetch(`${LINE_API}/richmenu/list`, {
        headers: { Authorization: `Bearer ${lineToken}` },
      });
      const allMenusJson = allMenusRes.ok
        ? await allMenusRes.json().catch(() => ({ richmenus: [] }))
        : { richmenus: [] };
      const allIds: string[] = (allMenusJson.richmenus ?? []).map((m: any) => m.richMenuId);
      await log("p1_richmenus_to_delete", { count: allIds.length, ids: allIds });
      for (const oldId of allIds) {
        await lineDeleteRichMenu(oldId, lineToken);
        await adminClient.from("rm_rich_menu_versions").update({ is_active: false }).eq("rich_menu_id", oldId);
        await log("p1_richmenu_deleted", { richMenuId: oldId });
      }

      await log("phase1_full_wipe_done");
    }

    // ── Phase 2 + 3 + 4 + 5: 逐一處理每個選單 ───────────────────────────
    for (const menu of targets) {
      const menuId = menu.id;
      const menuName = menu.name || "rich-menu";
      const aliasId: string = (menu.aliasId || "").replace(/[^a-z0-9_-]/g, "-").toLowerCase() || `menu-${menuId.slice(0, 8)}`;
      const isMain: boolean = !!(menu.isDefault);

      await log("menu_start", { menuId, menuName, aliasId, isMain });

      // ── Phase 2: 建立 Rich Menu ─────────────────────────────────────────
      if (!menu.imageUrl) {
        throw Object.assign(new Error(`Menu "${menuName}" has no image`), { code: "IMAGE_MISSING" });
      }

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

      // Fetch image first to detect actual dimensions
      let imageBuffer: ArrayBuffer;
      let imageContentType: string;
      try {
        const imgRes = await fetch(menu.imageUrl);
        if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
        imageContentType = imgRes.headers.get("content-type") || "image/jpeg";
        imageBuffer = await imgRes.arrayBuffer();
      } catch (e: any) {
        throw Object.assign(new Error(`Image fetch failed for "${menuName}": ${e.message}`), { code: "IMAGE_INVALID" });
      }

      const MAX_SIZE = 1024 * 1024;
      if (imageBuffer.byteLength > MAX_SIZE) {
        const sizeMB = (imageBuffer.byteLength / MAX_SIZE).toFixed(1);
        throw Object.assign(
          new Error(`「${menuName}」的圖片大小為 ${sizeMB}MB，超過 LINE 上限（1MB）。請先壓縮圖片後再發布。`),
          { code: "IMAGE_INVALID" }
        );
      }

      const detectedSize = getImageDimensions(imageBuffer, imageContentType);
      const size = detectedSize || menu.size || { width: 2500, height: 1686 };

      await log("p2_creating_richmenu", { menuId, menuName, size });
      const createRes = await linePost("/richmenu", lineToken, {
        size, selected: menu.selected ?? false,
        name: menuName, chatBarText: menu.chatBarText || "選單", areas,
      });
      if (!createRes.ok) {
        await log("p2_create_failed", { menuId, response: createRes.json });
        throw Object.assign(new Error(`建立 rich menu 失敗：${JSON.stringify(createRes.json)}`), { code: "LINE_API_ERROR" });
      }
      const richMenuId: string = createRes.json.richMenuId;
      await log("p2_richmenu_created", { menuId, richMenuId });

      // ── Phase 3: 上傳圖片 ───────────────────────────────────────────────
      await log("p3_uploading_image", { richMenuId, size: imageBuffer.byteLength });
      const imageBlob = new Blob([imageBuffer], { type: imageContentType });
      const uploadRes = await lineUploadImage(richMenuId, lineToken, imageBlob, imageContentType);
      if (!uploadRes.ok) {
        await log("p3_upload_failed", { richMenuId, status: uploadRes.status, body: uploadRes.text });
        throw Object.assign(new Error(`圖片上傳失敗：${uploadRes.text}`), { code: "LINE_API_ERROR" });
      }
      await log("p3_image_uploaded", { richMenuId });

      // ── Phase 4: Alias 綁定（更新優先，fallback 建立）──────────────────
      await log("p4_binding_alias", { richMenuId, aliasId });

      // 先把 DB 舊版本設為 inactive
      await adminClient
        .from("rm_rich_menu_versions")
        .update({ is_active: false })
        .eq("alias_id", aliasId)
        .eq("user_id", user.id);

      const existingAlias = existingAliases.find(a => a.richMenuAliasId === aliasId);
      if (existingAlias) {
        // 嘗試更新既有 alias
        const updateAliasRes = await fetch(`${LINE_API}/richmenu/alias/${aliasId}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${lineToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ richMenuId }),
        });
        if (updateAliasRes.ok) {
          await log("p4_alias_updated", { aliasId, richMenuId });
        } else {
          // fallback: 刪除後重建
          await fetch(`${LINE_API}/richmenu/alias/${aliasId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${lineToken}` },
          });
          const createAliasRes = await linePost("/richmenu/alias", lineToken, { richMenuAliasId: aliasId, richMenuId });
          if (!createAliasRes.ok) {
            await log("p4_alias_create_failed", { aliasId, response: createAliasRes.json });
            throw Object.assign(new Error(`Alias 建立失敗：${JSON.stringify(createAliasRes.json)}`), { code: "LINE_API_ERROR" });
          }
          await log("p4_alias_recreated", { aliasId, richMenuId });
        }
      } else {
        // Alias 不存在，直接建立
        const createAliasRes = await linePost("/richmenu/alias", lineToken, { richMenuAliasId: aliasId, richMenuId });
        if (!createAliasRes.ok) {
          await log("p4_alias_create_failed", { aliasId, response: createAliasRes.json });
          throw Object.assign(new Error(`Alias 建立失敗：${JSON.stringify(createAliasRes.json)}`), { code: "LINE_API_ERROR" });
        }
        await log("p4_alias_created", { aliasId, richMenuId });
      }

      // 寫入新版本到 DB
      await adminClient.from("rm_rich_menu_versions").insert({
        user_id: user.id,
        draft_id: draftId,
        job_id: job.id,
        alias_id: aliasId,
        rich_menu_id: richMenuId,
        menu_name: menuName,
        is_main: isMain,
        is_active: true,
      });

      // ── Phase 5: 設定預設選單（主選單才執行）──────────────────────────
      if (isMain) {
        await log("p5_setting_default", { richMenuId });
        // 先清除舊的頻道預設（含 OA Manager 設定的），再設定新的
        await fetch(`${LINE_API}/user/all/richmenu`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${lineToken}` },
        });
        const defaultRes = await fetch(`${LINE_API}/user/all/richmenu/${richMenuId}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${lineToken}` },
        });
        if (!defaultRes.ok) {
          const errBody = await defaultRes.text();
          await log("p5_default_failed", { richMenuId, body: errBody });
          // 回報錯誤但不中止（不 rollback）
        } else {
          mainMenuId = richMenuId;
          await log("p5_default_set", { richMenuId });
        }
      }

      results.push({ aliasId, richMenuId, name: menuName, isMain });
      await log("menu_done", { menuId, richMenuId, aliasId, isMain });
    }

    // ── Phase 6: 刪除舊的 richMenuId（非 cleanOldMenus 模式才需要，cleanOldMenus 已在 Phase 1 刪除）──
    if (!cleanOldMenus && oldRichMenuIds.length > 0) {
      await log("p6_deleting_old_richmenus", { count: oldRichMenuIds.length, ids: oldRichMenuIds });
      for (const oldId of oldRichMenuIds) {
        await lineDeleteRichMenu(oldId, lineToken);
        await adminClient.from("rm_rich_menu_versions").update({ is_active: false }).eq("rich_menu_id", oldId);
        await log("p6_old_richmenu_deleted", { richMenuId: oldId });
      }
    }

    // ── Phase 7: 完成 ────────────────────────────────────────────────────
    await adminClient.from("rm_publish_jobs").update({
      status: "success",
      current_step: "done",
      progress: steps,
    }).eq("id", job.id);

    await adminClient.from("rm_drafts").update({ status: "published" }).eq("id", draftId);

    await log("phase7_complete", { totalPublished: results.length, mainMenuId });

    return ok({ jobId: job.id, results, mainMenuId, publishedMenus: results });

  } catch (e: any) {
    const code: ErrCode = e.code ?? "LINE_API_ERROR";
    await adminClient.from("rm_publish_jobs").update({
      status: "failed",
      current_step: "error",
      error_message: e.message,
      progress: steps,
    }).eq("id", job.id);
    return err(code, e.message, { jobId: job.id });
  }
});
