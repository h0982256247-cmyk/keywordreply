import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { hasChannel } from '@/lib/channel';

const items = [
  { to: '/drafts', label: '訊息管理' },
  { to: '/campaigns', label: '推播設定' },
  { to: '/keywords', label: '自動回應訊息' },
];

export default function AppShell() {
  const nav = useNavigate();
  const location = useLocation();
  const [checkingChannel, setCheckingChannel] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const isEditRoute = /^\/drafts\/[^/]+\/edit$/.test(location.pathname);

  useEffect(() => {
    let active = true;

    // 監聽跨分頁的登入狀態變化（多分頁 token 衝突時自動跳回登入頁）
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'SIGNED_OUT' || !session) {
        nav('/');
      }
    });

    (async () => {
      try {
        // 5 秒逾時保護，避免 token 衝突時永久卡住
        const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000));
        const bound = await Promise.race([hasChannel(), timeout]);
        if (!active) return;
        if (!bound && !location.pathname.startsWith('/settings')) {
          nav('/settings', { replace: true });
        }
      } catch {
        // 發生錯誤時正常繼續，不卡住
      } finally {
        if (active) setCheckingChannel(false);
      }
    })();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [location.pathname, nav]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    nav('/');
  };

  if (checkingChannel) {
    return <div className="min-h-screen bg-neutral-50 flex items-center justify-center text-stone-500">載入品牌設定中...</div>;
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex">
      {/* Sidebar */}
      {sidebarOpen ? (
        <aside className="hidden md:flex md:w-64 bg-stone-900 text-white flex-col border-r border-stone-800 shrink-0">
          <div className="px-5 py-4 border-b border-stone-800 flex items-center justify-between">
            <div className="text-xl font-bold">ROAR</div>
            <button onClick={() => setSidebarOpen(false)} className="text-stone-400 hover:text-white transition p-1 rounded-lg hover:bg-stone-800" title="收起側欄">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
          </div>

          <nav className="p-4 space-y-2 flex-1">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `block rounded-2xl px-4 py-4 transition ${isActive ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-200 hover:bg-stone-800'}`}
              >
                <div className="font-semibold">{item.label}</div>
              </NavLink>
            ))}
          </nav>

          <div className="p-4 border-t border-stone-800">
            <button onClick={() => nav('/settings')} className="w-full mb-2 rounded-xl border border-stone-700 px-4 py-3 text-left hover:bg-stone-800 transition">
              <div className="font-medium">LINE 設定</div>
            </button>
            <button onClick={handleLogout} className="w-full rounded-xl bg-stone-800 px-4 py-3 text-left hover:bg-stone-700 transition">
              登出
            </button>
          </div>
        </aside>
      ) : (
        <aside className="hidden md:flex md:w-12 bg-stone-900 text-white flex-col border-r border-stone-800 shrink-0 items-center py-4 gap-4">
          <button onClick={() => setSidebarOpen(true)} className="text-stone-400 hover:text-white transition p-1 rounded-lg hover:bg-stone-800" title="展開側欄">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
        </aside>
      )}

      <div className="flex-1 min-w-0">
        {!isEditRoute && (
          <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-neutral-200 px-4 md:px-6 py-4 flex items-center gap-2">
            <div className="flex-1 flex items-center">
              <div className="text-xl font-bold text-stone-900 leading-none">
                {location.pathname.startsWith('/drafts') ? '訊息管理 > 草稿內容中心' : location.pathname.startsWith('/campaigns') ? '推播設定 > 推播發送中心' : location.pathname.startsWith('/keywords') ? '自動回應訊息 > 關鍵字規則中心' : 'LINE Channel 設定'}
              </div>
            </div>
            <div className="md:hidden flex gap-2 overflow-auto">
              {items.map(item => (
                <NavLink key={item.to} to={item.to} className={({isActive}) => `whitespace-nowrap rounded-full px-3 py-2 text-sm ${isActive ? 'bg-stone-900 text-white' : 'bg-neutral-100 text-stone-600'}`}>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </header>
        )}

        <main className={isEditRoute ? "" : "p-4 md:p-8"}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
