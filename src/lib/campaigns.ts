import { supabase } from './supabase';
import { requireUser, getDoc } from './db';
import { buildMessagesFromDoc } from './draftMessaging';
import { invokeEdgeFunction } from './edgeFunction';

export type BroadcastCampaign = {
  id: string;
  user_id: string;
  name: string;
  draft_id: string;
  status: 'draft' | 'sent' | 'failed';
  include_quick_reply: boolean;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  doc_title?: string | null;
};

export async function listCampaigns(): Promise<BroadcastCampaign[]> {
  const user = await requireUser();
  const { data, error } = await supabase
    .from('broadcast_campaigns')
    .select('*, docs:draft_id(title)')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row: any) => ({ ...row, doc_title: row.docs?.title || null }));
}

export async function saveCampaign(payload: { id?: string; name: string; draft_id: string; include_quick_reply?: boolean }) {
  const user = await requireUser();
  const body = { user_id: user.id, name: payload.name, draft_id: payload.draft_id, include_quick_reply: payload.include_quick_reply ?? true };
  if (payload.id) {
    const { error } = await supabase.from('broadcast_campaigns').update(body).eq('id', payload.id).eq('user_id', user.id);
    if (error) throw error;
    return payload.id;
  }
  const { data, error } = await supabase.from('broadcast_campaigns').insert(body).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteCampaign(id: string) {
  const user = await requireUser();
  const { error } = await supabase.from('broadcast_campaigns').delete().eq('id', id).eq('user_id', user.id);
  if (error) throw error;
}

export async function sendCampaign(id: string, options?: { includeQuickReply?: boolean }) {
  const user = await requireUser();
  const { data, error } = await supabase.from('broadcast_campaigns').select('*').eq('id', id).eq('user_id', user.id).single();
  if (error) throw error;
  const row: any = data;
  const docRow = await getDoc(row.draft_id);
  const messages = buildMessagesFromDoc(docRow.content, { includeQuickReply: options?.includeQuickReply ?? row.include_quick_reply ?? true });
  await invokeEdgeFunction('broadcast', { messages });
  const { error: updateError } = await supabase.from('broadcast_campaigns').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id);
  if (updateError) throw updateError;
}
