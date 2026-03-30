import React, { useEffect, useMemo, useState } from 'react';
import GlassSelect from "@/components/GlassSelect";
import FlexPreview from "@/components/FlexPreview";
import { listDocs } from '@/lib/db';
import { BroadcastCampaign, deleteCampaign, listCampaigns, saveCampaign, sendCampaign } from '@/lib/campaigns';
import { buildQuickReply } from '@/lib/draftMessaging';

const MAX_DRAFTS = 3;

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    sent:    { label: '已發送', cls: 'bg-[#EAF4ED] text-[#4E735D] border border-[#B8D9C4]' },
    failed:  { label: '失敗',   cls: 'bg-red-50 text-red-600 border border-red-200' },
    pending: { label: '待發送', cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-[#F0F0F0] text-[#6B6B6B] border border-[#E8E8E8]' };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Campaigns() {
  const [drafts, setDrafts]           = useState<any[]>([]);
  const [rows, setRows]               = useState<BroadcastCampaign[]>([]);
  const [name, setName]               = useState('');
  const [draftIds, setDraftIds]       = useState<string[]>([]);
  const [addingDraftId, setAddingDraftId] = useState('');
  const [previewIdx, setPreviewIdx]   = useState(0);
  const [msg, setMsg]                 = useState<{ text: string; ok: boolean } | null>(null);
  const [loading, setLoading]         = useState(false);
  const [sending, setSending]         = useState<string | null>(null);
  const [includeQuickReply, setIncludeQuickReply] = useState(true);
  const [sendOptions, setSendOptions] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab]     = useState<'all' | 'pending' | 'sent' | 'failed'>('all');

  const load = async () => {
    const [docRows, campaignRows] = await Promise.all([listDocs(), listCampaigns()]);
    const availableDrafts = docRows.filter((r: any) => r.content?.type !== 'folder');
    setDrafts(availableDrafts);
    setRows(campaignRows);
    setSendOptions((prev) => {
      const next = { ...prev };
      for (const row of campaignRows) {
        if (typeof next[row.id] !== 'boolean') next[row.id] = true;
      }
      return next;
    });
  };

  useEffect(() => { load(); }, []);

  // Drafts selected for the new campaign
  const selectedDraftObjects = useMemo(
    () => draftIds.map((id) => drafts.find((d) => d.id === id)).filter(Boolean),
    [draftIds, drafts]
  );
  const previewDraft = selectedDraftObjects[previewIdx] ?? selectedDraftObjects[0] ?? null;
  const previewDraftQr = buildQuickReply(previewDraft?.content?.quickReply);
  const canSubmit = !!name && draftIds.length > 0 && !loading;

  // Drafts not yet added
  const availableToAdd = drafts.filter((d) => !draftIds.includes(d.id));

  function handleAddDraft() {
    if (!addingDraftId || draftIds.includes(addingDraftId) || draftIds.length >= MAX_DRAFTS) return;
    const newIds = [...draftIds, addingDraftId];
    setDraftIds(newIds);
    setAddingDraftId('');
    setPreviewIdx(0);
  }

  function handleRemoveDraft(id: string) {
    const newIds = draftIds.filter((d) => d !== id);
    setDraftIds(newIds);
    setPreviewIdx(0);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      await saveCampaign({ name, draft_ids: draftIds, include_quick_reply: includeQuickReply });
      setName('');
      setDraftIds([]);
      setAddingDraftId('');
      setPreviewIdx(0);
      setMsg({ text: '推播文章已建立', ok: true });
      await load();
    } catch (err: any) {
      setMsg({ text: err.message || '建立失敗', ok: false });
    } finally {
      setLoading(false);
    }
  }

  async function handleSend(row: BroadcastCampaign) {
    setSending(row.id);
    setMsg(null);
    try {
      await sendCampaign(row.id, { includeQuickReply: sendOptions[row.id] ?? true });
      setMsg({ text: `「${row.name}」推播成功！`, ok: true });
      await load();
    } catch (err: any) {
      setMsg({ text: `推播失敗：${err.message || '未知錯誤'}`, ok: false });
    } finally {
      setSending(null);
    }
  }

  return (
    <div className="space-y-6">

      {/* Toast */}
      {msg && (
        <div className={`rounded-xl px-5 py-3.5 text-sm font-medium flex items-center gap-2 border ${
          msg.ok
            ? 'bg-[#EAF4ED] text-[#4E735D] border-[#B8D9C4]'
            : 'bg-red-50 text-red-700 border-red-200'
        }`}>
          <span>{msg.ok ? '✓' : '✕'}</span>
          {msg.text}
        </div>
      )}

      {/* ── Section 1: 建立推播 ──────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-[#E7C9CD] shadow-sm overflow-hidden">

        <div className="px-6 pt-5 pb-4 border-b border-[#F0E3E5]">
          <h2 className="text-base font-semibold text-[#2B2B2B]">建立推播</h2>
          <p className="mt-0.5 text-sm text-[#6B6B6B]">直接選擇已建立好的草稿，送到 LINE OA 廣播。</p>
        </div>

        <form onSubmit={handleSave}>
          <div className="p-6 grid gap-6 lg:grid-cols-2">

            {/* Left: form fields */}
            <div className="flex flex-col gap-5">

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-[#2B2B2B]">
                  推播名稱 <span className="text-red-400">*</span>
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：3 月活動推播"
                  className="w-full rounded-xl border border-[#E7C9CD] px-4 py-2.5 text-sm text-[#2B2B2B] placeholder-[#AAAAAA] focus:border-[#A35D5D] focus:ring-2 focus:ring-[#A35D5D]/15 outline-none transition"
                />
              </div>

              {/* Draft list */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-[#2B2B2B]">
                    草稿 <span className="text-red-400">*</span>
                    <span className="ml-1.5 text-xs font-normal text-[#AAAAAA]">（最多 {MAX_DRAFTS} 個）</span>
                  </label>
                  <span className="text-xs text-[#AAAAAA] tabular-nums">{draftIds.length} / {MAX_DRAFTS}</span>
                </div>

                {/* Added drafts */}
                {draftIds.length > 0 && (
                  <ul className="space-y-1.5">
                    {draftIds.map((id, idx) => {
                      const d = drafts.find((x) => x.id === id);
                      const title = d?.content?.title || d?.title || id;
                      return (
                        <li
                          key={id}
                          className="flex items-center gap-2 rounded-xl border border-[#E7C9CD] bg-[#FFF7F8] px-3 py-2"
                        >
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#A35D5D] text-white text-xs font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="flex-1 text-sm text-[#2B2B2B] truncate">{title}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveDraft(id)}
                            className="flex-shrink-0 text-[#AAAAAA] hover:text-[#A35D5D] transition-colors p-0.5"
                            title="移除"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* Add draft selector */}
                {draftIds.length < MAX_DRAFTS && (
                  <div className="flex gap-2">
                    <GlassSelect
                      size="lg"
                      className="flex-1"
                      rounded="rounded-xl"
                      value={addingDraftId}
                      onChange={setAddingDraftId}
                      options={[
                        { value: '', label: '選擇草稿…' },
                        ...availableToAdd.map((d) => ({ value: d.id, label: d.content?.title || d.title || d.id })),
                      ]}
                    />
                    <button
                      type="button"
                      disabled={!addingDraftId}
                      onClick={handleAddDraft}
                      className="flex-shrink-0 inline-flex items-center gap-1 rounded-xl border border-[#E7C9CD] bg-white hover:bg-[#FFF7F8] px-3 py-2.5 text-sm font-medium text-[#A35D5D] disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14"/>
                      </svg>
                      新增
                    </button>
                  </div>
                )}

                {draftIds.length === 0 && (
                  <p className="text-xs text-[#AAAAAA]">請選擇草稿後點選「新增」</p>
                )}
              </div>

              <div className="rounded-xl border border-[#E7C9CD] bg-[#FFF7F8] px-4 py-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[#2B2B2B]">Quick Reply 設定</span>
                  <label className="inline-flex items-center gap-2 text-sm text-[#555555] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={includeQuickReply}
                      onChange={(e) => setIncludeQuickReply(e.target.checked)}
                      className="rounded border-[#E7C9CD] text-[#A35D5D] focus:ring-[#A35D5D]"
                    />
                    保留 Quick Reply
                  </label>
                </div>
                {previewDraft ? (
                  <p className="text-xs text-[#6B6B6B]">
                    預覽草稿&nbsp;
                    {previewDraftQr
                      ? <span className="font-medium text-[#A35D5D]">含 {previewDraftQr.items.length} 個 Quick Reply</span>
                      : <span className="text-[#AAAAAA]">不含 Quick Reply</span>
                    }
                  </p>
                ) : (
                  <p className="text-xs text-[#AAAAAA]">請先新增草稿以確認是否含有 Quick Reply</p>
                )}
              </div>

              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-[#AAAAAA]">建立後會新增一筆推播紀錄</p>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#A35D5D] hover:bg-[#8F4A4A] px-5 py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  {loading
                    ? <><Spinner />建立中…</>
                    : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14"/></svg>建立推播</>
                  }
                </button>
              </div>
            </div>

            {/* Right: draft preview */}
            <div className="rounded-xl border border-[#E7C9CD] bg-[#FFF7F8] p-5 flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#AAAAAA]">草稿預覽</p>

              {/* Preview tab pills (only when > 1 draft) */}
              {selectedDraftObjects.length > 1 && (
                <div className="flex gap-1.5 flex-wrap">
                  {selectedDraftObjects.map((d, idx) => {
                    const title = d?.content?.title || d?.title || `草稿 ${idx + 1}`;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setPreviewIdx(idx)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                          previewIdx === idx
                            ? 'bg-[#A35D5D] text-white border-[#A35D5D]'
                            : 'bg-white text-[#6B6B6B] border-[#E7C9CD] hover:border-[#A35D5D] hover:text-[#A35D5D]'
                        }`}
                      >
                        <span className="w-4 h-4 rounded-full bg-current/20 flex items-center justify-center text-[10px] font-bold">
                          {idx + 1}
                        </span>
                        <span className="max-w-[100px] truncate">{title}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {previewDraft ? (
                <div className="w-full rounded-lg bg-white border border-[#EBEBEB] p-3 overflow-x-auto">
                  <FlexPreview doc={previewDraft.content} />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full py-8 text-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-[#F0F0F0] flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#AAAAAA]">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-[#6B6B6B]">尚未選擇草稿</p>
                  <p className="text-xs text-[#AAAAAA] leading-relaxed">新增草稿後，<br/>這裡將顯示內容摘要與預覽</p>
                </div>
              )}
            </div>

          </div>
        </form>
      </section>

      {/* ── Section 2: 推播訊息管理 ─────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-[#EBEBEB] shadow-sm overflow-hidden">

        <div className="px-6 py-4 border-b border-[#F0F0F0] flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#2B2B2B]">推播訊息管理</h2>
          <span className="text-xs text-[#AAAAAA] tabular-nums">{rows.length} 筆</span>
        </div>

        {/* Status Tabs */}
        {(() => {
          const tabs: { key: typeof activeTab; label: string }[] = [
            { key: 'all',     label: '全部' },
            { key: 'pending', label: '排程中' },
            { key: 'sent',    label: '已發送' },
            { key: 'failed',  label: '發送失敗' },
          ];
          return (
            <div className="flex gap-0 border-b border-[#F0F0F0] px-6 overflow-x-auto">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px ${
                    activeTab === t.key
                      ? 'border-[#A35D5D] text-[#A35D5D]'
                      : 'border-transparent text-[#6B6B6B] hover:text-[#2B2B2B] hover:border-[#E7C9CD]'
                  }`}
                >
                  {t.label}
                  <span className={`ml-1.5 text-xs tabular-nums ${activeTab === t.key ? 'text-[#A35D5D]' : 'text-[#AAAAAA]'}`}>
                    {t.key === 'all' ? rows.length : rows.filter((r) => r.status === t.key).length}
                  </span>
                </button>
              ))}
            </div>
          );
        })()}

        {(() => {
          const filtered = activeTab === 'all' ? rows : rows.filter((r) => r.status === activeTab);
          return filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-70">
            <div className="w-16 h-16 bg-[#F0F0F0] rounded-full flex items-center justify-center mb-4 text-3xl">📮</div>
            <p className="text-[#2B2B2B] font-medium text-sm">尚未建立任何推播</p>
            <p className="text-xs text-[#6B6B6B] mt-1">可先從上方選擇草稿建立第一則推播</p>
          </div>
        ) : (
          <ul className="divide-y divide-[#F0F0F0]">
            {filtered.map((row) => {
              const displayIds: string[] = (row.draft_ids && row.draft_ids.length > 0) ? row.draft_ids : [row.draft_id];
              const draftTitles = displayIds.map((id) => {
                const d = drafts.find((x) => x.id === id);
                return d?.content?.title || d?.title || id;
              });
              return (
                <li
                  key={row.id}
                  className="px-6 py-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between hover:bg-[#FAFAFA] transition-colors"
                >
                  {/* Left: info */}
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-[#2B2B2B] leading-snug">{row.name}</span>
                      <StatusBadge status={row.status ?? 'pending'} />
                    </div>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {draftTitles.map((title, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1 text-xs text-[#6B6B6B] bg-[#F5F5F5] rounded-md px-2 py-0.5">
                          <span className="w-3.5 h-3.5 rounded-full bg-[#DDDDDD] text-[#6B6B6B] text-[9px] font-bold flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                          <span className="truncate max-w-[140px]">{title}</span>
                        </span>
                      ))}
                    </div>
                    {row.sent_at && (
                      <p className="text-xs text-[#AAAAAA]">
                        最後發送：{new Date(row.sent_at).toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    )}
                  </div>

                  {/* Right: actions */}
                  <div className="flex flex-col items-start sm:items-end gap-2.5 shrink-0">
                    <label className="inline-flex items-center gap-2 text-xs text-[#555555] cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={sendOptions[row.id] ?? true}
                        onChange={(e) => setSendOptions((prev) => ({ ...prev, [row.id]: e.target.checked }))}
                        className="rounded border-[#E7C9CD] text-[#A35D5D] focus:ring-[#A35D5D]"
                      />
                      推播時保留 Quick Reply
                    </label>
                    <div className="flex gap-2">
                      <button
                        disabled={sending === row.id}
                        onClick={() => handleSend(row)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#A35D5D] hover:bg-[#8F4A4A] text-white px-4 py-2 text-xs font-semibold disabled:opacity-50 transition-colors"
                      >
                        {sending === row.id
                          ? <><Spinner />推播中…</>
                          : <>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7"/></svg>
                              立即推播
                            </>
                        }
                      </button>
                      <button
                        disabled={sending === row.id}
                        onClick={async () => { await deleteCampaign(row.id); await load(); }}
                        className="rounded-lg border border-[#E8E8E8] px-4 py-2 text-xs font-medium text-[#555555] hover:bg-[#F5F5F5] hover:border-[#DDDDDD] disabled:opacity-50 transition-colors"
                      >
                        刪除
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        );
        })()}
      </section>
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round"/>
    </svg>
  );
}
