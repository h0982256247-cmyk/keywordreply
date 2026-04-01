import { buildFlex } from '@/lib/buildFlex';
import { DocModel, QuickReplyConfig } from '@/lib/types';

export type LineMessageObject =
  | { type: 'text'; text: string; quickReply?: any }
  | { type: 'flex'; altText: string; contents: any; quickReply?: any }
  | { type: 'imagemap'; baseUrl: string; altText: string; baseSize: any; actions: any[] };

export function buildQuickReply(config?: QuickReplyConfig | null) {
  const items = (config?.items || [])
    .filter((item) => item?.action?.label && ((item.action.type === 'message' && item.action.text) || (item.action.type === 'uri' && item.action.uri)))
    .slice(0, 13)
    .map((item) => ({
      type: 'action',
      action: item.action.type === 'message'
        ? { type: 'message', label: item.action.label, text: item.action.text }
        : { type: 'uri', label: item.action.label, uri: item.action.uri },
    }));

  return items.length ? { items } : undefined;
}

export function buildMessagesFromDoc(doc: DocModel, options?: { includeQuickReply?: boolean; docId?: string }): LineMessageObject[] {
  if (doc.type === 'folder') {
    throw new Error('資料夾不能作為發送內容');
  }

  const quickReply = options?.includeQuickReply === false ? undefined : buildQuickReply((doc as any).quickReply);

  if (doc.type === 'text') {
    return [{
      type: 'text',
      text: doc.text,
      ...(quickReply ? { quickReply } : {}),
    }];
  }

  if (doc.type === 'imagemap') {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const baseUrl = `${supabaseUrl}/functions/v1/serve-imagemap/${options?.docId || ''}`;
    return [{
      type: 'imagemap',
      baseUrl,
      altText: (doc.altText || doc.title || '熱區圖片').slice(0, 400),
      baseSize: doc.baseSize,
      actions: doc.areas.map(area => ({
        type: area.action.type === 'uri' ? 'uri' : 'message',
        area: area.bounds,
        ...(area.action.type === 'uri'
          ? { linkUri: area.action.linkUri }
          : { text: area.action.text }),
      })),
    }];
  }

  const flexMsg = buildFlex(doc);
  return [{
    type: 'flex',
    altText: (doc.title || 'LINE 訊息').slice(0, 400),
    contents: flexMsg.contents,
    ...(quickReply ? { quickReply } : {}),
  }];
}
