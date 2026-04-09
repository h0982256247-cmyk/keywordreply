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
  let body: { draftId: string; menuIndex?: number };
  try { body = await req.json(); } catch { return err("PAYLOAD_INVALID", "Invalid JSON body"); }
  const { draftId, menuIndex } = body;
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
    await log("init", { totalMenus: targets.length });

    // ── Step 1: 清掉舊預設 ───────────────────────────────────────────────
    await log("step1_cancel_default");
    await fetch(`${LINE_API}/user/all/richmenu`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${lineToken}` },
    });

    // ── Step 2: 刪除所有舊 Alias ─────────────────────────────────────────
    await log("step2_delete_aliases");
    const existingAliases = await lineGetAliases(lineToken);
    for (const alias of existingAliases) {
      await fetch(`${LINE_API}/richmenu/alias/${alias.richMenuAliasId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${lineToken}` },
      });
    }

    // ── Step 3: 刪除所有舊 Rich Menu ─────────────────────────────────────
    await log("step3_delete_old_richmenus");
    const oldListRes = await fetch(`${LINE_API}/richmenu/list`, {
      headers: { Authorization: `Bearer ${lineToken}` },
    });
    const oldListJson = oldListRes.ok
      ? await oldListRes.json().catch(() => ({ richmenus: [] }))
      : { richmenus: [] };
    const oldIds: string[] = (oldListJson.richmenus ?? []).map((m: any) => m.richMenuId);
    for (const oldId of oldIds) {
      await lineDeleteRichMenu(oldId, lineToken);
      await adminClient.from("rm_rich_menu_versions").update({ is_active: false }).eq("rich_menu_id", oldId);
    }
    await log("step3_done", { deleted: oldIds.length });

    // ── Steps 4–6: 逐一處理每個選單 ──────────────────────────────────────
    for (const menu of targets) {
      const menuId = menu.id;
      const menuName = menu.name || "rich-menu";
      const aliasId: string = (menu.aliasId || "").replace(/[^a-z0-9_-]/g, "-").toLowerCase() || `menu-${menuId.slice(0, 8)}`;
      const isMain: boolean = !!(menu.isDefault);

      await log("menu_start", { menuId, menuName, aliasId, isMain });

      if (!menu.imageUrl) {
        throw Object.assign(new Error(`Menu "${menuName}" has no image`), { code: "IMAGE_MISSING" });
      }

      // Fetch image via internal Storage download（不走 CDN，不計 Cached Egress）
      let imageBuffer: ArrayBuffer;
      let imageContentType: string;
      try {
        const storagePath = menu.imageUrl.split("?")[0].split("/storage/v1/object/public/flex-assets/")[1];
        if (!storagePath) throw new Error("Cannot resolve storage path from imageUrl");
        const { data: blob, error: dlErr } = await adminClient.storage.from("flex-assets").download(storagePath);
        if (dlErr || !blob) throw new Error(dlErr?.message || "Download returned empty");
        imageContentType = blob.type || "image/jpeg";
        imageBuffer = await blob.arrayBuffer();
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

      const areas = (menu.areas || []).map((a: any) => {
        const src = a.action || {};
        const label = src.label?.trim() || undefined;
        let action: any;
        if (src.type === "uri") {
          action = { type: "uri", ...(label ? { label } : {}), uri: src.uri || "https://line.me" };
        } else if (src.type === "message") {
          action = { type: "message", ...(label ? { label } : {}), text: src.text || "" };
        } else if (src.type === "richmenuswitch") {
          action = {
            type: "richmenuswitch",
            ...(label ? { label } : {}),
            richMenuAliasId: src.richMenuAliasId || "",
            data: src.data || `switch-to-${src.richMenuAliasId || "menu"}`,
          };
        } else if (src.type === "postback") {
          action = {
            type: "postback",
            ...(label ? { label } : {}),
            data: src.data || "",
            inputOption: "openKeyboard",
            fillInText: src.data || "",
          };
        } else if (src.type === "datetimepicker") {
          action = { type: "datetimepicker", ...(label ? { label } : {}), data: src.data || "", mode: src.mode || "datetime" };
        } else {
          action = { type: "uri", uri: "https://line.me" };
        }
        return { bounds: a.bounds, action };
      });

      // ── Step 4: 建立 Rich Menu ──────────────────────────────────────────
      await log("step4_create_richmenu", { menuName, size });
      const createRes = await linePost("/richmenu", lineToken, {
        size, selected: isMain ? true : (menu.selected ?? false),
        name: menuName, chatBarText: menu.chatBarText || "選單", areas,
      });
      if (!createRes.ok) {
        throw Object.assign(new Error(`建立 rich menu 失敗：${JSON.stringify(createRes.json)}`), { code: "LINE_API_ERROR" });
      }
      const richMenuId: string = createRes.json.richMenuId;
      await log("step4_done", { richMenuId });

      // ── Step 5: 上傳圖片 ────────────────────────────────────────────────
      await log("step5_upload_image", { richMenuId });
      const imageBlob = new Blob([imageBuffer], { type: imageContentType });
      const uploadRes = await lineUploadImage(richMenuId, lineToken, imageBlob, imageContentType);
      if (!uploadRes.ok) {
        throw Object.assign(new Error(`圖片上傳失敗：${uploadRes.text}`), { code: "LINE_API_ERROR" });
      }
      await log("step5_done", { richMenuId });

      // ── Step 6: 建立 Alias ──────────────────────────────────────────────
      await log("step6_create_alias", { aliasId, richMenuId });
      const createAliasRes = await linePost("/richmenu/alias", lineToken, { richMenuAliasId: aliasId, richMenuId });
      if (!createAliasRes.ok) {
        throw Object.assign(new Error(`Alias 建立失敗：${JSON.stringify(createAliasRes.json)}`), { code: "LINE_API_ERROR" });
      }
      await log("step6_done", { aliasId, richMenuId });

      // 寫入新版本到 DB
      await adminClient
        .from("rm_rich_menu_versions")
        .update({ is_active: false })
        .eq("alias_id", aliasId)
        .eq("user_id", user.id);
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

      // ── Step 7: 設定新預設（主選單才執行）──────────────────────────────
      if (isMain) {
        await log("step7_set_default", { richMenuId });
        const defaultRes = await fetch(`${LINE_API}/user/all/richmenu/${richMenuId}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${lineToken}` },
        });
        if (!defaultRes.ok) {
          await log("step7_failed", { richMenuId, body: await defaultRes.text() });
        } else {
          mainMenuId = richMenuId;
          await log("step7_done", { richMenuId });
        }
      }

      results.push({ aliasId, richMenuId, name: menuName, isMain });
      await log("menu_done", { menuId, richMenuId, aliasId, isMain });
    }

    // ── 完成 ─────────────────────────────────────────────────────────────
    await adminClient.from("rm_publish_jobs").update({
      status: "success",
      current_step: "done",
      progress: steps,
    }).eq("id", job.id);

    await adminClient.from("rm_drafts").update({ status: "published" }).eq("id", draftId);

    await log("complete", { totalPublished: results.length, mainMenuId });

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
