import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { hasChannel } from '@/lib/channel';

const items = [
  { to: '/drafts', label: '訊息管理' },
  { to: '/rich-menus', label: '圖文選單' },
  { to: '/campaigns', label: '推播設定' },
  { to: '/keywords', label: '自動回應訊息' },
];

export default function AppShell() {
  const nav = useNavigate();
  const location = useLocation();
  const [checkingChannel, setCheckingChannel] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const isEditRoute = /^\/drafts\/[^/]+\/edit$/.test(location.pathname) || /^\/rich-menus\/[^/]+\/edit$/.test(location.pathname);

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
    return <div className="min-h-screen bg-[#FCF7F8] flex items-center justify-center text-[#6B6B6B]">載入品牌設定中...</div>;
  }

  return (
    <div className="min-h-screen bg-[#FCF7F8] flex">
      {/* Sidebar */}
      {sidebarOpen ? (
        <aside className="hidden md:flex md:w-60 bg-white flex-col border-r border-[#EFEFEF] shrink-0">
          <div className="px-5 py-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-[#A35D5D] flex items-center justify-center shrink-0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
              <div className="text-sm font-semibold text-[#1A1A1A] tracking-tight">GentlerDigit</div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="text-[#AAAAAA] hover:text-[#A35D5D] transition p-1.5 rounded-lg hover:bg-[#F6D9DD]" title="收起側欄">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
          </div>

          <nav className="px-3 space-y-0.5 flex-1">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `flex items-center rounded-lg px-3 py-2.5 transition-colors text-sm ${isActive ? 'bg-[#FBEBEE] text-[#A35D5D] font-medium' : 'text-[#555555] hover:bg-[#F6F6F6] hover:text-[#1A1A1A]'}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="p-3 border-t border-[#F0F0F0] space-y-0.5">
            <button onClick={() => nav('/settings')} className="w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-[#555555] hover:bg-[#F6F6F6] hover:text-[#1A1A1A] transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
              LINE 設定
            </button>
            <button onClick={handleLogout} className="w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-[#555555] hover:bg-[#F6F6F6] hover:text-[#1A1A1A] transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              登出
            </button>
          </div>
        </aside>
      ) : (
        <aside className="hidden md:flex md:w-12 bg-white flex-col border-r border-[#EFEFEF] shrink-0 items-center py-4 gap-4">
          <button onClick={() => setSidebarOpen(true)} className="text-[#AAAAAA] hover:text-[#A35D5D] transition p-1.5 rounded-lg hover:bg-[#F6F6F6]" title="展開側欄">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
        </aside>
      )}

      <div className="flex-1 min-w-0">
        {!isEditRoute && (
          <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[#EFEFEF] px-4 md:px-6 py-3 flex items-center gap-2">
            <div className="flex-1 flex items-center">
              {(() => {
                const crumbs: { parent: string; child: string } | { single: string } =
                  location.pathname.startsWith('/drafts')
                    ? { parent: '訊息管理', child: '草稿內容中心' }
                    : location.pathname.startsWith('/rich-menus')
                    ? { parent: '圖文選單', child: '多層圖文選單管理' }
                    : location.pathname.startsWith('/campaigns')
                    ? { parent: '推播設定', child: '推播發送中心' }
                    : location.pathname.startsWith('/keywords')
                    ? { parent: '自動回應訊息', child: '關鍵字規則中心' }
                    : { single: 'LINE Channel 設定' };

                if ('single' in crumbs) {
                  return <span className="text-base font-semibold text-[#2B2B2B]">{crumbs.single}</span>;
                }
                return (
                  <nav className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-[#6B6B6B]">{crumbs.parent}</span>
                    <svg className="w-3.5 h-3.5 text-[#E8A4A9] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
                    </svg>
                    <span className="text-base font-semibold text-[#2B2B2B]">{crumbs.child}</span>
                  </nav>
                );
              })()}
            </div>
            <div className="md:hidden flex gap-2 overflow-auto">
              {items.map(item => (
                <NavLink key={item.to} to={item.to} className={({isActive}) => `whitespace-nowrap rounded-full px-3 py-2 text-sm ${isActive ? 'bg-[#FBEBEE] text-[#A35D5D]' : 'bg-[#FFF7F8] text-[#6B6B6B]'}`}>
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
