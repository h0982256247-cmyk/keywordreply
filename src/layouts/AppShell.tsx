import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { hasChannel } from '@/lib/channel';

// ── Nav icons ──────────────────────────────────────────────────────────────────
const IconMessage = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);
const IconPanel = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
  </svg>
);
const IconSend = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);
const IconBot = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><line x1="12" y1="7" x2="12" y2="11"/>
    <line x1="8" y1="15" x2="8" y2="15" strokeWidth="2.5"/><line x1="12" y1="15" x2="12" y2="15" strokeWidth="2.5"/><line x1="16" y1="15" x2="16" y2="15" strokeWidth="2.5"/>
  </svg>
);
const IconSettings = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>
  </svg>
);
const IconLogout = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

// ── Nav items ──────────────────────────────────────────────────────────────────
const items = [
  { to: '/drafts',    label: '訊息管理',    desc: '管理訊息草稿與範本',  icon: <IconMessage /> },
  { to: '/rich-menus', label: '圖文選單',  desc: '設計多層互動圖文選單', icon: <IconPanel /> },
  { to: '/campaigns', label: '推播設定',   desc: '排程與群發推播訊息',   icon: <IconSend /> },
  { to: '/keywords',  label: '自動回應訊息', desc: '設定關鍵字觸發規則', icon: <IconBot /> },
];

// ── Page meta (for header) ─────────────────────────────────────────────────────
function usePageMeta(pathname: string) {
  if (pathname.startsWith('/drafts'))      return { label: '訊息管理',     desc: '管理訊息草稿與範本，建立多種類型的 LINE 訊息', icon: <IconMessage /> };
  if (pathname.startsWith('/rich-menus'))  return { label: '圖文選單',     desc: '設計多層互動圖文選單，支援熱區切換與動作設定', icon: <IconPanel /> };
  if (pathname.startsWith('/campaigns'))   return { label: '推播設定',     desc: '排程與群發推播訊息，精準觸及你的用戶',       icon: <IconSend /> };
  if (pathname.startsWith('/keywords'))    return { label: '自動回應訊息', desc: '設定關鍵字觸發規則，讓機器人自動回應',       icon: <IconBot /> };
  return { label: 'LINE 設定', desc: '連結 LINE Channel，設定 Webhook 與 Token', icon: <IconSettings /> };
}

export default function AppShell() {
  const nav = useNavigate();
  const location = useLocation();
  const [checkingChannel, setCheckingChannel] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const isEditRoute = /^\/rich-menus\/[^/]+\/edit$/.test(location.pathname);
  const isDraftEditRoute = /^\/drafts\/[^/]+\/(edit|imagemap)$/.test(location.pathname);
  const pageMeta = usePageMeta(location.pathname);

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'SIGNED_OUT' || !session) nav('/');
    });

    (async () => {
      try {
        const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000));
        const bound = await Promise.race([hasChannel(), timeout]);
        if (!active) return;
        if (!bound && !location.pathname.startsWith('/settings')) nav('/settings', { replace: true });
      } catch {
        // ignore
      } finally {
        if (active) setCheckingChannel(false);
      }
    })();

    return () => { active = false; subscription.unsubscribe(); };
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

      {/* ── Sidebar Expanded ── */}
      {sidebarOpen ? (
        <aside className="hidden md:flex md:w-60 bg-white flex-col border-r border-[#EFEFEF] shrink-0">
          {/* Logo */}
          <div className="px-5 py-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#A35D5D] flex items-center justify-center shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <span className="text-sm font-semibold text-[#1A1A1A] tracking-tight">LINE Boost</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-[#CCCCCC] hover:text-[#A35D5D] transition p-1.5 rounded-lg hover:bg-[#FFF0F1]"
              title="收起側欄"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 19l-7-7 7-7"/><path d="M21 12H4"/>
              </svg>
            </button>
          </div>

          {/* Nav */}
          <nav className="px-3 space-y-0.5 flex-1">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors text-sm font-medium
                  ${isActive
                    ? 'bg-[#FBEBEE] text-[#A35D5D]'
                    : 'text-[#666666] hover:bg-[#F6F6F6] hover:text-[#1A1A1A]'}`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={isActive ? 'text-[#A35D5D]' : 'text-[#AAAAAA]'}>
                      {item.icon}
                    </span>
                    {item.label}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Bottom */}
          <div className="p-3 border-t border-[#F0F0F0] space-y-0.5">
            <button
              onClick={() => nav('/settings')}
              className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#666666] hover:bg-[#F6F6F6] hover:text-[#1A1A1A] transition-colors"
            >
              <span className="text-[#AAAAAA]"><IconSettings /></span>
              LINE 設定
            </button>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#666666] hover:bg-[#FFF0F1] hover:text-[#B85C5C] transition-colors"
            >
              <span className="text-[#AAAAAA]"><IconLogout /></span>
              登出
            </button>
          </div>
        </aside>

      ) : (
        /* ── Sidebar Collapsed (icon-only) ── */
        <aside className="hidden md:flex md:w-14 bg-white flex-col border-r border-[#EFEFEF] shrink-0 items-center py-4 gap-1">
          {/* Logo icon */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-8 h-8 rounded-lg bg-[#A35D5D] flex items-center justify-center mb-3 hover:bg-[#8F4A4A] transition-colors"
            title="展開側欄"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </button>

          {/* Icon-only nav */}
          <nav className="flex flex-col items-center gap-1 flex-1">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                title={item.label}
                className={({ isActive }) =>
                  `w-9 h-9 flex items-center justify-center rounded-lg transition-colors
                  ${isActive
                    ? 'bg-[#FBEBEE] text-[#A35D5D]'
                    : 'text-[#BBBBBB] hover:bg-[#F6F6F6] hover:text-[#555555]'}`
                }
              >
                {item.icon}
              </NavLink>
            ))}
          </nav>

          {/* Bottom icons */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => nav('/settings')}
              title="LINE 設定"
              className="w-9 h-9 flex items-center justify-center rounded-lg text-[#BBBBBB] hover:bg-[#F6F6F6] hover:text-[#555555] transition-colors"
            >
              <IconSettings />
            </button>
            <button
              onClick={handleLogout}
              title="登出"
              className="w-9 h-9 flex items-center justify-center rounded-lg text-[#BBBBBB] hover:bg-[#FFF0F1] hover:text-[#B85C5C] transition-colors"
            >
              <IconLogout />
            </button>
          </div>
        </aside>
      )}

      {/* ── Main content ── */}
      <div className="flex-1 min-w-0">
        {!isEditRoute && (
          <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[#EFEFEF] px-4 md:px-6 py-3 flex items-center gap-4">
            {/* Page title + description */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[#FBEBEE] flex items-center justify-center shrink-0 text-[#A35D5D]">
                {pageMeta.icon}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[#1A1A1A] leading-tight">{pageMeta.label}</div>
                <div className="text-xs text-[#AAAAAA] leading-tight truncate hidden sm:block">{pageMeta.desc}</div>
              </div>
            </div>

            {/* Mobile nav tabs */}
            <div className="md:hidden flex gap-1.5 overflow-auto shrink-0">
              {items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium flex items-center gap-1.5
                    ${isActive ? 'bg-[#FBEBEE] text-[#A35D5D]' : 'bg-[#F5F5F5] text-[#6B6B6B]'}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className={isActive ? 'text-[#A35D5D]' : 'text-[#AAAAAA]'}>{item.icon}</span>
                      {item.label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </header>
        )}

        <main className={(isEditRoute || isDraftEditRoute) ? "" : "p-4 md:p-8"}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
