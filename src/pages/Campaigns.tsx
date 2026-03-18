import React, { useEffect, useMemo, useState } from 'react';
import GlassSelect from "@/components/GlassSelect";
import FlexPreview from "@/components/FlexPreview";
import { listDocs } from '@/lib/db';
import { BroadcastCampaign, deleteCampaign, listCampaigns, saveCampaign, sendCampaign } from '@/lib/campaigns';
import { buildQuickReply } from '@/lib/draftMessaging';

// ─── Status Badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    sent:    { label: '已發送', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
    failed:  { label: '失敗',   cls: 'bg-red-50 text-red-600 border border-red-200' },
    pending: { label: '待發送', cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600 border border-slate-200' };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-400">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
        </svg>
      </div>
      <p className="text-sm font-medium text-slate-700">尚未建立任何推播</p>
      <p className="text-xs text-slate-400 mt-1">可先從上方選擇草稿建立第一則推播</p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Campaigns() {
  const [drafts, setDrafts]           = useState<any[]>([]);
  const [rows, setRows]               = useState<BroadcastCampaign[]>([]);
  const [name, setName]               = useState('');
  const [draftId, setDraftId]         = useState('');
  const [msg, setMsg]                 = useState<{ text: string; ok: boolean } | null>(null);
  const [loading, setLoading]         = useState(false);
  const [sending, setSending]         = useState<string | null>(null);
  const [includeQuickReply, setIncludeQuickReply] = useState(true);
  const [sendOptions, setSendOptions] = useState<Record<string, boolean>>({});

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

  const selectedDraft       = useMemo(() => drafts.find((d) => d.id === draftId), [draftId, drafts]);
  const selectedDraftQr     = buildQuickReply(selectedDraft?.content?.quickReply);
  const canSubmit           = !!name && !!draftId && !loading;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      await saveCampaign({ name, draft_id: draftId, include_quick_reply: includeQuickReply });
      setName('');
      setDraftId('');
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
    <div className="space-y-8">

      {/* ── Toast ─────────────────────────────────────────────────────── */}
      {msg && (
        <div className={`rounded-xl px-5 py-3.5 text-sm font-medium flex items-center gap-2 ${
          msg.ok
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          <span>{msg.ok ? '✓' : '✕'}</span>
          {msg.text}
        </div>
      )}

      {/* ══ SECTION 1: 建立推播 ══════════════════════════════════════════ */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

        <div className="px-7 pt-6 pb-5 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">建立推播</h2>
          <p className="mt-0.5 text-sm text-slate-500">直接選擇已建立好的草稿，送到 LINE OA 廣播。</p>
        </div>

        <form onSubmit={handleSave}>
          <div className="p-7 grid gap-8 lg:grid-cols-2">

            {/* ── Left: form fields ───────────────────────────────────── */}
            <div className="flex flex-col gap-5">

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">
                  推播名稱 <span className="text-red-400">*</span>
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：3 月活動推播"
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">
                  選擇草稿 <span className="text-red-400">*</span>
                </label>
                <GlassSelect
                  size="lg"
                  className="w-full"
                  rounded="rounded-xl"
                  value={draftId}
                  onChange={setDraftId}
                  options={[{ value: '', label: '請選擇草稿…' }, ...drafts.map((d) => ({ value: d.id, label: d.content?.title || d.title || d.id }))]}
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-800">Quick Reply 設定</span>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={includeQuickReply}
                      onChange={(e) => setIncludeQuickReply(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    保留 Quick Reply
                  </label>
                </div>
                {selectedDraft ? (
                  <p className="text-xs text-slate-500">
                    此草稿&nbsp;
                    {selectedDraftQr
                      ? <span className="font-medium text-pink-600">含 {selectedDraftQr.items.length} 個 Quick Reply</span>
                      : <span className="text-slate-400">不含 Quick Reply</span>
                    }
                  </p>
                ) : (
                  <p className="text-xs text-slate-400">請先選擇草稿以確認是否含有 Quick Reply</p>
                )}
              </div>

              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-slate-400">建立後會新增一筆推播紀錄</p>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 active:bg-slate-950 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  {loading
                    ? <><Spinner />建立中…</>
                    : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14"/></svg>建立推播</>
                  }
                </button>
              </div>
            </div>

            {/* ── Right: draft preview ─────────────────────────────────── */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 flex flex-col gap-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">草稿預覽</p>
              {selectedDraft ? (
                <>
                  <div className="w-full rounded-lg bg-white border border-slate-200 p-3 overflow-x-auto">
                    <FlexPreview doc={selectedDraft.content} />
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full py-8 text-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-400">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-slate-600">尚未選擇草稿</p>
                  <p className="text-xs text-slate-400 leading-relaxed">選擇草稿後，<br/>這裡將顯示內容摘要與預覽</p>
                </div>
              )}
            </div>

          </div>
        </form>
      </section>

      {/* ══ SECTION 2: 推播文章列表 ═══════════════════════════════════════ */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

        {/* Card header */}
        <div className="px-7 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">推播文章列表</h2>
            <p className="text-xs text-slate-400 mt-0.5">從草稿引用內容，發送後會記錄狀態。</p>
          </div>
          <span className="text-xs text-slate-400 tabular-nums">{rows.length} 筆</span>
        </div>

        {/* List */}
        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => (
              <li
                key={row.id}
                className="px-7 py-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between hover:bg-slate-50/60 transition-colors"
              >
                {/* Left: info */}
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-slate-900 leading-snug">{row.name}</span>
                    <StatusBadge status={row.status ?? 'pending'} />
                  </div>
                  <p className="text-xs text-slate-500 truncate">
                    草稿：{row.doc_title || row.draft_id}
                  </p>
                  {row.sent_at && (
                    <p className="text-xs text-slate-400">
                      最後發送：{new Date(row.sent_at).toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  )}
                </div>

                {/* Right: actions */}
                <div className="flex flex-col items-start sm:items-end gap-2.5 shrink-0">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={sendOptions[row.id] ?? true}
                      onChange={(e) => setSendOptions((prev) => ({ ...prev, [row.id]: e.target.checked }))}
                      className="rounded border-slate-300 text-pink-600 focus:ring-pink-500"
                    />
                    推播時保留 Quick Reply
                  </label>
                  <div className="flex gap-2">
                    <button
                      disabled={sending === row.id}
                      onClick={() => handleSend(row)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-pink-600 text-white px-4 py-2 text-xs font-medium hover:bg-pink-700 active:bg-pink-800 disabled:opacity-50 transition"
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
                      className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 transition"
                    >
                      刪除
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─── Spinner ─────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round"/>
    </svg>
  );
}
