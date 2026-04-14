import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getDoc, listDocs, saveDoc } from "@/lib/db";
import { ImagemapArea, ImagemapDoc } from "@/lib/types";
import { supabase } from "@/lib/supabase";

const PALETTE_COLORS = [
  "#A35D5D", "#0A84FF", "#34C759", "#FF9F0A", "#FF453A", "#AF52DE",
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Area action editor ────────────────────────────────────────────────────────
function AreaEditor({
  area,
  index,
  onChange,
  onDelete,
  isSelected,
  onSelect,
}: {
  area: ImagemapArea;
  index: number;
  onChange: (a: ImagemapArea) => void;
  onDelete: () => void;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const color = PALETTE_COLORS[index % PALETTE_COLORS.length];

  return (
    <div
      onClick={onSelect}
      className={`rounded-xl border p-3 cursor-pointer transition-all ${
        isSelected ? "border-[#A35D5D] bg-[#FFF7F8] ring-1 ring-[#A35D5D]" : "border-[#E7C9CD] bg-white hover:border-[#A35D5D]"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className="w-5 h-5 rounded text-white text-[10px] font-bold flex items-center justify-center"
            style={{ backgroundColor: color }}
          >
            {index + 1}
          </span>
          <span className="text-xs font-medium text-[#555]">熱區 {index + 1}</span>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="text-[#AAAAAA] hover:text-red-500 transition-colors"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
          </svg>
        </button>
      </div>

      {/* Action type toggle */}
      <div className="flex gap-1 mb-2">
        {(["uri", "message"] as const).map(t => (
          <button
            key={t}
            onClick={e => {
              e.stopPropagation();
              onChange({
                ...area,
                action: t === "uri"
                  ? { type: "uri", linkUri: area.action.type === "uri" ? area.action.linkUri : "" }
                  : { type: "message", text: area.action.type === "message" ? area.action.text : "" },
              });
            }}
            className={`flex-1 py-1 text-[11px] rounded-lg transition-colors ${
              area.action.type === t
                ? "bg-[#A35D5D] text-white"
                : "bg-[#F5F5F5] text-[#6B6B6B] hover:bg-[#EEE]"
            }`}
          >
            {t === "uri" ? "連結" : "文字"}
          </button>
        ))}
      </div>

      {area.action.type === "uri" ? (
        <input
          type="url"
          placeholder="https://example.com"
          value={area.action.linkUri}
          onClick={e => e.stopPropagation()}
          onChange={e => onChange({ ...area, action: { type: "uri", linkUri: e.target.value } })}
          className="w-full text-xs border border-[#E7C9CD] rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#A35D5D]"
        />
      ) : (
        <input
          type="text"
          placeholder="輸入訊息文字"
          value={area.action.text}
          onClick={e => e.stopPropagation()}
          onChange={e => onChange({ ...area, action: { type: "message", text: e.target.value } })}
          className="w-full text-xs border border-[#E7C9CD] rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#A35D5D]"
        />
      )}
    </div>
  );
}

// ─── Main editor ───────────────────────────────────────────────────────────────
export default function EditImagemap() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();

  const [doc, setDoc] = useState<ImagemapDoc | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [folderDropdownOpen, setFolderDropdownOpen] = useState(false);
  const folderDropdownRef = useRef<HTMLDivElement>(null);

  // Canvas / drag state
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [drawing, setDrawing] = useState<{ startX: number; startY: number; curX: number; curY: number } | null>(null);
  const isDragging = useRef(false);
  const [resizing, setResizing] = useState<{
    areaId: string;
    handle: string;
    startX: number; startY: number;
    startBounds: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const [moving, setMoving] = useState<{
    areaId: string;
    startX: number; startY: number;
    startBounds: { x: number; y: number; width: number; height: number };
  } | null>(null);

  useEffect(() => {
    if (!id) return;
    getDoc(id).then(row => {
      setDoc(row.content as ImagemapDoc);
    });
    listDocs().then(rows => {
      setFolders(
        rows
          .filter((r: any) => r.content.type === "folder")
          .map((r: any) => ({ id: r.id, name: r.content.name }))
      );
    });
  }, [id]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (folderDropdownRef.current && !folderDropdownRef.current.contains(e.target as Node)) {
        setFolderDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Save with debounce
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleSave = useCallback((d: ImagemapDoc) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (!id) return;
      try {
        await saveDoc(id, d);
      } catch (e: any) {
        setSaveMsg("儲存失敗：" + e.message);
      }
    }, 800);
  }, [id]);

  const VALID_SCHEMES = ["https://", "http://", "tel:", "mailto:", "line://", "linemusic://"];

  function validateDoc(d: ImagemapDoc) {
    const errs: string[] = [];
    d.areas.forEach((area, i) => {
      if (area.action.type === "uri") {
        const uri = area.action.linkUri.trim();
        if (!uri) {
          errs.push(`熱區 ${i + 1}：連結網址不能為空`);
        } else if (!VALID_SCHEMES.some(s => uri.startsWith(s))) {
          errs.push(`熱區 ${i + 1}：連結須以 https://、http://、tel:、mailto:、line:// 開頭`);
        }
      } else if (area.action.type === "message" && !area.action.text.trim()) {
        errs.push(`熱區 ${i + 1}：訊息文字不能為空`);
      }
    });
    // Overlap check
    for (let i = 0; i < d.areas.length; i++) {
      for (let j = i + 1; j < d.areas.length; j++) {
        const a = d.areas[i].bounds, b = d.areas[j].bounds;
        const noOverlap = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
        if (!noOverlap) errs.push(`熱區 ${i + 1} 與熱區 ${j + 1} 重疊`);
      }
    }
    setValidationErrors(errs);
  }

  function updateDoc(d: ImagemapDoc) {
    setDoc(d);
    validateDoc(d);
    scheduleSave(d);
  }

  function handleResizeStart(e: React.MouseEvent, areaId: string, handle: string) {
    e.stopPropagation();
    e.preventDefault();
    const area = doc!.areas.find((a: ImagemapArea) => a.id === areaId)!;
    setResizing({ areaId, handle, startX: e.clientX, startY: e.clientY, startBounds: { ...area.bounds } });
  }

  function handleMoveStart(e: React.MouseEvent, areaId: string) {
    e.stopPropagation();
    if (selectedAreaId !== areaId) { setSelectedAreaId(areaId); return; }
    const area = doc!.areas.find((a: ImagemapArea) => a.id === areaId)!;
    setMoving({ areaId, startX: e.clientX, startY: e.clientY, startBounds: { ...area.bounds } });
  }

  // Upload image to Supabase Storage
  async function handleImageUpload(file: File) {
    if (file.size > 1 * 1024 * 1024) {
      alert(`圖片檔案過大（${(file.size / 1024 / 1024).toFixed(1)} MB）\n請上傳 1MB 以下的圖片。`);
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `imagemap_${uid()}.${ext}`;
      const { error } = await supabase.storage.from("flex-assets").upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("flex-assets").getPublicUrl(path);
      setImgLoaded(false);
      const updated = { ...doc!, imageUrl: publicUrl };
      updateDoc(updated);
    } catch (e: any) {
      setSaveMsg("❌ 上傳失敗：" + e.message);
    } finally {
      setUploading(false);
    }
  }

  // Drag-and-drop on upload zone
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) handleImageUpload(file);
  }

  // Convert screen pixel coords → 1040-space coords
  function toBaseCoords(px: number, py: number) {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const scaleX = (doc?.baseSize.width ?? 1040) / rect.width;
    const scaleY = (doc?.baseSize.height ?? 520) / rect.height;
    return {
      x: Math.round(Math.max(0, px - rect.left) * scaleX),
      y: Math.round(Math.max(0, py - rect.top) * scaleY),
    };
  }

  // Display coords: 1040-space → percentage
  function toDisplayPct(bounds: ImagemapArea["bounds"]) {
    const bw = doc?.baseSize.width ?? 1040;
    const bh = doc?.baseSize.height ?? 520;
    return {
      left: `${(bounds.x / bw) * 100}%`,
      top: `${(bounds.y / bh) * 100}%`,
      width: `${(bounds.width / bw) * 100}%`,
      height: `${(bounds.height / bh) * 100}%`,
    };
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    isDragging.current = true;
    setDrawing({ startX: e.clientX, startY: e.clientY, curX: e.clientX, curY: e.clientY });
    setSelectedAreaId(null);
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (moving && doc) {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const scaleX = doc.baseSize.width / rect.width;
      const scaleY = doc.baseSize.height / rect.height;
      const dx = (e.clientX - moving.startX) * scaleX;
      const dy = (e.clientY - moving.startY) * scaleY;
      const sb = moving.startBounds;
      const nx = Math.max(0, Math.min(sb.x + dx, doc.baseSize.width - sb.width));
      const ny = Math.max(0, Math.min(sb.y + dy, doc.baseSize.height - sb.height));
      setDoc({ ...doc, areas: doc.areas.map((a: ImagemapArea) => a.id === moving.areaId ? { ...a, bounds: { x: Math.round(nx), y: Math.round(ny), width: sb.width, height: sb.height } } : a) });
      return;
    }
    if (resizing && doc) {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const scaleX = doc.baseSize.width / rect.width;
      const scaleY = doc.baseSize.height / rect.height;
      const dx = (e.clientX - resizing.startX) * scaleX;
      const dy = (e.clientY - resizing.startY) * scaleY;
      const sb = resizing.startBounds;
      const MIN = 20;
      let nx = sb.x, ny = sb.y, nw = sb.width, nh = sb.height;
      const h = resizing.handle;
      if (h.includes('e')) nw = Math.max(MIN, sb.width + dx);
      if (h.includes('s')) nh = Math.max(MIN, sb.height + dy);
      if (h.includes('w')) { const nww = Math.max(MIN, sb.width - dx); nx = sb.x + sb.width - nww; nw = nww; }
      if (h.startsWith('n')) { const nhh = Math.max(MIN, sb.height - dy); ny = sb.y + sb.height - nhh; nh = nhh; }
      nx = Math.max(0, nx); ny = Math.max(0, ny);
      if (nx + nw > doc.baseSize.width) nw = doc.baseSize.width - nx;
      if (ny + nh > doc.baseSize.height) nh = doc.baseSize.height - ny;
      const newBounds = { x: Math.round(nx), y: Math.round(ny), width: Math.round(nw), height: Math.round(nh) };
      setDoc({ ...doc, areas: doc.areas.map((a: ImagemapArea) => a.id === resizing.areaId ? { ...a, bounds: newBounds } : a) });
      return;
    }
    if (!isDragging.current || !drawing) return;
    setDrawing(prev => prev ? { ...prev, curX: e.clientX, curY: e.clientY } : null);
  }

  function handleMouseUp(e: React.MouseEvent) {
    if (moving && doc) {
      validateDoc(doc);
      scheduleSave(doc);
      setMoving(null);
      return;
    }
    if (resizing && doc) {
      validateDoc(doc);
      scheduleSave(doc);
      setResizing(null);
      return;
    }
    if (!isDragging.current || !drawing || !doc) return;
    isDragging.current = false;

    const start = toBaseCoords(drawing.startX, drawing.startY);
    const end = toBaseCoords(e.clientX, e.clientY);

    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);

    setDrawing(null);

    if (w < 10 || h < 10) return;

    const newArea: ImagemapArea = {
      id: uid(),
      bounds: { x, y, width: w, height: h },
      action: { type: "uri", linkUri: "" },
    };
    const updated = { ...doc, areas: [...doc.areas, newArea] };
    updateDoc(updated);
    setSelectedAreaId(newArea.id);
  }

  function handleMouseLeave() {
    if (moving && doc) {
      validateDoc(doc);
      scheduleSave(doc);
      setMoving(null);
      return;
    }
    if (resizing && doc) {
      validateDoc(doc);
      scheduleSave(doc);
      setResizing(null);
      return;
    }
    if (isDragging.current) {
      isDragging.current = false;
      setDrawing(null);
    }
  }

  // Drawing preview rect in screen coords
  function getDrawingRect() {
    if (!drawing || !containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const x1 = Math.min(drawing.startX, drawing.curX) - rect.left;
    const y1 = Math.min(drawing.startY, drawing.curY) - rect.top;
    const w = Math.abs(drawing.curX - drawing.startX);
    const h = Math.abs(drawing.curY - drawing.startY);
    const containerW = rect.width;
    const containerH = rect.height;
    return {
      left: `${(x1 / containerW) * 100}%`,
      top: `${(y1 / containerH) * 100}%`,
      width: `${(w / containerW) * 100}%`,
      height: `${(h / containerH) * 100}%`,
    };
  }

  function handleImageLoad() {
    if (!imgRef.current || !doc) return;
    const { naturalWidth, naturalHeight } = imgRef.current;
    if (naturalWidth && naturalHeight) {
      const height = Math.round(1040 * (naturalHeight / naturalWidth));
      if (height !== doc.baseSize.height) {
        const updated = { ...doc, baseSize: { width: 1040, height } };
        updateDoc(updated);
      }
    }
    setImgLoaded(true);
  }

  async function handleSave() {
    if (!doc || !id) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await saveDoc(id, doc);
      setSaveMsg("✅ 已儲存");
    } catch (e: any) {
      setSaveMsg("❌ " + e.message);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }

  if (!doc) {
    return (
      <div className="flex items-center justify-center h-screen text-sm text-[#AAAAAA]">
        載入中...
      </div>
    );
  }

  const drawingRect = getDrawingRect();

  return (
    <div className="flex flex-col h-screen bg-[#FAF8F8]">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-[#F0E3E5] shrink-0">
        <button
          onClick={() => nav("/drafts")}
          className="p-1.5 rounded-lg text-[#AAAAAA] hover:bg-[#F5F5F5] hover:text-[#6B6B6B] transition-colors"
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <input
          type="text"
          value={doc.title}
          onChange={e => updateDoc({ ...doc, title: e.target.value })}
          className="flex-1 text-sm font-semibold text-[#2B2B2B] bg-transparent border-none outline-none min-w-0"
          placeholder="草稿名稱"
        />
        {/* Folder selector */}
        <div ref={folderDropdownRef} className="relative shrink-0">
          <button
            onClick={() => setFolderDropdownOpen(o => !o)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#6B6B6B] border border-[#E8E8E8] rounded-lg hover:bg-[#F5F5F5] transition-colors"
          >
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            {doc.folderId ? (folders.find(f => f.id === doc.folderId)?.name ?? "未分類") : "未分類"}
            <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className={`transition-transform ${folderDropdownOpen ? "rotate-180" : ""}`}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
          {folderDropdownOpen && (
            <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-[#E8E8E8] rounded-lg shadow-lg py-1 min-w-[120px]">
              <button
                onClick={() => { updateDoc({ ...doc, folderId: undefined }); setFolderDropdownOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${!doc.folderId ? "text-[#A35D5D] bg-[#FBEBEE]" : "text-[#555555] hover:bg-[#F5F5F5]"}`}
              >
                未分類
              </button>
              {folders.map(f => (
                <button
                  key={f.id}
                  onClick={() => { updateDoc({ ...doc, folderId: f.id }); setFolderDropdownOpen(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${doc.folderId === f.id ? "text-[#A35D5D] bg-[#FBEBEE]" : "text-[#555555] hover:bg-[#F5F5F5]"}`}
                >
                  {f.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {saveMsg && <span className="text-xs text-[#6B6B6B]">{saveMsg}</span>}
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 text-sm font-medium text-white bg-[#A35D5D] hover:bg-[#8F4A4A] rounded-xl transition-colors disabled:opacity-50"
        >
          {saving ? "儲存中..." : "儲存"}
        </button>
      </div>

      {/* Validation error banner */}
      {validationErrors.length > 0 && (
        <div className="mx-4 mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex gap-3 items-start shrink-0">
          <svg className="shrink-0 mt-0.5 text-red-500" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <ul className="flex flex-col gap-0.5">
            {validationErrors.map((e: string, i: number) => (
              <li key={i} className="text-xs text-red-600">{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Alt text - flush under header */}
      <div className="bg-white border-b border-[#F0E3E5] px-5 py-3 shrink-0">
        <p className="text-xs font-semibold text-[#555] uppercase tracking-wide mb-2">訊息設定</p>
        <div>
          <label className="text-xs text-[#6B6B6B] mb-1 block">LINE 通知顯示</label>
          <input
            type="text"
            placeholder="熱區圖片"
            value={doc.altText}
            onChange={e => updateDoc({ ...doc, altText: e.target.value })}
            className="w-full text-sm border border-[#E7C9CD] rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#A35D5D]"
          />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: canvas editor */}
        <div className="flex-1 flex flex-col gap-4 p-5 overflow-y-auto">

          {/* Image canvas */}
          <div className="bg-white rounded-2xl border border-[#F0E3E5] p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-[#555] uppercase tracking-wide">
                熱區編輯器
                {doc.imageUrl && (
                  <span className="ml-2 text-[#AAAAAA] font-normal normal-case">在圖片上拖拉新增熱區</span>
                )}
              </p>
              {doc.imageUrl && (
                <label className="flex items-center gap-1.5 px-3 py-1 text-xs text-[#A35D5D] border border-[#E7C9CD] rounded-lg cursor-pointer hover:bg-[#FFF7F8] transition-colors">
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {uploading ? "上傳中..." : "更換圖片"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }}
                  />
                </label>
              )}
            </div>

            {!doc.imageUrl ? (
              /* Upload zone */
              <label
                className="flex flex-col items-center justify-center h-56 border-2 border-dashed border-[#E7C9CD] rounded-xl cursor-pointer hover:border-[#A35D5D] hover:bg-[#FFF7F8] transition-all"
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
              >
                {uploading ? (
                  <div className="flex flex-col items-center gap-2 text-[#A35D5D]">
                    <svg className="animate-spin" width="24" height="24" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span className="text-sm">上傳中...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-[#AAAAAA]">
                    <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-sm font-medium text-[#6B6B6B]">點擊上傳圖片</span>
                    <span className="text-xs text-[#AAAAAA]">或拖拉圖片到此區域 · 支援 JPG、PNG · 最大 1MB</span>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }}
                />
              </label>
            ) : (
              <div
                ref={containerRef}
                className="relative select-none overflow-hidden rounded-xl cursor-crosshair"
                style={{ userSelect: "none" }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
              >
                <img
                  ref={imgRef}
                  src={doc.imageUrl}
                  alt={doc.altText}
                  className="w-full block"
                  draggable={false}
                  onLoad={handleImageLoad}
                  onError={() => setImgLoaded(false)}
                />

                {/* Existing areas */}
                {imgLoaded && doc.areas.map((area, idx) => {
                  const pct = toDisplayPct(area.bounds);
                  const color = PALETTE_COLORS[idx % PALETTE_COLORS.length];
                  const isSelected = selectedAreaId === area.id;
                  return (
                    <div
                      key={area.id}
                      onMouseDown={(e: React.MouseEvent) => handleMoveStart(e, area.id)}
                      className="absolute border-2 transition-colors"
                      style={{
                        ...pct,
                        borderColor: color,
                        backgroundColor: isSelected ? color + "33" : color + "1A",
                        boxShadow: isSelected ? `0 0 0 2px ${color}` : undefined,
                        cursor: isSelected ? 'move' : 'pointer',
                      }}
                    >
                      <span
                        className="absolute top-1 left-1 w-5 h-5 rounded text-white text-[10px] font-bold flex items-center justify-center"
                        style={{ backgroundColor: color }}
                      >
                        {idx + 1}
                      </span>
                      {isSelected && (['nw','n','ne','e','se','s','sw','w'] as const).map(handle => {
                        const cursors: Record<string, string> = { nw:'nw-resize', n:'ns-resize', ne:'ne-resize', e:'ew-resize', se:'se-resize', s:'ns-resize', sw:'sw-resize', w:'ew-resize' };
                        const hStyle: React.CSSProperties = {
                          position: 'absolute', width: 8, height: 8,
                          backgroundColor: 'white', border: `2px solid ${color}`, borderRadius: 2,
                          cursor: cursors[handle], zIndex: 10,
                          ...(handle.startsWith('n') ? { top: -5 } : handle.startsWith('s') ? { bottom: -5 } : { top: 'calc(50% - 4px)' }),
                          ...(handle.endsWith('w') ? { left: -5 } : handle.endsWith('e') ? { right: -5 } : { left: 'calc(50% - 4px)' }),
                        };
                        return <div key={handle} style={hStyle} onMouseDown={(e2: React.MouseEvent) => handleResizeStart(e2, area.id, handle)} />;
                      })}
                    </div>
                  );
                })}

                {/* Drawing preview */}
                {drawingRect && (
                  <div
                    className="absolute border-2 border-dashed border-[#A35D5D] bg-[#A35D5D]/10 pointer-events-none"
                    style={drawingRect}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: area list */}
        <div className="w-72 shrink-0 border-l border-[#F0E3E5] bg-white flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-[#F0E3E5] flex items-center justify-between">
            <span className="text-xs font-semibold text-[#555] uppercase tracking-wide">
              熱區列表 ({doc.areas.length})
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {doc.areas.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center">
                <p className="text-xs text-[#AAAAAA]">尚未設定熱區</p>
                <p className="text-xs text-[#AAAAAA] mt-1">在圖片上拖拉以新增</p>
              </div>
            ) : (
              doc.areas.map((area, idx) => (
                <AreaEditor
                  key={area.id}
                  area={area}
                  index={idx}
                  isSelected={selectedAreaId === area.id}
                  onSelect={() => setSelectedAreaId(area.id)}
                  onChange={updated => {
                    const areas = doc.areas.map(a => a.id === updated.id ? updated : a);
                    updateDoc({ ...doc, areas });
                  }}
                  onDelete={() => {
                    const areas = doc.areas.filter(a => a.id !== area.id);
                    updateDoc({ ...doc, areas });
                    if (selectedAreaId === area.id) setSelectedAreaId(null);
                  }}
                />
              ))
            )}
          </div>

          {/* baseSize info */}
          <div className="px-4 py-3 border-t border-[#F0E3E5] text-[10px] text-[#AAAAAA]">
            基準尺寸：{doc.baseSize.width} × {doc.baseSize.height} px
          </div>
        </div>
      </div>
    </div>
  );
}
