import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { hasChannel } from "@/lib/channel";

export default function Login() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState(() => localStorage.getItem("remembered_email") || "");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem("remembered_email"));
  const [authMsg, setAuthMsg] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const routeByChannelStatus = async () => {
      try {
        const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000));
        const bound = await Promise.race([hasChannel(), timeout]);
        if (!mounted) return;
        nav(bound ? "/drafts" : "/settings", { replace: true });
      } catch {
        if (mounted) nav("/settings", { replace: true });
      }
    };

    // 每次進入登入頁強制登出，確保每次都從表單重新輸入
    supabase.auth.signOut().finally(() => {
      if (mounted) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      if (!session) {
        setLoading(false);
        return;
      }
      // 登入成功後才路由
      await routeByChannelStatus();
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [nav]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setAuthMsg("請輸入 Email 和密碼");
      return;
    }

    setSubmitting(true);
    setAuthMsg(null);

    try {
      if (rememberMe) {
        localStorage.setItem("remembered_email", email);
      } else {
        localStorage.removeItem("remembered_email");
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err: any) {
      setAuthMsg(err?.message || "登入失敗");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-8 h-8 border-4 border-pink-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <div className="text-stone-500 font-medium">系統載入中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-pink-300 to-pink-600 rounded-2xl flex items-center justify-center shadow-lg shadow-pink-400/20 mb-6">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
              <path d="M21.99 12.06c0-5.7-4.93-10.31-10-10.31S2 6.36 2 12.06c0 5.1 4 9.35 8.89 10.16.34.07.8.22.92.51.1.25.07.62 0 1.05l-.18 1.09c-.05.32-.24 1.25 1.09.66s7.24-4.26 7.24-4.26a9.55 9.55 0 004.03-9.21z" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-stone-900">歡迎使用 ROAR</h2>
          <p className="mt-2 text-sm text-stone-600">請輸入您的帳號密碼以登入系統。首次登入會自動帶你到 LINE 設定頁完成綁定，下次登入則會直接進入主系統。</p>
        </div>

        <div className="bg-white py-8 px-4 shadow-xl shadow-neutral-200/50 sm:rounded-2xl sm:px-10 border border-neutral-100">
          <form onSubmit={handleAuth} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-stone-700 mb-2">Email 信箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="block w-full rounded-lg border border-stone-300 px-4 py-3 text-stone-900 placeholder-stone-400 focus:border-pink-500 focus:ring-pink-500 sm:text-sm transition-colors hover:border-stone-400"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-stone-700 mb-2">密碼</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="請輸入密碼"
                className="block w-full rounded-lg border border-stone-300 px-4 py-3 text-stone-900 placeholder-stone-400 focus:border-pink-500 focus:ring-pink-500 sm:text-sm transition-colors hover:border-stone-400"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-stone-300 text-pink-600 focus:ring-pink-500"
              />
              <label htmlFor="remember-me" className="text-sm text-stone-600">記住我</label>
            </div>

            {authMsg && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 whitespace-pre-wrap">
                {authMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex justify-center rounded-lg bg-pink-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-pink-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-600 disabled:opacity-60"
            >
              {submitting ? "登入中..." : "登入"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
