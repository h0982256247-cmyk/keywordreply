import React, { useEffect, useMemo, useState } from 'react';
import GlassSelect from "@/components/GlassSelect";
import ConfirmModal from '@/components/ConfirmModal';
import { listDocs } from '@/lib/db';
import { deleteKeywordRule, listKeywordRules, reorderKeywordRules, upsertKeywordRule, type KeywordRule } from '@/lib/keywords';

const MAX_DRAFTS = 3;
const MAX_KEYWORD_LEN = 30;

type FormState = {
  id?: string;
  name: string;
  keywords: string[];
  match_type: 'exact' | 'contains';
  priority: number;
  reply_mode: 'text' | 'draft';
  reply_text: string;
  draft_ids: string[];
  is_enabled: boolean;
};

const emptyForm: FormState = {
  name: '',
  keywords: [],
  match_type: 'exact',
  priority: 1,
  reply_mode: 'draft',
  reply_text: '',
  draft_ids: [],
  is_enabled: true,
};

export default function Keywords() {
  const [drafts, setDrafts] = useState<any[]>([]);
  const [rows, setRows] = useState<KeywordRule[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [addingDraftId, setAddingDraftId] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  const load = async () => {
    const [docRows, ruleRows] = await Promise.all([listDocs(), listKeywordRules()]);
    setDrafts(docRows.filter((r: any) => r.content?.type !== 'folder'));
    setRows(ruleRows);
  };

  useEffect(() => { void load(); }, []);

  const usageCount = useMemo(() => rows.filter((row) => row.is_enabled).length, [rows]);
  const sortRows = (nextRows: KeywordRule[]) => nextRows.map((row, index) => ({ ...row, priority: index + 1 }));

  function openCreate() {
    setForm(emptyForm);
    setAddingDraftId('');
    setTagInput('');
    setMsg(null);
    setOpen(true);
  }

  function openEdit(row: KeywordRule) {
    const existingIds = (row.draft_ids && row.draft_ids.length > 0)
      ? row.draft_ids
      : row.draft_id ? [row.draft_id] : [];
    const existingKeywords = (row.keywords && row.keywords.length > 0)
      ? row.keywords
      : row.keyword ? [row.keyword] : [];
    setForm({
      id: row.id,
      name: row.name || row.keyword,
      keywords: existingKeywords,
      match_type: row.match_type,
      priority: row.priority,
      reply_mode: row.reply_mode,
      reply_text: row.reply_text || '',
      draft_ids: existingIds,
      is_enabled: row.is_enabled,
    });
    setAddingDraftId('');
    setTagInput('');
    setMsg(null);
    setOpen(true);
  }

  function commitTagInput(raw: string) {
    const trimmed = raw.trim().replace(/,+$/, '').trim();
    if (!trimmed) return;
    if (trimmed.length > MAX_KEYWORD_LEN) {
      setMsg(`每筆關鍵字上限為 ${MAX_KEYWORD_LEN} 個字`);
      return;
    }
    if (form.keywords.includes(trimmed)) return;
    setForm((prev) => ({ ...prev, keywords: [...prev.keywords, trimmed] }));
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitTagInput(tagInput);
      setTagInput('');
      return;
    }
    if (e.key === 'Backspace' && tagInput === '' && form.keywords.length > 0) {
      setForm({ ...form, keywords: form.keywords.slice(0, -1) });
    }
  }

  function removeKeyword(kw: string) {
    setForm({ ...form, keywords: form.keywords.filter((k) => k !== kw) });
  }

  function handleAddDraft() {
    if (!addingDraftId || form.draft_ids.includes(addingDraftId) || form.draft_ids.length >= MAX_DRAFTS) return;
    setForm({ ...form, draft_ids: [...form.draft_ids, addingDraftId] });
    setAddingDraftId('');
  }

  function handleRemoveDraft(id: string) {
    setForm({ ...form, draft_ids: form.draft_ids.filter((d) => d !== id) });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Commit any pending tag input before submitting
    const pendingKeywords = tagInput.trim()
      ? [...form.keywords, ...tagInput.split(',').map((s) => s.trim()).filter(Boolean)]
      : form.keywords;
    if (pendingKeywords.length === 0) {
      setMsg('請至少輸入一個關鍵字');
      return;
    }
    if (form.reply_mode === 'draft' && form.draft_ids.length === 0) {
      setMsg('請至少選擇一個草稿');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const primaryKeyword = pendingKeywords[0];
      await upsertKeywordRule({
        ...form,
        keyword: primaryKeyword,
        keywords: pendingKeywords,
        name: form.name || primaryKeyword,
      } as any);
      setOpen(false);
      setForm(emptyForm);
      setTagInput('');
      await load();
    } catch (e: any) {
      setMsg(e.message || '儲存失敗');
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(row: KeywordRule) {
    await upsertKeywordRule({ ...row, is_enabled: !row.is_enabled });
    await load();
  }

  async function persistOrder(nextRows: KeywordRule[]) {
    setRows(sortRows(nextRows));
    setSavingOrder(true);
    try {
      await reorderKeywordRules(nextRows.map((row) => row.id));
      await load();
    } finally {
      setSavingOrder(false);
    }
  }

  function moveRow(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= rows.length || fromIndex === toIndex) return;
    const next = [...rows];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    void persistOrder(next);
  }

  function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) return;
    const fromIndex = rows.findIndex((row) => row.id === draggingId);
    const toIndex = rows.findIndex((row) => row.id === targetId);
    setDraggingId(null);
    if (fromIndex === -1 || toIndex === -1) return;
    moveRow(fromIndex, toIndex);
  }

  const availableToAdd = drafts.filter((d) => !form.draft_ids.includes(d.id));

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <section className="bg-white rounded-2xl border border-[#E7C9CD] p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[#2B2B2B]">關鍵字規則</h2>
            <p className="mt-1 text-sm text-[#6B6B6B]">
              {usageCount} 條規則啟用中 / 共 200 條上限
              {savingOrder && <span className="ml-2 text-[#A35D5D]">正在儲存排序...</span>}
            </p>
            <p className="mt-1 text-xs text-[#AAAAAA]">支援拖曳排序，或使用上下移動按鈕快速調整優先順序。</p>
          </div>
          <button
            onClick={openCreate}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-[#A35D5D] hover:bg-[#8F4A4A] text-white px-4 py-2.5 text-sm font-semibold shadow-md transition-colors"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            建立關鍵字規則
          </button>
        </div>
      </section>

      {/* Table */}
      <section className="bg-white rounded-2xl border border-[#EBEBEB] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[#F0F0F0] bg-[#FAFAFA]">
                <th className="px-5 py-3 text-left text-xs font-medium text-[#4F4F4F] tracking-wide">排序</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-[#4F4F4F] tracking-wide">規則名稱</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-[#4F4F4F] tracking-wide">匹配</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-[#4F4F4F] tracking-wide">關鍵字</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-[#4F4F4F] tracking-wide">狀態</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-[#4F4F4F] tracking-wide">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F0F0]">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-20 text-center">
                    <div className="flex flex-col items-center justify-center opacity-70">
                      <div className="w-16 h-16 bg-[#F0F0F0] rounded-full flex items-center justify-center mb-4 text-3xl">🔍</div>
                      <p className="text-[#2B2B2B] font-medium">尚未建立關鍵字規則</p>
                      <p className="text-sm text-[#6B6B6B] mt-1">點擊右上角「建立關鍵字規則」開始建立</p>
                    </div>
                  </td>
                </tr>
              ) : rows.map((row, index) => (
                <tr
                  key={row.id}
                  className="hover:bg-[#FAFAFA] transition-colors"
                  draggable
                  onDragStart={() => setDraggingId(row.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(row.id)}
                >
                  <td className="px-5 py-4 text-[#6B6B6B] tabular-nums">{index + 1}</td>
                  <td className="px-5 py-4 font-medium text-[#A35D5D]">{row.name || row.keyword}</td>
                  <td className="px-5 py-4 text-[#555555]">{row.match_type === 'exact' ? '完全' : '包含'}</td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1">
                      {(row.keywords && row.keywords.length > 0 ? row.keywords : [row.keyword]).map((kw) => (
                        <span key={kw} className="inline-flex items-center rounded-md bg-[#F5F5F5] border border-[#E8E8E8] px-2 py-0.5 text-xs text-[#2B2B2B]">{kw}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => toggleEnabled(row)}
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        row.is_enabled
                          ? 'bg-[#FBEBEE] text-[#A35D5D] hover:bg-[#F6D9DD]'
                          : 'bg-[#F0F0F0] text-[#6B6B6B] hover:bg-[#E8E8E8]'
                      }`}
                    >
                      {row.is_enabled ? '使用中' : '已停用'}
                    </button>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => openEdit(row)}
                        className="w-9 h-9 flex items-center justify-center text-[#8A8A8A] hover:text-[#A35D5D] hover:bg-[#FBEBEE] rounded-lg transition-colors"
                        title="編輯"
                      >
                        <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button
                        onClick={() => setDeleteId(row.id)}
                        className="w-9 h-9 flex items-center justify-center text-[#8A8A8A] hover:text-[#B85C5C] hover:bg-[#FEF2F2] rounded-lg transition-colors"
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
            </tbody>
          </table>
        </div>
      </section>

      {/* Create / Edit Modal */}
      {open && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !busy && setOpen(false)} />
          <form
            onSubmit={handleSubmit}
            className="relative w-[94%] max-w-3xl rounded-2xl bg-white shadow-2xl border border-[#E7C9CD] overflow-hidden"
          >
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-[#F0E3E5]">
              <div className="text-base font-semibold text-[#2B2B2B]">
                {form.id ? '編輯關鍵字規則' : '建立關鍵字規則'}
              </div>
              <div className="mt-1 text-sm text-[#6B6B6B]">設定這個關鍵字收到後要回覆什麼內容。</div>
            </div>

            <div className="p-6 grid gap-4 md:grid-cols-2">
              <Field label="規則名稱" value={form.name} onChange={(v: string) => setForm({ ...form, name: v })} placeholder="例如：優惠自動回覆" />

              {/* Tag input for keywords */}
              <div className="block space-y-2">
                <div className="text-sm font-medium text-[#2B2B2B]">
                  關鍵字
                  <span className="ml-1.5 text-xs font-normal text-[#AAAAAA]">（Enter 或逗號新增，每筆最多 {MAX_KEYWORD_LEN} 字）</span>
                </div>
                <div
                  className="min-h-[44px] w-full rounded-xl border border-[#E7C9CD] px-3 py-2 flex flex-wrap gap-1.5 items-center focus-within:border-[#A35D5D] focus-within:ring-2 focus-within:ring-[#A35D5D]/15 transition cursor-text"
                  onClick={(e) => (e.currentTarget.querySelector('input') as HTMLInputElement)?.focus()}
                >
                  {form.keywords.map((kw) => (
                    <span key={kw} className="inline-flex items-center gap-1 rounded-md bg-[#4A4A4A] text-white text-xs font-medium px-2 py-0.5">
                      {kw}
                      <button type="button" onClick={() => removeKeyword(kw)} className="opacity-70 hover:opacity-100 transition-opacity">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                      </button>
                    </span>
                  ))}
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    onBlur={() => commitTagInput(tagInput)}
                    placeholder={form.keywords.length === 0 ? '輸入關鍵字後按 Enter…' : ''}
                    className="flex-1 min-w-[120px] bg-transparent text-sm text-[#2B2B2B] placeholder-[#AAAAAA] outline-none"
                  />
                </div>
                <p className="text-xs text-[#AAAAAA]">每筆關鍵字的字數上限為 {MAX_KEYWORD_LEN} 個字。</p>
              </div>

              <label className="block space-y-2">
                <div className="text-sm font-medium text-[#2B2B2B]">匹配方式</div>
                <GlassSelect
                  size="lg"
                  className="w-full"
                  rounded="rounded-xl"
                  value={form.match_type}
                  onChange={(val) => setForm({ ...form, match_type: val as any })}
                  options={[{value:"exact",label:"完全"},{value:"contains",label:"包含（保留結構）"}]}
                />
              </label>

              <div className="md:col-span-2 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-[#2B2B2B]">
                    選擇草稿
                    <span className="ml-1.5 text-xs font-normal text-[#AAAAAA]">（最多 {MAX_DRAFTS} 個）</span>
                  </div>
                  <span className="text-xs text-[#AAAAAA] tabular-nums">{form.draft_ids.length} / {MAX_DRAFTS}</span>
                </div>

                {/* Added drafts list */}
                {form.draft_ids.length > 0 && (
                  <ul className="space-y-1.5">
                    {form.draft_ids.map((id, idx) => {
                      const d = drafts.find((x) => x.id === id);
                      const title = d?.content?.title || d?.title || id;
                      return (
                        <li key={id} className="flex items-center gap-2 rounded-xl border border-[#E7C9CD] bg-[#FFF7F8] px-3 py-2">
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#A35D5D] text-white text-xs font-bold flex items-center justify-center">{idx + 1}</span>
                          <span className="flex-1 text-sm text-[#2B2B2B] truncate">{title}</span>
                          {d?.content?.quickReply?.items?.length > 0 && (
                            <span className="flex-shrink-0 text-xs text-[#A35D5D] bg-[#FBEBEE] rounded-full px-2 py-0.5">
                              QR×{d.content.quickReply.items.length}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveDraft(id)}
                            className="flex-shrink-0 text-[#AAAAAA] hover:text-[#A35D5D] transition-colors p-0.5"
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

                {/* Add draft row */}
                {form.draft_ids.length < MAX_DRAFTS && (
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

                {form.draft_ids.length === 0 && (
                  <p className="text-xs text-[#AAAAAA]">請選擇草稿後點選「新增」</p>
                )}
              </div>

              <label className="inline-flex items-center gap-3 text-sm text-[#555555] md:col-span-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_enabled}
                  onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })}
                  className="rounded border-[#E7C9CD] text-[#A35D5D] focus:ring-[#A35D5D]"
                />
                儲存後立即啟用
              </label>

              {msg && (
                <div className="md:col-span-2 rounded-xl bg-red-50 text-red-600 border border-red-200 px-4 py-3 text-sm">
                  {msg}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-[#F0E3E5] bg-[#FFF7F8]/50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm text-[#555555] hover:bg-[#F5F5F5] rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                disabled={busy}
                className="px-5 py-2 text-sm font-semibold text-white bg-[#A35D5D] hover:bg-[#8F4A4A] rounded-xl transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? '儲存中...' : form.id ? '更新規則' : '建立規則'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal
        open={!!deleteId}
        title="刪除關鍵字規則"
        description="刪除後將無法再透過這組關鍵字觸發自動回覆。"
        confirmText="刪除"
        danger
        onClose={() => setDeleteId(null)}
        onConfirm={async () => {
          if (!deleteId) return;
          await deleteKeywordRule(deleteId);
          setDeleteId(null);
          await load();
        }}
      />
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: any) {
  return (
    <label className="block space-y-2">
      <div className="text-sm font-medium text-[#2B2B2B]">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-[#E7C9CD] px-4 py-2.5 text-sm text-[#2B2B2B] placeholder-[#AAAAAA] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition"
      />
    </label>
  );
}
