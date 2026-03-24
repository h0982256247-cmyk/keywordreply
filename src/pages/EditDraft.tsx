import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import ProgressBar from "@/components/ProgressBar";
import { supabase } from "@/lib/supabase";
import { AccordionSection } from "@/components/Accordion";
import FlexPreview from "@/components/FlexPreview";
import ColorPicker, { AutoTextColorHint } from "@/components/ColorPicker";

import { getDoc, saveDoc, createTemplateFromDoc, getActiveShareForDoc } from "@/lib/db";
import { DocModel, FooterButton, ImageSource, SpecialSection, BubbleSize, QuickReplyItem } from "@/lib/types";
import { uid, autoTextColor } from "@/lib/utils";
import { seedSpecialSection } from "@/lib/templates";
import { validateDoc } from "@/lib/validate";
import { extractVideoFrame } from "@/lib/extractVideoFrame";
import EmojiPicker from "emoji-picker-react";
import GlassSelect from "@/components/GlassSelect";
import ConfirmModal from "@/components/ConfirmModal";

type SaveState = "idle" | "saving" | "saved" | "error";

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed);
  return next;
}

export default function EditDraft() {
  const { id } = useParams();
  const nav = useNavigate();
  const [doc, setDoc] = useState<DocModel | null>(null);
  const [selectedCardIdx, setSelectedCardIdx] = useState(0);
  const [open, setOpen] = useState<"hero" | "body" | "footer">("hero");
  const [showBodyAdd, setShowBodyAdd] = useState(false);
  const [showFooterAdd, setShowFooterAdd] = useState(false);
  const [showAddCardMenu, setShowAddCardMenu] = useState(false);
  const [addCardMenuPos, setAddCardMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [activeShare, setActiveShare] = useState<{ token: string; version_no: number } | null>(null);
  const [editingNameIdx, setEditingNameIdx] = useState<number | null>(null);
  const [folders, setFolders] = useState<any[]>([]);
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; onConfirm: () => void } | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<number | null>(null);
  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  };
  const saveTimer = useRef<number | null>(null);
  const cardTabsRef = useRef<HTMLDivElement>(null);
  const addCardBtnRef = useRef<HTMLButtonElement>(null);
  const addCardMenuRef = useRef<HTMLDivElement>(null);
  const dragBodyRef = useRef<number>(-1);
  const dragFooterRef = useRef<number>(-1);

  // 分享連結使用 LIFF URL 格式（自動觸發分享）
  const liffId = import.meta.env.VITE_LIFF_ID as string | undefined;
  const shareUrl = activeShare && liffId
    ? `https://liff.line.me/${liffId}?token=${activeShare.token}&autoshare=1`
    : null;

  useEffect(() => {
    (async () => {
      if (!id) return;
      const row = await getDoc(id);
      setDoc(row.content);
      // 取得已發布的分享連結
      const share = await getActiveShareForDoc(id);
      setActiveShare(share);

      // 取得使用者的資料夾清單
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from("docs").select("id, content").eq("owner_id", user.id);
        if (data) setFolders(data.filter(d => d.content?.type === "folder"));
      }
    })();
  }, [id]);

  // Auto-scroll card tabs when selectedCardIdx changes
  useEffect(() => {
    if (cardTabsRef.current && doc?.type === "carousel") {
      const container = cardTabsRef.current;
      const selectedBtn = container.children[selectedCardIdx] as HTMLElement;
      if (selectedBtn) {
        const containerRect = container.getBoundingClientRect();
        const btnRect = selectedBtn.getBoundingClientRect();
        const scrollLeft = selectedBtn.offsetLeft - containerRect.width / 2 + btnRect.width / 2;
        container.scrollTo({ left: Math.max(0, scrollLeft), behavior: "smooth" });
      }
    }
  }, [selectedCardIdx, doc?.type]);

  // 點擊外部關閉 + 新增卡片 dropdown（排除 button 和 dropdown 本身）
  useEffect(() => {
    if (!showAddCardMenu) return;
    const handler = (e: MouseEvent) => {
      if (addCardBtnRef.current?.contains(e.target as Node)) return;
      if (addCardMenuRef.current?.contains(e.target as Node)) return;
      setShowAddCardMenu(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [showAddCardMenu]);

  const scheduleSave = (next: DocModel) => {
    setDoc(next);
    setSaveState("saving");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        if (!id) return;
        await saveDoc(id, next);
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 800);
  };

  const flushSave = async () => {
    if (!doc || !id) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setSaveState("saving");
    try { await saveDoc(id, doc); setSaveState("saved"); } catch { setSaveState("error"); }
  };

  if (!doc || !id) {
    return (
      <div className="min-h-screen bg-[#FCF7F8] flex items-center justify-center">
        <div className="bg-white border border-[#E7C9CD] shadow-sm rounded-xl p-8 flex flex-col items-center">
          <div className="animate-spin w-8 h-8 boundary-t-2 border-b-2 border-[#2B2B2B] rounded-full mb-4"></div>
          <div className="text-[#6B6B6B] font-medium">載入草稿中...</div>
        </div>
      </div>
    );
  }

  // Safe access for carousel cards
  const currentCardIdx = doc.type === "carousel" ? Math.min(selectedCardIdx, doc.cards.length - 1) : 0;
  const section = doc.type === "bubble" ? doc.section : doc.type === "carousel" ? doc.cards[currentCardIdx]?.section : (null as any);
  const isSpecialCard = section ? (section as SpecialSection).kind === "special" : false;
  const specialSection = isSpecialCard && section ? (section as SpecialSection) : null;

  // Check if hero contains video
  const isVideoHero = !isSpecialCard && section && (section as any).hero ? (section as any).hero.some((h: any) => h.kind === "hero_video") : false;
  const heroVideo = isVideoHero && section ? (section as any).hero.find((h: any) => h.kind === "hero_video") : null;

  const report = validateDoc(doc);

  const handleTitleChange = (val: string) => {
    if (doc.type === "bubble") {
      scheduleSave({ ...doc, title: val });
    } else if (doc.type === "carousel") {
      scheduleSave({ ...doc, title: val });
    } else if (doc.type === "text") {
      scheduleSave({ ...doc, title: val });
    } else if (doc.type === "folder") {
      scheduleSave({ ...doc, name: val });
    }
  };

  const handleBubbleSizeChange = (val: BubbleSize) => {
    if (doc.type === "bubble" || doc.type === "carousel") {
      scheduleSave({ ...doc, bubbleSize: val });
    }
  };
  const setSection = (next: any) => {
    if (doc.type === "bubble") {
      scheduleSave({ ...doc, section: next });
    } else if (doc.type === "carousel") {
      const nextCards = [...doc.cards];
      nextCards[currentCardIdx] = { ...nextCards[currentCardIdx], section: next };
      scheduleSave({ ...doc, cards: nextCards });
    }
  };

  const checkExternalImage = async (url: string) => {
    const res = await fetch(`/api/check-image?url=${encodeURIComponent(url)}`);
    return await res.json();
  };

  const updateHeroImageSource = async (img: ImageSource) => {
    if (isSpecialCard || isVideoHero) return; // Special cards and video heroes don't have hero_image
    const regularSection = section as any;
    const hero = regularSection.hero.map((c: any) => (c.kind === "hero_image" ? { ...c, image: img } : c));
    setSection({ ...regularSection, hero });
  };

  const updateHeroVideoSource = async (videoUrl: string, previewUrl: string, assetId?: string, previewAssetId?: string) => {
    if (isSpecialCard || !isVideoHero) return;
    const regularSection = section as any;
    const videoSource = assetId
      ? { kind: "upload" as const, assetId, url: videoUrl, previewAssetId: previewAssetId || "", previewUrl }
      : { kind: "external" as const, url: videoUrl, previewUrl };
    const hero = regularSection.hero.map((c: any) => (c.kind === "hero_video" ? { ...c, video: videoSource } : c));
    setSection({ ...regularSection, hero });
  };

  // Build card structure tree nodes for display
  const getCardTreeNodes = (cardSection: any): { label: string; children?: string[] }[] => {
    if (!cardSection) return [];
    if (cardSection.kind === "special") {
      const nodes: { label: string; children?: string[] }[] = [{ label: "Bubble" }];
      nodes.push({ label: "封面圖片 (特殊)" });
      if (cardSection.body?.length) {
        nodes.push({ label: "覆蓋層內容", children: cardSection.body.map((c: any) => c.kind === "title" ? "標題" : c.kind === "paragraph" ? "段落" : c.kind === "key_value" ? "標籤數值" : c.kind) });
      }
      if (cardSection.footer?.length) {
        nodes.push({ label: "底部按鈕", children: cardSection.footer.map((b: any) => b.label || "按鈕") });
      }
      return nodes;
    }
    const nodes: { label: string; children?: string[] }[] = [{ label: "Bubble" }];
    if (cardSection.hero?.length) nodes.push({ label: "封面圖片" });
    if (cardSection.body !== undefined) {
      const bodyKindLabel = (k: string) => k === "title" ? "標題" : k === "paragraph" ? "段落" : k === "divider" ? "分隔線" : k === "key_value" ? "數值標籤" : k === "spacer" ? "留白" : k;
      nodes.push({ label: "內容區塊", children: [...(cardSection.body || []).map((c: any) => bodyKindLabel(c.kind)), "+ 新增內容"] });
    }
    if (cardSection.footer !== undefined) {
      nodes.push({ label: "底部區塊", children: (cardSection.footer || []).map((b: any) => b.label || "按鈕") });
    }
    return nodes;
  };

  const toastPortal = createPortal(
    <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[9999] transition-all duration-300 ${toast ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-2 pointer-events-none"}`}>
      <div className={`flex items-center gap-2 px-4 py-2.5 text-white text-sm font-medium rounded-full shadow-xl ${toast?.type === "error" ? "bg-red-500" : "bg-[#2B2B2B]"}`}>
        {toast?.type === "error" ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-400 flex-shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
        )}
        {toast?.msg}
      </div>
    </div>,
    document.body
  );

  if (doc.type === "carousel") {
    const currentCard = doc.cards[currentCardIdx];
    const _cardTreeNodes = currentCard ? getCardTreeNodes(currentCard.section) : []; void _cardTreeNodes;

    // Build current card display name
    const getCardDisplayName = (c: any, idx: number) => {
      const isSpec = (c.section as SpecialSection).kind === "special";
      const sameTypeCount = doc.cards.slice(0, idx).filter((card: any) => ((card.section as SpecialSection).kind === "special") === isSpec).length + 1;
      return c.name || (isSpec ? `特殊 ${sameTypeCount}` : `卡片 ${sameTypeCount}`);
    };

    return (
      <>
        {toastPortal}
      <div className="h-screen overflow-hidden flex flex-col bg-[#FCF7F8]">

        {/* Sticky top bar — full width */}
        <div className="sticky top-0 z-30 bg-white border-b border-[#E7C9CD] px-4 py-2 flex items-center gap-3">
          {/* Left: back + title + folder selector */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* Back */}
            <button
              title="回到草稿列表"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-[#AAAAAA] hover:text-[#555555] hover:bg-[#F0F0F0] transition-colors flex-shrink-0"
              onClick={() => nav("/drafts")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            </button>
            {/* Title */}
            <input
              autoFocus
              type="text"
              value={doc.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="text-sm font-semibold text-[#2B2B2B] border-none bg-transparent p-0 focus:ring-0 placeholder:text-[#CCCCCC] min-w-0 w-40"
              placeholder="草稿名稱..."
            />
            {/* Folder selector — shows folder name like bubble editor */}
            <GlassSelect
              size="xs"
              value={(doc as any).folderId || ""}
              onChange={(val) => scheduleSave({ ...doc, folderId: val || undefined })}
              options={[{value:"",label:"未分類"},...folders.map((f: any) => ({value: f.id, label: f.content.name}))]}
              className="flex-shrink-0"
            />
          </div>

          {/* Right: size dropdown + JSON + 儲存為範本 + 儲存發布 */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-1 text-xs text-[#6B6B6B]">
              <span className="flex-shrink-0">卡片大小:</span>
              <GlassSelect
                value={doc.bubbleSize || "kilo"}
                onChange={(val) => handleBubbleSizeChange(val as BubbleSize)}
                options={[
                  {value: "nano", label: "Nano"},
                  {value: "micro", label: "Micro"},
                  {value: "kilo", label: "Kilo"},
                  {value: "mega", label: "Mega"},
                  {value: "giga", label: "Giga"},
                ]}
                size="xs"
                className="flex-shrink-0"
              />
            </div>
            <button className="px-3 py-1.5 text-xs bg-white border border-[#E7C9CD] text-[#6B6B6B] font-medium rounded-lg hover:bg-[#FCF7F8] transition-colors" onClick={async () => {
              const name = prompt("範本名稱（儲存後可在「新增草稿」直接使用）");
              if (!name) return;
              try { await createTemplateFromDoc(name.trim(), null, doc); alert("已儲存為範本"); }
              catch (e: any) { alert(e?.message || String(e)); }
            }}>儲存為範本</button>
            <button className="px-3 py-1.5 text-xs bg-[#A35D5D] text-white font-medium rounded-lg hover:bg-[#8F4A4A] transition-colors" onClick={async () => { await flushSave(); nav(`/drafts/${id}/preview`); }}>儲存發布</button>
          </div>
        </div>

        {/* 3-column body */}
        <div className="flex flex-1 min-h-0" style={{ height: "calc(100vh - 49px)" }}>

          {/* Column 1: Left panel */}
          <div className="w-52 flex-shrink-0 bg-white border-r border-[#E7C9CD] flex flex-col overflow-y-auto">

            {/* Section B: Card structure tree */}
            <div className="px-3 pt-3 pb-4 flex-1 overflow-y-auto">
              <div className="text-xs font-semibold text-[#AAAAAA] uppercase tracking-wide mb-3">卡片結構</div>
              <div className="space-y-0.5">

                {/* Bubble row */}
                <div className="flex items-center gap-2.5 py-2 px-2 rounded-lg text-sm font-medium text-[#6B6B6B]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#AAAAAA] flex-shrink-0"><rect x="2" y="2" width="20" height="20" rx="5"/></svg>
                  <span>{getCardDisplayName(currentCard, currentCardIdx)}</span>
                </div>

                {/* 封面圖片 row */}
                {!isSpecialCard && (
                  <div className="flex items-center gap-2.5 py-2 px-2 rounded-lg text-sm font-medium text-[#555555]">
                    <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0" style={{ background: "#FB923C" }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    </div>
                    <span>封面圖片</span>
                  </div>
                )}
                {isSpecialCard && (
                  <div className="flex items-center gap-2.5 py-2 px-2 rounded-lg text-sm font-medium text-[#555555]">
                    <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0" style={{ background: "#A855F7" }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    </div>
                    <span>封面圖片 (特殊)</span>
                  </div>
                )}

                {/* 內容設定 row */}
                {section && section.body !== undefined && (
                  <div>
                    <div className={`flex items-center gap-2.5 py-2 px-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${open === "body" ? "bg-[#FBEBEE] text-[#A35D5D]" : "text-[#555555] hover:bg-[#FCF7F8]"}`}
                      onClick={() => setOpen(open === "body" ? "hero" : "body")}>
                      <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0" style={{ background: "#EC4899" }}>
                        <svg width="9" height="9" viewBox="0 0 12 10" fill="none"><rect x="0" y="0" width="12" height="2" rx="1" fill="white"/><rect x="0" y="4" width="12" height="2" rx="1" fill="white"/><rect x="0" y="8" width="8" height="2" rx="1" fill="white"/></svg>
                      </div>
                      <span className="flex-1">{isSpecialCard ? "覆蓋層內容" : "內容設定"}</span>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open === "body" ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6"/></svg>
                    </div>

                    {open === "body" && (
                      <div className="mt-0.5 space-y-0.5">
                        {(isSpecialCard && specialSection ? specialSection.body : section.body || []).map((c: any, idx: number) => {
                          const kindLabel = c.kind === "title" ? "標題" : c.kind === "paragraph" ? "段落" : c.kind === "divider" ? "分隔線" : c.kind === "key_value" ? "標籤數值" : c.kind === "list" ? "列表" : c.kind === "spacer" ? "留白" : c.kind;
                          const iconBg = c.kind === "title" ? "#EC4899" : c.kind === "paragraph" ? "#EC4899" : c.kind === "divider" ? "#94A3B8" : c.kind === "key_value" ? "#A855F7" : c.kind === "list" ? "#10B981" : "#CBD5E1";
                          return (
                            <div
                              key={c.id}
                              className="flex items-center gap-2.5 py-2 px-2 pl-5 rounded-lg text-sm text-[#6B6B6B] hover:bg-[#FCF7F8] cursor-grab active:cursor-grabbing transition-colors"
                              draggable
                              onDragStart={() => { dragBodyRef.current = idx; }}
                              onDragOver={(e) => { e.preventDefault(); }}
                              onDrop={() => {
                                if (dragBodyRef.current !== idx) {
                                  const src = isSpecialCard && specialSection ? specialSection : section;
                                  setSection({ ...src, body: moveItem(src.body, dragBodyRef.current, idx) });
                                }
                                dragBodyRef.current = -1;
                              }}
                            >
                              <div className="w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
                                {c.kind === "title" && <span className="text-white font-bold" style={{ fontSize: "7px" }}>T</span>}
                                {c.kind === "paragraph" && <svg width="7" height="6" viewBox="0 0 12 10" fill="none"><rect x="0" y="0" width="12" height="2" rx="1" fill="white"/><rect x="0" y="4" width="12" height="2" rx="1" fill="white"/><rect x="0" y="8" width="8" height="2" rx="1" fill="white"/></svg>}
                                {c.kind === "divider" && <svg width="7" height="3" viewBox="0 0 12 4" fill="none"><rect x="0" y="1" width="12" height="2" rx="1" fill="white"/></svg>}
                                {c.kind === "key_value" && <span className="text-white font-bold" style={{ fontSize: "6px" }}>KV</span>}
                                {c.kind === "list" && <span className="text-white font-bold" style={{ fontSize: "7px" }}>≡</span>}
                                {c.kind === "spacer" && <span className="text-white" style={{ fontSize: "7px" }}>↕</span>}
                              </div>
                              <span className="flex-1 truncate">{kindLabel}</span>
                              <span className="text-[#CCCCCC] select-none flex-shrink-0">⠿</span>
                            </div>
                          );
                        })}

                        {/* + 新增內容 */}
                        <div className="pl-4 pt-1">
                          <button
                            className={`flex items-center justify-center gap-1.5 py-2 px-3 w-full rounded-xl text-xs font-semibold transition-all shadow-sm ${showBodyAdd ? "bg-[#FBEBEE]0 text-white shadow-[#F6D9DD]" : "bg-[#FBEBEE] text-[#A35D5D] border border-[#E7C9CD] hover:bg-[#8F4A4A] hover:text-white hover:shadow-[#F6D9DD]"}`}
                            onClick={() => setShowBodyAdd(v => !v)}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            <span>新增內容</span>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`ml-auto transition-transform ${showBodyAdd ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6"/></svg>
                          </button>
                          {showBodyAdd && (
                            <div className="mt-2 rounded-xl border border-[#E7C9CD] bg-white shadow-md overflow-hidden">
                              {isSpecialCard && specialSection ? (
                                <>
                                  {[
                                    { label: "標題", onClick: () => { setSection({ ...specialSection, body: [...specialSection.body, { id: uid("t_"), kind: "title", enabled: true, text: "標題", size: "lg", weight: "bold", color: "#FFFFFF", align: "start" }] }); setShowBodyAdd(false); } },
                                    { label: "段落", onClick: () => { setSection({ ...specialSection, body: [...specialSection.body, { id: uid("p_"), kind: "paragraph", enabled: true, text: "描述文字…", size: "md", weight: "regular", color: "#FFFFFF", wrap: true }] }); setShowBodyAdd(false); } },
                                    { label: "標籤數值", onClick: () => { setSection({ ...specialSection, body: [...specialSection.body, { id: uid("kv_"), kind: "key_value", enabled: true, label: "標籤", value: "內容" }] }); setShowBodyAdd(false); } },
                                  ].map((btn, i, arr) => (
                                    <button key={btn.label} className={`w-full text-left px-3 py-2.5 text-xs font-medium text-[#555555] hover:bg-[#FBEBEE] hover:text-[#A35D5D] transition-colors flex items-center gap-2 ${i < arr.length - 1 ? "border-b border-[#F0E3E5]" : ""}`} onClick={btn.onClick}>
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-[#A35D5D]"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                      {btn.label}
                                    </button>
                                  ))}
                                </>
                              ) : (
                                <>
                                  {[
                                    { label: "標題", onClick: () => { setSection({ ...section, body: [...section.body, { id: uid("t_"), kind: "title", enabled: true, text: "新標題", size: "lg", weight: "bold", color: "#111111", align: "start" }] }); setShowBodyAdd(false); } },
                                    { label: "段落", onClick: () => { setSection({ ...section, body: [...section.body, { id: uid("p_"), kind: "paragraph", enabled: true, text: "新段落…", size: "md", color: "#333333", wrap: true }] }); setShowBodyAdd(false); } },
                                    { label: "標籤數值", onClick: () => { setSection({ ...section, body: [...section.body, { id: uid("kv_"), kind: "key_value", enabled: true, label: "標籤", value: "內容", action: { type: "uri", uri: "https://example.com" } }] }); setShowBodyAdd(false); } },
                                    { label: "列表", onClick: () => { setSection({ ...section, body: [...section.body, { id: uid("l_"), kind: "list", enabled: true, items: [{ id: uid("i_"), text: "清單項目" }] }] }); setShowBodyAdd(false); } },
                                    { label: "分隔線", onClick: () => { setSection({ ...section, body: [...section.body, { id: uid("d_"), kind: "divider", enabled: true }] }); setShowBodyAdd(false); } },
                                    { label: "留白", onClick: () => { setSection({ ...section, body: [...section.body, { id: uid("s_"), kind: "spacer", enabled: true, size: "md" }] }); setShowBodyAdd(false); } },
                                  ].map((btn, i, arr) => (
                                    <button key={btn.label} className={`w-full text-left px-3 py-2.5 text-xs font-medium text-[#555555] hover:bg-[#FBEBEE] hover:text-[#A35D5D] transition-colors flex items-center gap-2 ${i < arr.length - 1 ? "border-b border-[#F0E3E5]" : ""}`} onClick={btn.onClick}>
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-[#A35D5D]"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                      {btn.label}
                                    </button>
                                  ))}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 底部按鈕 row */}
                {section && section.footer !== undefined && (
                  <div>
                    <div className={`flex items-center gap-2.5 py-2 px-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${open === "footer" ? "bg-[#FBEBEE] text-[#A35D5D]" : "text-[#555555] hover:bg-[#FCF7F8]"}`}
                      onClick={() => setOpen(open === "footer" ? "hero" : "footer")}>
                      <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 bg-[#AAAAAA]">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="15" width="20" height="7" rx="2"/></svg>
                      </div>
                      <span className="flex-1">底部按鈕</span>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open === "footer" ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6"/></svg>
                    </div>

                    {open === "footer" && (
                      <div className="mt-0.5 space-y-0.5">
                        {((section as any).footer || []).map((b: any, idx: number) => (
                          <div
                            key={b.id}
                            className="flex items-center gap-2 py-1.5 px-2 pl-4 rounded-lg text-xs text-[#6B6B6B] hover:bg-[#FCF7F8] cursor-grab active:cursor-grabbing transition-colors"
                            draggable
                            onDragStart={() => { dragFooterRef.current = idx; }}
                            onDragOver={(e) => { e.preventDefault(); }}
                            onDrop={() => {
                              if (dragFooterRef.current !== idx) {
                                setSection({ ...section, footer: moveItem((section as any).footer, dragFooterRef.current, idx) });
                              }
                              dragFooterRef.current = -1;
                            }}
                          >
                            <div className="w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 bg-[#FCF7F8]0">
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="10" rx="2"/></svg>
                            </div>
                            <span className="flex-1 truncate">{b.label || `按鈕 ${idx + 1}`}</span>
                            <span className="text-[#CCCCCC] select-none flex-shrink-0">⠿</span>
                          </div>
                        ))}

                        {/* + 新增按鈕 (sidebar) — only for non-special cards */}
                        {!isSpecialCard && (
                          <div className="pl-4">
                            <button
                              className={`flex items-center gap-1.5 py-1.5 px-2 w-full text-left rounded-lg border border-dashed transition-colors text-xs ${showFooterAdd ? "border-[#E7C9CD] bg-[#FBEBEE] text-[#A35D5D] font-medium" : "border-[#E7C9CD] text-[#6B6B6B] hover:border-[#E7C9CD] hover:text-[#A35D5D] hover:bg-[#FBEBEE]"}`}
                              disabled={((section as any).footer?.length || 0) >= 3}
                              onClick={() => setShowFooterAdd(v => !v)}
                            >
                              <span>+ 新增按鈕</span>
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`ml-auto transition-transform ${showFooterAdd ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6"/></svg>
                            </button>
                            {showFooterAdd && (
                              <div className="mt-1.5 space-y-1">
                                <button className="w-full text-left px-2 py-1 rounded-md bg-[#FCF7F8] border border-[#E7C9CD] text-[#6B6B6B] hover:bg-[#FBEBEE] hover:text-[#8F4A4A]00 hover:border-[#E7C9CD] transition-colors" onClick={() => {
                                  const bg = "#0A84FF";
                                  const btn: FooterButton = { id: uid("btn_"), kind: "footer_button", enabled: true, label: "新按鈕", action: { type: "uri", uri: "https://example.com" }, style: "primary", bgColor: bg, textColor: autoTextColor(bg), autoTextColor: true };
                                  setSection({ ...section, footer: [...((section as any).footer || []), btn].slice(0, 3) });
                                  setShowFooterAdd(false);
                                }}>＋ 按鈕</button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          </div>

          {/* Column 2: Middle editor */}
          <div className="flex-1 bg-[#FCF7F8] flex flex-col overflow-hidden">

            {/* Card tabs bar */}
            <div className="flex-shrink-0 bg-white border-b border-[#E7C9CD]">
              <div className="flex items-center px-2 pt-2 gap-1">
                {/* Scrollable tabs */}
                <div className="flex items-end overflow-x-auto flex-1 gap-0.5 scrollbar-hide min-w-0" ref={cardTabsRef}>
                  {doc.cards.map((c, idx) => {
                    const isSpec = (c.section as SpecialSection).kind === "special";
                    const displayName = getCardDisplayName(c, idx);
                    const isSelected = currentCardIdx === idx;
                    return editingNameIdx === idx ? (
                      <input
                        key={c.id}
                        autoFocus
                        className="px-2 py-1 text-sm bg-white border border-[#A35D5D] rounded-t-lg focus:ring-2 focus:ring-[#A35D5D]/15 outline-none w-28 flex-shrink-0"
                        defaultValue={c.name || displayName}
                        onBlur={(e) => {
                          const val = e.target.value.trim();
                          if (val) {
                            const nextCards = [...doc.cards];
                            nextCards[idx] = { ...c, name: val };
                            scheduleSave({ ...doc, cards: nextCards });
                          }
                          setEditingNameIdx(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                          if (e.key === "Escape") setEditingNameIdx(null);
                        }}
                      />
                    ) : (
                      <div
                        key={c.id}
                        className={`inline-flex items-center gap-0.5 px-2 py-1.5 border-b-2 whitespace-nowrap transition-colors flex-shrink-0 rounded-t-md ${isSelected ? "border-[#A35D5D] bg-[#FBEBEE]" : "border-transparent hover:bg-[#FCF7F8]"}`}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("cardIdx", idx.toString()); (e.currentTarget as HTMLElement).style.opacity = "0.4"; }}
                        onDragEnd={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const from = parseInt(e.dataTransfer.getData("cardIdx"));
                          if (isNaN(from) || from === idx) return;
                          const nextCards = moveItem(doc.cards, from, idx);
                          scheduleSave({ ...doc, cards: nextCards });
                          setSelectedCardIdx(idx);
                        }}
                      >
                        <button
                          className={`text-xs font-medium px-1 ${isSelected ? "text-[#A35D5D]" : "text-[#6B6B6B]"}`}
                          onClick={() => setSelectedCardIdx(idx)}
                        >
                          {isSpec ? "✦ " : ""}{displayName}
                        </button>
                        {isSelected && (
                          <button
                            className="w-5 h-5 flex items-center justify-center rounded transition-colors text-[#A35D5D] hover:bg-[#F6D9DD]"
                            onClick={(e) => { e.stopPropagation(); setEditingNameIdx(idx); }}
                            title="重命名"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                        )}
                        {isSelected && doc.cards.length > 1 && (
                          <button
                            className="w-5 h-5 flex items-center justify-center rounded text-[#AAAAAA] hover:text-red-500 hover:bg-red-50 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmState({
                                title: "刪除此卡片",
                                description: "此操作無法復原。",
                                onConfirm: () => {
                                  const nextCards = doc.cards.filter((_, i) => i !== idx);
                                  scheduleSave({ ...doc, cards: nextCards });
                                  setSelectedCardIdx(Math.max(0, idx - 1));
                                },
                              });
                            }}
                            title="刪除卡片"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {/* + 新增卡片按鈕：緊接在最後一張卡片右方 */}
                  {doc.cards.length < 10 && (
                    <div className="flex-shrink-0 self-end pb-1.5 ml-1">
                      <button
                        ref={addCardBtnRef}
                        title="新增卡片"
                        className="w-6 h-6 flex items-center justify-center rounded-full border border-[#E7C9CD] hover:bg-[#FBEBEE] hover:border-[#A35D5D] hover:text-[#A35D5D] transition-colors text-[#AAAAAA]"
                        onClick={() => {
                          if (!showAddCardMenu && addCardBtnRef.current) {
                            const rect = addCardBtnRef.current.getBoundingClientRect();
                            setAddCardMenuPos({ top: rect.bottom + 4, left: rect.left });
                          }
                          setShowAddCardMenu(v => !v);
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                      </button>
                    </div>
                  )}
                </div>

                {/* Fixed dropdown — 在 overflow 容器外渲染，不會被裁切 */}
                {showAddCardMenu && addCardMenuPos && (
                  <div
                    ref={addCardMenuRef}
                    className="fixed z-50 bg-white border border-[#E7C9CD] rounded-xl shadow-lg overflow-hidden min-w-[110px]"
                    style={{ top: addCardMenuPos.top, left: addCardMenuPos.left }}
                  >
                    {[{ val: "regular", label: "一般卡片" }, { val: "special", label: "特殊卡片" }].map(({ val, label }) => (
                      <button key={val} className="w-full text-left px-4 py-2 text-sm text-[#555555] hover:bg-[#FCF7F8] transition-colors" onClick={() => {
                        const newCard = val === "regular"
                          ? { id: uid("card_"), section: { hero: [{ id: uid("hero_"), kind: "hero_image", enabled: true, image: { kind: "external", url: "https://placehold.co/600x390/E2E8F0/94A3B8/png?text=+", lastCheck: { ok: true, level: "pass" } }, ratio: "20:13", mode: "cover" }], body: [], footer: [] } as any }
                          : { id: uid("card_"), section: seedSpecialSection() };
                        scheduleSave({ ...doc, cards: [...doc.cards, newCard] });
                        setSelectedCardIdx(doc.cards.length);
                        setShowAddCardMenu(false);
                      }}>{label}</button>
                    ))}
                  </div>
                )}

                {/* Right actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0 pb-1">
                  {/* Duplicate */}
                  <button
                    className="w-9 h-9 flex items-center justify-center rounded-lg border border-[#E7C9CD] hover:bg-[#FBEBEE] hover:border-[#E7C9CD] text-[#6B6B6B] hover:text-[#A35D5D] transition-colors"
                    title="複製卡片"
                    onClick={() => {
                      const current = doc.cards[selectedCardIdx];
                      const newCard = JSON.parse(JSON.stringify(current));
                      newCard.id = uid("card_");
                      const nextCards = [...doc.cards];
                      nextCards.splice(selectedCardIdx + 1, 0, newCard);
                      scheduleSave({ ...doc, cards: nextCards });
                      setSelectedCardIdx(selectedCardIdx + 1);
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  </button>
                </div>
              </div>

            </div>

            {/* Scrollable editor content */}
            <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">

            {/* Editor sections (carousel) */}
            <div className="space-y-3">
              {/* Special Card Editor */}
              {isSpecialCard && specialSection ? (
                <>
                  <AccordionSection
                    title="滿版圖片" accent="bg-purple-400"
                    subtitle="上傳圖片，圖片會佔滿整張卡片"
                    open={open === "hero"}
                    onToggle={() => setOpen(open === "hero" ? "body" : "hero")}
                    right={<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">特殊卡片</span>}
                  >
                    <div className="space-y-3">
                      <label className="flex items-center justify-center w-full px-4 py-3 bg-white border border-dashed border-[#E7C9CD] rounded-xl cursor-pointer hover:bg-[#FCF7F8] hover:border-[#A35D5D] transition-all text-sm font-medium text-[#6B6B6B] group">
                        上傳圖片
                        <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 1 * 1024 * 1024) return showToast("檔案過大，請小於 1MB", "error");
                          try {
                            const ext = file.name.split(".").pop();
                            const path = `${uid("img_")}.${ext}`;
                            const { error } = await supabase.storage.from("flex-assets").upload(path, file);
                            if (error) return showToast("上傳失敗：" + error.message, "error");
                            const { data: { publicUrl } } = supabase.storage.from("flex-assets").getPublicUrl(path);
                            setSection({ ...specialSection, image: { kind: "upload", assetId: path, url: publicUrl } });
                            showToast("圖片上傳成功");
                          } catch (err: any) {
                            showToast("上傳錯誤：" + err.message, "error");
                          }
                        }} />
                      </label>

                      <div className="mt-4">
                        <div className="text-sm font-semibold text-[#555555] mb-2">圖片比例</div>
                        <RatioPicker
                          value={specialSection.ratio || "2:3"}
                          onChange={(val) => setSection({ ...specialSection, ratio: val as any })}
                          options={[{value:"2:3",label:"2:3"},{value:"9:16",label:"9:16"},{value:"1:1",label:"1:1"},{value:"4:3",label:"4:3"},{value:"16:9",label:"16:9"}]}
                        />
                      </div>
                    </div>
                  </AccordionSection>

                  <AccordionSection
                    title="底部覆蓋層" accent="bg-[#AAAAAA]"
                    subtitle="半透明背景，可調整高度與顏色"
                    open={open === "body"}
                    onToggle={() => setOpen(open === "body" ? "footer" : "body")}
                    right={<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F0F0F0] text-[#2B2B2B] border border-[#E7C9CD]">{specialSection.body.filter((c: any) => c.enabled).length} 個</span>}
                  >
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-sm font-semibold text-[#555555] mb-2">覆蓋層高度</div>
                          <GlassSelect
                            value={specialSection.overlay?.height || "auto"}
                            onChange={(val) => setSection({ ...specialSection, overlay: { ...specialSection.overlay, height: val as any } })}
                            options={[
                              {value: "auto", label: "自動 (依內容)"},
                              {value: "30%", label: "30%"},
                              {value: "40%", label: "40%"},
                              {value: "50%", label: "50%"},
                              {value: "60%", label: "60%"},
                              {value: "70%", label: "70%"},
                            ]}
                            size="sm"
                            className="w-full"
                          />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-[#555555] mb-2">背景顏色</div>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              className="w-10 h-10 rounded cursor-pointer border border-gray-300"
                              value={(specialSection.overlay?.backgroundColor || "#03303A").substring(0, 7)}
                              onChange={(e) => {
                                const alpha = (specialSection.overlay?.backgroundColor || "#03303Acc").substring(7) || "cc";
                                setSection({ ...specialSection, overlay: { ...specialSection.overlay, backgroundColor: e.target.value + alpha } });
                              }}
                            />
                            <div className="flex-1">
                              <input
                                type="text"
                                className="w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all"
                                value={specialSection.overlay?.backgroundColor || "#03303Acc"}
                                onChange={(e) => setSection({ ...specialSection, overlay: { ...specialSection.overlay, backgroundColor: e.target.value } })}
                                placeholder="#03303Acc"
                              />
                              <div className="text-xs opacity-70 mt-1">後2位為透明度 (00~ff)</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-[#E7C9CD] pt-4 mt-4">
                        <div className="text-sm font-semibold text-[#555555] mb-3">覆蓋層內容</div>
                        {specialSection.body.map((c: any, idx: number) => (
                          <div key={c.id} className="bg-white border border-[#E7C9CD] rounded-xl p-4 mb-3 shadow-sm relative group/item">
                            <div className="flex items-center justify-between bg-[#FCF7F8] -mx-4 -mt-4 px-4 pt-3 pb-2 mb-3 rounded-t-xl border-b border-[#F0E3E5]">
                              <div className="font-semibold text-sm">{idx + 1}. {c.kind === 'paragraph' ? '段落' : c.kind === 'title' ? '標題' : c.kind === 'key_value' ? '標籤數值' : c.kind}</div>
                              <button className="px-2 py-1 bg-white border border-[#E7C9CD] rounded text-xs text-red-500 hover:bg-red-50 hover:border-red-200 transition-colors" onClick={() => {
                                const next = specialSection.body.filter((_: any, i: number) => i !== idx);
                                setSection({ ...specialSection, body: next });
                              }}>刪除</button>
                            </div>
                            {(c.kind === "title" || c.kind === "paragraph") && (
                              <div className="space-y-3 mt-2">
                                <textarea className="w-full px-3 py-2 bg-[#FCF7F8] border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all" rows={2} value={c.text} onChange={(e) => {
                                  const next = [...specialSection.body]; next[idx] = { ...c, text: e.target.value };
                                  setSection({ ...specialSection, body: next });
                                }} />
                                <div className="flex gap-2 items-end">
                                  <div className="flex-1">
                                    <ColorPicker label="文字顏色" value={c.color || "#FFFFFF"} onChange={(v) => {
                                      const next = [...specialSection.body]; next[idx] = { ...c, color: v.toUpperCase() };
                                      setSection({ ...specialSection, body: next });
                                    }} />
                                  </div>
                                  <div className="w-24">
                                    <div className="text-xs font-semibold text-[#6B6B6B] mb-1">大小</div>
                                    <GlassSelect
                                      value={c.size}
                                      onChange={(val) => {
                                        const next = [...specialSection.body]; next[idx] = { ...c, size: val };
                                        setSection({ ...specialSection, body: next });
                                      }}
                                      options={[
                                        {value: "xs", label: "XS"},
                                        {value: "sm", label: "SM"},
                                        {value: "md", label: "MD"},
                                        {value: "lg", label: "LG"},
                                        {value: "xl", label: "XL"},
                                      ]}
                                      size="xs"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                            {c.kind === "key_value" && (
                              <div className="grid grid-cols-2 gap-3 mt-2">
                                <input className="w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm" placeholder="標籤" value={c.label} onChange={(e) => {
                                  const next = [...specialSection.body]; next[idx] = { ...c, label: e.target.value }; setSection({ ...specialSection, body: next });
                                }} />
                                <input className="w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm" placeholder="數值" value={c.value} onChange={(e) => {
                                  const next = [...specialSection.body]; next[idx] = { ...c, value: e.target.value }; setSection({ ...specialSection, body: next });
                                }} />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </AccordionSection>
                </>
              ) : isVideoHero && heroVideo ? (
                <>
                  <AccordionSection
                    title="影片封面" accent="bg-red-400"
                    subtitle="上傳影片檔案（MP4，最大 200MB）與預覽圖"
                    open={open === "hero"}
                    onToggle={() => setOpen(open === "hero" ? "body" : "hero")}
                    right={<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">影片</span>}
                  >
                    <div className="space-y-3">
                      {heroVideo.video?.url ? (
                        <div className="flex items-center gap-3 px-4 py-3 bg-[#FCF7F8] border border-[#E7C9CD] rounded-xl">
                          <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#DC2626" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                          </div>
                          <span className="text-sm text-[#2B2B2B] truncate flex-1">{heroVideo.video.url.split("/").pop()?.split("?")[0] || "影片"}</span>
                          <button type="button" onClick={() => { const r = section as any; const hero = r.hero.map((c: any) => c.kind === "hero_video" ? { ...c, video: { kind: "external", url: "", previewUrl: "" } } : c); setSection({ ...r, hero }); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-[#AAAAAA] hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0" title="移除影片">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                          </button>
                        </div>
                      ) : (
                        <label className="flex items-center justify-center w-full px-4 py-8 border-2 border-dashed border-[#E7C9CD] rounded-xl hover:bg-[#FCF7F8] hover:border-[#A35D5D] transition-all cursor-pointer group">
                          <div className="flex flex-col items-center gap-2">
                            <div className="w-10 h-10 rounded-full bg-[#F0F0F0] flex items-center justify-center text-[#AAAAAA] group-hover:bg-white group-hover:text-red-500 transition-colors">
                              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                            </div>
                            <span className="text-sm font-medium text-[#6B6B6B] group-hover:text-[#2B2B2B]">上傳影片 (MP4)</span>
                            <span className="text-xs text-[#AAAAAA]">Max 200MB</span>
                          </div>
                          <input type="file" accept="video/mp4" className="hidden" onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.size > 200 * 1024 * 1024) return showToast(`影片檔案過大，請小於 200 MB（目前 ${(file.size / 1024 / 1024).toFixed(1)} MB）`, "error");
                            try {
                              // 1. 上傳影片
                              const ext = file.name.split(".").pop();
                              const path = `${uid("video_")}.${ext}`;
                              const { error } = await supabase.storage.from("flex-assets").upload(path, file);
                              if (error) return showToast("上傳失敗：" + error.message, "error");
                              const { data: { publicUrl } } = supabase.storage.from("flex-assets").getPublicUrl(path);

                              // 2. 自動擷取第一幀作為預覽圖
                              let previewUrl = heroVideo.video?.previewUrl || "";
                              let previewAssetId = heroVideo.video?.kind === "upload" ? heroVideo.video.previewAssetId : "";
                              try {
                                const frameBlob = await extractVideoFrame(publicUrl, 0.1);
                                const previewPath = `${uid("preview_")}.jpg`;
                                const { error: previewError } = await supabase.storage.from("flex-assets").upload(previewPath, frameBlob, { contentType: "image/jpeg" });
                                if (!previewError) {
                                  const { data: { publicUrl: previewPublicUrl } } = supabase.storage.from("flex-assets").getPublicUrl(previewPath);
                                  previewUrl = previewPublicUrl;
                                  previewAssetId = previewPath;
                                }
                              } catch (frameErr) {
                                console.warn("自動擷取預覽圖失敗，請手動上傳：", frameErr);
                              }

                              await updateHeroVideoSource(publicUrl, previewUrl, path, previewAssetId);
                              showToast("影片上傳成功");
                            } catch (err: any) {
                              showToast("上傳錯誤：" + err.message, "error");
                            }
                          }} />
                        </label>
                      )}
                      {heroVideo.video?.previewUrl ? (
                        <div className="flex items-center gap-3 px-3 py-2 bg-[#FCF7F8] border border-[#E7C9CD] rounded-xl">
                          <img src={heroVideo.video.previewUrl} alt="預覽圖" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-[#E7C9CD]" />
                          <span className="text-sm text-[#2B2B2B] truncate flex-1">預覽圖</span>
                          <button type="button" onClick={() => updateHeroVideoSource(heroVideo.video?.url || "", "", heroVideo.video?.kind === "upload" ? heroVideo.video.assetId : "", "")} className="w-7 h-7 flex items-center justify-center rounded-lg text-[#AAAAAA] hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0" title="移除預覽圖">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                          </button>
                        </div>
                      ) : (
                        <label className="flex items-center justify-center w-full px-4 py-4 border-2 border-dashed border-[#E7C9CD] rounded-xl hover:bg-[#FCF7F8] hover:border-[#A35D5D] transition-all cursor-pointer group">
                          <span className="text-sm font-medium text-[#6B6B6B] group-hover:text-[#555555] flex items-center gap-2">
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            上傳預覽圖
                          </span>
                          <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.size > 1 * 1024 * 1024) return showToast("檔案過大，請小於 1MB", "error");
                            try {
                              const ext = file.name.split(".").pop();
                              const path = `${uid("img_")}.${ext}`;
                              const { error } = await supabase.storage.from("flex-assets").upload(path, file);
                              if (error) return showToast("上傳失敗：" + error.message, "error");
                              const { data: { publicUrl } } = supabase.storage.from("flex-assets").getPublicUrl(path);
                              await updateHeroVideoSource(heroVideo.video?.url || "", publicUrl, heroVideo.video?.kind === "upload" ? heroVideo.video.assetId : "", path);
                              showToast("預覽圖上傳成功");
                            } catch (err: any) {
                              showToast("上傳錯誤：" + err.message, "error");
                            }
                          }} />
                        </label>
                      )}
                      <div className="mt-4">
                        <div className="text-sm font-semibold text-[#555555] mb-2">影片比例</div>
                        <RatioPicker
                          value={heroVideo.ratio || "16:9"}
                          onChange={(val) => {
                            const regularSection = section as any;
                            const hero = regularSection.hero.map((c: any) => (c.kind === "hero_video" ? { ...c, ratio: val } : c));
                            setSection({ ...regularSection, hero });
                          }}
                          options={[{value:"20:13",label:"20:13"},{value:"16:9",label:"16:9"},{value:"4:3",label:"4:3"},{value:"1:1",label:"1:1"},{value:"9:16",label:"9:16"}]}
                        />
                      </div>
                    </div>
                  </AccordionSection>

                  <AccordionSection
                    title="內容設定" accent="bg-[#A35D5D]"
                    open={open === "body"}
                    onToggle={() => setOpen(open === "body" ? "footer" : "body")}
                    right={<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F0F0F0] text-[#2B2B2B] border border-[#E7C9CD]">{section.body.filter((c: any) => c.enabled).length} 個</span>}
                  >
                    <div className="space-y-3">
                      {section.body.map((c: any, idx: number) => (
                        <div key={c.id} className="bg-white border border-[#E7C9CD] rounded-xl p-4 mb-3 shadow-sm relative group/item">
                          <div className="flex items-center justify-between bg-[#FCF7F8] -mx-4 -mt-4 px-4 pt-3 pb-2 mb-3 rounded-t-xl border-b border-[#F0E3E5]">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-[#6B6B6B]">
                                {c.kind === "title" ? "標題設定 (Title)" : c.kind === "paragraph" ? "內文設定" : c.kind === "divider" ? "分隔線" : c.kind === "key_value" ? "標籤數值" : c.kind === "list" ? "列表" : "留白"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                className="p-1.5 text-[#AAAAAA] hover:text-[#6B6B6B] rounded-lg hover:bg-[#F0F0F0] disabled:opacity-30 transition-colors"
                                disabled={idx === 0}
                                onClick={() => setSection({ ...section, body: moveItem(section.body, idx, idx - 1) })}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6" /></svg>
                              </button>
                              <button
                                className="p-1.5 text-[#AAAAAA] hover:text-[#6B6B6B] rounded-lg hover:bg-[#F0F0F0] disabled:opacity-30 transition-colors"
                                disabled={idx === section.body.length - 1}
                                onClick={() => setSection({ ...section, body: moveItem(section.body, idx, idx + 1) })}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                              </button>
                              <div className="w-px h-4 bg-gray-300 mx-1"></div>
                              <button className="p-1.5 text-[#AAAAAA] hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors" onClick={() => {
                                const next = [...section.body]; next.splice(idx, 1);
                                setSection({ ...section, body: next });
                              }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                              </button>
                            </div>
                          </div>

                          {c.kind === "title" ? (
                            <div className="mt-3 space-y-3">
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-medium text-[#6B6B6B]">文字內容</span>
                                  <span className="text-xs text-[#AAAAAA]">{(c.text || "").length} / 40</span>
                                </div>
                                <input className="w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all font-sans" maxLength={40} value={c.text} onChange={(e) => {
                                  const next = [...section.body]; next[idx] = { ...c, text: e.target.value };
                                  setSection({ ...section, body: next });
                                }} />
                              </div>
                              <div>
                                <span className="text-xs font-medium text-[#6B6B6B] mb-1 block">文字樣式</span>
                                <div className="flex items-center gap-2">
                                  <GlassSelect
                                    size="xs"
                                    value={c.size || "md"}
                                    onChange={(val) => { const next = [...section.body]; next[idx] = { ...c, size: val }; setSection({ ...section, body: next }); }}
                                    options={[
                                      {value: "xxs", label: "11px"},
                                      {value: "xs", label: "13px"},
                                      {value: "sm", label: "14px"},
                                      {value: "md", label: "16px"},
                                      {value: "lg", label: "19px"},
                                      {value: "xl", label: "22px"},
                                      {value: "xxl", label: "26px"},
                                    ]}
                                  />
                                  <div className="flex rounded-lg overflow-hidden border border-[#E7C9CD]">
                                    <button className={`px-3 py-1.5 text-sm font-bold transition-colors ${(c.weight || "regular") === "bold" ? "bg-[#FBEBEE]0 text-white" : "bg-white text-[#6B6B6B] hover:bg-[#FCF7F8]"}`} onClick={() => { const next = [...section.body]; next[idx] = { ...c, weight: "bold" }; setSection({ ...section, body: next }); }}>B</button>
                                    <button className={`px-3 py-1.5 text-sm transition-colors ${(c.weight || "regular") === "regular" ? "bg-[#FBEBEE]0 text-white" : "bg-white text-[#6B6B6B] hover:bg-[#FCF7F8]"}`} onClick={() => { const next = [...section.body]; next[idx] = { ...c, weight: "regular" }; setSection({ ...section, body: next }); }}>R</button>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                    <input type="color" className="w-6 h-6 rounded-full cursor-pointer border-0 flex-shrink-0" value={(c.color || "#111111").substring(0, 7)} onChange={(e) => { const next = [...section.body]; next[idx] = { ...c, color: e.target.value.toUpperCase() }; setSection({ ...section, body: next }); }} />
                                    <input className="flex-1 min-w-0 px-2 py-1 bg-white border border-[#E7C9CD] rounded-lg text-xs text-[#555555] focus:outline-none focus:ring-1 focus:ring-[#A35D5D]/40" value={c.color || "#111111"} onChange={(e) => { const next = [...section.body]; next[idx] = { ...c, color: e.target.value }; setSection({ ...section, body: next }); }} />
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null}

                          {c.kind === "paragraph" ? (
                            <div className="mt-3 space-y-3">
                              <div>
                                <span className="text-xs font-medium text-[#6B6B6B] mb-1 block">內容描述</span>
                                <textarea className="w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all font-sans" rows={3} value={c.text} onChange={(e) => {
                                  const next = [...section.body]; next[idx] = { ...c, text: e.target.value };
                                  setSection({ ...section, body: next });
                                }} />
                              </div>
                              <div>
                                <span className="text-xs font-medium text-[#6B6B6B] mb-1 block">文字樣式</span>
                                <div className="flex items-center gap-2">
                                  <GlassSelect
                                    size="xs"
                                    value={c.size || "md"}
                                    onChange={(val) => { const next = [...section.body]; next[idx] = { ...c, size: val }; setSection({ ...section, body: next }); }}
                                    options={[
                                      {value: "xxs", label: "11px"},
                                      {value: "xs", label: "13px"},
                                      {value: "sm", label: "14px"},
                                      {value: "md", label: "16px"},
                                      {value: "lg", label: "19px"},
                                      {value: "xl", label: "22px"},
                                      {value: "xxl", label: "26px"},
                                    ]}
                                  />
                                  <div className="flex rounded-lg overflow-hidden border border-[#E7C9CD]">
                                    <button className={`px-3 py-1.5 text-sm font-bold transition-colors ${(c.weight || "regular") === "bold" ? "bg-[#FBEBEE]0 text-white" : "bg-white text-[#6B6B6B] hover:bg-[#FCF7F8]"}`} onClick={() => { const next = [...section.body]; next[idx] = { ...c, weight: "bold" }; setSection({ ...section, body: next }); }}>B</button>
                                    <button className={`px-3 py-1.5 text-sm transition-colors ${(c.weight || "regular") === "regular" ? "bg-[#FBEBEE]0 text-white" : "bg-white text-[#6B6B6B] hover:bg-[#FCF7F8]"}`} onClick={() => { const next = [...section.body]; next[idx] = { ...c, weight: "regular" }; setSection({ ...section, body: next }); }}>R</button>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                    <input type="color" className="w-6 h-6 rounded-full cursor-pointer border-0 flex-shrink-0" value={(c.color || "#111111").substring(0, 7)} onChange={(e) => { const next = [...section.body]; next[idx] = { ...c, color: e.target.value.toUpperCase() }; setSection({ ...section, body: next }); }} />
                                    <input className="flex-1 min-w-0 px-2 py-1 bg-white border border-[#E7C9CD] rounded-lg text-xs text-[#555555] focus:outline-none focus:ring-1 focus:ring-[#A35D5D]/40" value={c.color || "#111111"} onChange={(e) => { const next = [...section.body]; next[idx] = { ...c, color: e.target.value }; setSection({ ...section, body: next }); }} />
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null}

                          {c.kind === "key_value" ? (
                            <div className="mt-3 space-y-3">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div><div className="text-xs font-medium text-[#6B6B6B] mb-1">標籤名稱 (Label)</div><input className="w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all font-sans" value={c.label} onChange={(e) => {
                                  const next = [...section.body]; next[idx] = { ...c, label: e.target.value }; setSection({ ...section, body: next });
                                }} /></div>
                                <div><div className="text-xs font-medium text-[#6B6B6B] mb-1">顯示數值 (Value)</div><input className="w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all font-sans" value={c.value} onChange={(e) => {
                                  const next = [...section.body]; next[idx] = { ...c, value: e.target.value }; setSection({ ...section, body: next });
                                }} /></div>
                              </div>
                              <div><div className="text-xs font-medium text-[#6B6B6B] mb-1">連結網址 (URL)</div><input className="w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all font-sans" value={c.action?.uri || ""} onChange={(e) => {
                                const next = [...section.body]; next[idx] = { ...c, action: { type: "uri", uri: e.target.value } }; setSection({ ...section, body: next });
                              }} /></div>
                            </div>
                          ) : null}

                          {c.kind === "list" ? (
                            <div className="mt-3 space-y-2">
                              {c.items.map((it: any, j: number) => (
                                <input key={it.id} className="w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all font-sans" value={it.text} onChange={(e) => {
                                  const next = [...section.body];
                                  const items = [...c.items]; items[j] = { ...it, text: e.target.value };
                                  next[idx] = { ...c, items }; setSection({ ...section, body: next });
                                }} />
                              ))}
                              <button className="w-full px-3 py-2 bg-white border border-[#E7C9CD] text-[#6B6B6B] font-medium rounded-lg hover:bg-[#FCF7F8] transition-colors shadow-sm text-xs" onClick={() => {
                                const next = [...section.body]; next[idx] = { ...c, items: [...c.items, { id: uid("i_"), text: "新項目" }] };
                                setSection({ ...section, body: next });
                              }}>+ 新增項目</button>
                            </div>
                          ) : null}

                          {c.kind === "spacer" ? (
                            <div className="mt-3">
                              <div className="text-xs font-medium text-[#6B6B6B] mb-1">留白大小</div>
                              <GlassSelect
                                size="sm"
                                className="w-full"
                                value={c.size}
                                onChange={(val) => { const next = [...section.body]; next[idx] = { ...c, size: val }; setSection({ ...section, body: next }); }}
                                options={[
                                  {value: "sm", label: "sm"},
                                  {value: "md", label: "md"},
                                  {value: "lg", label: "lg"},
                                ]}
                              />
                            </div>
                          ) : null}

                          {c.kind === "divider" ? (
                            <div className="mt-3 space-y-3">
                              <div>
                                <span className="text-xs font-medium text-[#6B6B6B] mb-1 block">線條顏色</span>
                                <div className="flex items-center gap-2">
                                  <input type="color" className="w-8 h-8 rounded-lg cursor-pointer border border-[#E7C9CD] p-0.5 flex-shrink-0" value={(c.color || "#f1f5f9").substring(0, 7)} onChange={(e) => { const next = [...section.body]; next[idx] = { ...c, color: e.target.value }; setSection({ ...section, body: next }); }} />
                                  <input className="flex-1 px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all" value={c.color || "#f1f5f9"} onChange={(e) => { const next = [...section.body]; next[idx] = { ...c, color: e.target.value }; setSection({ ...section, body: next }); }} />
                                </div>
                              </div>
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-medium text-[#6B6B6B]">間距 (Spacing)</span>
                                  <span className="text-xs text-[#AAAAAA]">{({"none":"0px","xs":"4px","sm":"8px","md":"16px","lg":"24px","xl":"32px","xxl":"48px"} as any)[c.spacing || "md"] || "16px"}</span>
                                </div>
                                <input type="range" min="0" max="6" step="1" className="w-full accent-[#A35D5D]" value={["none","xs","sm","md","lg","xl","xxl"].indexOf(c.spacing || "md") === -1 ? 3 : ["none","xs","sm","md","lg","xl","xxl"].indexOf(c.spacing || "md")} onChange={(e) => { const tokens = ["none","xs","sm","md","lg","xl","xxl"]; const next = [...section.body]; next[idx] = { ...c, spacing: tokens[Number(e.target.value)] }; setSection({ ...section, body: next }); }} />
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </AccordionSection>

                  <AccordionSection
                    title="底部按鈕" accent="bg-[#AAAAAA]"
                    
                    open={open === "footer"}
                    onToggle={() => setOpen(open === "footer" ? "hero" : "footer")}
                    right={<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F0F0F0] text-[#2B2B2B] border border-[#E7C9CD]">{(section as any).footer?.length || 0}/3</span>}
                  >
                    <div className="space-y-3">
                      {((section as any).footer || []).map((b: any, idx: number) => (
                        <div key={b.id} className="bg-white border border-[#E7C9CD] rounded-xl p-4 space-y-3 shadow-sm">
                          <div className="flex items-center justify-between bg-[#FCF7F8] -mx-4 -mt-4 px-4 pt-3 pb-2 mb-2 rounded-t-xl border-b border-[#F0E3E5]">
                            <div className="font-semibold text-sm">按鈕 {idx + 1}</div>
                            <div className="flex items-center gap-1">
                              <button
                                className="p-1.5 text-[#AAAAAA] hover:text-[#6B6B6B] rounded-lg hover:bg-[#F0F0F0] disabled:opacity-30 transition-colors"
                                disabled={idx === 0}
                                onClick={() => setSection({ ...section, footer: moveItem((section as any).footer, idx, idx - 1) })}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6" /></svg>
                              </button>
                              <button
                                className="p-1.5 text-[#AAAAAA] hover:text-[#6B6B6B] rounded-lg hover:bg-[#F0F0F0] disabled:opacity-30 transition-colors"
                                disabled={idx === (section as any).footer.length - 1}
                                onClick={() => setSection({ ...section, footer: moveItem((section as any).footer, idx, idx + 1) })}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                              </button>
                              <div className="w-px h-4 bg-[#E8E8E8] mx-1"></div>
                              <button className="w-7 h-7 flex items-center justify-center rounded-lg text-[#AAAAAA] hover:text-red-500 hover:bg-red-50 transition-colors" title="刪除按鈕" onClick={() => {
                                const next = (section as any).footer.filter((_: any, i: number) => i !== idx);
                                setSection({ ...section, footer: next });
                              }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>
                            </div>
                          </div>

                          <div>
                            <div>
                              <div className="flex gap-4 mb-2">
                                <div className="flex-1">
                                  <div className="text-sm font-semibold text-[#555555] mb-1">按鈕文字</div>
                                  <input className="w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all" value={b.label} onChange={(e) => {
                                    const next = [...(section as any).footer]; next[idx] = { ...b, label: e.target.value }; setSection({ ...section, footer: next });
                                  }} />
                                </div>
                                <div className="w-1/3">
                                  <div className="text-sm font-semibold text-[#555555] mb-1">動作類型</div>
                                  <GlassSelect
                                    size="sm"
                                    className="w-full"
                                    value={b.action.type}
                                    onChange={(val) => {
                                      const type = val as any;
                                      const next = [...(section as any).footer];
                                      if (type === "uri") next[idx] = { ...b, action: { type, uri: "" } };
                                      else if (type === "message") next[idx] = { ...b, action: { type, text: "" } };
                                      setSection({ ...section, footer: next });
                                    }}
                                    options={[
                                      {value: "uri", label: "開啟網址"},
                                      {value: "message", label: "傳送文字"},
                                    ]}
                                  />
                                </div>
                              </div>

                              <div>
                                <div className="text-sm font-semibold text-[#555555] mb-2">
                                  {b.action.type === "uri" ? "URL連結" : b.action.type === "message" ? "訊息文字" : "分享連結（自動填入）"}
                                </div>
                                <input
                                  className={`w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all ${b.action.type === "share" ? "bg-[#F0F0F0] opacity-60 cursor-not-allowed" : ""}`}
                                  disabled={b.action.type === "share"}
                                  value={b.action.type === "uri" ? b.action.uri : b.action.type === "message" ? b.action.text : (shareUrl || "尚未發布，請先至預覽頁發布")}
                                  onChange={(e) => {
                                    if (b.action.type === "share") return;
                                    const next = [...(section as any).footer];
                                    if (b.action.type === "uri") next[idx] = { ...b, action: { ...b.action, uri: e.target.value } };
                                    else if (b.action.type === "message") next[idx] = { ...b, action: { ...b.action, text: e.target.value } };
                                    setSection({ ...section, footer: next });
                                  }}
                                />
                                {b.action.type === "uri" ? <div className="mt-1 text-xs opacity-70">僅支援 https://、line://、liff://</div> : null}
                                {b.action.type === "share" && !shareUrl ? <div className="mt-1 text-xs text-amber-600">請先至「預覽與發布」頁面發布後，連結會自動顯示</div> : null}
                                {b.action.type === "share" && shareUrl ? <div className="mt-1 text-xs text-green-600">已發布 v{activeShare?.version_no}</div> : null}
                              </div>
                            </div>
                          </div>

                          <details className="bg-[#FCF7F8] border border-[#E7C9CD] rounded-xl p-3">
                            <summary className="cursor-pointer font-semibold text-sm text-[#555555]">顏色設定</summary>
                            <div className="mt-3 space-y-4">
                              <ColorPicker label="背景色" value={b.bgColor} onChange={(v) => {
                                const next = [...(section as any).footer];
                                next[idx] = { ...b, bgColor: v.toUpperCase(), textColor: b.autoTextColor ? autoTextColor(v) : b.textColor };
                                setSection({ ...section, footer: next });
                              }} />
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-xs opacity-70">文字色：{b.textColor}</div>
                                <button className="px-3 py-1.5 text-xs font-medium bg-white border border-[#E7C9CD] text-[#6B6B6B] rounded-lg hover:bg-[#FCF7F8] transition-colors shadow-sm" onClick={() => {
                                  const next = [...(section as any).footer]; next[idx] = { ...b, textColor: autoTextColor(b.bgColor), autoTextColor: true }; setSection({ ...section, footer: next });
                                }}>自動</button>
                              </div>
                              <ColorPicker label="文字色（手動）" value={b.textColor} onChange={(v) => {
                                const next = [...(section as any).footer]; next[idx] = { ...b, textColor: v.toUpperCase(), autoTextColor: false }; setSection({ ...section, footer: next });
                              }} />
                              <AutoTextColorHint bgColor={b.bgColor} textColor={b.textColor} />
                            </div>
                          </details>
                        </div>
                      ))}
                    </div>
                  </AccordionSection>
                </>
              ) : (
                /* Regular Card Editor */
                <>
                  <AccordionSection
                    title="封面圖片" accent="bg-orange-400"
                    open={open === "hero"}
                    onToggle={() => setOpen(open === "hero" ? "body" : "hero")}
                    right={(() => {
                      const heroArr = (section as any).hero || [];
                      const heroImage = heroArr.find((c: any) => c.kind === "hero_image");
                      const hasUpload = heroImage?.image?.url && !heroImage.image.url.includes("placehold.co");
                      if (!hasUpload) return undefined;
                      return (
                        <button
                          type="button"
                          title="刪除圖片"
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-[#AAAAAA] hover:text-red-500 hover:bg-red-50 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            const ratioDims: Record<string, string> = { "20:13": "600x390", "16:9": "640x360", "4:3": "640x480", "1:1": "600x600", "9:16": "360x640", "1.91:1": "640x335" };
                            const currentRatio = heroImage?.ratio || "20:13";
                            const dims = ratioDims[currentRatio] || "600x390";
                            const hero = heroArr.map((c: any) => c.kind === "hero_image"
                              ? { ...c, image: { kind: "external", url: `https://placehold.co/${dims}/E2E8F0/94A3B8/png?text=+`, lastCheck: { ok: true, level: "pass" } } }
                              : c
                            );
                            setSection({ ...section, hero });
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                          </svg>
                        </button>
                      );
                    })()}
                  >
                    <div className="space-y-3">
                      <label className="flex items-center justify-center w-full px-4 py-3 bg-white border border-dashed border-[#E7C9CD] rounded-xl cursor-pointer hover:bg-[#FCF7F8] hover:border-[#A35D5D] transition-all text-sm font-medium text-[#6B6B6B] group">
                        上傳圖片
                        <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;

                          // Simple verification
                          if (file.size > 1 * 1024 * 1024) return showToast("檔案過大，請小於 1MB", "error");

                          try {
                            const ext = file.name.split(".").pop();
                            const path = `${uid("img_")}.${ext}`;
                            const { data, error } = await supabase.storage.from("flex-assets").upload(path, file);

                            if (error) {
                              console.error(error);
                              return showToast("上傳失敗：" + error.message, "error");
                            }

                            const { data: { publicUrl } } = supabase.storage.from("flex-assets").getPublicUrl(path);

                            await updateHeroImageSource({
                              kind: "upload",
                              assetId: path,
                              url: publicUrl
                            });
                            showToast("圖片上傳成功");
                          } catch (err: any) {
                            showToast("上傳錯誤：" + err.message, "error");
                          }
                        }} />
                      </label>



                      <div className="mt-3">
                        <div className="text-sm font-semibold text-[#555555] mb-2">圖片比例</div>
                        <RatioPicker
                          value={(() => { const heroArr = (section as any).hero || []; const heroImage = heroArr.find((c: any) => c.kind === "hero_image"); return heroImage?.ratio || "20:13"; })()}
                          onChange={(val) => {
                            const ratioDims: Record<string, string> = { "20:13": "600x390", "16:9": "640x360", "4:3": "640x480", "1:1": "600x600", "9:16": "360x640", "1.91:1": "640x335" };
                            const heroArr = (section as any).hero || [];
                            const hero = heroArr.map((c: any) => {
                              if (c.kind !== "hero_image") return c;
                              const isPlaceholder = !c.image?.url || c.image?.url?.includes("placehold.co");
                              const image = isPlaceholder ? { kind: "external", url: `https://placehold.co/${ratioDims[val] || "600x400"}/E2E8F0/94A3B8/png?text=+`, lastCheck: { ok: true, level: "pass" } } : c.image;
                              return { ...c, ratio: val, image };
                            });
                            setSection({ ...section, hero });
                          }}
                          options={[{value:"20:13",label:"20:13"},{value:"16:9",label:"16:9"},{value:"4:3",label:"4:3"},{value:"1:1",label:"1:1"},{value:"9:16",label:"9:16"},{value:"1.91:1",label:"1.91:1"}]}
                        />
                      </div>
                    </div>
                  </AccordionSection>

                  <AccordionSection
                    title="內容設定" accent="bg-[#A35D5D]"
                    open={open === "body"}
                    onToggle={() => setOpen(open === "body" ? "footer" : "body")}
                    right={<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F0F0F0] text-[#2B2B2B] border border-[#E7C9CD]">{section.body.filter((c: any) => c.enabled).length} 個</span>}
                  >
                    <div className="space-y-3">
                      {section.body.map((c: any, idx: number) => (
                        <div key={c.id} className="bg-white border border-[#E7C9CD] rounded-xl p-4 shadow-sm relative group/item">
                          <div className="flex items-center justify-between bg-[#FCF7F8] -mx-4 -mt-4 px-4 pt-3 pb-2 mb-3 rounded-t-xl border-b border-[#F0E3E5]">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-[#6B6B6B]">
                                {c.kind === "title" ? "標題設定 (Title)" : c.kind === "paragraph" ? "內文設定" : c.kind === "divider" ? "分隔線" : c.kind === "key_value" ? "標籤數值" : c.kind === "list" ? "列表" : "留白"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                className="p-1.5 text-[#AAAAAA] hover:text-[#6B6B6B] rounded-lg hover:bg-[#F0F0F0] disabled:opacity-30 transition-colors"
                                disabled={idx === 0}
                                onClick={() => setSection({ ...section, body: moveItem(section.body, idx, idx - 1) })}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6" /></svg>
                              </button>
                              <button
                                className="p-1.5 text-[#AAAAAA] hover:text-[#6B6B6B] rounded-lg hover:bg-[#F0F0F0] disabled:opacity-30 transition-colors"
                                disabled={idx === section.body.length - 1}
                                onClick={() => setSection({ ...section, body: moveItem(section.body, idx, idx + 1) })}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                              </button>
                              <div className="w-px h-4 bg-[#E8E8E8] mx-1"></div>
                              <button className="p-1.5 text-[#AAAAAA] hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors" onClick={() => {
                                const next = [...section.body]; next.splice(idx, 1);
                                setSection({ ...section, body: next });
                              }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                              </button>
                            </div>
                          </div>

                          {c.kind === "title" ? (
                            <div className="mt-3 space-y-3">
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-medium text-[#6B6B6B]">文字內容</span>
                                  <span className="text-xs text-[#AAAAAA]">{(c.text || "").length} / 40</span>
                                </div>
                                <input className="w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all font-sans" maxLength={40} value={c.text} onChange={(e) => {
                                  const next = [...section.body]; next[idx] = { ...c, text: e.target.value };
                                  setSection({ ...section, body: next });
                                }} />
                              </div>
                              <div>
                                <span className="text-xs font-medium text-[#6B6B6B] mb-1 block">文字樣式</span>
                                <div className="flex items-center gap-2">
                                  <GlassSelect
                                    size="xs"
                                    value={c.size || "md"}
                                    onChange={(val) => { const next = [...section.body]; next[idx] = { ...c, size: val }; setSection({ ...section, body: next }); }}
                                    options={[
                                      {value: "xxs", label: "11px"},
                                      {value: "xs", label: "13px"},
                                      {value: "sm", label: "14px"},
                                      {value: "md", label: "16px"},
                                      {value: "lg", label: "19px"},
                                      {value: "xl", label: "22px"},
                                      {value: "xxl", label: "26px"},
                                    ]}
                                  />
                                  <div className="flex rounded-lg overflow-hidden border border-[#E7C9CD]">
                                    <button className={`px-3 py-1.5 text-sm font-bold transition-colors ${(c.weight || "regular") === "bold" ? "bg-[#FBEBEE]0 text-white" : "bg-white text-[#6B6B6B] hover:bg-[#FCF7F8]"}`} onClick={() => { const next = [...section.body]; next[idx] = { ...c, weight: "bold" }; setSection({ ...section, body: next }); }}>B</button>
                                    <button className={`px-3 py-1.5 text-sm transition-colors ${(c.weight || "regular") === "regular" ? "bg-[#FBEBEE]0 text-white" : "bg-white text-[#6B6B6B] hover:bg-[#FCF7F8]"}`} onClick={() => { const next = [...section.body]; next[idx] = { ...c, weight: "regular" }; setSection({ ...section, body: next }); }}>R</button>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                    <input type="color" className="w-6 h-6 rounded-full cursor-pointer border-0 flex-shrink-0" value={(c.color || "#111111").substring(0, 7)} onChange={(e) => { const next = [...section.body]; next[idx] = { ...c, color: e.target.value.toUpperCase() }; setSection({ ...section, body: next }); }} />
                                    <input className="flex-1 min-w-0 px-2 py-1 bg-white border border-[#E7C9CD] rounded-lg text-xs text-[#555555] focus:outline-none focus:ring-1 focus:ring-[#A35D5D]/40" value={c.color || "#111111"} onChange={(e) => { const next = [...section.body]; next[idx] = { ...c, color: e.target.value }; setSection({ ...section, body: next }); }} />
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null}

                          {c.kind === "paragraph" ? (
                            <div className="mt-3 space-y-3">
                              <div>
                                <span className="text-xs font-medium text-[#6B6B6B] mb-1 block">內容描述</span>
                                <textarea className="w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all font-sans" rows={3} value={c.text} onChange={(e) => {
                                  const next = [...section.body]; next[idx] = { ...c, text: e.target.value };
                                  setSection({ ...section, body: next });
                                }} />
                              </div>
                              <div>
                                <span className="text-xs font-medium text-[#6B6B6B] mb-1 block">文字樣式</span>
                                <div className="flex items-center gap-2">
                                  <GlassSelect
                                    size="xs"
                                    value={c.size || "md"}
                                    onChange={(val) => { const next = [...section.body]; next[idx] = { ...c, size: val }; setSection({ ...section, body: next }); }}
                                    options={[
                                      {value: "xxs", label: "11px"},
                                      {value: "xs", label: "13px"},
                                      {value: "sm", label: "14px"},
                                      {value: "md", label: "16px"},
                                      {value: "lg", label: "19px"},
                                      {value: "xl", label: "22px"},
                                      {value: "xxl", label: "26px"},
                                    ]}
                                  />
                                  <div className="flex rounded-lg overflow-hidden border border-[#E7C9CD]">
                                    <button className={`px-3 py-1.5 text-sm font-bold transition-colors ${(c.weight || "regular") === "bold" ? "bg-[#FBEBEE]0 text-white" : "bg-white text-[#6B6B6B] hover:bg-[#FCF7F8]"}`} onClick={() => { const next = [...section.body]; next[idx] = { ...c, weight: "bold" }; setSection({ ...section, body: next }); }}>B</button>
                                    <button className={`px-3 py-1.5 text-sm transition-colors ${(c.weight || "regular") === "regular" ? "bg-[#FBEBEE]0 text-white" : "bg-white text-[#6B6B6B] hover:bg-[#FCF7F8]"}`} onClick={() => { const next = [...section.body]; next[idx] = { ...c, weight: "regular" }; setSection({ ...section, body: next }); }}>R</button>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                    <input type="color" className="w-6 h-6 rounded-full cursor-pointer border-0 flex-shrink-0" value={(c.color || "#111111").substring(0, 7)} onChange={(e) => { const next = [...section.body]; next[idx] = { ...c, color: e.target.value.toUpperCase() }; setSection({ ...section, body: next }); }} />
                                    <input className="flex-1 min-w-0 px-2 py-1 bg-white border border-[#E7C9CD] rounded-lg text-xs text-[#555555] focus:outline-none focus:ring-1 focus:ring-[#A35D5D]/40" value={c.color || "#111111"} onChange={(e) => { const next = [...section.body]; next[idx] = { ...c, color: e.target.value }; setSection({ ...section, body: next }); }} />
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null}

                          {c.kind === "key_value" ? (
                            <div className="mt-3 space-y-3">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div><div className="text-xs font-medium text-[#6B6B6B] mb-1">標籤名稱 (Label)</div><input className="w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all" value={c.label} onChange={(e) => {
                                  const next = [...section.body]; next[idx] = { ...c, label: e.target.value }; setSection({ ...section, body: next });
                                }} /></div>
                                <div><div className="text-xs font-medium text-[#6B6B6B] mb-1">顯示數值 (Value)</div><input className="w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all" value={c.value} onChange={(e) => {
                                  const next = [...section.body]; next[idx] = { ...c, value: e.target.value }; setSection({ ...section, body: next });
                                }} /></div>
                              </div>
                              <div><div className="text-xs font-medium text-[#6B6B6B] mb-1">連結網址 (URL)</div><input className="w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all" value={c.action?.uri || ""} onChange={(e) => {
                                const next = [...section.body]; next[idx] = { ...c, action: { type: "uri", uri: e.target.value } }; setSection({ ...section, body: next });
                              }} /></div>
                            </div>
                          ) : null}

                          {c.kind === "list" ? (
                            <div className="mt-3 space-y-2">
                              {c.items.map((it: any, j: number) => (
                                <input key={it.id} className="w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all" value={it.text} onChange={(e) => {
                                  const next = [...section.body];
                                  const items = [...c.items]; items[j] = { ...it, text: e.target.value };
                                  next[idx] = { ...c, items }; setSection({ ...section, body: next });
                                }} />
                              ))}
                              <button className="w-full px-3 py-2 bg-white border border-[#E7C9CD] text-[#6B6B6B] font-medium rounded-lg hover:bg-[#FCF7F8] transition-colors shadow-sm text-xs" onClick={() => {
                                const next = [...section.body]; next[idx] = { ...c, items: [...c.items, { id: uid("i_"), text: "新項目" }] };
                                setSection({ ...section, body: next });
                              }}>+ 新增項目</button>
                            </div>
                          ) : null}

                          {c.kind === "spacer" ? (
                            <div className="mt-3">
                              <div className="text-xs font-medium text-[#6B6B6B] mb-1">留白大小</div>
                              <GlassSelect
                                size="sm"
                                className="w-full"
                                value={c.size}
                                onChange={(val) => { const next = [...section.body]; next[idx] = { ...c, size: val }; setSection({ ...section, body: next }); }}
                                options={[
                                  {value: "sm", label: "sm"},
                                  {value: "md", label: "md"},
                                  {value: "lg", label: "lg"},
                                ]}
                              />
                            </div>
                          ) : null}

                          {c.kind === "divider" ? (
                            <div className="mt-3 space-y-3">
                              <div>
                                <span className="text-xs font-medium text-[#6B6B6B] mb-1 block">線條顏色</span>
                                <div className="flex items-center gap-2">
                                  <input type="color" className="w-8 h-8 rounded-lg cursor-pointer border border-[#E7C9CD] p-0.5 flex-shrink-0" value={(c.color || "#f1f5f9").substring(0, 7)} onChange={(e) => { const next = [...section.body]; next[idx] = { ...c, color: e.target.value }; setSection({ ...section, body: next }); }} />
                                  <input className="flex-1 px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all" value={c.color || "#f1f5f9"} onChange={(e) => { const next = [...section.body]; next[idx] = { ...c, color: e.target.value }; setSection({ ...section, body: next }); }} />
                                </div>
                              </div>
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-medium text-[#6B6B6B]">間距 (Spacing)</span>
                                  <span className="text-xs text-[#AAAAAA]">{({"none":"0px","xs":"4px","sm":"8px","md":"16px","lg":"24px","xl":"32px","xxl":"48px"} as any)[c.spacing || "md"] || "16px"}</span>
                                </div>
                                <input type="range" min="0" max="6" step="1" className="w-full accent-[#A35D5D]" value={["none","xs","sm","md","lg","xl","xxl"].indexOf(c.spacing || "md") === -1 ? 3 : ["none","xs","sm","md","lg","xl","xxl"].indexOf(c.spacing || "md")} onChange={(e) => { const tokens = ["none","xs","sm","md","lg","xl","xxl"]; const next = [...section.body]; next[idx] = { ...c, spacing: tokens[Number(e.target.value)] }; setSection({ ...section, body: next }); }} />
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </AccordionSection>

                  <AccordionSection
                    title="底部按鈕" accent="bg-[#AAAAAA]"
                    
                    open={open === "footer"}
                    onToggle={() => setOpen(open === "footer" ? "hero" : "footer")}
                    right={<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F0F0F0] text-[#2B2B2B] border border-[#E7C9CD]">{(section as any).footer?.length || 0}/3</span>}
                  >
                    <div className="space-y-3">
                      {((section as any).footer || []).map((b: any, idx: number) => (
                        <div key={b.id} className="bg-white border border-[#E7C9CD] rounded-xl p-4 space-y-3 shadow-sm">
                          <div className="flex items-center justify-between bg-[#FCF7F8] -mx-4 -mt-4 px-4 pt-3 pb-2 mb-2 rounded-t-xl border-b border-[#F0E3E5]">
                            <div className="font-semibold text-sm">按鈕 {idx + 1}</div>
                            <div className="flex items-center gap-1">
                              <button
                                className="p-1.5 text-[#AAAAAA] hover:text-[#6B6B6B] rounded-lg hover:bg-[#F0F0F0] disabled:opacity-30 transition-colors"
                                disabled={idx === 0}
                                onClick={() => setSection({ ...section, footer: moveItem((section as any).footer, idx, idx - 1) })}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6" /></svg>
                              </button>
                              <button
                                className="p-1.5 text-[#AAAAAA] hover:text-[#6B6B6B] rounded-lg hover:bg-[#F0F0F0] disabled:opacity-30 transition-colors"
                                disabled={idx === (section as any).footer.length - 1}
                                onClick={() => setSection({ ...section, footer: moveItem((section as any).footer, idx, idx + 1) })}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                              </button>
                              <div className="w-px h-4 bg-[#E8E8E8] mx-1"></div>
                              <button className="w-7 h-7 flex items-center justify-center rounded-lg text-[#AAAAAA] hover:text-red-500 hover:bg-red-50 transition-colors" title="刪除按鈕" onClick={() => {
                                const next = (section as any).footer.filter((_: any, i: number) => i !== idx);
                                setSection({ ...section, footer: next });
                              }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>
                            </div>
                          </div>

                          <div>
                            <div>
                              <div className="flex gap-4 mb-2">
                                <div className="flex-1">
                                  <div className="text-sm font-semibold text-[#555555] mb-1">按鈕文字</div>
                                  <input className="w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all" value={b.label} onChange={(e) => {
                                    const next = [...(section as any).footer]; next[idx] = { ...b, label: e.target.value }; setSection({ ...section, footer: next });
                                  }} />
                                </div>
                                <div className="w-1/3">
                                  <div className="text-sm font-semibold text-[#555555] mb-1">動作類型</div>
                                  <GlassSelect size="sm" className="w-full" value={b.action.type} onChange={(val) => {
                                    const type = val as any;
                                    const next = [...(section as any).footer];
                                    if (type === "uri") next[idx] = { ...b, action: { type, uri: "" } };
                                    else if (type === "message") next[idx] = { ...b, action: { type, text: "" } };
                                    setSection({ ...section, footer: next });
                                  }} options={[{value:"uri",label:"開啟網址"},{value:"message",label:"傳送文字"}]} />
                                </div>
                              </div>

                              <div>
                                <div className="text-sm font-semibold text-[#555555] mb-2">
                                  {b.action.type === "uri" ? "URL連結" : b.action.type === "message" ? "訊息文字" : "分享連結（自動填入）"}
                                </div>
                                <input
                                  className={`w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all ${b.action.type === "share" ? "bg-[#F0F0F0] opacity-60 cursor-not-allowed" : ""}`}
                                  disabled={b.action.type === "share"}
                                  value={b.action.type === "uri" ? b.action.uri : b.action.type === "message" ? b.action.text : (shareUrl || "尚未發布，請先至預覽頁發布")}
                                  onChange={(e) => {
                                    if (b.action.type === "share") return;
                                    const next = [...(section as any).footer];
                                    if (b.action.type === "uri") next[idx] = { ...b, action: { ...b.action, uri: e.target.value } };
                                    else if (b.action.type === "message") next[idx] = { ...b, action: { ...b.action, text: e.target.value } };
                                    setSection({ ...section, footer: next });
                                  }}
                                />
                                {b.action.type === "uri" ? <div className="mt-1 text-xs opacity-70">僅支援 https://、line://、liff://</div> : null}
                                {b.action.type === "share" && !shareUrl ? <div className="mt-1 text-xs text-amber-600">請先至「預覽與發布」頁面發布後，連結會自動顯示</div> : null}
                                {b.action.type === "share" && shareUrl ? <div className="mt-1 text-xs text-green-600">已發布 v{activeShare?.version_no}</div> : null}
                              </div>
                            </div>
                          </div>

                          <details className="bg-[#FCF7F8] border border-[#E7C9CD] rounded-xl p-3">
                            <summary className="cursor-pointer font-semibold text-sm text-[#555555]">顏色設定</summary>
                            <div className="mt-3 space-y-4">
                              <ColorPicker label="背景色" value={b.bgColor} onChange={(v) => {
                                const next = [...(section as any).footer];
                                next[idx] = { ...b, bgColor: v.toUpperCase(), textColor: b.autoTextColor ? autoTextColor(v) : b.textColor };
                                setSection({ ...section, footer: next });
                              }} />
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-xs opacity-70">文字色：{b.textColor}</div>
                                <button className="px-3 py-2 text-xs font-medium bg-white border border-[#E7C9CD] text-[#6B6B6B] rounded-lg hover:bg-[#FCF7F8] transition-colors shadow-sm" onClick={() => {
                                  const next = [...(section as any).footer]; next[idx] = { ...b, textColor: autoTextColor(b.bgColor), autoTextColor: true }; setSection({ ...section, footer: next });
                                }}>自動</button>
                              </div>
                              <ColorPicker label="文字色（手動）" value={b.textColor} onChange={(v) => {
                                const next = [...(section as any).footer]; next[idx] = { ...b, textColor: v.toUpperCase(), autoTextColor: false }; setSection({ ...section, footer: next });
                              }} />
                              <AutoTextColorHint bgColor={b.bgColor} textColor={b.textColor} />
                            </div>
                          </details>
                        </div>
                      ))}
                    </div>
                  </AccordionSection>
                </>
              )}

              <QuickReplyEditor
                doc={doc as EditableMessageDoc}
                onChange={(nextQuickReply) => scheduleSave({ ...doc, quickReply: nextQuickReply } as DocModel)}
              />
            </div>
            </div>{/* end scrollable editor */}

          </div>{/* end Column 2 */}

          {/* Column 3: Right panel — LINE live preview */}
          <div className="w-[380px] flex-shrink-0 min-h-0 bg-white border-l border-[#E7C9CD] overflow-y-auto">
            {/* Header */}
            <div className="px-4 pt-3 pb-2 border-b border-[#F0E3E5]">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[#555555]">LINE 即時預覽</span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${report.errors.length ? "bg-red-100 text-red-800 border-red-200" : report.warnings.length ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-green-100 text-green-800 border-green-200"}`}>
                  {report.errors.length ? `✕ 有 ${report.errors.length} 個錯誤` : report.warnings.length ? `⚠ 有 ${report.warnings.length} 個警告` : "✓ 驗證通過"}
                </span>
              </div>
              {(report.errors.length > 0 || report.warnings.length > 0) && (
                <div className="mt-2 space-y-1">
                  {report.errors.map((e: any, i: number) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5">
                      <span className="flex-shrink-0 mt-0.5">✕</span>
                      <span>{e.message}</span>
                    </div>
                  ))}
                  {report.warnings.map((w: any, i: number) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                      <span className="flex-shrink-0 mt-0.5">⚠</span>
                      <span>{w.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-4 py-4 flex flex-col items-center gap-3">
              <>
                  {/* iPhone frame */}
                  <div className="relative" style={{ width: "270px" }}>
                    <div className="rounded-[46px]" style={{ background: "#111", padding: "6px", boxShadow: "0 0 0 1px #222, 0 20px 60px rgba(0,0,0,0.5)" }}>
                      <div className="rounded-[42px] overflow-hidden" style={{ background: "#111" }}>
                        <div className="flex justify-center pt-3 pb-2" style={{ background: "rgba(30,38,54,0.82)" }}>
                          <div style={{ width: "100px", height: "28px", background: "rgba(0,0,0,0.7)", borderRadius: "14px", border: "1.5px solid rgba(255,255,255,0.08)" }} />
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5" style={{ background: "rgba(30,38,54,0.82)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#06C755" }} />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-[12px] leading-tight truncate" style={{ color: "rgba(255,255,255,0.92)" }}>LINE Official Account</div>
                          </div>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                        </div>
                        <div className="p-2 pb-3" style={{ background: "#90AACB" }}>
                          <div className="flex items-start gap-1">
                            <div className="w-6 h-6 rounded-full bg-white flex-shrink-0 flex items-center justify-center overflow-hidden mt-1">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="#06C755"><path d="M21.99 12.06c0-5.7-4.93-10.31-10-10.31S2 6.36 2 12.06c0 5.1 4 9.35 8.89 10.16.34.07.8.22.92.51.1.25.07.62 0 1.05l-.18 1.09c-.05.32-.24 1.25 1.09.66s7.24-4.26 7.24-4.26a9.55 9.55 0 004.03-9.21z"/></svg>
                            </div>
                            <div style={{ zoom: 0.6, width: "320px" }}>
                              <FlexPreview
                                doc={doc}
                                selectedIndex={currentCardIdx}
                                onIndexChange={(i) => {
                                  if (i >= 0 && i < doc.cards.length) setSelectedCardIdx(i);
                                }}
                              />
                            </div>
                          </div>
                        </div>
                        {((doc as any).quickReply?.items?.length ?? 0) > 0 && (
                          <div className="px-2 py-1.5 flex gap-1.5 overflow-x-auto" style={{ background: "#90AACB" }}>
                            {(doc as any).quickReply.items.map((item: any) => (
                              <div key={item.id} className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 bg-white border border-[#06C755] rounded-full text-[9px] text-[#06C755] font-medium whitespace-nowrap">
                                {item.action.label || "按鈕"}
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="px-2 py-1 flex items-center gap-1.5 bg-white border-t border-gray-200">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="1.8" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                          <div className="flex-1 h-6 bg-gray-100 rounded-full px-3 flex items-center">
                            <span className="text-[10px] text-gray-400">Aa</span>
                          </div>
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                        </div>
                        <div className="flex justify-center py-1 bg-white">
                          <div className="w-20 h-[3px] bg-black rounded-full opacity-20" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-[#AAAAAA] text-center">ⓘ 僅供參考，實際效果以手機為準</p>
                </>
            </div>
          </div>

        </div>
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
      </>
    );
  } // end if (doc.type === "carousel")

  // ── Non-carousel layout (bubble / text) ──────────────────────────────────

  return (
    <div className="min-h-screen bg-[#FCF7F8] pb-20">
      {toastPortal}
      <div className="mx-auto max-w-5xl px-4 pt-4">
        <div className="bg-white border border-[#E7C9CD] shadow-sm rounded-xl p-4 flex items-center justify-between sticky top-4 z-30">
          <div className="flex-1 mr-4">
            <div className="flex items-center gap-3">
              <input
                autoFocus
                type="text"
                value={doc.type === "folder" ? doc.name : doc.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="w-full max-w-[400px] text-xl font-bold text-[#2B2B2B] border-none bg-transparent p-0 focus:ring-0 placeholder:text-[#CCCCCC]"
                placeholder="輸入草稿名稱..."
              />
              {doc.type !== "folder" && (
                <GlassSelect size="xs" value={(doc as any).folderId || ""} onChange={(val) => scheduleSave({ ...doc, folderId: val || undefined })} options={[{value:"",label:"未分類 (無資料夾)"},...folders.map((f: any) => ({value: f.id, label: f.content.name}))]} />
              )}
            </div>
            <div className="text-sm opacity-70 mt-1">儲存：{saveState === "saving" ? "●" : saveState === "saved" ? "✓" : saveState === "error" ? "✗" : "—"}</div>
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex items-center gap-2">
              {doc.type !== "text" && doc.type !== "folder" && (
                <div className="flex items-center gap-3 w-fit px-4 py-3 bg-[#FCF7F8] border border-[#E7C9CD] rounded-xl mt-4">
                  <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm border border-[#E7C9CD]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#6B6B6B]">
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-[#6B6B6B] mb-1">氣泡大小</div>
                    <GlassSelect size="xs" value={doc.bubbleSize || "kilo"} onChange={(val) => handleBubbleSizeChange(val as BubbleSize)} options={[{value:"nano",label:"Nano (極小)"},{value:"micro",label:"Micro (小)"},{value:"kilo",label:"Kilo (標準預設)"},{value:"mega",label:"Mega (大)"},{value:"giga",label:"Giga (特大)"}]} />
                  </div>
                </div>
              )}
            </div>
            <button className="px-3 py-1.5 text-sm bg-white border border-[#E7C9CD] text-[#6B6B6B] font-medium rounded-lg hover:bg-[#FCF7F8] transition-colors shadow-sm" onClick={async () => {
              const name = prompt("範本名稱（儲存後可在「新增草稿」直接使用）");
              if (!name) return;
              try {
                await createTemplateFromDoc(name.trim(), null, doc);
                alert("已儲存為範本");
              } catch (e: any) {
                alert(e?.message || String(e));
              }
            }}>另存為範本</button>
            <button className="px-3 py-1.5 text-sm bg-white border border-[#E7C9CD] text-[#6B6B6B] font-medium rounded-lg hover:bg-[#FCF7F8] transition-colors shadow-sm" onClick={() => nav("/drafts")}>回草稿</button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-4 flex gap-4 items-start">

        {/* Left sidebar: Card structure (bubble / video only) */}
        {doc.type === "bubble" && (
          <div className="w-52 flex-shrink-0 bg-white border border-[#E7C9CD] rounded-xl sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto">
            <div className="px-3 pt-3 pb-4">
              <div className="text-xs font-semibold text-[#AAAAAA] uppercase tracking-wide mb-3">卡片結構</div>
              <div className="space-y-0.5">

                {/* Bubble row */}
                <div className="flex items-center gap-2.5 py-2 px-2 rounded-lg text-sm font-medium text-[#6B6B6B]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#AAAAAA] flex-shrink-0"><rect x="2" y="2" width="20" height="20" rx="5"/></svg>
                  <span>{isVideoHero ? "影片 Bubble" : isSpecialCard ? "特殊卡片" : "單頁訊息"}</span>
                </div>

                {/* 封面 / 影片 row */}
                {isVideoHero ? (
                  <div className="flex items-center gap-2.5 py-2 px-2 rounded-lg text-sm font-medium text-[#555555]">
                    <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0" style={{ background: "#FB923C" }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    </div>
                    <span>影片</span>
                  </div>
                ) : !isSpecialCard ? (
                  <div className="flex items-center gap-2.5 py-2 px-2 rounded-lg text-sm font-medium text-[#555555]">
                    <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0" style={{ background: "#FB923C" }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    </div>
                    <span>封面圖片</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 py-2 px-2 rounded-lg text-sm font-medium text-[#555555]">
                    <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0" style={{ background: "#A855F7" }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    </div>
                    <span>封面圖片 (特殊)</span>
                  </div>
                )}

                {/* 內容設定 row */}
                {section && section.body !== undefined && (
                  <div>
                    <div className={`flex items-center gap-2.5 py-2 px-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${open === "body" ? "bg-[#FBEBEE] text-[#A35D5D]" : "text-[#555555] hover:bg-[#FCF7F8]"}`}
                      onClick={() => setOpen(open === "body" ? "hero" : "body")}>
                      <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0" style={{ background: "#EC4899" }}>
                        <svg width="9" height="9" viewBox="0 0 12 10" fill="none"><rect x="0" y="0" width="12" height="2" rx="1" fill="white"/><rect x="0" y="4" width="12" height="2" rx="1" fill="white"/><rect x="0" y="8" width="8" height="2" rx="1" fill="white"/></svg>
                      </div>
                      <span className="flex-1">{isSpecialCard ? "覆蓋層內容" : "內容設定"}</span>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open === "body" ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6"/></svg>
                    </div>
                    {open === "body" && (
                      <div className="mt-0.5 space-y-0.5">
                        {(isSpecialCard && specialSection ? specialSection.body : section.body || []).map((c: any, idx: number) => {
                          const kindLabel = c.kind === "title" ? "標題" : c.kind === "paragraph" ? "段落" : c.kind === "divider" ? "分隔線" : c.kind === "key_value" ? "標籤數值" : c.kind === "list" ? "列表" : c.kind === "spacer" ? "留白" : c.kind;
                          const iconBg = c.kind === "title" ? "#EC4899" : c.kind === "paragraph" ? "#EC4899" : c.kind === "divider" ? "#94A3B8" : c.kind === "key_value" ? "#A855F7" : c.kind === "list" ? "#10B981" : "#CBD5E1";
                          return (
                            <div key={c.id} className="flex items-center gap-2.5 py-2 px-2 pl-5 rounded-lg text-sm text-[#6B6B6B] hover:bg-[#FCF7F8] cursor-grab active:cursor-grabbing transition-colors" draggable
                              onDragStart={() => { dragBodyRef.current = idx; }}
                              onDragOver={(e) => { e.preventDefault(); }}
                              onDrop={() => {
                                if (dragBodyRef.current !== idx) {
                                  const src = isSpecialCard && specialSection ? specialSection : section;
                                  setSection({ ...src, body: moveItem(src.body, dragBodyRef.current, idx) });
                                }
                                dragBodyRef.current = -1;
                              }}>
                              <div className="w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
                                {c.kind === "title" && <span className="text-white font-bold" style={{ fontSize: "7px" }}>T</span>}
                                {c.kind === "paragraph" && <svg width="7" height="6" viewBox="0 0 12 10" fill="none"><rect x="0" y="0" width="12" height="2" rx="1" fill="white"/><rect x="0" y="4" width="12" height="2" rx="1" fill="white"/><rect x="0" y="8" width="8" height="2" rx="1" fill="white"/></svg>}
                                {c.kind === "divider" && <svg width="7" height="3" viewBox="0 0 12 4" fill="none"><rect x="0" y="1" width="12" height="2" rx="1" fill="white"/></svg>}
                                {c.kind === "key_value" && <span className="text-white font-bold" style={{ fontSize: "6px" }}>KV</span>}
                                {c.kind === "list" && <span className="text-white font-bold" style={{ fontSize: "7px" }}>≡</span>}
                                {c.kind === "spacer" && <span className="text-white" style={{ fontSize: "7px" }}>↕</span>}
                              </div>
                              <span className="flex-1 truncate">{kindLabel}</span>
                              <span className="text-[#CCCCCC] select-none flex-shrink-0">⠿</span>
                            </div>
                          );
                        })}
                        {/* + 新增內容 */}
                        <div className="pl-4 pt-1">
                          <button className={`flex items-center justify-center gap-1.5 py-2 px-3 w-full rounded-xl text-xs font-semibold transition-all shadow-sm ${showBodyAdd ? "bg-[#FBEBEE] text-[#A35D5D]" : "bg-[#FBEBEE] text-[#A35D5D] border border-[#E7C9CD] hover:bg-[#8F4A4A] hover:text-white"}`}
                            onClick={() => setShowBodyAdd(v => !v)}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            <span>新增內容</span>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`ml-auto transition-transform ${showBodyAdd ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6"/></svg>
                          </button>
                          {showBodyAdd && (
                            <div className="mt-2 rounded-xl border border-[#E7C9CD] bg-white shadow-md overflow-hidden">
                              {(isSpecialCard && specialSection ? [
                                { label: "標題", onClick: () => { setSection({ ...specialSection!, body: [...specialSection!.body, { id: uid("t_"), kind: "title", enabled: true, text: "標題", size: "lg", weight: "bold", color: "#FFFFFF", align: "start" }] }); setShowBodyAdd(false); } },
                                { label: "段落", onClick: () => { setSection({ ...specialSection!, body: [...specialSection!.body, { id: uid("p_"), kind: "paragraph", enabled: true, text: "描述文字…", size: "md", weight: "regular", color: "#FFFFFF", wrap: true }] }); setShowBodyAdd(false); } },
                                { label: "標籤數值", onClick: () => { setSection({ ...specialSection!, body: [...specialSection!.body, { id: uid("kv_"), kind: "key_value", enabled: true, label: "標籤", value: "內容" }] }); setShowBodyAdd(false); } },
                              ] : [
                                { label: "標題", onClick: () => { setSection({ ...section, body: [...section.body, { id: uid("t_"), kind: "title", enabled: true, text: "新標題", size: "lg", weight: "bold", color: "#111111", align: "start" }] }); setShowBodyAdd(false); } },
                                { label: "段落", onClick: () => { setSection({ ...section, body: [...section.body, { id: uid("p_"), kind: "paragraph", enabled: true, text: "新段落…", size: "md", color: "#333333", wrap: true }] }); setShowBodyAdd(false); } },
                                { label: "標籤數值", onClick: () => { setSection({ ...section, body: [...section.body, { id: uid("kv_"), kind: "key_value", enabled: true, label: "標籤", value: "內容", action: { type: "uri", uri: "https://example.com" } }] }); setShowBodyAdd(false); } },
                                { label: "列表", onClick: () => { setSection({ ...section, body: [...section.body, { id: uid("l_"), kind: "list", enabled: true, items: [{ id: uid("i_"), text: "清單項目" }] }] }); setShowBodyAdd(false); } },
                                { label: "分隔線", onClick: () => { setSection({ ...section, body: [...section.body, { id: uid("d_"), kind: "divider", enabled: true }] }); setShowBodyAdd(false); } },
                                { label: "留白", onClick: () => { setSection({ ...section, body: [...section.body, { id: uid("s_"), kind: "spacer", enabled: true, size: "md" }] }); setShowBodyAdd(false); } },
                              ]).map((btn, i, arr) => (
                                <button key={btn.label} className={`w-full text-left px-3 py-2.5 text-xs font-medium text-[#555555] hover:bg-[#FBEBEE] hover:text-[#A35D5D] transition-colors flex items-center gap-2 ${i < arr.length - 1 ? "border-b border-[#F0E3E5]" : ""}`} onClick={btn.onClick}>
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-[#A35D5D]"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                  {btn.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 底部按鈕 row */}
                {section && section.footer !== undefined && (
                  <div>
                    <div className={`flex items-center gap-2.5 py-2 px-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${open === "footer" ? "bg-[#FBEBEE] text-[#A35D5D]" : "text-[#555555] hover:bg-[#FCF7F8]"}`}
                      onClick={() => setOpen(open === "footer" ? "hero" : "footer")}>
                      <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 bg-[#AAAAAA]">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="15" width="20" height="7" rx="2"/></svg>
                      </div>
                      <span className="flex-1">底部按鈕</span>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open === "footer" ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6"/></svg>
                    </div>
                    {open === "footer" && (
                      <div className="mt-0.5 space-y-0.5">
                        {((section as any).footer || []).map((b: any, idx: number) => (
                          <div key={b.id} className="flex items-center gap-2 py-1.5 px-2 pl-4 rounded-lg text-xs text-[#6B6B6B] hover:bg-[#FCF7F8] cursor-grab active:cursor-grabbing transition-colors" draggable
                            onDragStart={() => { dragFooterRef.current = idx; }}
                            onDragOver={(e) => { e.preventDefault(); }}
                            onDrop={() => {
                              if (dragFooterRef.current !== idx) {
                                setSection({ ...section, footer: moveItem((section as any).footer, dragFooterRef.current, idx) });
                              }
                              dragFooterRef.current = -1;
                            }}>
                            <span className="flex-1 truncate">{b.label || `按鈕 ${idx + 1}`}</span>
                            <span className="text-[#CCCCCC] select-none flex-shrink-0">⠿</span>
                          </div>
                        ))}
                        {!isSpecialCard && (
                          <div className="pl-4">
                            <button className="flex items-center gap-1.5 py-1.5 px-2 w-full text-left rounded-lg border border-dashed border-[#E7C9CD] text-xs text-[#6B6B6B] hover:text-[#A35D5D] hover:bg-[#FBEBEE] transition-colors"
                              disabled={((section as any).footer?.length || 0) >= 3}
                              onClick={() => { const bg = "#0A84FF"; const btn: FooterButton = { id: uid("btn_"), kind: "footer_button", enabled: true, label: "新按鈕", action: { type: "uri", uri: "https://example.com" }, style: "primary", bgColor: bg, textColor: autoTextColor(bg), autoTextColor: true }; setSection({ ...section, footer: [...((section as any).footer || []), btn].slice(0, 3) }); }}>
                              + 新增按鈕
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          </div>
        )}

        {/* Editor + Preview */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
        {/* Column 1: Editor */}
        <div className="space-y-4 relative flex flex-col min-h-[500px]">
          {doc.type === "text" ? (
            <div className="bg-white border border-[#E7C9CD] shadow-sm rounded-xl p-6 flex-1 flex flex-col">
              <h2 className="text-lg font-semibold text-[#2B2B2B] mb-1">純文字內容</h2>
              <p className="text-sm text-[#6B6B6B] mb-4">輸入你想發送的文字，支援換行與表情符號。</p>
              <div className="relative">
                <textarea
                  className="w-full h-64 p-4 bg-[#FCF7F8] border border-[#E7C9CD] rounded-xl text-[#2B2B2B] focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-all resize-none"
                  placeholder="輸入文字內容..."
                  value={(doc as any).text || ""}
                  onChange={(e) => {
                    const text = e.target.value;
                    if (text.length <= 500) scheduleSave({ ...doc, text } as any);
                  }}
                />
                <div className="absolute bottom-3 right-3 flex items-center gap-3">
                  <div className={`text-xs font-medium ${(doc as any).text?.length >= 500 ? 'text-red-500' : 'text-[#AAAAAA]'}`}>
                    {((doc as any).text || "").length} / 500
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {isSpecialCard && specialSection ? (
                <>
                  <AccordionSection title="滿版圖片" accent="bg-purple-400" subtitle="上傳圖片，圖片會佔滿整張卡片" open={open === "hero"} onToggle={() => setOpen(open === "hero" ? "body" : "hero")} right={<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">特殊卡片</span>}>
                    <div className="space-y-3">
                      <label className="flex items-center justify-center w-full px-4 py-3 bg-white border border-dashed border-[#E7C9CD] rounded-xl cursor-pointer hover:bg-[#FCF7F8] hover:border-[#A35D5D] transition-all text-sm font-medium text-[#6B6B6B] group">上傳圖片<input type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 1 * 1024 * 1024) return showToast("檔案過大，請小於 1MB", "error"); try { const ext = file.name.split(".").pop(); const path = `${uid("img_")}.${ext}`; const { error } = await supabase.storage.from("flex-assets").upload(path, file); if (error) return showToast("上傳失敗：" + error.message, "error"); const { data: { publicUrl } } = supabase.storage.from("flex-assets").getPublicUrl(path); setSection({ ...specialSection, image: { kind: "upload", assetId: path, url: publicUrl } }); showToast("圖片上傳成功"); } catch (err: any) { showToast("上傳錯誤：" + err.message, "error"); } }} /></label>
                      <div className="mt-4"><div className="text-sm font-semibold text-[#555555] mb-2">圖片比例</div><RatioPicker value={specialSection.ratio || "2:3"} onChange={(val) => setSection({ ...specialSection, ratio: val as any })} options={[{value:"2:3",label:"2:3"},{value:"9:16",label:"9:16"},{value:"1:1",label:"1:1"},{value:"4:3",label:"4:3"},{value:"16:9",label:"16:9"}]} /></div>
                    </div>
                  </AccordionSection>
                  <AccordionSection title="底部覆蓋層" accent="bg-[#AAAAAA]" subtitle="半透明背景，可調整高度與顏色" open={open === "body"} onToggle={() => setOpen(open === "body" ? "footer" : "body")} right={<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F0F0F0] text-[#2B2B2B] border border-[#E7C9CD]">{specialSection.body.filter((c: any) => c.enabled).length} 個</span>}>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div><div className="text-sm font-semibold text-[#555555] mb-2">覆蓋層高度</div><GlassSelect size="sm" className="w-full" value={specialSection.overlay?.height || "auto"} onChange={(val) => setSection({ ...specialSection, overlay: { ...specialSection.overlay, height: val as any } })} options={[{value:"auto",label:"自動 (依內容)"},{value:"30%",label:"30%"},{value:"40%",label:"40%"},{value:"50%",label:"50%"},{value:"60%",label:"60%"},{value:"70%",label:"70%"}]} /></div>
                        <div><div className="text-sm font-semibold text-[#555555] mb-2">背景顏色</div><div className="flex gap-2"><input type="color" className="w-10 h-10 rounded cursor-pointer border border-gray-300" value={(specialSection.overlay?.backgroundColor || "#03303A").substring(0, 7)} onChange={(e) => { const alpha = (specialSection.overlay?.backgroundColor || "#03303Acc").substring(7) || "cc"; setSection({ ...specialSection, overlay: { ...specialSection.overlay, backgroundColor: e.target.value + alpha } }); }} /><div className="flex-1"><input type="text" className="w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all" value={specialSection.overlay?.backgroundColor || "#03303Acc"} onChange={(e) => setSection({ ...specialSection, overlay: { ...specialSection.overlay, backgroundColor: e.target.value } })} placeholder="#03303Acc" /><div className="text-xs opacity-70 mt-1">後2位為透明度 (00~ff)</div></div></div></div>
                      </div>
                      <div className="border-t border-[#E7C9CD] pt-4 mt-4">
                        <div className="text-sm font-semibold text-[#555555] mb-3">覆蓋層內容</div>
                        {specialSection.body.map((c: any, idx: number) => (
                          <div key={c.id} className="bg-white border border-[#E7C9CD] rounded-xl p-4 mb-3 shadow-sm relative group/item">
                            <div className="flex items-center justify-between bg-[#FCF7F8] -mx-4 -mt-4 px-4 pt-3 pb-2 mb-3 rounded-t-xl border-b border-[#F0E3E5]"><div className="font-semibold text-sm">{idx + 1}. {c.kind === 'paragraph' ? '段落' : c.kind === 'title' ? '標題' : c.kind === 'key_value' ? '標籤數值' : c.kind}</div><button className="px-2 py-1 bg-white border border-[#E7C9CD] rounded text-xs text-red-500 hover:bg-red-50 hover:border-red-200 transition-colors" onClick={() => { const next = specialSection.body.filter((_: any, i: number) => i !== idx); setSection({ ...specialSection, body: next }); }}>刪除</button></div>
                            {(c.kind === "title" || c.kind === "paragraph") && (<div className="space-y-3 mt-2"><textarea className="w-full px-3 py-2 bg-[#FCF7F8] border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all" rows={2} value={c.text} onChange={(e) => { const next = [...specialSection.body]; next[idx] = { ...c, text: e.target.value }; setSection({ ...specialSection, body: next }); }} /><div className="flex gap-2 items-end"><div className="flex-1"><ColorPicker label="文字顏色" value={c.color || "#FFFFFF"} onChange={(v) => { const next = [...specialSection.body]; next[idx] = { ...c, color: v.toUpperCase() }; setSection({ ...specialSection, body: next }); }} /></div><div className="w-24"><div className="text-xs font-semibold text-[#6B6B6B] mb-1">大小</div><GlassSelect size="xs" value={c.size} onChange={(val) => { const next = [...specialSection.body]; next[idx] = { ...c, size: val }; setSection({ ...specialSection, body: next }); }} options={[{value:"xs",label:"XS"},{value:"sm",label:"SM"},{value:"md",label:"MD"},{value:"lg",label:"LG"},{value:"xl",label:"XL"}]} /></div></div></div>)}
                            {c.kind === "key_value" && (<div className="grid grid-cols-2 gap-3 mt-2"><input className="w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm" placeholder="標籤" value={c.label} onChange={(e) => { const next = [...specialSection.body]; next[idx] = { ...c, label: e.target.value }; setSection({ ...specialSection, body: next }); }} /><input className="w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm" placeholder="數值" value={c.value} onChange={(e) => { const next = [...specialSection.body]; next[idx] = { ...c, value: e.target.value }; setSection({ ...specialSection, body: next }); }} /></div>)}
                          </div>
                        ))}
                      </div>
                    </div>
                  </AccordionSection>
                </>
              ) : (
                <>
                  <AccordionSection
                    title={isVideoHero ? "影片封面" : "封面圖片"}
                    accent={isVideoHero ? "bg-red-400" : "bg-orange-400"}
                    subtitle={isVideoHero ? "上傳影片檔案（MP4，最大 200MB）與預覽圖" : undefined}
                    open={open === "hero"}
                    onToggle={() => setOpen(open === "hero" ? "body" : "hero")}
                    right={isVideoHero ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">影片</span> : undefined}
                  >
                    {isVideoHero && heroVideo ? (
                      <div className="space-y-3">
                        {heroVideo.video?.url ? (
                          <div className="flex items-center gap-3 px-4 py-3 bg-[#FCF7F8] border border-[#E7C9CD] rounded-xl">
                            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#DC2626" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                            </div>
                            <span className="text-sm text-[#2B2B2B] truncate flex-1">{heroVideo.video.url.split("/").pop()?.split("?")[0] || "影片"}</span>
                            <button type="button" onClick={() => { const r = section as any; const hero = r.hero.map((c: any) => c.kind === "hero_video" ? { ...c, video: { kind: "external", url: "", previewUrl: "" } } : c); setSection({ ...r, hero }); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-[#AAAAAA] hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0" title="移除影片">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                            </button>
                          </div>
                        ) : (
                          <label className="flex items-center justify-center w-full px-4 py-8 border-2 border-dashed border-[#E7C9CD] rounded-xl hover:bg-[#FCF7F8] hover:border-[#A35D5D] transition-all cursor-pointer group">
                            <div className="flex flex-col items-center gap-2">
                              <div className="w-10 h-10 rounded-full bg-[#F0F0F0] flex items-center justify-center text-[#AAAAAA] group-hover:bg-white group-hover:text-red-500 transition-colors">
                                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                              </div>
                              <span className="text-sm font-medium text-[#6B6B6B] group-hover:text-[#2B2B2B]">上傳影片 (MP4)</span>
                              <span className="text-xs text-[#AAAAAA]">Max 200MB</span>
                            </div>
                            <input type="file" accept="video/mp4" className="hidden" onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (file.size > 200 * 1024 * 1024) return showToast(`影片檔案過大，請小於 200 MB（目前 ${(file.size / 1024 / 1024).toFixed(1)} MB）`, "error");
                              try {
                                const ext = file.name.split(".").pop();
                                const path = `${uid("video_")}.${ext}`;
                                const { error } = await supabase.storage.from("flex-assets").upload(path, file);
                                if (error) return showToast("上傳失敗：" + error.message, "error");
                                const { data: { publicUrl } } = supabase.storage.from("flex-assets").getPublicUrl(path);
                                let previewUrl = heroVideo.video?.previewUrl || "";
                                let previewAssetId = heroVideo.video?.kind === "upload" ? heroVideo.video.previewAssetId : "";
                                try {
                                  const frameBlob = await extractVideoFrame(publicUrl, 0.1);
                                  const previewPath = `${uid("preview_")}.jpg`;
                                  const { error: previewError } = await supabase.storage.from("flex-assets").upload(previewPath, frameBlob, { contentType: "image/jpeg" });
                                  if (!previewError) {
                                    const { data: { publicUrl: previewPublicUrl } } = supabase.storage.from("flex-assets").getPublicUrl(previewPath);
                                    previewUrl = previewPublicUrl;
                                    previewAssetId = previewPath;
                                  }
                                } catch (frameErr) {
                                  console.warn("自動擷取預覽圖失敗，請手動上傳：", frameErr);
                                }
                                await updateHeroVideoSource(publicUrl, previewUrl, path, previewAssetId);
                                showToast("影片上傳成功");
                              } catch (err: any) {
                                showToast("上傳錯誤：" + err.message, "error");
                              }
                            }} />
                          </label>
                        )}
                        {heroVideo.video?.previewUrl ? (
                          <div className="flex items-center gap-3 px-3 py-2 bg-[#FCF7F8] border border-[#E7C9CD] rounded-xl">
                            <img src={heroVideo.video.previewUrl} alt="預覽圖" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-[#E7C9CD]" />
                            <span className="text-sm text-[#2B2B2B] truncate flex-1">預覽圖</span>
                            <button type="button" onClick={() => updateHeroVideoSource(heroVideo.video?.url || "", "", heroVideo.video?.kind === "upload" ? heroVideo.video.assetId : "", "")} className="w-7 h-7 flex items-center justify-center rounded-lg text-[#AAAAAA] hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0" title="移除預覽圖">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                            </button>
                          </div>
                        ) : (
                          <label className="flex items-center justify-center w-full px-4 py-4 border-2 border-dashed border-[#E7C9CD] rounded-xl hover:bg-[#FCF7F8] hover:border-[#A35D5D] transition-all cursor-pointer group">
                            <span className="text-sm font-medium text-[#6B6B6B] group-hover:text-[#555555] flex items-center gap-2">
                              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                              上傳預覽圖
                            </span>
                            <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (file.size > 1 * 1024 * 1024) return showToast("檔案過大，請小於 1MB", "error");
                              try {
                                const ext = file.name.split(".").pop();
                                const path = `${uid("img_")}.${ext}`;
                                const { error } = await supabase.storage.from("flex-assets").upload(path, file);
                                if (error) return showToast("上傳失敗：" + error.message, "error");
                                const { data: { publicUrl } } = supabase.storage.from("flex-assets").getPublicUrl(path);
                                await updateHeroVideoSource(heroVideo.video?.url || "", publicUrl, heroVideo.video?.kind === "upload" ? heroVideo.video.assetId : "", path);
                                showToast("預覽圖上傳成功");
                              } catch (err: any) {
                                showToast("上傳錯誤：" + err.message, "error");
                              }
                            }} />
                          </label>
                        )}
                        <div className="mt-4">
                          <div className="text-sm font-semibold text-[#555555] mb-2">影片比例</div>
                          <RatioPicker
                            value={heroVideo.ratio || "16:9"}
                            onChange={(val) => {
                              const regularSection = section as any;
                              const hero = regularSection.hero.map((c: any) => (c.kind === "hero_video" ? { ...c, ratio: val } : c));
                              setSection({ ...regularSection, hero });
                            }}
                            options={[{value:"20:13",label:"20:13"},{value:"16:9",label:"16:9"},{value:"4:3",label:"4:3"},{value:"1:1",label:"1:1"},{value:"9:16",label:"9:16"}]}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {(() => { const heroArr = (section as any).hero || []; const heroImage = heroArr.find((c: any) => c.kind === "hero_image"); const hasUpload = heroImage?.image?.url && !heroImage.image.url.includes("placehold.co"); return hasUpload ? (
                          <div className="flex items-center gap-3 px-3 py-2 bg-[#FCF7F8] border border-[#E7C9CD] rounded-xl">
                            <img src={heroImage.image.url} alt="封面圖" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-[#E7C9CD]" />
                            <span className="text-sm text-[#2B2B2B] truncate flex-1">封面圖片</span>
                            <button type="button" onClick={() => { const ratio = heroImage?.ratio || "20:13"; const ratioDims: Record<string,string> = {"20:13":"600x390","16:9":"640x360","4:3":"640x480","1:1":"600x600","9:16":"360x640","1.91:1":"640x335"}; updateHeroImageSource({ kind: "external", url: `https://placehold.co/${ratioDims[ratio]||"600x390"}/E2E8F0/94A3B8/png?text=+` }); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-[#AAAAAA] hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0" title="移除圖片">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                            </button>
                          </div>
                        ) : (
                          <label className="flex items-center justify-center w-full px-4 py-3 bg-white border border-dashed border-[#E7C9CD] rounded-xl cursor-pointer hover:bg-[#FCF7F8] hover:border-[#A35D5D] transition-all text-sm font-medium text-[#6B6B6B] group">上傳圖片<input type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 1 * 1024 * 1024) return showToast("檔案過大，請小於 1MB", "error"); try { const ext = file.name.split(".").pop(); const path = `${uid("img_")}.${ext}`; const { error } = await supabase.storage.from("flex-assets").upload(path, file); if (error) { console.error(error); return showToast("上傳失敗：" + error.message, "error"); } const { data: { publicUrl } } = supabase.storage.from("flex-assets").getPublicUrl(path); await updateHeroImageSource({ kind: "upload", assetId: path, url: publicUrl }); showToast("圖片上傳成功"); } catch (err: any) { showToast("上傳錯誤：" + err.message, "error"); } }} /></label>
                        ); })()}
                        <div className="mt-3">
                          <div className="text-sm font-semibold text-[#555555] mb-2">圖片比例</div>
                          <RatioPicker
                            value={(() => { const heroArr = (section as any).hero || []; const heroImage = heroArr.find((c: any) => c.kind === "hero_image"); return heroImage?.ratio || "20:13"; })()}
                            onChange={(val) => {
                              const ratioDims: Record<string, string> = { "20:13": "600x390", "16:9": "640x360", "4:3": "640x480", "1:1": "600x600", "9:16": "360x640", "1.91:1": "640x335" };
                              const heroArr = (section as any).hero || [];
                              const hero = heroArr.map((c: any) => {
                                if (c.kind !== "hero_image") return c;
                                const isPlaceholder = !c.image?.url || c.image?.url?.includes("placehold.co");
                                const image = isPlaceholder ? { kind: "external", url: `https://placehold.co/${ratioDims[val] || "600x400"}/E2E8F0/94A3B8/png?text=+`, lastCheck: { ok: true, level: "pass" } } : c.image;
                                return { ...c, ratio: val, image };
                              });
                              setSection({ ...section, hero });
                            }}
                            options={[{value:"20:13",label:"20:13"},{value:"16:9",label:"16:9"},{value:"4:3",label:"4:3"},{value:"1:1",label:"1:1"},{value:"9:16",label:"9:16"},{value:"1.91:1",label:"1.91:1"}]}
                          />
                        </div>
                      </div>
                    )}
                  </AccordionSection>
                  <AccordionSection title="內容設定" accent="bg-[#A35D5D]" open={open === "body"} onToggle={() => setOpen(open === "body" ? "footer" : "body")} right={<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F0F0F0] text-[#2B2B2B] border border-[#E7C9CD]">{section.body.filter((c: any) => c.enabled).length} 個</span>}>
                    <div className="space-y-3">
                      {section.body.map((c: any, idx: number) => (
                        <div key={c.id} className="bg-white border border-[#E7C9CD] rounded-xl p-4 shadow-sm relative group/item">
                          <div className="flex items-center justify-between bg-[#FCF7F8] -mx-4 -mt-4 px-4 pt-3 pb-2 mb-3 rounded-t-xl border-b border-[#F0E3E5]">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-[#6B6B6B]">
                                {c.kind === "title" ? "標題設定 (Title)" : c.kind === "paragraph" ? "內文設定" : c.kind === "divider" ? "分隔線" : c.kind === "key_value" ? "標籤數值" : c.kind === "list" ? "列表" : "留白"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button className="p-1.5 text-[#AAAAAA] hover:text-[#6B6B6B] rounded-lg hover:bg-[#F0F0F0] disabled:opacity-30 transition-colors" disabled={idx === 0} onClick={() => setSection({ ...section, body: moveItem(section.body, idx, idx - 1) })}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6" /></svg></button>
                              <button className="p-1.5 text-[#AAAAAA] hover:text-[#6B6B6B] rounded-lg hover:bg-[#F0F0F0] disabled:opacity-30 transition-colors" disabled={idx === section.body.length - 1} onClick={() => setSection({ ...section, body: moveItem(section.body, idx, idx + 1) })}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg></button>
                              <div className="w-px h-4 bg-[#E8E8E8] mx-1"></div>
                              <button className="p-1.5 text-[#AAAAAA] hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors" onClick={() => { const next = [...section.body]; next.splice(idx, 1); setSection({ ...section, body: next }); }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                              </button>
                            </div>
                          </div>

                          {c.kind === "title" ? (
                            <div className="mt-3 space-y-3">
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-medium text-[#6B6B6B]">文字內容</span>
                                  <span className="text-xs text-[#AAAAAA]">{(c.text || "").length} / 40</span>
                                </div>
                                <input className="w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all font-sans" maxLength={40} value={c.text} onChange={(e) => { const next = [...section.body]; next[idx] = { ...c, text: e.target.value }; setSection({ ...section, body: next }); }} />
                              </div>
                              <div>
                                <span className="text-xs font-medium text-[#6B6B6B] mb-1 block">文字樣式</span>
                                <div className="flex items-center gap-2">
                                  <GlassSelect size="xs" value={c.size || "md"} onChange={(val) => { const next = [...section.body]; next[idx] = { ...c, size: val }; setSection({ ...section, body: next }); }} options={[{value:"xxs",label:"11px"},{value:"xs",label:"13px"},{value:"sm",label:"14px"},{value:"md",label:"16px"},{value:"lg",label:"19px"},{value:"xl",label:"22px"},{value:"xxl",label:"26px"}]} />
                                  <div className="flex rounded-lg overflow-hidden border border-[#E7C9CD]">
                                    <button className={`px-3 py-1.5 text-sm font-bold transition-colors ${(c.weight || "regular") === "bold" ? "bg-[#FBEBEE]0 text-white" : "bg-white text-[#6B6B6B] hover:bg-[#FCF7F8]"}`} onClick={() => { const next = [...section.body]; next[idx] = { ...c, weight: "bold" }; setSection({ ...section, body: next }); }}>B</button>
                                    <button className={`px-3 py-1.5 text-sm transition-colors ${(c.weight || "regular") === "regular" ? "bg-[#FBEBEE]0 text-white" : "bg-white text-[#6B6B6B] hover:bg-[#FCF7F8]"}`} onClick={() => { const next = [...section.body]; next[idx] = { ...c, weight: "regular" }; setSection({ ...section, body: next }); }}>R</button>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                    <input type="color" className="w-6 h-6 rounded-full cursor-pointer border-0 flex-shrink-0" value={(c.color || "#111111").substring(0, 7)} onChange={(e) => { const next = [...section.body]; next[idx] = { ...c, color: e.target.value.toUpperCase() }; setSection({ ...section, body: next }); }} />
                                    <input className="flex-1 min-w-0 px-2 py-1 bg-white border border-[#E7C9CD] rounded-lg text-xs text-[#555555] focus:outline-none focus:ring-1 focus:ring-[#A35D5D]/40" value={c.color || "#111111"} onChange={(e) => { const next = [...section.body]; next[idx] = { ...c, color: e.target.value }; setSection({ ...section, body: next }); }} />
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null}

                          {c.kind === "paragraph" ? (
                            <div className="mt-3 space-y-3">
                              <div>
                                <span className="text-xs font-medium text-[#6B6B6B] mb-1 block">內容描述</span>
                                <textarea className="w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all font-sans" rows={3} value={c.text} onChange={(e) => { const next = [...section.body]; next[idx] = { ...c, text: e.target.value }; setSection({ ...section, body: next }); }} />
                              </div>
                              <div>
                                <span className="text-xs font-medium text-[#6B6B6B] mb-1 block">文字樣式</span>
                                <div className="flex items-center gap-2">
                                  <GlassSelect size="xs" value={c.size || "md"} onChange={(val) => { const next = [...section.body]; next[idx] = { ...c, size: val }; setSection({ ...section, body: next }); }} options={[{value:"xxs",label:"11px"},{value:"xs",label:"13px"},{value:"sm",label:"14px"},{value:"md",label:"16px"},{value:"lg",label:"19px"},{value:"xl",label:"22px"},{value:"xxl",label:"26px"}]} />
                                  <div className="flex rounded-lg overflow-hidden border border-[#E7C9CD]">
                                    <button className={`px-3 py-1.5 text-sm font-bold transition-colors ${(c.weight || "regular") === "bold" ? "bg-[#FBEBEE]0 text-white" : "bg-white text-[#6B6B6B] hover:bg-[#FCF7F8]"}`} onClick={() => { const next = [...section.body]; next[idx] = { ...c, weight: "bold" }; setSection({ ...section, body: next }); }}>B</button>
                                    <button className={`px-3 py-1.5 text-sm transition-colors ${(c.weight || "regular") === "regular" ? "bg-[#FBEBEE]0 text-white" : "bg-white text-[#6B6B6B] hover:bg-[#FCF7F8]"}`} onClick={() => { const next = [...section.body]; next[idx] = { ...c, weight: "regular" }; setSection({ ...section, body: next }); }}>R</button>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                    <input type="color" className="w-6 h-6 rounded-full cursor-pointer border-0 flex-shrink-0" value={(c.color || "#111111").substring(0, 7)} onChange={(e) => { const next = [...section.body]; next[idx] = { ...c, color: e.target.value.toUpperCase() }; setSection({ ...section, body: next }); }} />
                                    <input className="flex-1 min-w-0 px-2 py-1 bg-white border border-[#E7C9CD] rounded-lg text-xs text-[#555555] focus:outline-none focus:ring-1 focus:ring-[#A35D5D]/40" value={c.color || "#111111"} onChange={(e) => { const next = [...section.body]; next[idx] = { ...c, color: e.target.value }; setSection({ ...section, body: next }); }} />
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null}

                          {c.kind === "key_value" ? (<div className="mt-3 space-y-3"><div className="grid grid-cols-1 md:grid-cols-2 gap-3"><div><div className="text-xs font-medium text-[#6B6B6B] mb-1">標籤名稱 (Label)</div><input className="w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all" value={c.label} onChange={(e) => { const next = [...section.body]; next[idx] = { ...c, label: e.target.value }; setSection({ ...section, body: next }); }} /></div><div><div className="text-xs font-medium text-[#6B6B6B] mb-1">顯示數值 (Value)</div><input className="w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all" value={c.value} onChange={(e) => { const next = [...section.body]; next[idx] = { ...c, value: e.target.value }; setSection({ ...section, body: next }); }} /></div></div><div><div className="text-xs font-medium text-[#6B6B6B] mb-1">連結網址 (URL)</div><input className="w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all" value={c.action?.uri || ""} onChange={(e) => { const next = [...section.body]; next[idx] = { ...c, action: { type: "uri", uri: e.target.value } }; setSection({ ...section, body: next }); }} /></div></div>) : null}

                          {c.kind === "list" ? (<div className="mt-3 space-y-2">{c.items.map((it: any, j: number) => (<input key={it.id} className="w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all" value={it.text} onChange={(e) => { const next = [...section.body]; const items = [...c.items]; items[j] = { ...it, text: e.target.value }; next[idx] = { ...c, items }; setSection({ ...section, body: next }); }} />))}<button className="w-full px-3 py-2 bg-white border border-[#E7C9CD] text-[#6B6B6B] font-medium rounded-lg hover:bg-[#FCF7F8] transition-colors shadow-sm text-xs" onClick={() => { const next = [...section.body]; next[idx] = { ...c, items: [...c.items, { id: uid("i_"), text: "新項目" }] }; setSection({ ...section, body: next }); }}>+ 新增項目</button></div>) : null}

                          {c.kind === "spacer" ? (<div className="mt-3"><div className="text-xs font-medium text-[#6B6B6B] mb-1">留白大小</div><GlassSelect size="sm" className="w-full" value={c.size} onChange={(val) => { const next = [...section.body]; next[idx] = { ...c, size: val }; setSection({ ...section, body: next }); }} options={[{value:"sm",label:"sm"},{value:"md",label:"md"},{value:"lg",label:"lg"}]} /></div>) : null}

                          {c.kind === "divider" ? (
                            <div className="mt-3 space-y-3">
                              <div>
                                <span className="text-xs font-medium text-[#6B6B6B] mb-1 block">線條顏色</span>
                                <div className="flex items-center gap-2">
                                  <input type="color" className="w-8 h-8 rounded-lg cursor-pointer border border-[#E7C9CD] p-0.5 flex-shrink-0" value={(c.color || "#f1f5f9").substring(0, 7)} onChange={(e) => { const next = [...section.body]; next[idx] = { ...c, color: e.target.value }; setSection({ ...section, body: next }); }} />
                                  <input className="flex-1 px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all" value={c.color || "#f1f5f9"} onChange={(e) => { const next = [...section.body]; next[idx] = { ...c, color: e.target.value }; setSection({ ...section, body: next }); }} />
                                </div>
                              </div>
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-medium text-[#6B6B6B]">間距 (Spacing)</span>
                                  <span className="text-xs text-[#AAAAAA]">{({"none":"0px","xs":"4px","sm":"8px","md":"16px","lg":"24px","xl":"32px","xxl":"48px"} as any)[c.spacing || "md"] || "16px"}</span>
                                </div>
                                <input type="range" min="0" max="6" step="1" className="w-full accent-[#A35D5D]" value={["none","xs","sm","md","lg","xl","xxl"].indexOf(c.spacing || "md") === -1 ? 3 : ["none","xs","sm","md","lg","xl","xxl"].indexOf(c.spacing || "md")} onChange={(e) => { const tokens = ["none","xs","sm","md","lg","xl","xxl"]; const next = [...section.body]; next[idx] = { ...c, spacing: tokens[Number(e.target.value)] }; setSection({ ...section, body: next }); }} />
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </AccordionSection>
                  <AccordionSection title="底部按鈕" accent="bg-[#AAAAAA]"  open={open === "footer"} onToggle={() => setOpen(open === "footer" ? "hero" : "footer")} right={<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F0F0F0] text-[#2B2B2B] border border-[#E7C9CD]">{(section as any).footer?.length || 0}/3</span>}>
                    <div className="space-y-3">
                      <button className="w-full px-4 py-3 bg-white border border-dashed border-[#E7C9CD] rounded-xl text-[#6B6B6B] hover:bg-[#FCF7F8] hover:border-[#A35D5D] font-medium transition-all shadow-sm" disabled={((section as any).footer?.length || 0) >= 3} onClick={() => { const bg = "#0A84FF"; const btn: FooterButton = { id: uid("btn_"), kind: "footer_button", enabled: true, label: "新按鈕", action: { type: "uri", uri: "https://example.com" }, style: "primary", bgColor: bg, textColor: autoTextColor(bg), autoTextColor: true }; setSection({ ...section, footer: [...((section as any).footer || []), btn].slice(0, 3) }); }}>+ 新增按鈕</button>
                      {((section as any).footer || []).map((b: any, idx: number) => (
                        <div key={b.id} className="bg-white border border-[#E7C9CD] rounded-xl p-4 space-y-3 shadow-sm">
                          <div className="flex items-center justify-between bg-[#FCF7F8] -mx-4 -mt-4 px-4 pt-3 pb-2 mb-2 rounded-t-xl border-b border-[#F0E3E5]"><div className="font-semibold text-sm">按鈕 {idx + 1}</div><div className="flex items-center gap-1"><button className="p-1.5 text-[#AAAAAA] hover:text-[#6B6B6B] rounded-lg hover:bg-[#F0F0F0] disabled:opacity-30 transition-colors" disabled={idx === 0} onClick={() => setSection({ ...section, footer: moveItem((section as any).footer, idx, idx - 1) })}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6" /></svg></button><button className="p-1.5 text-[#AAAAAA] hover:text-[#6B6B6B] rounded-lg hover:bg-[#F0F0F0] disabled:opacity-30 transition-colors" disabled={idx === (section as any).footer.length - 1} onClick={() => setSection({ ...section, footer: moveItem((section as any).footer, idx, idx + 1) })}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg></button><div className="w-px h-4 bg-[#E8E8E8] mx-1"></div><button className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors" onClick={() => { const next = (section as any).footer.filter((_: any, i: number) => i !== idx); setSection({ ...section, footer: next }); }}>刪除</button></div></div>
                          <div><div className="flex gap-4 mb-2"><div className="flex-1"><div className="text-sm font-semibold text-[#555555] mb-1">按鈕文字</div><input className="w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all" value={b.label} onChange={(e) => { const next = [...(section as any).footer]; next[idx] = { ...b, label: e.target.value }; setSection({ ...section, footer: next }); }} /></div><div className="w-1/3"><div className="text-sm font-semibold text-[#555555] mb-1">動作類型</div><GlassSelect size="sm" className="w-full" value={b.action.type} onChange={(val) => { const type = val as any; const next = [...(section as any).footer]; if (type === "uri") next[idx] = { ...b, action: { type, uri: "" } }; else if (type === "message") next[idx] = { ...b, action: { type, text: "" } }; setSection({ ...section, footer: next }); }} options={[{value:"uri",label:"開啟網址"},{value:"message",label:"傳送文字"}]} /></div></div><div><div className="text-sm font-semibold text-[#555555] mb-2">{b.action.type === "uri" ? "URL連結" : b.action.type === "message" ? "訊息文字" : "分享連結（自動填入）"}</div><input className={`w-full px-3 py-2 bg-white border border-[#E7C9CD] rounded-lg text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all ${b.action.type === "share" ? "bg-[#F0F0F0] opacity-60 cursor-not-allowed" : ""}`} disabled={b.action.type === "share"} value={b.action.type === "uri" ? b.action.uri : b.action.type === "message" ? b.action.text : (shareUrl || "尚未發布，請先至預覽頁發布")} onChange={(e) => { if (b.action.type === "share") return; const next = [...(section as any).footer]; if (b.action.type === "uri") next[idx] = { ...b, action: { ...b.action, uri: e.target.value } }; else if (b.action.type === "message") next[idx] = { ...b, action: { ...b.action, text: e.target.value } }; setSection({ ...section, footer: next }); }} />{b.action.type === "uri" ? <div className="mt-1 text-xs opacity-70">僅支援 https://、line://、liff://</div> : null}{b.action.type === "share" && !shareUrl ? <div className="mt-1 text-xs text-amber-600">請先至「預覽與發布」頁面發布後，連結會自動顯示</div> : null}{b.action.type === "share" && shareUrl ? <div className="mt-1 text-xs text-green-600">已發布 v{activeShare?.version_no}</div> : null}</div></div>
                          <details className="bg-[#FCF7F8] border border-[#E7C9CD] rounded-xl p-3"><summary className="cursor-pointer font-semibold text-sm text-[#555555]">顏色設定</summary><div className="mt-3 space-y-4"><ColorPicker label="背景色" value={b.bgColor} onChange={(v) => { const next = [...(section as any).footer]; next[idx] = { ...b, bgColor: v.toUpperCase(), textColor: b.autoTextColor ? autoTextColor(v) : b.textColor }; setSection({ ...section, footer: next }); }} /><div className="flex items-center justify-between gap-2"><div className="text-xs opacity-70">文字色：{b.textColor}</div><button className="px-3 py-2 text-xs font-medium bg-white border border-[#E7C9CD] text-[#6B6B6B] rounded-lg hover:bg-[#FCF7F8] transition-colors shadow-sm" onClick={() => { const next = [...(section as any).footer]; next[idx] = { ...b, textColor: autoTextColor(b.bgColor), autoTextColor: true }; setSection({ ...section, footer: next }); }}>自動</button></div><ColorPicker label="文字色（手動）" value={b.textColor} onChange={(v) => { const next = [...(section as any).footer]; next[idx] = { ...b, textColor: v.toUpperCase(), autoTextColor: false }; setSection({ ...section, footer: next }); }} /><AutoTextColorHint bgColor={b.bgColor} textColor={b.textColor} /></div></details>
                        </div>
                      ))}
                    </div>
                  </AccordionSection>
                </>
              )}
              <QuickReplyEditor doc={doc as EditableMessageDoc} onChange={(nextQuickReply) => scheduleSave({ ...doc, quickReply: nextQuickReply } as DocModel)} />
            </div>
          )}

        </div>

        {/* Column 2: LINE 即時預覽 */}
        <div className="sticky top-24 self-start">
          <div className="bg-white border border-[#E7C9CD] rounded-xl overflow-hidden shadow-sm">
            {/* Header */}
            <div className="px-4 pt-3 pb-2 border-b border-[#F0E3E5]">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[#555555]">LINE 即時預覽</span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${report.errors.length ? "bg-red-100 text-red-800 border-red-200" : report.warnings.length ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-green-100 text-green-800 border-green-200"}`}>
                  {report.errors.length ? `✕ 有 ${report.errors.length} 個錯誤` : report.warnings.length ? `⚠ 有 ${report.warnings.length} 個警告` : "✓ 驗證通過"}
                </span>
              </div>
              {(report.errors.length > 0 || report.warnings.length > 0) && (
                <div className="mt-2 space-y-1">
                  {report.errors.map((e: any, i: number) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5">
                      <span className="flex-shrink-0 mt-0.5">✕</span><span>{e.message}</span>
                    </div>
                  ))}
                  {report.warnings.map((w: any, i: number) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                      <span className="flex-shrink-0 mt-0.5">⚠</span><span>{w.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* iPhone frame */}
            <div className="px-4 py-4 flex flex-col items-center gap-3">
              <div className="relative" style={{ width: "270px" }}>
                <div className="rounded-[46px]" style={{ background: "#111", padding: "6px", boxShadow: "0 0 0 1px #222, 0 20px 60px rgba(0,0,0,0.5)" }}>
                  <div className="rounded-[42px] overflow-hidden" style={{ background: "#000" }}>
                    <div className="flex justify-center pt-3 pb-2" style={{ background: "#000" }}>
                      <div style={{ width: "100px", height: "28px", background: "#000", borderRadius: "14px", border: "1.5px solid #1a1a1a" }} />
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5" style={{ background: "#ffffff", borderBottom: "1px solid #e5e7eb" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#06C755" }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-black font-semibold text-[12px] leading-tight truncate">LINE Official Account</div>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                    </div>
                    <div className="p-2 pb-3" style={{ background: "#90AACB" }}>
                      <div className="flex items-start gap-1">
                        <div className="w-6 h-6 rounded-full bg-white flex-shrink-0 flex items-center justify-center overflow-hidden mt-1">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="#06C755"><path d="M21.99 12.06c0-5.7-4.93-10.31-10-10.31S2 6.36 2 12.06c0 5.1 4 9.35 8.89 10.16.34.07.8.22.92.51.1.25.07.62 0 1.05l-.18 1.09c-.05.32-.24 1.25 1.09.66s7.24-4.26 7.24-4.26a9.55 9.55 0 004.03-9.21z"/></svg>
                        </div>
                        <div style={{ zoom: 0.6, width: "320px" }}>
                          <FlexPreview doc={doc} selectedIndex={0} onIndexChange={() => {}} />
                        </div>
                      </div>
                    </div>
                    {((doc as any).quickReply?.items?.length ?? 0) > 0 && (
                      <div className="px-2 py-1.5 flex gap-1.5 overflow-x-auto" style={{ background: "#90AACB" }}>
                        {(doc as any).quickReply.items.map((item: any) => (
                          <div key={item.id} className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 bg-white border border-[#06C755] rounded-full text-[9px] text-[#06C755] font-medium whitespace-nowrap">
                            {item.action.label || "按鈕"}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="px-2 py-1 flex items-center gap-1.5 bg-white border-t border-gray-200">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="1.8" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      <div className="flex-1 h-6 bg-gray-100 rounded-full px-3 flex items-center">
                        <span className="text-[10px] text-gray-400">Aa</span>
                      </div>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                    </div>
                    <div className="flex justify-center py-1 bg-white">
                      <div className="w-20 h-[3px] bg-black rounded-full opacity-20" />
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-[#AAAAAA] text-center">ⓘ 僅供參考，實際效果以手機為準</p>
            </div>
          </div>
        </div>
        </div>{/* end inner grid */}
      </div>{/* end outer flex wrapper */}

      <ConfirmModal
        open={!!confirmState}
        title={confirmState?.title || ""}
        description={confirmState?.description || ""}
        confirmText="刪除"
        danger
        onConfirm={confirmState?.onConfirm || (() => {})}
        onClose={() => setConfirmState(null)}
      />
    </div>
  );
}

type EditableMessageDoc = Extract<DocModel, { type: "bubble" | "carousel" | "text" }>;

function RatioPicker({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  function parse(r: string): [number, number] {
    const p = r.split(":");
    return [parseFloat(p[0]), parseFloat(p[1])];
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const [w, h] = parse(opt.value);
        const maxDim = 32;
        const boxW = w >= h ? maxDim : Math.round(maxDim * w / h);
        const boxH = h > w ? maxDim : Math.round(maxDim * h / w);
        const sel = value === opt.value;
        return (
          <button key={opt.value} type="button" onClick={() => onChange(opt.value)}
            className={`flex flex-col items-center gap-1.5 px-2.5 py-2 rounded-xl border-2 transition-all ${sel ? "border-[#A35D5D] bg-[#FBEBEE]" : "border-[#E7C9CD] bg-white hover:border-[#E7C9CD] hover:bg-[#FCF7F8]"}`}
          >
            <div className="h-9 w-10 flex items-center justify-center">
              <div className={`rounded border-2 ${sel ? "border-[#A35D5D] bg-[#FBEBEE]" : "border-[#E7C9CD] bg-[#F0F0F0]"}`}
                style={{ width: `${boxW}px`, height: `${boxH}px` }} />
            </div>
            <span className={`text-[11px] font-medium leading-none ${sel ? "text-[#A35D5D]" : "text-[#6B6B6B]"}`}>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function QuickReplyEditor({ doc, onChange }: { doc: EditableMessageDoc; onChange: (quickReply: any) => void }) {
  const items = doc.quickReply?.items || [];
  const dragIdx = useRef<number>(-1);

  function updateItem(id: string, patch: Partial<QuickReplyItem>) {
    onChange({ items: items.map((item) => item.id === id ? { ...item, ...patch, action: { ...item.action, ...(patch as any).action } } : item) });
  }

  function removeItem(id: string) {
    onChange({ items: items.filter((item) => item.id !== id) });
  }

  function addItem() {
    if (items.length >= 13) return;
    onChange({
      items: [...items, { id: uid('qr_'), action: { type: 'message', label: `按鈕 ${items.length + 1}`, text: `按鈕 ${items.length + 1}` } }],
    });
  }

  function moveItem(from: number, to: number) {
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange({ items: next });
  }

  return (
    <div className="bg-white border border-[#E7C9CD] rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-[#2B2B2B]">預設回覆</div>
        </div>
        <button type="button" onClick={addItem} disabled={items.length >= 13} className="rounded-xl border border-[#E7C9CD] px-3 py-2 text-sm text-[#555555] disabled:opacity-50">＋ 新增按鈕</button>
      </div>

      {items.length === 0 ? null : (
        <>
          <div className="mt-4 rounded-2xl border border-[#E7C9CD] bg-[#FCF7F8] p-4">
            <div className="text-sm font-medium text-[#555555]">Quick Reply 預覽 <span className="text-xs text-[#AAAAAA] font-normal ml-1">拖拉可調整順序</span></div>
            <div className="mt-3 flex flex-wrap gap-2">
              {items.map((item, idx) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => { dragIdx.current = idx; }}
                  onDragOver={(e) => { e.preventDefault(); }}
                  onDrop={(e) => { e.preventDefault(); if (dragIdx.current !== -1 && dragIdx.current !== idx) moveItem(dragIdx.current, idx); dragIdx.current = -1; }}
                  onDragEnd={() => { dragIdx.current = -1; }}
                  className="inline-flex items-center rounded-full border border-[#E7C9CD] bg-white px-3 py-2 text-sm text-[#555555] shadow-sm cursor-grab active:cursor-grabbing select-none"
                >
                  <span>{item.action.label || '未命名按鈕'}</span>
                  <span className="ml-2 text-xs text-[#AAAAAA]">{item.action.type === 'message' ? '傳文字' : '開連結'}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {items.map((item, index) => (
              <div key={item.id} className="rounded-2xl border border-[#E7C9CD] p-4 bg-[#FCF7F8]">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-[#2B2B2B]">按鈕 {index + 1}</div>
                  <button type="button" onClick={() => removeItem(item.id)} title="刪除按鈕" className="w-7 h-7 flex items-center justify-center rounded-lg text-[#AAAAAA] hover:text-red-500 hover:bg-red-50 transition-colors"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg></button>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-[140px_1fr_1fr]">
                  <label className="block space-y-2">
                    <div className="text-xs font-medium text-[#6B6B6B]">動作</div>
                    <GlassSelect
                      size="sm"
                      className="w-full"
                      value={item.action.type}
                      onChange={(val) => updateItem(item.id, { action: val === 'uri' ? { type: 'uri', label: item.action.label, uri: 'https://' } as any : { type: 'message', label: item.action.label, text: item.action.type === 'message' ? item.action.text : item.action.label } as any })}
                      options={[{value:"message",label:"傳送文字"},{value:"uri",label:"開啟連結"}]}
                    />
                  </label>
                  <label className="block space-y-2">
                    <div className="text-xs font-medium text-[#6B6B6B]">按鈕標籤</div>
                    <input value={item.action.label} onChange={(e) => updateItem(item.id, { action: { ...item.action, label: e.target.value } as any })} className="w-full rounded-xl border border-[#E7C9CD] px-3 py-2 bg-white" />
                  </label>
                  <label className="block space-y-2">
                    <div className="text-xs font-medium text-[#6B6B6B]">{item.action.type === 'message' ? '送出的文字' : '連結網址'}</div>
                    <input value={item.action.type === 'message' ? item.action.text : item.action.uri} onChange={(e) => updateItem(item.id, { action: item.action.type === 'message' ? { ...item.action, text: e.target.value } as any : { ...item.action, uri: e.target.value } as any })} className="w-full rounded-xl border border-[#E7C9CD] px-3 py-2 bg-white" placeholder={item.action.type === 'message' ? '例如：優惠' : 'https://example.com'} />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
