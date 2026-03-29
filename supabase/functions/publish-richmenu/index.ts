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

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // ── 1. Auth ──────────────────────────────────────────────────────────────
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

  // ── 2. Parse body ────────────────────────────────────────────────────────
  let body: { draftId: string; menuIndex?: number };
  try { body = await req.json(); } catch { return err("PAYLOAD_INVALID", "Invalid JSON body"); }
  const { draftId, menuIndex } = body;
  if (!draftId) return err("PAYLOAD_INVALID", "draftId is required");

  // ── 3. Fetch draft ───────────────────────────────────────────────────────
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

  // ── 4. Get LINE token ────────────────────────────────────────────────────
  const { data: tokenRows, error: tokenErr } = await adminClient.rpc("get_channel_secret", {
    p_user_id: user.id,
  });
  if (tokenErr || !tokenRows?.length) return err("TOKEN_MISSING", "LINE token not found. Please configure your channel.");
  const lineToken: string = tokenRows[0].access_token;
  if (!lineToken) return err("TOKEN_MISSING", "LINE access token is empty");

  // ── 5. Validate token ────────────────────────────────────────────────────
  const botInfo = await fetch(`${LINE_API}/info`, {
    headers: { Authorization: `Bearer ${lineToken}` },
  });
  if (!botInfo.ok) return err("TOKEN_INVALID", "LINE token is invalid or expired");

  // ── 6. Create publish job ────────────────────────────────────────────────
  const { data: job, error: jobErr } = await adminClient
    .from("rm_publish_jobs")
    .insert({ user_id: user.id, draft_id: draftId, status: "publishing", current_step: "start", progress: [] })
    .select()
    .single();
  if (jobErr || !job) return err("DB_ERROR", "Failed to create publish job: " + jobErr?.message);

  const steps: any[] = [];
  const publishedMenus: any[] = [];

  async function updateJob(step: string, extra?: object) {
    steps.push({ step, ts: new Date().toISOString(), ...extra });
    await adminClient.from("rm_publish_jobs").update({ current_step: step, progress: steps }).eq("id", job.id);
  }

  try {
    const existingAliases = await lineGetAliases(lineToken);

    for (const menu of targets) {
      const menuId = menu.id;
      const menuName = menu.name || "rich-menu";
      const aliasId: string = (menu.aliasId || "").replace(/[^a-z0-9_-]/g, "-").toLowerCase() || `menu-${menuId.slice(0, 8)}`;

      // ── Fetch image early to detect actual dimensions ──────────────────
      if (!menu.imageUrl) {
        await updateJob("image_missing", { menuId, error: "IMAGE_MISSING" });
        throw Object.assign(new Error(`Menu "${menuName}" has no image`), { code: "IMAGE_MISSING" });
      }
      let imageBuffer: ArrayBuffer;
      let imageContentType: string;
      try {
        const imgRes = await fetch(menu.imageUrl);
        if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`);
        imageContentType = imgRes.headers.get("content-type") || "image/jpeg";
        imageBuffer = await imgRes.arrayBuffer();
      } catch (fetchErr: any) {
        throw Object.assign(new Error(`Image fetch failed: ${fetchErr.message}`), { code: "IMAGE_INVALID" });
      }

      // LINE 圖文選單圖片上限 1MB
      const MAX_SIZE = 1024 * 1024;
      if (imageBuffer.byteLength > MAX_SIZE) {
        const sizeMB = (imageBuffer.byteLength / MAX_SIZE).toFixed(1);
        throw Object.assign(
          new Error(`「${menuName}」的圖片大小為 ${sizeMB}MB，超過 LINE 上限（1MB）。請先壓縮圖片後再發布。`),
          { code: "IMAGE_INVALID" }
        );
      }

      // ── Build LINE payload ─────────────────────────────────────────────
      const detectedSize = getImageDimensions(imageBuffer, imageContentType);
      const size = detectedSize || menu.size || { width: 2500, height: 1686 };
      const areas = (menu.areas || []).map((a: any) => {
        let action = { ...a.action };
        // LINE requires `data` field for richmenuswitch actions
        if (action.type === "richmenuswitch" && !action.data) {
          action.data = `switch-to-${action.richMenuAliasId || "menu"}`;
        }
        // postback with fillInText: open keyboard and pre-fill the chat input
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

      await updateJob("create_richmenu", { menuId, name: menuName });

      // ── Step: create rich menu ─────────────────────────────────────────
      const createRes = await linePost("/richmenu", lineToken, rmPayload);
      if (!createRes.ok) {
        await updateJob("create_richmenu_failed", { menuId, response: createRes.json });
        throw Object.assign(new Error(`LINE API error creating rich menu: ${JSON.stringify(createRes.json)}`), { code: "LINE_API_ERROR" });
      }
      const richMenuId: string = createRes.json.richMenuId;
      await updateJob("richmenu_created", { menuId, richMenuId });

      // ── Step: upload image ─────────────────────────────────────────────
      await updateJob("upload_image", { menuId, richMenuId });
      const imageBlob = new Blob([imageBuffer], { type: imageContentType });
      const uploadRes = await lineUploadImage(richMenuId, lineToken, imageBlob, imageContentType);
      if (!uploadRes.ok) {
        await updateJob("upload_image_failed", { richMenuId, status: uploadRes.status, body: uploadRes.text });
        throw Object.assign(new Error(`Image upload failed: ${uploadRes.text}`), { code: "LINE_API_ERROR" });
      }
      await updateJob("image_uploaded", { richMenuId });

      // ── Step: create/update alias ──────────────────────────────────────
      await updateJob("set_alias", { richMenuId, aliasId });
      const existingAlias = existingAliases.find(a => a.richMenuAliasId === aliasId);
      if (existingAlias) {
        // Update existing alias
        const aliasRes = await fetch(`${LINE_API}/richmenu/alias/${aliasId}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${lineToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ richMenuId }),
        });
        if (!aliasRes.ok) {
          const body = await aliasRes.text();
          await updateJob("alias_update_failed", { aliasId, body });
          throw Object.assign(new Error(`Alias update failed: ${body}`), { code: "LINE_API_ERROR" });
        }
      } else {
        const aliasRes = await linePost("/richmenu/alias", lineToken, { richMenuAliasId: aliasId, richMenuId });
        if (!aliasRes.ok) {
          await updateJob("alias_create_failed", { aliasId, response: aliasRes.json });
          throw Object.assign(new Error(`Alias create failed: ${JSON.stringify(aliasRes.json)}`), { code: "LINE_API_ERROR" });
        }
      }
      await updateJob("alias_set", { richMenuId, aliasId });

      // ── Step: set default (if flagged) ────────────────────────────────
      if (menu.isDefault) {
        await updateJob("set_default", { richMenuId });
        const defaultRes = await fetch(`${LINE_API}/user/all/richmenu/${richMenuId}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${lineToken}` },
        });
        if (!defaultRes.ok) {
          const body = await defaultRes.text();
          await updateJob("set_default_failed", { richMenuId, body });
          throw Object.assign(new Error(`Set default failed: ${body}`), { code: "LINE_API_ERROR" });
        }
        await updateJob("default_set", { richMenuId });
      }

      // ── Step: delete old rich menu (use LINE alias data as source of truth) ──
      // existingAlias.richMenuId is the OLD richMenuId that the alias previously pointed to.
      // This works even if the old menu was published before version tracking was added.
      if (existingAlias && existingAlias.richMenuId !== richMenuId) {
        const oldRichMenuId = existingAlias.richMenuId;
        await lineDeleteRichMenu(oldRichMenuId, lineToken);
        await adminClient
          .from("rm_rich_menu_versions")
          .update({ is_active: false })
          .eq("rich_menu_id", oldRichMenuId);
        await updateJob("old_menu_deleted", { oldRichMenuId, aliasId });
      }

      publishedMenus.push({ menuId, richMenuId, aliasId, name: menuName, isDefault: !!menu.isDefault });
    }

    // ── Step: save version ───────────────────────────────────────────────
    await updateJob("saving_versions");
    for (const m of publishedMenus) {
      await adminClient.from("rm_rich_menu_versions").insert({
        user_id: user.id,
        draft_id: draftId,
        job_id: job.id,
        alias_id: m.aliasId,
        rich_menu_id: m.richMenuId,
        menu_name: m.name,
        is_main: m.isDefault,
        is_active: true,
      });
    }

    // ── Finalize job ─────────────────────────────────────────────────────
    await adminClient.from("rm_publish_jobs").update({
      status: "success",
      current_step: "done",
      progress: steps,
    }).eq("id", job.id);

    // Update draft status
    await adminClient.from("rm_drafts").update({ status: "published" }).eq("id", draftId);

    return ok({ jobId: job.id, publishedMenus });

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
