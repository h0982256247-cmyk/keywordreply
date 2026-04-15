import React, { useEffect, useState } from "react";
import ConfirmModal from "@/components/ConfirmModal";
import { supabase } from "@/lib/supabase";

// ── Types ────────────────────────────────────────────────────────────────────
type Tag = {
  id: string;
  name: string;
  color: string;
  user_count: number;
  created_at: string;
};

type TagForm = {
  id?: string;
  name: string;
  color: string;
};

// ── Color presets ────────────────────────────────────────────────────────────
const TAG_COLORS = [
  "#A35D5D", "#E57373", "#FF8A65", "#FFB74D",
  "#81C784", "#4DB6AC", "#64B5F6", "#7986CB",
  "#BA68C8", "#F06292", "#8D6E63", "#78909C",
];

const emptyForm: TagForm = { name: "", color: "#A35D5D" };

// ── Component ────────────────────────────────────────────────────────────────
export default function Tags() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<TagForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.rpc("list_tags_with_count");
    setTags(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.name.trim()) { setMsg("請輸入標籤名稱"); return; }
    setSaving(true);
    await supabase.rpc("upsert_tag", { tag_id: form.id || null, tag_name: form.name.trim(), tag_color: form.color });
    await load();
    setSaving(false);
    setModalOpen(false);
    setForm(emptyForm);
    setMsg(null);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.rpc("delete_tag", { tag_id: deleteId });
    setTags(prev => prev.filter(t => t.id !== deleteId));
    setDeleteId(null);
  };

  const totalUsers = tags.reduce((sum, t) => sum + t.user_count, 0);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-[#6B6B6B]">載入中...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* ── Header stats ── */}
      <div className="bg-white rounded-2xl border border-[#E7C9CD] shadow-sm p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <div className="text-2xl font-bold text-[#2B2B2B]">{tags.length}</div>
              <div className="text-xs text-[#AAAAAA]">標籤數量</div>
            </div>
            <div className="w-px h-10 bg-[#E7C9CD]" />
            <div>
              <div className="text-2xl font-bold text-[#2B2B2B]">{totalUsers.toLocaleString()}</div>
              <div className="text-xs text-[#AAAAAA]">已貼標用戶</div>
            </div>
          </div>
          <button
            onClick={() => { setForm(emptyForm); setMsg(null); setModalOpen(true); }}
            className="px-4 py-2 text-sm font-medium text-white bg-[#A35D5D] hover:bg-[#8F4A4A] rounded-xl transition-colors"
          >
            + 新增標籤
          </button>
        </div>
      </div>

      {/* ── Tag list ── */}
      {tags.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E7C9CD] shadow-sm p-12 text-center">
          <div className="text-4xl mb-3">🏷️</div>
          <div className="text-sm text-[#6B6B6B] mb-1">尚未建立任何標籤</div>
          <div className="text-xs text-[#AAAAAA]">建立標籤後，可在關鍵字規則中設定自動貼標</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tags.map(tag => (
            <div
              key={tag.id}
              className="bg-white rounded-2xl border border-[#E7C9CD] shadow-sm p-4 hover:shadow-md transition-shadow group"
            >
              {/* Tag header */}
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-4 h-4 rounded-full shrink-0"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="text-sm font-semibold text-[#2B2B2B] flex-1 truncate">{tag.name}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => { setForm({ id: tag.id, name: tag.name, color: tag.color }); setMsg(null); setModalOpen(true); }}
                    className="p-1 rounded-lg text-[#AAAAAA] hover:text-[#A35D5D] hover:bg-[#FBEBEE] transition-colors"
                    title="編輯"
                  >
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setDeleteId(tag.id)}
                    className="p-1 rounded-lg text-[#AAAAAA] hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="刪除"
                  >
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#AAAAAA" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  <span className="text-sm font-medium text-[#2B2B2B]">{tag.user_count.toLocaleString()}</span>
                  <span className="text-xs text-[#AAAAAA]">人</span>
                </div>
                <span className="text-xs text-[#CCCCCC]">{new Date(tag.created_at).toLocaleDateString("zh-TW")}</span>
              </div>

              {/* Source breakdown (placeholder) */}
              <div className="mt-3 pt-3 border-t border-[#F0E3E5]">
                <div className="flex gap-2 text-xs text-[#AAAAAA]">
                  <span className="px-2 py-0.5 bg-[#FBEBEE] text-[#A35D5D] rounded-full">關鍵字</span>
                  <span className="px-2 py-0.5 bg-[#F0F7FF] text-[#4A90D9] rounded-full">圖文選單</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Create/Edit Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-[#2B2B2B] mb-4">{form.id ? "編輯標籤" : "新增標籤"}</h3>

            {/* Name */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-[#6B6B6B] mb-1">標籤名稱</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="例如：訂房意向"
                className="w-full rounded-xl border border-[#E7C9CD] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#A35D5D]"
                autoFocus
              />
            </div>

            {/* Color */}
            <div className="mb-5">
              <label className="block text-xs font-medium text-[#6B6B6B] mb-2">標籤顏色</label>
              <div className="flex flex-wrap gap-2">
                {TAG_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setForm(f => ({ ...f, color: c }))}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${form.color === c ? "border-[#2B2B2B] scale-110" : "border-transparent hover:scale-105"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className="mb-5 p-3 bg-[#FAF8F8] rounded-xl">
              <div className="text-xs text-[#AAAAAA] mb-2">預覽</div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: form.color }} />
                <span className="text-sm font-medium text-[#2B2B2B]">{form.name || "標籤名稱"}</span>
              </div>
            </div>

            {/* Error */}
            {msg && <div className="text-xs text-red-500 mb-3">{msg}</div>}

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setModalOpen(false); setForm(emptyForm); setMsg(null); }}
                className="px-4 py-2 text-sm text-[#6B6B6B] hover:bg-[#F5F5F5] rounded-xl transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-[#A35D5D] hover:bg-[#8F4A4A] rounded-xl transition-colors disabled:opacity-50"
              >
                {saving ? "儲存中..." : "儲存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      <ConfirmModal
        open={!!deleteId}
        title="刪除標籤"
        message="刪除後，所有用戶的此標籤也會被移除，確定要刪除嗎？"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
