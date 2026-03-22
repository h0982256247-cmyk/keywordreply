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
  const [hasChannel, setHasChannel] = useState(false);

  useEffect(() => {
    (async () => {
      const channel = await getChannel();
      if (channel) {
        setChannelName(channel.name);
        setChannelId((channel as any).channel_id || '');
        setChannelSecret((channel as any).channel_secret_masked || '');
        setHasChannel(true);
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
      <div className="bg-white rounded-2xl border border-[#E7C9CD] p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-[#2B2B2B]">LINE Channel 設定</h2>
        <p className="mt-2 text-sm text-[#6B6B6B]">第一次登入請先完成這一頁，儲存成功後會自動進入系統；下次登入會直接進入主系統。</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-[#E7C9CD] p-6 shadow-sm space-y-5">
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Channel 名稱" value={channelName} onChange={setChannelName} placeholder="例如：品牌客服 OA" disabled={hasChannel} />
          <Field label="Channel ID" value={channelId} onChange={setChannelId} placeholder="LINE Developers 的 Channel ID" disabled={hasChannel} />
          <Field label="Channel Secret" value={channelSecret} onChange={setChannelSecret} placeholder="貼上 Channel Secret" type="password" disabled={hasChannel} />
          <Field label="Channel Access Token" value={accessToken} onChange={setAccessToken} placeholder="貼上長期 Access Token" type="password" disabled={hasChannel} />
        </div>

        <div className="rounded-xl bg-[#FFF7F8] border border-[#E7C9CD] p-4">
          <div className="text-sm font-semibold text-[#2B2B2B]">Webhook URL</div>
          <div className="mt-2 flex flex-col md:flex-row gap-3 md:items-center">
            <code className="flex-1 rounded-xl bg-[#2B2B2B] text-stone-100 px-4 py-3 text-xs overflow-auto">{webhookUrl}</code>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(webhookUrl)}
              className="rounded-xl px-4 py-3 bg-[#A35D5D] hover:bg-[#8F4A4A] text-white text-sm font-medium transition-colors"
            >
              複製
            </button>
          </div>
          <p className="mt-2 text-xs text-[#6B6B6B]">到 LINE Developers &gt; Messaging API 貼上這組 URL，開啟 webhook 後即可使用關鍵字自動回覆。</p>
        </div>

        {msg && (
          <div className={`text-sm rounded-xl px-4 py-3 border ${
            msg.includes('成功') || msg.includes('完成')
              ? 'bg-[#EAF4ED] text-[#4E735D] border-[#B8D9C4]'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}>
            {msg}
          </div>
        )}

        {!hasChannel && (
          <button
            disabled={loading}
            className="rounded-xl bg-[#A35D5D] hover:bg-[#8F4A4A] text-white px-5 py-2.5 text-sm font-semibold shadow-sm disabled:opacity-60 transition-colors"
          >
            {loading ? '儲存中...' : '儲存設定'}
          </button>
        )}
      </form>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text', disabled = false }: any) {
  return (
    <label className="block space-y-2">
      <div className={`text-sm font-medium ${disabled ? 'text-[#AAAAAA]' : 'text-[#2B2B2B]'}`}>{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        disabled={disabled}
        className={`w-full rounded-xl border px-4 py-2.5 text-sm placeholder-[#AAAAAA] outline-none transition ${
          disabled
            ? 'border-[#E7C9CD] bg-[#F5F5F5] text-[#AAAAAA] cursor-not-allowed'
            : 'border-[#E7C9CD] bg-white text-[#2B2B2B] focus:border-[#A35D5D] focus:ring-2 focus:ring-[#A35D5D]/15'
        }`}
      />
    </label>
  );
}
