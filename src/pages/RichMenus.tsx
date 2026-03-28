import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  listRmDrafts, deleteRmDraft, createRmDraft,
  listRmFolders, createRmFolder, renameRmFolder, deleteRmFolder, saveRmFolderOrder,
  saveRmDraft,
  RmDraft, RmFolder,
} from "@/lib/richMenuDb";
import ConfirmModal from "@/components/ConfirmModal";

// ── Schedule Modal ─────────────────────────────────────────────────────────────
function ScheduleModal({ draft, onClose, onUpdated }: {
  draft: RmDraft;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const existing = draft.scheduled_at ? new Date(draft.scheduled_at) : new Date();
  const [year, setYear] = useState(existing.getFullYear());
  const [month, setMonth] = useState(existing.getMonth() + 1);
  const [day, setDay] = useState(existing.getDate());
  const [hour, setHour] = useState(existing.getHours());
  const [min, setMin] = useState(Math.ceil(existing.getMinutes() / 5) * 5 % 60);
  const [saving, setSaving] = useState(false);

  const pad = (n: number) => String(n).padStart(2, "0");

  const handleUpdate = async () => {
    setSaving(true);
    const scheduledAt = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(min)}:00`;
    await saveRmDraft(draft.id, { data: { ...draft.data, scheduled_at: scheduledAt }, scheduled_at: scheduledAt });
    setSaving(false);
    onUpdated();
    onClose();
  };

  const handleCancel = async () => {
    setSaving(true);
    const { scheduled_at, ...rest } = draft.data as any;
    await saveRmDraft(draft.id, { data: rest, scheduled_at: null });
    setSaving(false);
    onUpdated();
    onClose();
  };

  const selectCls = "w-full rounded-lg border border-[#E0E0E0] px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#A35D5D]";

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[340px] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="text-base font-semibold text-[#1A1A1A]">排程設定</h2>
            <p className="text-xs text-[#8A8A8A] mt-0.5 truncate max-w-[220px]">{draft.name}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-[#AAAAAA] hover:bg-[#F5F5F5]">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-5 pb-2 space-y-4">
          <div>
            <div className="text-xs font-medium text-[#6B6B6B] mb-2">日期</div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-[#AAAAAA] mb-0.5 block">年</label>
                <select value={year} onChange={e => setYear(Number(e.target.value))} className={selectCls}>
                  {[2025,2026,2027,2028].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-[#AAAAAA] mb-0.5 block">月</label>
                <select value={month} onChange={e => setMonth(Number(e.target.value))} className={selectCls}>
                  {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-[#AAAAAA] mb-0.5 block">日</label>
                <select value={day} onChange={e => setDay(Number(e.target.value))} className={selectCls}>
                  {Array.from({length:31},(_,i)=>i+1).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-[#6B6B6B] mb-2">時間</div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-[10px] text-[#AAAAAA] mb-0.5 block">時</label>
                <select value={hour} onChange={e => setHour(Number(e.target.value))} className={selectCls}>
                  {Array.from({length:24},(_,i)=>i).map(h => <option key={h} value={h}>{pad(h)}</option>)}
                </select>
              </div>
              <div className="pb-2 text-[#AAAAAA] text-sm">:</div>
              <div className="flex-1">
                <label className="text-[10px] text-[#AAAAAA] mb-0.5 block">分</label>
                <select value={min} onChange={e => setMin(Number(e.target.value))} className={selectCls}>
                  {[0,5,10,15,20,25,30,35,40,45,50,55].map(m => <option key={m} value={m}>{pad(m)}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>
        <div className="px-4 py-4 flex gap-2">
          <button onClick={handleUpdate} disabled={saving} className="flex-1 py-2.5 text-sm font-semibold text-white bg-[#A35D5D] hover:bg-[#8F4A4A] rounded-xl transition-colors disabled:opacity-50">更新排程</button>
          <button onClick={handleCancel} disabled={saving} className="flex-1 py-2.5 text-sm font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-xl transition-colors disabled:opacity-50">取消排程</button>
        </div>
      </div>
    </div>
  );
}

// ── Folder Create Modal ────────────────────────────────────────────────────────
function FolderCreateModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = React.useState("");
  React.useEffect(() => { if (open) setName(""); }, [open]);
  if (!open) return null;
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) { onCreate(name.trim()); onClose(); }
  };
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-[92%] max-w-sm bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/60 overflow-hidden">
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-[#FBEBEE] border border-[#E7C9CD] flex items-center justify-center">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#A35D5D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div>
              <div className="text-base font-semibold text-[#2B2B2B]">新增資料夾</div>
              <div className="text-xs text-[#AAAAAA]">為圖文選單建立分類資料夾</div>
            </div>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="px-6 pb-6">
          <label className="block text-xs font-medium text-[#6B6B6B] mb-2">資料夾名稱</label>
          <input
            autoFocus type="text" value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例如：節慶活動、常設選單..."
            className="w-full rounded-xl border border-[#E7C9CD] bg-white px-4 py-3 text-sm text-[#2B2B2B] placeholder-[#C4A8AB] focus:outline-none focus:ring-2 focus:ring-[#A35D5D] focus:border-[#A35D5D] transition"
          />
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm text-[#555555] hover:bg-[#F5F5F5] rounded-xl transition-colors font-medium">取消</button>
            <button type="submit" disabled={!name.trim()} className="px-5 py-2.5 text-sm font-semibold text-white bg-[#A35D5D] hover:bg-[#8F4A4A] rounded-xl transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed">建立</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── New Rich Menu Modal ────────────────────────────────────────────────────────
function NewRichMenuModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("新圖文選單");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setErr(null);
    try {
      const id = await createRmDraft(name.trim());
      onCreated(id);
    } catch (e: any) {
      setErr(e?.message || "建立失敗");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0E3E5]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#FBEBEE] border border-[#E7C9CD] flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A35D5D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="3" x2="12" y2="21"/>
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#2B2B2B]">新增多層圖文選單</h2>
              <p className="text-xs text-[#AAAAAA]">建立 LINE 圖文選單草稿</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-[#AAAAAA] hover:bg-[#F5F5F5] hover:text-[#6B6B6B] transition-colors">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleCreate} className="px-6 py-5">
          <label className="block text-xs font-medium text-[#6B6B6B] mb-2">草稿名稱</label>
          <input
            autoFocus type="text" value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例如：主選單 2025年版"
            className="w-full rounded-xl border border-[#E7C9CD] bg-white px-4 py-3 text-sm text-[#2B2B2B] placeholder-[#C4A8AB] focus:outline-none focus:ring-2 focus:ring-[#A35D5D] focus:border-[#A35D5D] transition"
          />
          <div className="mt-3 bg-[#FFF7F8] rounded-xl px-4 py-3 text-xs text-[#6B6B6B]">
            <p className="font-medium mb-0.5 text-[#555555]">多層圖文選單</p>
            <p>支援多個選單層，透過按鈕動作在選單間切換，打造豐富的互動體驗。</p>
          </div>
          {err && <p className="mt-3 text-xs text-red-500">{err}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-[#555555] hover:bg-[#F5F5F5] rounded-lg transition-colors">取消</button>
            <button type="submit" disabled={!name.trim() || loading} className="px-5 py-2 text-sm font-medium text-white bg-[#A35D5D] hover:bg-[#8F4A4A] rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? "建立中..." : "建立並編輯"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main RichMenus page ────────────────────────────────────────────────────────
export default function RichMenus() {
  const nav = useNavigate();
  const [drafts, setDrafts] = useState<RmDraft[]>([]);
  const [folders, setFolders] = useState<RmFolder[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; onConfirm: () => void } | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [folderOrder, setFolderOrder] = useState<string[]>([]);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const [schedulingDraft, setSchedulingDraft] = useState<RmDraft | null>(null);

  const isScheduled = (d: RmDraft) => !!(d.scheduled_at && new Date(d.scheduled_at) > new Date());

  useEffect(() => { load(); }, []);

  useEffect(() => {
    setFolderOrder(prev => {
      const existing = prev.filter(id => folders.some(f => f.id === id));
      const newIds = folders.filter(f => !prev.includes(f.id)).map(f => f.id);
      return [...existing, ...newIds];
    });
  }, [folders]);

  async function load() {
    try {
      const [d, f] = await Promise.all([listRmDrafts(), listRmFolders()]);
      setDrafts(d);
      setFolders(f);
    } catch (e: any) {
      setErr(e.message || "讀取失敗");
    }
  }

  async function handleDelete(id: string, name: string) {
    setConfirmState({
      title: `刪除「${name}」`,
      description: "此操作無法復原。",
      onConfirm: async () => {
        setDeleting(id);
        setErr(null);
        try {
          await deleteRmDraft(id);
          await load();
        } catch (e: any) {
          setErr(e.message || "刪除失敗");
        } finally {
          setDeleting(null);
        }
      },
    });
  }

  async function handleCreateFolder(name: string) {
    try {
      await createRmFolder(name);
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
      await renameRmFolder(id, trimmed);
      await load();
    } catch (e: any) {
      setErr(e.message || "重新命名失敗");
    }
  }

  async function handleDeleteFolder(id: string, name: string) {
    setConfirmState({
      title: `刪除資料夾「${name}」`,
      description: "資料夾內的草稿不會被刪除。",
      onConfirm: async () => {
        try {
          await deleteRmFolder(id);
          if (selectedFolder === id) setSelectedFolder("all");
          await load();
        } catch (e: any) {
          setErr(e.message || "刪除資料夾失敗");
        }
      },
    });
  }

  const orderedFolders = folderOrder
    .map(id => folders.find(f => f.id === id))
    .filter(Boolean) as RmFolder[];

  const tabs = [
    { id: "all", label: "全部", isFolder: false },
    { id: "uncategorized", label: "未分類", isFolder: false },
    ...orderedFolders.map(f => ({ id: f.id, label: f.name, isFolder: true })),
  ];

  const visibleDrafts = drafts.filter(d => {
    if (selectedFolder === "all") return true;
    if (selectedFolder === "uncategorized") return !d.folder_id;
    return d.folder_id === selectedFolder;
  }).filter(d => {
    if (!searchQuery) return true;
    return d.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const getFolderName = (d: RmDraft) => {
    if (!d.folder_id) return "未分類";
    return folders.find(f => f.id === d.folder_id)?.name || "未分類";
  };

  return (
    <div className="space-y-6">
      {err && <div className="mb-4 bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">{err}</div>}

      <div>
      {/* Search Bar */}
      <div className="bg-white border border-[#EBEBEB] rounded-xl px-4 py-3 mb-4 flex items-center gap-3 shadow-sm">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6B6B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="m21 21-4.35-4.35" /></svg>
          <input
            type="text" placeholder="搜尋圖文選單名稱..."
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-[#E8E8E8] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#A35D5D] focus:border-[#A35D5D] placeholder-[#AAAAAA]"
          />
        </div>
        <button
          className="shrink-0 px-4 py-2 text-sm font-semibold text-white bg-[#A35D5D] hover:bg-[#8F4A4A] rounded-xl transition-colors flex items-center gap-1.5 shadow-md"
          onClick={() => setShowNewModal(true)}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          新增多層圖文選單
        </button>
      </div>

      {/* Folder Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none mb-5 pl-3">
        <span className="shrink-0 text-[#AAAAAA]">
          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
        </span>
        {tabs.map(tab => {
            const isActive = selectedFolder === tab.id;
            const isEditing = editingFolderId === tab.id;

            if (isEditing) {
              return (
                <span key={tab.id} className="shrink-0">
                  <input
                    autoFocus value={editingFolderName}
                    onChange={e => setEditingFolderName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") handleRenameFolder(tab.id, editingFolderName);
                      if (e.key === "Escape") setEditingFolderId(null);
                    }}
                    onBlur={() => handleRenameFolder(tab.id, editingFolderName)}
                    className="px-3 py-1.5 text-sm border border-[#A35D5D] rounded-full outline-none focus:ring-1 focus:ring-[#A35D5D] w-28"
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
                  saveRmFolderOrder(next);
                }}
                className={`shrink-0 flex items-center rounded-full text-sm font-medium transition-colors whitespace-nowrap select-none
                  ${tab.isFolder ? "cursor-grab active:cursor-grabbing" : ""}
                  ${dragOverId === tab.id ? "ring-2 ring-[#A35D5D] ring-offset-1" : ""}
                  ${isActive ? "bg-[#FBEBEE] text-[#A35D5D] shadow-sm border border-transparent" : "bg-white text-[#555555] border border-[#E8E8E8] hover:bg-[#F5F5F5] hover:text-[#1A1A1A]"}`}
              >
                <button onClick={() => setSelectedFolder(tab.id)} className={`pl-4 ${isActive && tab.isFolder ? "pr-2" : "pr-4"} py-1.5 font-medium`}>
                  {tab.label}
                </button>
                {isActive && tab.isFolder && (
                  <span className="flex items-center gap-0.5 pr-2">
                    <button onClick={e => { e.stopPropagation(); setEditingFolderName(tab.label); setEditingFolderId(tab.id); }} className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-[#8F4A4A] text-[#E8A4A9] transition-colors" title="重新命名">
                      <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487a2.1 2.1 0 1 1 2.97 2.97L7.5 19.79l-4 1 1-4z" /></svg>
                    </button>
                    <button onClick={e => { e.stopPropagation(); handleDeleteFolder(tab.id, tab.label); }} className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-[#8F4A4A] text-[#E8A4A9] transition-colors" title="刪除資料夾">
                      <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                    </button>
                  </span>
                )}
              </span>
            );
          })}
          <button onClick={() => setShowFolderModal(true)} className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-[#888888] border border-[#E8E8E8] bg-white hover:bg-[#F5F5F5] hover:text-[#1A1A1A] transition-colors" title="新增資料夾">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          </button>
        </div>

      {/* Table */}
      <div className="bg-white border border-[#EBEBEB] rounded-2xl shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#F0F0F0] bg-[#FAFAFA]">
              <th className="text-left px-5 py-3 font-medium text-[#4F4F4F] text-xs tracking-wide">選單名稱</th>
              <th className="text-left px-5 py-3 font-medium text-[#4F4F4F] text-xs tracking-wide">選單數量</th>
              <th className="text-left px-5 py-3 font-medium text-[#4F4F4F] text-xs tracking-wide">資料夾</th>
              <th className="text-left px-5 py-3 font-medium text-[#4F4F4F] text-xs tracking-wide">狀態</th>
              <th className="text-left px-5 py-3 font-medium text-[#4F4F4F] text-xs tracking-wide">最後更新</th>
              <th className="text-right px-5 py-3 font-medium text-[#4F4F4F] text-xs tracking-wide">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0F0F0]">
            {visibleDrafts.map(d => (
              <tr key={d.id} className="hover:bg-[#FAFAFA] transition-colors">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#FBEBEE] flex items-center justify-center shrink-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A35D5D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="3" x2="12" y2="21"/>
                      </svg>
                    </div>
                    <span
                      className="font-medium text-[#2B2B2B] hover:text-[#A35D5D] cursor-pointer transition-colors"
                      onClick={() => nav(`/rich-menus/${d.id}/edit`)}
                    >
                      {d.name}
                    </span>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-[#6B6B6B]">
                  <span className="inline-flex items-center gap-1.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="3" x2="12" y2="21"/>
                    </svg>
                    {(d.data?.menus ?? []).length} 個選單層
                  </span>
                </td>
                <td className="px-5 py-3.5 text-[#6B6B6B]">{getFolderName(d)}</td>
                <td className="px-5 py-3.5">
                  {isScheduled(d) ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#EEF2FF] text-[#4F46E5]">已排程</span>
                  ) : (
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${d.status === "published" ? "bg-[#EAF4ED] text-[#4E735D]" : "bg-[#F6F0F1] text-[#6B6B6B]"}`}>
                      {d.status === "published" ? "已發布" : "草稿"}
                    </span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-[#AAAAAA] text-xs tabular-nums">
                  {new Date(d.updated_at).toLocaleString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center justify-end gap-1">
                    {isScheduled(d) && (
                      <button
                        className="w-9 h-9 flex items-center justify-center text-[#4F46E5] hover:text-[#4F46E5] hover:bg-[#EEF2FF] rounded-lg transition-colors"
                        onClick={() => setSchedulingDraft(d)}
                        title="排程設定"
                      >
                        <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                      </button>
                    )}
                    <button
                      className="w-9 h-9 flex items-center justify-center text-[#8A8A8A] hover:text-[#A35D5D] hover:bg-[#FBEBEE] rounded-lg transition-colors"
                      onClick={() => nav(`/rich-menus/${d.id}/edit`)}
                      title="編輯"
                    >
                      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    <button
                      className="w-9 h-9 flex items-center justify-center text-[#8A8A8A] hover:text-[#B85C5C] hover:bg-[#FBEBEE] rounded-lg transition-colors disabled:opacity-40"
                      disabled={deleting === d.id}
                      onClick={() => handleDelete(d.id, d.name)}
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

            {visibleDrafts.length === 0 && (
              <tr>
                <td colSpan={6} className="py-24 text-center">
                  <div className="flex flex-col items-center justify-center opacity-70">
                    <div className="w-16 h-16 bg-[#F0F0F0] rounded-full flex items-center justify-center mb-4 text-3xl">📋</div>
                    <p className="text-[#2B2B2B] font-medium">尚無圖文選單</p>
                    <p className="text-sm text-[#6B6B6B] mt-1">點擊「新增多層圖文選單」開始建立</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </div>

      {showNewModal && (
        <NewRichMenuModal
          onClose={() => setShowNewModal(false)}
          onCreated={id => { setShowNewModal(false); nav(`/rich-menus/${id}/edit`); }}
        />
      )}

      <FolderCreateModal
        open={showFolderModal}
        onClose={() => setShowFolderModal(false)}
        onCreate={handleCreateFolder}
      />

      <ConfirmModal
        open={!!confirmState}
        title={confirmState?.title || ""}
        description={confirmState?.description || ""}
        confirmText="刪除"
        danger
        onConfirm={confirmState?.onConfirm || (() => {})}
        onClose={() => setConfirmState(null)}
      />

      {schedulingDraft && (
        <ScheduleModal
          draft={schedulingDraft}
          onClose={() => setSchedulingDraft(null)}
          onUpdated={load}
        />
      )}
    </div>
  );
}
