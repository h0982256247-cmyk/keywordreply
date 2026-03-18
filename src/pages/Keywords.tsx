import React, { useEffect, useMemo, useState } from 'react';
import GlassSelect from "@/components/GlassSelect";
import ConfirmModal from '@/components/ConfirmModal';
import { listDocs } from '@/lib/db';
import { deleteKeywordRule, listKeywordRules, reorderKeywordRules, upsertKeywordRule, type KeywordRule } from '@/lib/keywords';

type FormState = {
  id?: string;
  name: string;
  keyword: string;
  match_type: 'exact' | 'contains';
  priority: number;
  reply_mode: 'text' | 'draft';
  reply_text: string;
  draft_id: string;
  is_enabled: boolean;
};

const emptyForm: FormState = {
  name: '',
  keyword: '',
  match_type: 'exact',
  priority: 1,
  reply_mode: 'draft',
  reply_text: '',
  draft_id: '',
  is_enabled: true,
};

export default function Keywords() {
  const [drafts, setDrafts] = useState<any[]>([]);
  const [rows, setRows] = useState<KeywordRule[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
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
    setMsg(null);
    setOpen(true);
  }

  function openEdit(row: KeywordRule) {
    setForm({
      id: row.id,
      name: row.name || row.keyword,
      keyword: row.keyword,
      match_type: row.match_type,
      priority: row.priority,
      reply_mode: row.reply_mode,
      reply_text: row.reply_text || '',
      draft_id: row.draft_id || '',
      is_enabled: row.is_enabled,
    });
    setMsg(null);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await upsertKeywordRule({ ...form, name: form.name || form.keyword } as any);
      setOpen(false);
      setForm(emptyForm);
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

  const currentDraft = drafts.find((draft) => draft.id === form.draft_id);

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-3xl border border-neutral-200 p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-stone-900">自動回應</h2>
            <div className="mt-6">
              <div className="text-xl font-semibold text-stone-900">關鍵字規則</div>
              <div className="mt-2 text-stone-500">{usageCount} keywords rules / 200 keyword rules</div>
              <div className="mt-2 text-xs text-stone-400">支援拖曳排序，或使用上下移動按鈕快速調整優先順序。{savingOrder ? ' 目前正在儲存排序...' : ''}</div>
            </div>
          </div>
          <button onClick={openCreate} className="rounded-2xl bg-pink-400 text-white px-5 py-3 font-medium shadow-sm hover:bg-pink-500">＋ 建立關鍵字規則</button>
        </div>
      </section>

      <section className="bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50 text-stone-500">
              <tr>
                <th className="px-6 py-4 text-left font-medium">排序</th>
                <th className="px-6 py-4 text-left font-medium">規則名稱</th>
                <th className="px-6 py-4 text-left font-medium">匹配</th>
                <th className="px-6 py-4 text-left font-medium">關鍵字</th>
                <th className="px-6 py-4 text-left font-medium">參與</th>
                <th className="px-6 py-4 text-left font-medium">狀態</th>
                <th className="px-6 py-4 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-10 text-center text-stone-400">尚未建立關鍵字規則</td></tr>
              ) : rows.map((row, index) => (
                <tr key={row.id} className="hover:bg-neutral-50/80">
                  <td className="px-6 py-5 text-stone-700">{index + 1}</td>
                  <td className="px-6 py-5 font-semibold text-pink-600">{row.name || row.keyword}</td>
                  <td className="px-6 py-5 text-stone-600">{row.match_type === 'exact' ? '完全' : '包含'}</td>
                  <td className="px-6 py-5 text-stone-700">{row.keyword}</td>
                  <td className="px-6 py-5 text-stone-600">1</td>
                  <td className="px-6 py-5">
                    <button onClick={() => toggleEnabled(row)} className={`rounded-full px-4 py-2 text-sm font-medium ${row.is_enabled ? 'bg-pink-100 text-pink-700' : 'bg-neutral-100 text-stone-500'}`}>
                      {row.is_enabled ? '使用中' : '已停用'}
                    </button>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button onClick={() => openEdit(row)} className="rounded-xl border border-stone-300 px-3 py-2 text-stone-600">編輯</button>
                      <button onClick={() => setDeleteId(row.id)} className="rounded-xl border border-red-200 px-3 py-2 text-red-600">刪除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {open && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center">
          <div className="absolute inset-0 bg-stone-950/40" onClick={() => !busy && setOpen(false)} />
          <form onSubmit={handleSubmit} className="relative w-[94%] max-w-3xl rounded-3xl bg-white shadow-2xl border border-neutral-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-neutral-200">
              <div className="text-xl font-bold text-stone-900">{form.id ? '編輯關鍵字規則' : '建立關鍵字規則'}</div>
              <div className="mt-1 text-sm text-stone-500">設定這個關鍵字收到後要回覆什麼內容。V1 先以完全符合為主。</div>
            </div>
            <div className="p-6 grid gap-4 md:grid-cols-2">
              <Field label="規則名稱" value={form.name} onChange={(v: string) => setForm({ ...form, name: v })} placeholder="例如：優惠自動回覆" />
              <Field label="關鍵字" value={form.keyword} onChange={(v: string) => setForm({ ...form, keyword: v })} placeholder="例如：優惠" />
              <label className="block space-y-2">
                <div className="text-sm font-medium text-stone-700">匹配方式</div>
                <GlassSelect
                  size="lg"
                  className="w-full"
                  rounded="rounded-2xl"
                  value={form.match_type}
                  onChange={(val) => setForm({ ...form, match_type: val as any })}
                  options={[{value:"exact",label:"完全"},{value:"contains",label:"包含（保留結構）"}]}
                />
              </label>
              <Field label="排序 priority" value={String(form.priority)} onChange={(v: string) => setForm({ ...form, priority: Number(v || 1) })} placeholder="1" />
              <label className="block space-y-2 md:col-span-2">
                <div className="text-sm font-medium text-stone-700">回覆方式</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <button type="button" onClick={() => setForm({ ...form, reply_mode: 'text' })} className={`rounded-2xl border px-4 py-4 text-left ${form.reply_mode === 'text' ? 'border-pink-500 bg-pink-50' : 'border-neutral-200 bg-white'}`}>
                    <div className="font-semibold text-stone-900">純文字</div>
                    <div className="text-sm text-stone-500 mt-1">適合地址、電話、FAQ</div>
                  </button>
                  <button type="button" onClick={() => setForm({ ...form, reply_mode: 'draft' })} className={`rounded-2xl border px-4 py-4 text-left ${form.reply_mode === 'draft' ? 'border-pink-500 bg-pink-50' : 'border-neutral-200 bg-white'}`}>
                    <div className="font-semibold text-stone-900">選擇草稿</div>
                    <div className="text-sm text-stone-500 mt-1">連動單卡、多頁或影片 Bubble</div>
                  </button>
                </div>
              </label>

              {form.reply_mode === 'text' ? (
                <label className="block space-y-2 md:col-span-2">
                  <div className="text-sm font-medium text-stone-700">文字內容</div>
                  <textarea rows={5} value={form.reply_text} onChange={(e) => setForm({ ...form, reply_text: e.target.value })} className="w-full rounded-2xl border border-stone-300 px-4 py-3" placeholder="輸入收到關鍵字後要回覆的文字" />
                </label>
              ) : (
                <>
                  <label className="block space-y-2 md:col-span-2">
                    <div className="text-sm font-medium text-stone-700">選擇草稿</div>
                    <GlassSelect
                      size="lg"
                      className="w-full"
                      rounded="rounded-2xl"
                      value={form.draft_id}
                      onChange={(val) => setForm({ ...form, draft_id: val })}
                      options={[{value:"",label:"請選擇草稿"},...drafts.map(d => ({value:d.id,label:d.title}))]}
                    />
                  </label>
                  {currentDraft && (
                    <div className="md:col-span-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                      <div className="text-sm text-stone-500">已選擇內容</div>
                      <div className="mt-2 font-semibold text-stone-900">{currentDraft.title}</div>
                      <div className="mt-1 text-sm text-stone-500">類型：{currentDraft.content?.type === 'carousel' ? '多卡滑動訊息' : '單卡 / 影片卡片訊息'}</div>
                      {!!currentDraft.content?.quickReply?.items?.length && (
                        <div className="mt-2 inline-flex rounded-full bg-pink-100 px-3 py-1 text-xs font-medium text-pink-600">包含 {currentDraft.content.quickReply.items.length} 個 Quick Reply</div>
                      )}
                    </div>
                  )}
                </>
              )}

              <label className="inline-flex items-center gap-3 text-sm text-stone-700 md:col-span-2"><input type="checkbox" checked={form.is_enabled} onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })} /> 儲存後立即啟用</label>
              {msg && <div className="md:col-span-2 rounded-2xl bg-red-50 text-red-600 px-4 py-3 text-sm">{msg}</div>}
            </div>
            <div className="px-6 py-5 border-t border-neutral-200 flex justify-end gap-3">
              <button type="button" onClick={() => setOpen(false)} className="rounded-2xl border border-stone-300 px-4 py-3 text-stone-600">取消</button>
              <button disabled={busy} className="rounded-2xl bg-pink-400 hover:bg-pink-500 text-white px-5 py-3 font-medium disabled:opacity-60 transition-colors">{busy ? '儲存中...' : form.id ? '更新規則' : '建立規則'}</button>
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
      <div className="text-sm font-medium text-stone-700">{label}</div>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-2xl border border-stone-300 px-4 py-3" />
    </label>
  );
}
