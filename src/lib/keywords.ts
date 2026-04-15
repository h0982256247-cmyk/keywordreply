import { supabase } from './supabase';
import { requireUser } from './db';

export type KeywordRule = {
  id: string;
  user_id: string;
  name?: string | null;
  keyword: string;
  keywords?: string[] | null;
  match_type: 'exact' | 'contains';
  priority: number;
  reply_mode: 'text' | 'draft';
  reply_text: string | null;
  draft_id: string | null;
  draft_ids?: string[] | null;
  tag_ids?: string[] | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  doc_title?: string | null;
};

export async function listKeywordRules(): Promise<KeywordRule[]> {
  const user = await requireUser();
  const { data, error } = await supabase
    .from('keyword_rules')
    .select('*, docs:draft_id(title)')
    .eq('user_id', user.id)
    .order('priority', { ascending: true })
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row: any) => ({ ...row, doc_title: row.docs?.title || null }));
}

export async function upsertKeywordRule(payload: Partial<KeywordRule> & { keyword?: string; keywords?: string[] | null; reply_mode: 'text' | 'draft' }) {
  const user = await requireUser();

  // Resolve keywords array
  const keywords: string[] =
    payload.keywords && payload.keywords.length > 0
      ? payload.keywords
      : payload.keyword ? [payload.keyword] : [];
  const primaryKeyword = keywords[0] ?? '';

  // Resolve draft_ids array
  const draftIds: string[] =
    payload.reply_mode === 'draft'
      ? (payload.draft_ids && payload.draft_ids.length > 0
          ? payload.draft_ids
          : payload.draft_id ? [payload.draft_id] : [])
      : [];
  const primaryDraftId = draftIds[0] ?? null;

  const body = {
    user_id: user.id,
    name: ((payload.name || primaryKeyword) as string).trim(),
    keyword: primaryKeyword,
    keywords,
    match_type: payload.match_type || 'exact',
    priority: payload.priority || 100,
    reply_mode: payload.reply_mode,
    reply_text: payload.reply_mode === 'text' ? (payload.reply_text || '') : null,
    draft_id: primaryDraftId,
    draft_ids: payload.reply_mode === 'draft' ? draftIds : null,
    tag_ids: (payload as any).tag_ids || [],
    is_enabled: payload.is_enabled ?? true,
  };

  if (payload.id) {
    const { error } = await supabase.from('keyword_rules').update(body).eq('id', payload.id).eq('user_id', user.id);
    if (error) throw error;
    return payload.id;
  }

  const { data, error } = await supabase.from('keyword_rules').insert(body).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteKeywordRule(id: string) {
  const user = await requireUser();
  const { error } = await supabase.from('keyword_rules').delete().eq('id', id).eq('user_id', user.id);
  if (error) throw error;
}

export async function reorderKeywordRules(ids: string[]) {
  const user = await requireUser();
  await Promise.all(ids.map((id, index) =>
    supabase.from('keyword_rules').update({ priority: index + 1 }).eq('id', id).eq('user_id', user.id)
  ));
}
