import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  getRmDraft, saveRmDraft, publishRmDraft, makeDefaultMenu, listRmFolders,
  RmDraft, RmMenu, RmArea, RmFolder,
} from "@/lib/richMenuDb";
import GlassSelect from "@/components/GlassSelect";
import ConfirmModal from "@/components/ConfirmModal";

// ── Helpers ────────────────────────────────────────────────────────────────────
function uid() { return crypto.randomUUID(); }

const CANVAS_W = 2500;
const CANVAS_H = 1686;

// ── Validation ─────────────────────────────────────────────────────────────────
function getValidationErrors(menus: RmMenu[]): { menuName: string; issues: string[] }[] {
  return menus.map(menu => {
    const issues: string[] = [];
    if (!menu.imageUrl) issues.push("未上傳選單圖片");
    menu.areas.forEach((area, i) => {
      const n = i + 1;
      const { type, uri, text, richMenuAliasId, data } = area.action;
      if (type === "uri" && !uri?.trim())
        issues.push(`熱區 #${n}（開啟網址）：未填寫網址`);
      else if (type === "message" && !text?.trim())
        issues.push(`熱區 #${n}（發送訊息）：未填寫訊息內容`);
      else if (type === "richmenuswitch" && !richMenuAliasId?.trim())
        issues.push(`熱區 #${n}（切換選單）：未選擇目標選單`);
      else if (type === "postback" && !data?.trim())
        issues.push(`熱區 #${n}（預填欄位）：未填寫欄位內容`);
    });
    return { menuName: menu.name, issues };
  }).filter(v => v.issues.length > 0);
}

// ── Action type labels ─────────────────────────────────────────────────────────
const ACTION_TYPES = [
  { value: "uri", label: "開啟網址" },
  { value: "message", label: "發送訊息" },
  { value: "richmenuswitch", label: "切換選單" },
  { value: "postback", label: "預填欄位" },
];

// ── Area draw / edit canvas ────────────────────────────────────────────────────
function RichMenuCanvas({
  menu,
  selectedAreaId,
  onAreasChange,
  onSelectArea,
}: {
  menu: RmMenu;
  selectedAreaId: string | null;
  onAreasChange: (areas: RmArea[]) => void;
  onSelectArea: (id: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [drawing, setDrawing] = useState(false);
  const [startPt, setStartPt] = useState({ x: 0, y: 0 });
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [dragging, setDragging] = useState<{ areaId: string; startX: number; startY: number; origBounds: RmArea["bounds"] } | null>(null);
  const [resizing, setResizing] = useState<{ areaId: string; handle: string; startX: number; startY: number; origBounds: RmArea["bounds"] } | null>(null);

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        setScale(w / CANVAS_W);
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const ptFromEvent = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return {
      x: Math.round((e.clientX - rect.left) / scale),
      y: Math.round((e.clientY - rect.top) / scale),
    };
  }, [scale]);

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // Check if clicked on an existing area
    const pt = ptFromEvent(e);
    const hit = [...menu.areas].reverse().find(a =>
      pt.x >= a.bounds.x && pt.x <= a.bounds.x + a.bounds.width &&
      pt.y >= a.bounds.y && pt.y <= a.bounds.y + a.bounds.height
    );
    if (hit) {
      onSelectArea(hit.id);
      return;
    }
    onSelectArea(null);
    setDrawing(true);
    setStartPt(pt);
    setDrawRect(null);
    e.preventDefault();
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!drawing) return;
    const pt = ptFromEvent(e);
    setDrawRect({
      x: Math.min(pt.x, startPt.x),
      y: Math.min(pt.y, startPt.y),
      w: Math.abs(pt.x - startPt.x),
      h: Math.abs(pt.y - startPt.y),
    });
  };

  const handleCanvasMouseUp = (e: React.MouseEvent) => {
    if (!drawing) return;
    setDrawing(false);
    if (!drawRect || drawRect.w < 20 || drawRect.h < 20) { setDrawRect(null); return; }
    const newArea: RmArea = {
      id: uid(),
      bounds: { x: drawRect.x, y: drawRect.y, width: drawRect.w, height: drawRect.h },
      action: { type: "uri", label: "", uri: "" },
    };
    const updated = [...menu.areas, newArea];
    onAreasChange(updated);
    onSelectArea(newArea.id);
    setDrawRect(null);
  };

  // Area drag handlers
  const handleAreaMouseDown = (e: React.MouseEvent, area: RmArea) => {
    e.stopPropagation();
    onSelectArea(area.id);
    const rect = containerRef.current!.getBoundingClientRect();
    setDragging({
      areaId: area.id,
      startX: e.clientX,
      startY: e.clientY,
      origBounds: { ...area.bounds },
    });
  };

  const handleResizeMouseDown = (e: React.MouseEvent, area: RmArea, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    setResizing({
      areaId: area.id,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      origBounds: { ...area.bounds },
    });
  };

  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
    if (dragging) {
      const dx = Math.round((e.clientX - dragging.startX) / scale);
      const dy = Math.round((e.clientY - dragging.startY) / scale);
      const b = dragging.origBounds;
      const newX = Math.max(0, Math.min(CANVAS_W - b.width, b.x + dx));
      const newY = Math.max(0, Math.min(CANVAS_H - b.height, b.y + dy));
      onAreasChange(menu.areas.map(a => a.id === dragging.areaId ? { ...a, bounds: { ...a.bounds, x: newX, y: newY } } : a));
    }
    if (resizing) {
      const dx = Math.round((e.clientX - resizing.startX) / scale);
      const dy = Math.round((e.clientY - resizing.startY) / scale);
      const b = resizing.origBounds;
      let { x, y, width, height } = b;
      const h = resizing.handle;
      if (h.includes("e")) width = Math.max(20, b.width + dx);
      if (h.includes("s")) height = Math.max(20, b.height + dy);
      if (h.includes("w")) { x = Math.min(b.x + b.width - 20, b.x + dx); width = b.width - (x - b.x); }
      if (h.includes("n")) { y = Math.min(b.y + b.height - 20, b.y + dy); height = b.height - (y - b.y); }
      x = Math.max(0, x); y = Math.max(0, y);
      width = Math.min(width, CANVAS_W - x); height = Math.min(height, CANVAS_H - y);
      onAreasChange(menu.areas.map(a => a.id === resizing.areaId ? { ...a, bounds: { x, y, width, height } } : a));
    }
  }, [dragging, resizing, scale, menu.areas, onAreasChange]);

  const handleGlobalMouseUp = useCallback(() => {
    setDragging(null);
    setResizing(null);
  }, []);

  useEffect(() => {
    if (dragging || resizing) {
      window.addEventListener("mousemove", handleGlobalMouseMove);
      window.addEventListener("mouseup", handleGlobalMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleGlobalMouseMove);
        window.removeEventListener("mouseup", handleGlobalMouseUp);
      };
    }
  }, [dragging, resizing, handleGlobalMouseMove, handleGlobalMouseUp]);

  const handles = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
  const handlePos: Record<string, { top?: string; bottom?: string; left?: string; right?: string; transform: string }> = {
    n:  { top: "-4px", left: "50%", transform: "translateX(-50%)" },
    ne: { top: "-4px", right: "-4px", transform: "" },
    e:  { top: "50%", right: "-4px", transform: "translateY(-50%)" },
    se: { bottom: "-4px", right: "-4px", transform: "" },
    s:  { bottom: "-4px", left: "50%", transform: "translateX(-50%)" },
    sw: { bottom: "-4px", left: "-4px", transform: "" },
    w:  { top: "50%", left: "-4px", transform: "translateY(-50%)" },
    nw: { top: "-4px", left: "-4px", transform: "" },
  };
  const handleCursor: Record<string, string> = {
    n: "n-resize", ne: "ne-resize", e: "e-resize", se: "se-resize",
    s: "s-resize", sw: "sw-resize", w: "w-resize", nw: "nw-resize",
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-xl overflow-hidden border border-[#E0E0E0] bg-[#F5F5F5] select-none"
      style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}
    >
      {/* Background image or placeholder */}
      {menu.imageUrl ? (
        <img src={menu.imageUrl} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-[#AAAAAA]">
            <svg className="w-12 h-12 mx-auto mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
            <p className="text-sm">尚未上傳圖片</p>
            <p className="text-xs mt-0.5">在右側面板上傳選單背景圖</p>
          </div>
        </div>
      )}

      {/* Draw overlay */}
      <div
        className="absolute inset-0"
        style={{ cursor: drawing ? "crosshair" : "crosshair" }}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
      />

      {/* Existing areas */}
      {menu.areas.map(area => {
        const isSelected = area.id === selectedAreaId;
        const left = area.bounds.x * scale;
        const top = area.bounds.y * scale;
        const width = area.bounds.width * scale;
        const height = area.bounds.height * scale;
        return (
          <div
            key={area.id}
            style={{ position: "absolute", left, top, width, height, boxSizing: "border-box" }}
            className={`border-2 rounded transition-colors ${isSelected ? "border-[#A35D5D] bg-[#A35D5D]/20" : "border-white/70 bg-white/10 hover:bg-white/20"}`}
            onMouseDown={e => handleAreaMouseDown(e, area)}
          >
            {/* Action type badge */}
            <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-medium pointer-events-none select-none truncate max-w-[90%]">
              {ACTION_TYPES.find(t => t.value === area.action.type)?.label || area.action.type}
            </div>
            {/* Resize handles */}
            {isSelected && handles.map(h => (
              <div
                key={h}
                style={{
                  position: "absolute",
                  width: 8, height: 8,
                  borderRadius: 2,
                  background: "white",
                  border: "1.5px solid #A35D5D",
                  cursor: handleCursor[h],
                  zIndex: 10,
                  ...handlePos[h],
                }}
                onMouseDown={e => handleResizeMouseDown(e, area, h)}
              />
            ))}
          </div>
        );
      })}

      {/* Drawing preview rect */}
      {drawing && drawRect && drawRect.w > 4 && drawRect.h > 4 && (
        <div
          style={{
            position: "absolute",
            left: drawRect.x * scale,
            top: drawRect.y * scale,
            width: drawRect.w * scale,
            height: drawRect.h * scale,
            border: "2px dashed #A35D5D",
            background: "rgba(163,93,93,0.15)",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}

// ── Area Settings Panel ────────────────────────────────────────────────────────
function AreaSettings({
  area,
  allMenus,
  onChange,
  onDelete,
}: {
  area: RmArea;
  allMenus: RmMenu[];
  onChange: (updated: RmArea) => void;
  onDelete: () => void;
}) {
  const update = (patch: Partial<RmArea["action"]>) => onChange({ ...area, action: { ...area.action, ...patch } });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#2B2B2B] uppercase tracking-wide">熱區動作</span>
        <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          刪除熱區
        </button>
      </div>

      <div>
        <label className="block text-xs font-medium text-[#6B6B6B] mb-1">動作類型</label>
        <select
          value={area.action.type}
          onChange={e => update({ type: e.target.value as any })}
          className="w-full rounded-lg border border-[#E0E0E0] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#A35D5D]"
        >
          {ACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-[#6B6B6B] mb-1">標籤（可選）</label>
        <input
          type="text" value={area.action.label || ""}
          onChange={e => update({ label: e.target.value })}
          placeholder="按鈕標籤"
          className="w-full rounded-lg border border-[#E0E0E0] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#A35D5D]"
        />
      </div>

      {area.action.type === "uri" && (
        <div>
          <label className="block text-xs font-medium text-[#6B6B6B] mb-1">網址</label>
          <input
            type="url" value={area.action.uri || ""}
            onChange={e => update({ uri: e.target.value })}
            placeholder="https://..."
            className="w-full rounded-lg border border-[#E0E0E0] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#A35D5D]"
          />
        </div>
      )}

      {area.action.type === "message" && (
        <div>
          <label className="block text-xs font-medium text-[#6B6B6B] mb-1">訊息文字</label>
          <input
            type="text" value={area.action.text || ""}
            onChange={e => update({ text: e.target.value })}
            placeholder="用戶點擊後發送的文字"
            className="w-full rounded-lg border border-[#E0E0E0] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#A35D5D]"
          />
        </div>
      )}

      {area.action.type === "richmenuswitch" && (
        <div>
          <label className="block text-xs font-medium text-[#6B6B6B] mb-1">切換到選單</label>
          <select
            value={area.action.richMenuAliasId || ""}
            onChange={e => update({ richMenuAliasId: e.target.value })}
            className="w-full rounded-lg border border-[#E0E0E0] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#A35D5D]"
          >
            <option value="">— 選擇選單 —</option>
            {allMenus.map(m => <option key={m.aliasId} value={m.aliasId}>{m.name}</option>)}
          </select>
        </div>
      )}

      {area.action.type === "postback" && (
        <div>
          <label className="block text-xs font-medium text-[#6B6B6B] mb-1">預填文字</label>
          <textarea
            value={area.action.data || ""}
            onChange={e => update({ data: e.target.value })}
            placeholder="消費者點擊後自動帶入聊天輸入框的文字…"
            rows={4}
            className="w-full rounded-lg border border-[#E0E0E0] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#A35D5D] resize-none"
          />
        </div>
      )}

      <div className="text-xs text-[#AAAAAA] pt-1 border-t border-[#F0F0F0]">
        位置: {area.bounds.x}, {area.bounds.y} &nbsp;|&nbsp; 大小: {area.bounds.width} × {area.bounds.height}
      </div>
    </div>
  );
}

// ── Image Uploader ─────────────────────────────────────────────────────────────
function ImageUploader({ menu, onUploaded }: { menu: RmMenu; onUploaded: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) { setErr("請選擇圖片檔案"); return; }
    if (file.size > 1024 * 1024) {
      setErr(`圖片大小 ${(file.size / 1024 / 1024).toFixed(1)}MB 超過 LINE 上限（1MB），請先壓縮圖片`);
      return;
    }
    setUploading(true);
    setErr(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const ext = file.name.split(".").pop() || "jpg";
      const path = `rich-menus/${user.id}/${menu.id}.${ext}`;
      const { error } = await supabase.storage.from("flex-assets").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("flex-assets").getPublicUrl(path);
      onUploaded(publicUrl + "?t=" + Date.now());
    } catch (e: any) {
      setErr(e.message || "上傳失敗");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="block text-xs font-medium text-[#6B6B6B] mb-2">選單背景圖片</label>
      <div
        className="border-2 border-dashed border-[#E0E0E0] rounded-xl p-4 text-center cursor-pointer hover:border-[#A35D5D] hover:bg-[#FFF7F8] transition-colors"
        onClick={() => inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
      >
        {menu.imageUrl ? (
          <div className="relative">
            <img src={menu.imageUrl} className="w-full h-20 object-cover rounded-lg" />
            <div className="mt-2 text-xs text-[#6B6B6B]">點擊或拖曳更換圖片</div>
          </div>
        ) : (
          <>
            <svg className="w-8 h-8 mx-auto mb-2 text-[#CCCCCC]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
            <p className="text-sm text-[#AAAAAA]">{uploading ? "上傳中..." : "點擊或拖曳上傳圖片"}</p>
            <p className="text-xs text-[#CCCCCC] mt-0.5">建議尺寸 2500 × 1686px</p>
          </>
        )}
      </div>
      {err && <p className="mt-1 text-xs text-red-500">{err}</p>}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
    </div>
  );
}

// ── Main Editor ────────────────────────────────────────────────────────────────
export default function RichMenuEditor() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [draft, setDraft] = useState<RmDraft | null>(null);
  const [menus, setMenus] = useState<RmMenu[]>([]);
  const [selectedMenuIdx, setSelectedMenuIdx] = useState(0);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishModal, setPublishModal] = useState<"validation" | "choose" | "schedule" | null>(null);
  const [schedYear, setSchedYear] = useState(() => new Date().getFullYear());
  const [schedMonth, setSchedMonth] = useState(() => new Date().getMonth() + 1);
  const [schedDay, setSchedDay] = useState(() => new Date().getDate());
  const [schedHour, setSchedHour] = useState(() => new Date().getHours());
  const [schedMin, setSchedMin] = useState(() => Math.ceil(new Date().getMinutes() / 5) * 5 % 60);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [folders, setFolders] = useState<RmFolder[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; onConfirm: () => void } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!id) return;
    getRmDraft(id).then(d => {
      setDraft(d);
      setDraftName(d.name);
      setFolderId(d.folder_id);
      setMenus(d.data?.menus ?? [makeDefaultMenu(0)]);
    }).catch(e => setErr(e.message));
    listRmFolders().then(setFolders).catch(() => {});
  }, [id]);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Auto-save
  const triggerSave = useCallback((updatedMenus: RmMenu[], updatedName?: string) => {
    if (!id) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await saveRmDraft(id, { data: { menus: updatedMenus }, name: updatedName ?? draftName });
      } catch {}
      setSaving(false);
    }, 800);
  }, [id, draftName]);

  const validationErrors = useMemo(() => getValidationErrors(menus), [menus]);

  const currentMenu = menus[selectedMenuIdx];
  const selectedArea = currentMenu?.areas.find(a => a.id === selectedAreaId) ?? null;

  const updateMenu = (patch: Partial<RmMenu>) => {
    const updated = menus.map((m, i) => i === selectedMenuIdx ? { ...m, ...patch } : m);
    setMenus(updated);
    triggerSave(updated);
  };

  const updateAreas = (areas: RmArea[]) => {
    updateMenu({ areas });
  };

  const updateArea = (updated: RmArea) => {
    if (!currentMenu) return;
    updateMenu({ areas: currentMenu.areas.map(a => a.id === updated.id ? updated : a) });
  };

  const deleteArea = (areaId: string) => {
    if (!currentMenu) return;
    updateMenu({ areas: currentMenu.areas.filter(a => a.id !== areaId) });
    setSelectedAreaId(null);
  };

  const addMenu = () => {
    const newMenu = makeDefaultMenu(menus.length);
    const updated = [...menus, newMenu];
    setMenus(updated);
    setSelectedMenuIdx(updated.length - 1);
    setSelectedAreaId(null);
    triggerSave(updated);
  };

  const deleteMenu = (idx: number) => {
    if (menus.length <= 1) { showToast("至少需要保留一個選單層", "error"); return; }
    setConfirmState({
      title: `刪除「${menus[idx].name}」`,
      description: "此操作無法復原。",
      onConfirm: () => {
        const updated = menus.filter((_, i) => i !== idx);
        const newIdx = Math.min(selectedMenuIdx, updated.length - 1);
        setMenus(updated);
        setSelectedMenuIdx(newIdx);
        setSelectedAreaId(null);
        triggerSave(updated);
      },
    });
  };

  const handlePublish = () => {
    if (validationErrors.length > 0) {
      setPublishModal("validation");
    } else {
      setPublishModal("choose");
    }
  };

  const handlePublishNow = async () => {
    if (!id) return;
    setPublishModal(null);
    setPublishing(true);
    try {
      const result = await publishRmDraft(id);
      showToast(`已成功發布 ${result.publishedMenus.length} 個選單`);
    } catch (e: any) {
      showToast(e.message || "發布失敗", "error");
    } finally {
      setPublishing(false);
    }
  };

  const handleScheduleConfirm = async () => {
    if (!id) return;
    const pad = (n: number) => String(n).padStart(2, "0");
    const scheduledAt = `${schedYear}-${pad(schedMonth)}-${pad(schedDay)}T${pad(schedHour)}:${pad(schedMin)}:00`;
    setPublishModal(null);
    try {
      await saveRmDraft(id, { data: { menus, scheduled_at: scheduledAt }, scheduled_at: scheduledAt });
      showToast(`已排程於 ${schedYear}/${pad(schedMonth)}/${pad(schedDay)} ${pad(schedHour)}:${pad(schedMin)} 發布`);
    } catch (e: any) {
      showToast(e.message || "排程失敗", "error");
    }
  };

  const handleNameSave = async () => {
    setEditingName(false);
    if (!id || !draftName.trim()) return;
    await saveRmDraft(id, { name: draftName.trim(), data: { menus } });
  };

  if (err) return (
    <div className="h-screen flex items-center justify-center text-red-500">{err}</div>
  );
  if (!draft) return (
    <div className="h-screen flex items-center justify-center text-[#6B6B6B]">載入中...</div>
  );

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-[#F7F7F7]">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg text-sm font-medium transition-all ${toast.type === "error" ? "bg-red-600 text-white" : "bg-[#1A1A1A] text-white"}`}>
          {toast.type === "success" ? (
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#4ADE80" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          ) : (
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#FCA5A5" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          )}
          {toast.msg}
        </div>
      )}

      {/* Top bar */}
      <header className="h-12 bg-white border-b border-[#EBEBEB] flex items-center px-4 gap-3 shrink-0 z-30">
        <button onClick={() => nav("/rich-menus")} className="text-[#8A8A8A] hover:text-[#2B2B2B] transition-colors p-1 rounded-lg hover:bg-[#F5F5F5]">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="h-4 w-px bg-[#EBEBEB]" />

        {editingName ? (
          <input
            autoFocus value={draftName}
            onChange={e => setDraftName(e.target.value)}
            onBlur={handleNameSave}
            onKeyDown={e => { if (e.key === "Enter") handleNameSave(); if (e.key === "Escape") { setDraftName(draft.name); setEditingName(false); } }}
            className="text-sm font-semibold text-[#2B2B2B] border-b border-[#A35D5D] focus:outline-none bg-transparent w-48"
          />
        ) : (
          <button onClick={() => setEditingName(true)} className="flex items-center gap-1.5 text-sm font-semibold text-[#2B2B2B] hover:text-[#A35D5D] transition-colors group">
            {draftName}
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="opacity-0 group-hover:opacity-100 transition-opacity"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487a2.1 2.1 0 1 1 2.97 2.97L7.5 19.79l-4 1 1-4z" /></svg>
          </button>
        )}

        <GlassSelect
          size="xs"
          value={folderId || ""}
          onChange={(val) => {
            const newFolderId = val || null;
            setFolderId(newFolderId);
            saveRmDraft(id!, { folder_id: newFolderId });
          }}
          options={[{ value: "", label: "未分類" }, ...folders.map(f => ({ value: f.id, label: f.name }))]}
        />

        <div className="flex-1" />

        {saving && <span className="text-xs text-[#AAAAAA]">儲存中...</span>}

        <div className="relative">
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="px-4 py-1.5 text-sm font-semibold text-white bg-[#A35D5D] hover:bg-[#8F4A4A] rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
            {publishing ? "發布中..." : "發布到 LINE"}
          </button>
          {validationErrors.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white pointer-events-none">
              {validationErrors.reduce((s: number, v: { issues: string[] }) => s + v.issues.length, 0)}
            </span>
          )}
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left: Menu Layer List */}
        <aside className="w-52 bg-white border-r border-[#EBEBEB] flex flex-col shrink-0">
          <div className="px-3 py-3 border-b border-[#F0F0F0]">
            <div className="text-xs font-semibold text-[#6B6B6B] uppercase tracking-wide mb-2">選單層</div>
            <div className="space-y-1">
              {menus.map((m, i) => (
                <div
                  key={m.id}
                  onClick={() => { setSelectedMenuIdx(i); setSelectedAreaId(null); }}
                  className={`group flex items-center justify-between rounded-lg px-2.5 py-2 cursor-pointer transition-colors text-sm ${selectedMenuIdx === i ? "bg-[#FBEBEE] text-[#A35D5D]" : "text-[#555555] hover:bg-[#F5F5F5]"}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 text-[10px] font-bold ${selectedMenuIdx === i ? "bg-[#A35D5D] text-white" : "bg-[#E8E8E8] text-[#888888]"}`}>{i + 1}</div>
                    <span className="truncate font-medium">{m.name}</span>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); deleteMenu(i); }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-500 transition-all shrink-0"
                    title="刪除此選單層"
                  >
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={addMenu}
              className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs text-[#888888] border border-dashed border-[#DDDDDD] hover:border-[#A35D5D] hover:text-[#A35D5D] transition-colors"
            >
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              新增選單層
            </button>
          </div>

          {/* Area list for selected menu */}
          {currentMenu && (
            <div className="flex-1 overflow-y-auto px-3 py-3">
              <div className="text-xs font-semibold text-[#6B6B6B] uppercase tracking-wide mb-2">熱區列表</div>
              {currentMenu.areas.length === 0 ? (
                <p className="text-xs text-[#AAAAAA] text-center py-4">在畫布上拖曳繪製熱區</p>
              ) : (
                <div className="space-y-1">
                  {currentMenu.areas.map((a, i) => (
                    <div
                      key={a.id}
                      onClick={() => setSelectedAreaId(a.id)}
                      className={`flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer text-xs transition-colors ${selectedAreaId === a.id ? "bg-[#FBEBEE] text-[#A35D5D]" : "text-[#555555] hover:bg-[#F5F5F5]"}`}
                    >
                      <span className="font-medium shrink-0">#{i + 1}</span>
                      <span className="truncate">{ACTION_TYPES.find(t => t.value === a.action.type)?.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>

        {/* Center: Canvas */}
        <div className="flex-1 overflow-auto p-6 flex flex-col gap-4">
          {currentMenu && (
            <>
              <div className="text-xs text-[#AAAAAA] text-center">在畫布上拖曳繪製熱區 · 點擊選取後可調整</div>
              <RichMenuCanvas
                menu={currentMenu}
                selectedAreaId={selectedAreaId}
                onAreasChange={updateAreas}
                onSelectArea={setSelectedAreaId}
              />
            </>
          )}
        </div>

        {/* Right: Settings Panel */}
        <aside className="w-72 bg-white border-l border-[#EBEBEB] flex flex-col shrink-0 overflow-y-auto">
          <div className="p-4 space-y-5">
            {/* Menu settings */}
            {currentMenu && (
              <>
                <div>
                  <div className="text-xs font-semibold text-[#6B6B6B] uppercase tracking-wide mb-3">選單設定</div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-[#6B6B6B] mb-1">選單名稱</label>
                      <input
                        type="text" value={currentMenu.name}
                        onChange={e => updateMenu({ name: e.target.value })}
                        className="w-full rounded-lg border border-[#E0E0E0] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#A35D5D]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#6B6B6B] mb-1">底欄文字</label>
                      <input
                        type="text" value={currentMenu.chatBarText}
                        onChange={e => updateMenu({ chatBarText: e.target.value })}
                        placeholder="選單"
                        className="w-full rounded-lg border border-[#E0E0E0] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#A35D5D]"
                      />
                    </div>

                  </div>
                </div>

                <div className="border-t border-[#F0F0F0] pt-4">
                  <ImageUploader
                    menu={currentMenu}
                    onUploaded={url => { updateMenu({ imageUrl: url }); showToast("圖片上傳成功"); }}
                  />
                </div>
              </>
            )}

            {/* Area settings */}
            {selectedArea && currentMenu && (
              <div className="border-t border-[#F0F0F0] pt-4">
                <AreaSettings
                  area={selectedArea}
                  allMenus={menus}
                  onChange={updateArea}
                  onDelete={() => deleteArea(selectedArea.id)}
                />
              </div>
            )}

            {!selectedArea && currentMenu && (
              <div className="border-t border-[#F0F0F0] pt-4 text-center text-xs text-[#AAAAAA] py-4">
                點擊畫布上的熱區以編輯動作
              </div>
            )}
          </div>
        </aside>
      </div>

      <ConfirmModal
        open={!!confirmState}
        title={confirmState?.title || ""}
        description={confirmState?.description || ""}
        confirmText="刪除"
        danger
        onConfirm={confirmState?.onConfirm || (() => {})}
        onClose={() => setConfirmState(null)}
      />

      {/* Publish Modal */}
      {publishModal && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40" onClick={() => setPublishModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[340px] overflow-hidden" onClick={e => e.stopPropagation()}>

            {publishModal === "validation" && (
              <>
                <div className="px-6 pt-6 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                    </div>
                    <h2 className="text-base font-semibold text-[#1A1A1A]">發布前請先修正以下問題</h2>
                  </div>
                  <p className="text-xs text-[#8A8A8A] ml-8">修正後再點擊「發布到 LINE」即可繼續</p>
                </div>
                <div className="px-6 pb-2 max-h-72 overflow-y-auto space-y-3">
                  {validationErrors.map((v: { menuName: string; issues: string[] }, i: number) => (
                    <div key={i}>
                      <div className="text-xs font-semibold text-[#555555] mb-1">📋 {v.menuName}</div>
                      <ul className="space-y-1">
                        {v.issues.map((issue: string, j: number) => (
                          <li key={j} className="flex items-start gap-1.5 text-xs text-[#CC4A00]">
                            <span className="mt-0.5 shrink-0">•</span>
                            <span>{issue}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-4">
                  <button onClick={() => setPublishModal(null)} className="w-full py-2.5 text-sm font-semibold text-white bg-[#A35D5D] hover:bg-[#8F4A4A] rounded-xl transition-colors">我知道了，去修正</button>
                </div>
              </>
            )}

            {publishModal === "choose" && (
              <>
                <div className="px-6 pt-6 pb-4">
                  <h2 className="text-base font-semibold text-[#1A1A1A] mb-1">發布選單</h2>
                  <p className="text-sm text-[#8A8A8A]">請選擇發布方式</p>
                </div>
                <div className="px-4 pb-4 space-y-2">
                  <button
                    onClick={handlePublishNow}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-[#E0E0E0] hover:border-[#A35D5D] hover:bg-[#FDF8F8] transition-colors text-left"
                  >
                    <div className="w-9 h-9 rounded-full bg-[#A35D5D]/10 flex items-center justify-center shrink-0">
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#A35D5D" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-[#1A1A1A]">立即發布</div>
                      <div className="text-xs text-[#8A8A8A]">發布後即時生效</div>
                    </div>
                  </button>
                  <button
                    onClick={() => setPublishModal("schedule")}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-[#E0E0E0] hover:border-[#A35D5D] hover:bg-[#FDF8F8] transition-colors text-left"
                  >
                    <div className="w-9 h-9 rounded-full bg-[#A35D5D]/10 flex items-center justify-center shrink-0">
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#A35D5D" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" /></svg>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-[#1A1A1A]">排程發布</div>
                      <div className="text-xs text-[#8A8A8A]">選擇指定日期與時間發布</div>
                    </div>
                  </button>
                </div>
                <div className="px-4 pb-4">
                  <button onClick={() => setPublishModal(null)} className="w-full py-2 text-sm text-[#8A8A8A] hover:text-[#1A1A1A] transition-colors">取消</button>
                </div>
              </>
            )}

            {publishModal === "schedule" && (
              <>
                <div className="px-6 pt-6 pb-4">
                  <h2 className="text-base font-semibold text-[#1A1A1A] mb-1">選擇發布時間</h2>
                  <p className="text-sm text-[#8A8A8A]">設定排程發布的日期與時間</p>
                </div>
                <div className="px-6 pb-4 space-y-4">
                  <div>
                    <div className="text-xs font-medium text-[#6B6B6B] mb-2">日期</div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] text-[#AAAAAA] mb-0.5 block">年</label>
                        <select value={schedYear} onChange={e => setSchedYear(Number(e.target.value))} className="w-full rounded-lg border border-[#E0E0E0] px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#A35D5D]">
                          {[2025,2026,2027,2028].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] text-[#AAAAAA] mb-0.5 block">月</label>
                        <select value={schedMonth} onChange={e => setSchedMonth(Number(e.target.value))} className="w-full rounded-lg border border-[#E0E0E0] px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#A35D5D]">
                          {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] text-[#AAAAAA] mb-0.5 block">日</label>
                        <select value={schedDay} onChange={e => setSchedDay(Number(e.target.value))} className="w-full rounded-lg border border-[#E0E0E0] px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#A35D5D]">
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
                        <select value={schedHour} onChange={e => setSchedHour(Number(e.target.value))} className="w-full rounded-lg border border-[#E0E0E0] px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#A35D5D]">
                          {Array.from({length:24},(_,i)=>i).map(h => <option key={h} value={h}>{String(h).padStart(2,"0")}</option>)}
                        </select>
                      </div>
                      <div className="pb-2 text-[#AAAAAA] text-sm">:</div>
                      <div className="flex-1">
                        <label className="text-[10px] text-[#AAAAAA] mb-0.5 block">分</label>
                        <select value={schedMin} onChange={e => setSchedMin(Number(e.target.value))} className="w-full rounded-lg border border-[#E0E0E0] px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#A35D5D]">
                          {[0,5,10,15,20,25,30,35,40,45,50,55].map(m => <option key={m} value={m}>{String(m).padStart(2,"0")}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="px-4 pb-4 flex gap-2">
                  <button onClick={handleScheduleConfirm} className="flex-1 py-2.5 text-sm font-semibold text-white bg-[#A35D5D] hover:bg-[#8F4A4A] rounded-xl transition-colors">確認排程</button>
                  <button onClick={() => setPublishModal("choose")} className="flex-1 py-2.5 text-sm font-medium text-[#6B6B6B] bg-[#F5F5F5] hover:bg-[#EBEBEB] rounded-xl transition-colors">取消</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
