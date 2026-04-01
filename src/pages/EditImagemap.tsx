import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getDoc, saveDoc } from "@/lib/db";
import { ImagemapArea, ImagemapDoc } from "@/lib/types";

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
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);

  // Canvas / drag state
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [drawing, setDrawing] = useState<{ startX: number; startY: number; curX: number; curY: number } | null>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    if (!id) return;
    getDoc(id).then(row => {
      setDoc(row.content as ImagemapDoc);
    });
  }, [id]);

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

  function updateDoc(d: ImagemapDoc) {
    setDoc(d);
    scheduleSave(d);
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
    if (!isDragging.current || !drawing) return;
    setDrawing(prev => prev ? { ...prev, curX: e.clientX, curY: e.clientY } : null);
  }

  function handleMouseUp(e: React.MouseEvent) {
    if (!isDragging.current || !drawing || !doc) return;
    isDragging.current = false;

    const start = toBaseCoords(drawing.startX, drawing.startY);
    const end = toBaseCoords(e.clientX, e.clientY);

    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);

    setDrawing(null);

    if (w < 10 || h < 10) return; // ignore tiny drags

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
        {saveMsg && <span className="text-xs text-[#6B6B6B]">{saveMsg}</span>}
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 text-sm font-medium text-white bg-[#A35D5D] hover:bg-[#8F4A4A] rounded-xl transition-colors disabled:opacity-50"
        >
          {saving ? "儲存中..." : "儲存"}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: canvas editor */}
        <div className="flex-1 flex flex-col gap-4 p-5 overflow-y-auto">
          {/* Image URL + alt text */}
          <div className="bg-white rounded-2xl border border-[#F0E3E5] p-4 flex flex-col gap-3">
            <p className="text-xs font-semibold text-[#555] uppercase tracking-wide">圖片設定</p>
            <div>
              <label className="text-xs text-[#6B6B6B] mb-1 block">圖片網址（HTTPS）</label>
              <input
                type="url"
                placeholder="https://example.com/image.jpg"
                value={doc.imageUrl}
                onChange={e => {
                  setImgLoaded(false);
                  updateDoc({ ...doc, imageUrl: e.target.value });
                }}
                className="w-full text-sm border border-[#E7C9CD] rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#A35D5D]"
              />
            </div>
            <div>
              <label className="text-xs text-[#6B6B6B] mb-1 block">替代文字（LINE 通知顯示）</label>
              <input
                type="text"
                placeholder="熱區圖片"
                value={doc.altText}
                onChange={e => updateDoc({ ...doc, altText: e.target.value })}
                className="w-full text-sm border border-[#E7C9CD] rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#A35D5D]"
              />
            </div>
          </div>

          {/* Image canvas */}
          <div className="bg-white rounded-2xl border border-[#F0E3E5] p-4">
            <p className="text-xs font-semibold text-[#555] uppercase tracking-wide mb-3">
              熱區編輯器
              <span className="ml-2 text-[#AAAAAA] font-normal normal-case">在圖片上拖拉新增熱區</span>
            </p>

            {!doc.imageUrl ? (
              <div className="flex items-center justify-center h-48 border-2 border-dashed border-[#E7C9CD] rounded-xl text-sm text-[#AAAAAA]">
                請先輸入圖片網址
              </div>
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
                {/* Hidden img to detect natural dimensions */}
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
                      onClick={e => { e.stopPropagation(); setSelectedAreaId(area.id); }}
                      className="absolute border-2 transition-all"
                      style={{
                        ...pct,
                        borderColor: color,
                        backgroundColor: isSelected ? color + "33" : color + "1A",
                        boxShadow: isSelected ? `0 0 0 2px ${color}` : undefined,
                      }}
                    >
                      <span
                        className="absolute top-1 left-1 w-5 h-5 rounded text-white text-[10px] font-bold flex items-center justify-center"
                        style={{ backgroundColor: color }}
                      >
                        {idx + 1}
                      </span>
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
