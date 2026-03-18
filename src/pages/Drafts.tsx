import React, { useEffect, useMemo, useState } from "react";
import { listDocs, deleteDoc, createDoc, listTemplates, TemplateRow, deleteTemplate } from "@/lib/db";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { seedBubble, seedCarousel, seedVideoBubble } from "@/lib/templates";

// ─── Folder create modal ────────────────────────────────────────────────────
function FolderCreateModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = React.useState("");

  React.useEffect(() => {
    if (open) setName("");
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) { onCreate(name.trim()); onClose(); }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-[92%] max-w-sm bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/60 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-100 to-purple-100 border border-pink-200/60 flex items-center justify-center">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#c084fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div>
              <div className="text-base font-semibold text-stone-900">新增資料夾</div>
              <div className="text-xs text-stone-400">為訊息建立分類資料夾</div>
            </div>
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 pb-6">
          <label className="block text-xs font-medium text-stone-500 mb-2">資料夾名稱</label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例如：活動訊息、客服範本..."
            className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-pink-300 transition"
          />
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm text-stone-600 hover:bg-stone-100 rounded-xl transition-colors font-medium"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 rounded-xl transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              建立
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Type icon for table rows ───────────────────────────────────────────────
function TypeIcon({ type, doc }: { type: string; doc?: any }) {
  if (type === "bubble" && (doc?.section?.hero ?? []).some((h: any) => h.kind === "hero_video")) {
    return (
      <span className="flex items-center gap-1.5 text-orange-500 font-medium">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="3" width="20" height="18" rx="2" /><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
        </svg>
        影片
      </span>
    );
  }
  if (type === "carousel") {
    return (
      <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="5" width="6" height="14" rx="1" /><rect x="9" y="3" width="6" height="18" rx="1" /><rect x="16" y="5" width="6" height="14" rx="1" />
        </svg>
        多頁訊息
      </span>
    );
  }
  if (type === "bubble") {
    return (
      <span className="flex items-center gap-1.5 text-teal-600 font-medium">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" />
        </svg>
        單頁訊息
      </span>
    );
  }
  if (type === "text") {
    return (
      <span className="flex items-center gap-1.5 text-blue-500 font-medium">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M4 7V4h16v3" /><line x1="12" y1="4" x2="12" y2="20" /><line x1="9" y1="20" x2="15" y2="20" />
        </svg>
        純文字
      </span>
    );
  }
  if (type === "image") {
    return (
      <span className="flex items-center gap-1.5 text-purple-500 font-medium">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        圖片
      </span>
    );
  }
  return <span className="text-stone-400 text-xs">{type}</span>;
}

// ─── Message type definitions ─────────────────────────────────────────────────
const MSG_TYPES = [
  {
    id: "text", label: "純文字", enabled: true,
    desc: "純文字訊息支援表情符號，適合簡單的問候或通知。",
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path d="M4 7V4h16v3" /><line x1="12" y1="4" x2="12" y2="20" /><line x1="9" y1="20" x2="15" y2="20" />
      </svg>
    ),
  },
  {
    id: "sticker", label: "貼圖", enabled: false,
    desc: "發送 LINE 官方貼圖，增加訊息的趣味性。",
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
      </svg>
    ),
  },
  {
    id: "image", label: "圖片", enabled: false,
    desc: "發送單張圖片訊息，支援 JPEG、PNG 格式。",
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
      </svg>
    ),
  },
  {
    id: "coupon", label: "優惠券", enabled: false,
    desc: "發送優惠券訊息，適合促銷活動和會員回饋。",
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path d="M20 12V22H4V12" /><path d="M22 7H2v5h20V7z" /><path d="M12 22V7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
      </svg>
    ),
  },
  {
    id: "imagemap", label: "圖文訊息", enabled: false,
    desc: "在圖片上設定可點擊區域，引導用戶執行不同動作。",
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="12" y1="3" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    id: "advvideo", label: "進階影片", enabled: false,
    desc: "發送附有動作按鈕的進階影片訊息。",
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m10 9 5 3-5 3V9z" />
        <line x1="16" y1="2" x2="16" y2="4" /><line x1="8" y1="2" x2="8" y2="4" />
      </svg>
    ),
  },
  {
    id: "video", label: "影片", enabled: true, direct: true,
    desc: "使用影片 Bubble 建立含播放鍵的影片訊息。",
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
      </svg>
    ),
  },
  {
    id: "audio", label: "語音訊息", enabled: false,
    desc: "發送語音訊息，適合個人化的溝通方式。",
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    ),
  },
  {
    id: "survey", label: "問卷", enabled: false,
    desc: "發送問卷調查，收集用戶意見與回饋。",
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="12" y2="16" />
      </svg>
    ),
  },
  {
    id: "singlepage", label: "單頁訊息", enabled: true, direct: true,
    desc: "建立單頁 Flex Message Bubble，適合單一主題的豐富訊息。",
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="8" y1="16" x2="12" y2="16" />
      </svg>
    ),
  },
  {
    id: "multipage", label: "多頁訊息", enabled: true, direct: true,
    desc: "建立多頁輪播 Carousel，適合展示多個產品或活動（預設 3 張）。",
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="4" width="14" height="16" rx="2" /><path d="M8 2h12a2 2 0 0 1 2 2v14" />
      </svg>
    ),
  },
];

// ─── New Message Modal ────────────────────────────────────────────────────────
function NewMessageModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState("singlepage");
  const [tpls, setTpls] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const directSeedMap: Record<string, () => any> = useMemo(() => ({
    singlepage: seedBubble,
    multipage: () => seedCarousel(3),
    video: seedVideoBubble,
    text: () => ({ type: "text", title: "新草稿（純文字）", text: "" }),
  }), []);

  async function createFromDoc(doc: any) {
    setLoading(true);
    setErr(null);
    try {
      const id = await createDoc(doc);
      onCreated(id);
    } catch (e: any) {
      setErr(e?.message || "建立失敗");
      setLoading(false);
    }
  }

  const currentType = MSG_TYPES.find(t => t.id === selectedType)!;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
          <h2 className="text-base font-semibold text-stone-900">建立新訊息</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-stone-400 hover:bg-neutral-100 hover:text-stone-600 transition-colors"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5">
          <>
            <p className="text-xs font-medium text-stone-500 mb-3 tracking-wide uppercase">選擇訊息類型</p>

            {/* Type Grid */}
            <div className="grid grid-cols-6 gap-2 mb-4">
              {MSG_TYPES.map(t => (
                <button
                  key={t.id}
                  disabled={!t.enabled}
                  onClick={() => t.enabled && setSelectedType(t.id)}
                  className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all
                      ${!t.enabled ? "opacity-40 cursor-not-allowed border-neutral-100 bg-neutral-50 text-stone-400" :
                      selectedType === t.id
                        ? "border-emerald-400 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-400"
                        : "border-neutral-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-neutral-50"
                    }`}
                >
                  <span className={selectedType === t.id && t.enabled ? "text-emerald-600" : "text-stone-500"}>
                    {t.icon}
                  </span>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Description */}
            <div className="bg-neutral-50 rounded-xl px-4 py-3 flex items-start gap-3 min-h-[64px]">
              <span className="text-stone-400 mt-0.5 shrink-0">{currentType.icon}</span>
              <div>
                <span className="text-sm font-medium text-stone-700 block mb-0.5">{currentType.label}</span>
                <span className="text-xs text-stone-500">{currentType.desc}</span>
              </div>
            </div>

            {err && <p className="mt-3 text-xs text-red-500">{err}</p>}
          </>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-stone-600 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            disabled={!currentType.enabled || loading}
            onClick={() => {
              const seedFn = directSeedMap[currentType.id];
              if (seedFn) {
                createFromDoc(seedFn());
              } else {
                // This case should ideally not be reached if all enabled types have a directSeedMap entry
                // or if there was a step 2 for templates.
                // For now, we'll just create a default bubble if no direct seed function is found.
                createFromDoc(seedBubble());
              }
            }}
            className="px-5 py-2 text-sm font-medium text-white bg-pink-400 hover:bg-pink-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "建立中..." : "建立"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Drafts page ─────────────────────────────────────────────────────────
export default function Drafts() {
  const nav = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "used" | "unused">("all");

  const [showNewModal, setShowNewModal] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [folderOrder, setFolderOrder] = useState<string[]>([]);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragIdRef = React.useRef<string | null>(null);

  useEffect(() => { load(); }, [nav]);


  // Sync folder order from rows; preserve local order if already set
  useEffect(() => {
    const folders = rows.filter(r => r.content.type === "folder");
    const sorted = [...folders].sort((a, b) => (a.content.order ?? 0) - (b.content.order ?? 0));
    setFolderOrder(prev => {
      const existing = prev.filter(id => sorted.some(f => f.id === id));
      const newIds = sorted.filter(f => !prev.includes(f.id)).map(f => f.id);
      return [...existing, ...newIds];
    });
  }, [rows]);

  async function saveFolderOrder(orderedIds: string[]) {
    const user = await supabase.auth.getUser();
    const uid = user.data.user!.id;
    const foldersMap = Object.fromEntries(rows.filter(r => r.content.type === "folder").map(r => [r.id, r]));
    await Promise.all(orderedIds.map((id, idx) => {
      const f = foldersMap[id];
      if (!f) return Promise.resolve();
      return supabase.from("docs")
        .update({ content: { ...f.content, order: idx }, updated_at: new Date().toISOString() })
        .eq("id", id).eq("owner_id", uid);
    }));
  }

  async function load() {
    try {
      const u = await supabase.auth.getUser();
      if (!u.data.user) return nav("/login");
      setRows(await listDocs());
    } catch (e: any) {
      setErr(e.message || "讀取失敗");
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`確定要刪除「${title}」嗎？此操作無法復原。`)) return;
    setDeleting(id);
    setErr(null);
    try {
      await deleteDoc(id);
      await load();
      if (id === selectedFolder) setSelectedFolder("all");
    } catch (e: any) {
      setErr(e.message || "刪除失敗");
    } finally {
      setDeleting(null);
    }
  }

  async function handleCreateFolder(name: string) {
    try {
      const folderDoc = { type: "folder", id: crypto.randomUUID(), name };
      await createDoc(folderDoc as any);
      await load();
    } catch (e: any) {
      setErr(e.message || "建立資料夾失敗");
    }
  }

  async function handleRenameFolder(id: string, newName: string) {
    const trimmed = newName.trim();
    setEditingFolderId(null);
    if (!trimmed) return;
    try {
      const user = await supabase.auth.getUser();
      const folder = rows.find(r => r.id === id);
      if (!folder) return;
      await supabase.from("docs")
        .update({ content: { ...folder.content, name: trimmed }, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("owner_id", user.data.user!.id);
      await load();
    } catch (e: any) {
      setErr(e.message || "重新命名失敗");
    }
  }

  async function handleDeleteFolder(id: string, name: string) {
    if (!confirm(`確定要刪除資料夾「${name}」嗎？資料夾內的訊息不會被刪除。`)) return;
    try {
      await deleteDoc(id);
      if (selectedFolder === id) setSelectedFolder("all");
      await load();
    } catch (e: any) {
      setErr(e.message || "刪除資料夾失敗");
    }
  }

  const allFolders = rows.filter(r => r.content.type === "folder");
  const folders = folderOrder
    .map(id => allFolders.find(f => f.id === id))
    .filter(Boolean) as typeof allFolders;

  const tabs = [
    { id: "all", label: "全部", isFolder: false },
    { id: "uncategorized", label: "未分類", isFolder: false },
    ...folders.map(f => ({ id: f.id, label: f.content.name, isFolder: true })),
  ];

  const getFolderName = (r: any) => {
    if (!r.content.folderId) return "未分類";
    const folder = folders.find(f => f.id === r.content.folderId);
    return folder?.content.name || "未分類";
  };

  const files = rows.filter(r => {
    if (r.content.type === "folder") return false;
    if (selectedFolder === "all") return true;
    if (selectedFolder === "uncategorized") return !r.content.folderId;
    return r.content.folderId === selectedFolder;
  }).filter(r => {
    const name = (r.content.name || r.title || "").toLowerCase();
    if (searchQuery && !name.includes(searchQuery.toLowerCase())) return false;
    if (statusFilter === "used" && r.status !== "publishable") return false;
    if (statusFilter === "unused" && r.status === "publishable") return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>

        {err && <div className="mb-4 bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">{err}</div>}

        {/* Folder Tabs + Create Button */}
        <div className="flex items-center justify-between gap-2 mb-5">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none flex-1">
          {tabs.map(tab => {
            const isActive = selectedFolder === tab.id;
            const isEditing = editingFolderId === tab.id;

            if (isEditing) {
              return (
                <span key={tab.id} className="shrink-0">
                  <input
                    autoFocus
                    value={editingFolderName}
                    onChange={e => setEditingFolderName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") handleRenameFolder(tab.id, editingFolderName);
                      if (e.key === "Escape") setEditingFolderId(null);
                    }}
                    onBlur={() => handleRenameFolder(tab.id, editingFolderName)}
                    className="px-3 py-1.5 text-sm border border-pink-400 rounded-full outline-none focus:ring-1 focus:ring-pink-400 w-28"
                  />
                </span>
              );
            }

            return (
              <span
                key={tab.id}
                draggable={tab.isFolder}
                onDragStart={() => { if (tab.isFolder) dragIdRef.current = tab.id; }}
                onDragOver={e => { if (tab.isFolder) { e.preventDefault(); setDragOverId(tab.id); } }}
                onDragLeave={() => setDragOverId(null)}
                onDrop={e => {
                  e.preventDefault();
                  setDragOverId(null);
                  const from = dragIdRef.current;
                  dragIdRef.current = null;
                  if (!from || from === tab.id || !tab.isFolder) return;
                  const next = [...folderOrder];
                  const fi = next.indexOf(from);
                  const ti = next.indexOf(tab.id);
                  if (fi < 0 || ti < 0) return;
                  next.splice(fi, 1);
                  next.splice(ti, 0, from);
                  setFolderOrder(next);
                  saveFolderOrder(next);
                }}
                className={`shrink-0 flex items-center rounded-full text-sm font-medium transition-colors whitespace-nowrap select-none
                    ${tab.isFolder ? "cursor-grab active:cursor-grabbing" : ""}
                    ${dragOverId === tab.id ? "ring-2 ring-pink-400 ring-offset-1" : ""}
                    ${isActive
                    ? "bg-pink-400 text-white shadow-sm"
                    : "bg-white text-stone-700 border border-stone-200 hover:bg-neutral-50"
                  }`}
              >
                {/* Name — clickable for selection */}
                <button
                  onClick={() => setSelectedFolder(tab.id)}
                  className={`pl-4 ${isActive && tab.isFolder ? "pr-2" : "pr-4"} py-1.5 font-medium`}
                >
                  {tab.label}
                </button>

                {/* Edit / Delete — only when active */}
                {isActive && tab.isFolder && (
                  <span className="flex items-center gap-0.5 pr-2">
                    <button
                      onClick={e => { e.stopPropagation(); setEditingFolderName(tab.label); setEditingFolderId(tab.id); }}
                      className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-pink-500 text-pink-100 transition-colors"
                      title="重新命名"
                    >
                      <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487a2.1 2.1 0 1 1 2.97 2.97L7.5 19.79l-4 1 1-4z" />
                      </svg>
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteFolder(tab.id, tab.label); }}
                      className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-pink-500 text-pink-100 transition-colors"
                      title="刪除資料夾"
                    >
                      <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                      </svg>
                    </button>
                  </span>
                )}
              </span>
            );
          })}

          <button
            onClick={() => setShowFolderModal(true)}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-stone-400 border border-stone-200 bg-white hover:bg-neutral-50 hover:text-stone-600 transition-colors"
            title="新增資料夾"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
          <button
            className="shrink-0 ml-4 px-4 py-2 text-sm font-medium text-white bg-pink-400 hover:bg-pink-500 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
            onClick={() => setShowNewModal(true)}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            建立訊息
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="bg-white border border-neutral-200 rounded-xl px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="搜尋訊息名稱..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-pink-400 focus:border-pink-400 placeholder-stone-400"
            />
          </div>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-stone-600 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            篩選類型
          </button>
          <div className="ml-auto flex items-center rounded-lg border border-neutral-200 overflow-hidden text-sm">
            {(["all", "used", "unused"] as const).map((v, i) => (
              <button
                key={v}
                onClick={() => setStatusFilter(v)}
                className={`px-3 py-1.5 transition-colors ${i > 0 ? "border-l border-neutral-200" : ""} ${statusFilter === v ? "bg-pink-400 text-white" : "bg-white text-stone-600 hover:bg-neutral-50"
                  }`}
              >
                {v === "all" ? "全部" : v === "used" ? "已使用" : "未使用"}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-neutral-200 rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50/60">
                <th className="text-left px-5 py-3 font-medium text-stone-400 text-xs tracking-wide">訊息名稱</th>
                <th className="text-left px-5 py-3 font-medium text-stone-400 text-xs tracking-wide">類型</th>
                <th className="text-left px-5 py-3 font-medium text-stone-400 text-xs tracking-wide">資料夾</th>
                <th className="text-left px-5 py-3 font-medium text-stone-400 text-xs tracking-wide">使用狀態</th>
                <th className="text-left px-5 py-3 font-medium text-stone-400 text-xs tracking-wide">最後更新</th>
                <th className="text-right px-5 py-3 font-medium text-stone-400 text-xs tracking-wide">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {files.map(r => (
                <tr key={r.id} className="hover:bg-neutral-50/60 transition-colors">
                  <td className="px-5 py-3.5">
                    <span
                      className="font-medium text-stone-900 hover:text-pink-600 cursor-pointer transition-colors"
                      onClick={() => nav(`/drafts/${r.id}/edit`)}
                    >
                      {r.content.name || r.title || "未命名"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <TypeIcon type={r.content.type} doc={r.content} />
                  </td>
                  <td className="px-5 py-3.5 text-stone-500">{getFolderName(r)}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${r.status === "publishable"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-neutral-100 text-stone-500"
                      }`}>
                      {r.status === "publishable" ? "已使用" : "未使用"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-stone-400 text-xs tabular-nums">
                    {new Date(r.updated_at).toLocaleString("zh-TW", {
                      year: "numeric", month: "2-digit", day: "2-digit",
                      hour: "2-digit", minute: "2-digit", hour12: false,
                    })}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="w-9 h-9 flex items-center justify-center text-stone-400 hover:text-pink-600 hover:bg-pink-50 rounded-lg transition-colors"
                        onClick={e => { e.stopPropagation(); nav(`/drafts/${r.id}/edit`); }}
                        title="編輯"
                      >
                        <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button
                        className="w-9 h-9 flex items-center justify-center text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                        disabled={deleting === r.id}
                        onClick={e => { e.stopPropagation(); handleDelete(r.id, r.title || r.content.name); }}
                        title="刪除"
                      >
                        <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {files.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-24 text-center">
                    <div className="flex flex-col items-center justify-center opacity-70">
                      <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mb-4 text-3xl text-stone-300">📭</div>
                      <p className="text-stone-700 font-medium">沒有訊息</p>
                      <p className="text-sm text-stone-400 mt-1">點擊右上角「建立訊息」開始建立</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-8 text-center text-xs text-stone-300">Flex Editor v1.0.4</div>
      </div>

      {/* New Message Modal */}
      {showNewModal && (
        <NewMessageModal
          onClose={() => setShowNewModal(false)}
          onCreated={id => {
            setShowNewModal(false);
            nav(`/drafts/${id}/edit`);
          }}
        />
      )}

      {/* Folder Create Modal */}
      <FolderCreateModal
        open={showFolderModal}
        onClose={() => setShowFolderModal(false)}
        onCreate={handleCreateFolder}
      />
    </div>
  );
}
