import { supabase } from "./supabase";

export interface RmMenu {
  id: string;
  name: string;
  chatBarText: string;
  size: { width: number; height: number };
  areas: RmArea[];
  imageUrl: string | null;
  imageAssetId: string | null;
  isDefault: boolean;
  aliasId: string;
  selected: boolean;
}

export interface RmArea {
  id: string;
  bounds: { x: number; y: number; width: number; height: number };
  action: {
    type: "uri" | "message" | "richmenuswitch" | "postback" | "datetimepicker";
    label?: string;
    uri?: string;
    text?: string;
    richMenuAliasId?: string;
    data?: string;
  };
}

export interface RmDraft {
  id: string;
  user_id: string;
  name: string;
  folder_id: string | null;
  data: { menus: RmMenu[] };
  status: "draft" | "published";
  created_at: string;
  updated_at: string;
}

export interface RmFolder {
  id: string;
  user_id: string;
  name: string;
  order: number;
  created_at: string;
}

async function requireUser() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("NOT_AUTH");
  return data.user;
}

// ── Drafts ────────────────────────────────────────────────────────────────────

export async function listRmDrafts(): Promise<RmDraft[]> {
  await requireUser();
  const { data, error } = await supabase
    .from("rm_drafts")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data as RmDraft[];
}

export async function getRmDraft(id: string): Promise<RmDraft> {
  await requireUser();
  const { data, error } = await supabase
    .from("rm_drafts")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as RmDraft;
}

export function makeDefaultMenu(index: number = 0): RmMenu {
  const id = crypto.randomUUID();
  return {
    id,
    name: `選單 ${index + 1}`,
    chatBarText: "選單",
    size: { width: 2500, height: 1686 },
    areas: [],
    imageUrl: null,
    imageAssetId: null,
    isDefault: index === 0,
    aliasId: `menu-${id.slice(0, 8)}`,
    selected: index === 0,
  };
}

export async function createRmDraft(name: string, folderId?: string | null): Promise<string> {
  const user = await requireUser();
  const menus: RmMenu[] = [makeDefaultMenu(0)];
  const { data, error } = await supabase
    .from("rm_drafts")
    .insert({
      user_id: user.id,
      name,
      folder_id: folderId ?? null,
      data: { menus },
      status: "draft",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function saveRmDraft(id: string, patch: Partial<Pick<RmDraft, "name" | "data" | "folder_id" | "status">>) {
  const user = await requireUser();
  const { error } = await supabase
    .from("rm_drafts")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
}

export async function deleteRmDraft(id: string) {
  const user = await requireUser();
  const { error } = await supabase
    .from("rm_drafts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
}

// ── Folders ───────────────────────────────────────────────────────────────────

export async function listRmFolders(): Promise<RmFolder[]> {
  await requireUser();
  const { data, error } = await supabase
    .from("rm_folders")
    .select("*")
    .order("order", { ascending: true });
  if (error) throw error;
  return data as RmFolder[];
}

export async function createRmFolder(name: string): Promise<string> {
  const user = await requireUser();
  const { data: existing } = await supabase.from("rm_folders").select("order").order("order", { ascending: false }).limit(1);
  const nextOrder = existing?.length ? (existing[0].order ?? 0) + 1 : 0;
  const { data, error } = await supabase
    .from("rm_folders")
    .insert({ user_id: user.id, name, order: nextOrder })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function renameRmFolder(id: string, name: string) {
  const user = await requireUser();
  const { error } = await supabase
    .from("rm_folders")
    .update({ name })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
}

export async function deleteRmFolder(id: string) {
  const user = await requireUser();
  const { error } = await supabase
    .from("rm_folders")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
}

export async function saveRmFolderOrder(orderedIds: string[]) {
  await Promise.all(
    orderedIds.map((id, idx) =>
      supabase.from("rm_folders").update({ order: idx }).eq("id", id)
    )
  );
}

// ── Publish ───────────────────────────────────────────────────────────────────

export async function publishRmDraft(draftId: string, menuIndex?: number) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("尚未登入，請重新整理頁面");

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const res = await fetch(`${supabaseUrl}/functions/v1/publish-richmenu`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ draftId, menuIndex }),
  });

  let json: any;
  try {
    json = await res.json();
  } catch {
    throw new Error(`HTTP ${res.status} — ${res.statusText || "無法解析回應"}`);
  }

  if (!res.ok && !json?.success) {
    const detail = json?.error?.message || json?.message || `HTTP ${res.status}`;
    const code = json?.error?.code ? ` [${json.error.code}]` : "";
    throw new Error(`發布失敗${code}：${detail}`);
  }

  if (!json.success) throw new Error(json.error?.message || "發布失敗");
  return json.data as { jobId: string; publishedMenus: any[] };
}

// ── Version history ───────────────────────────────────────────────────────────

export async function listRmVersions(draftId: string) {
  await requireUser();
  const { data, error } = await supabase
    .from("rm_rich_menu_versions")
    .select("*")
    .eq("draft_id", draftId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
