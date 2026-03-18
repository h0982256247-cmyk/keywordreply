import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getChannel, upsertChannel, validateAccessToken } from '@/lib/channel';

export default function Settings() {
  const nav = useNavigate();
  const [channelName, setChannelName] = useState('My LINE Channel');
  const [channelId, setChannelId] = useState('');
  const [channelSecret, setChannelSecret] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const channel = await getChannel();
      if (channel) {
        setChannelName(channel.name);
        setChannelId((channel as any).channel_id || '');
        setChannelSecret((channel as any).channel_secret_masked || '');
      }
    })();
  }, []);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/line-webhook`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const validation = await validateAccessToken(accessToken);
      if (!validation.valid) throw new Error(validation.error || 'Token 驗證失敗');
      await upsertChannel(channelName, accessToken, channelId, channelSecret, validation.botUserId);
      setMsg('LINE Channel 已更新完成，正在進入系統...');
      setAccessToken('');
      setChannelSecret('');
      setTimeout(() => nav('/drafts'), 600);
    } catch (e: any) {
      setMsg(e.message || '儲存失敗');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="bg-white rounded-3xl border border-neutral-200 p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-stone-900">LINE Channel 設定</h2>
        <p className="mt-2 text-stone-500">第一次登入請先完成這一頁，儲存成功後會自動進入系統；下次登入會直接進入主系統。</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-3xl border border-neutral-200 p-6 shadow-sm space-y-5">
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Channel 名稱" value={channelName} onChange={setChannelName} placeholder="例如：品牌客服 OA" />
          <Field label="Channel ID" value={channelId} onChange={setChannelId} placeholder="LINE Developers 的 Channel ID" />
          <Field label="Channel Secret" value={channelSecret} onChange={setChannelSecret} placeholder="貼上 Channel Secret" type="password" />
          <Field label="Channel Access Token" value={accessToken} onChange={setAccessToken} placeholder="貼上長期 Access Token" type="password" />
        </div>

        <div className="rounded-2xl bg-neutral-50 border border-neutral-200 p-4">
          <div className="text-sm font-semibold text-stone-700">Webhook URL</div>
          <div className="mt-2 flex flex-col md:flex-row gap-3 md:items-center">
            <code className="flex-1 rounded-xl bg-stone-900 text-stone-100 px-4 py-3 text-xs overflow-auto">{webhookUrl}</code>
            <button type="button" onClick={() => navigator.clipboard.writeText(webhookUrl)} className="rounded-xl px-4 py-3 bg-stone-900 text-white">複製</button>
          </div>
          <p className="mt-2 text-xs text-stone-500">到 LINE Developers &gt; Messaging API 貼上這組 URL，開啟 webhook 後即可使用關鍵字自動回覆。</p>
        </div>

        {msg && <div className="text-sm text-stone-600 bg-neutral-50 rounded-xl px-4 py-3">{msg}</div>}

        <button disabled={loading} className="rounded-2xl bg-pink-600 text-white px-5 py-3 font-medium disabled:opacity-60">{loading ? '儲存中...' : '儲存設定'}</button>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }: any) {
  return (
    <label className="block space-y-2">
      <div className="text-sm font-medium text-stone-700">{label}</div>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type={type} className="w-full rounded-2xl border border-stone-300 px-4 py-3 outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-100" />
    </label>
  );
}
