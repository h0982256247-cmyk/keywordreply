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

    supabase.auth.signOut().finally(() => {
      if (mounted) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      if (!session) { setLoading(false); return; }
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
    if (!email || !password) { setAuthMsg("請輸入 Email 和密碼"); return; }
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
      <div className="min-h-screen bg-[#FCF7F8] flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-8 h-8 border-4 border-[#A35D5D] border-t-transparent rounded-full animate-spin mb-4"></div>
          <div className="text-[#6B6B6B] font-medium text-sm">系統載入中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FCF7F8] flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        {/* Logo + Title */}
        <div className="text-center">
          <div className="mx-auto w-14 h-14 bg-[#A35D5D] rounded-2xl flex items-center justify-center shadow-lg shadow-[#A35D5D]/20 mb-6">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
              <path d="M21.99 12.06c0-5.7-4.93-10.31-10-10.31S2 6.36 2 12.06c0 5.1 4 9.35 8.89 10.16.34.07.8.22.92.51.1.25.07.62 0 1.05l-.18 1.09c-.05.32-.24 1.25 1.09.66s7.24-4.26 7.24-4.26a9.55 9.55 0 004.03-9.21z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-[#2B2B2B]">歡迎使用 LINE Boost</h2>
          <p className="mt-2 text-sm text-[#6B6B6B]">請輸入您的帳號密碼以登入系統。</p>
        </div>

        {/* Form Card */}
        <div className="bg-white py-8 px-6 shadow-xl shadow-[#E7C9CD]/30 rounded-2xl border border-[#E7C9CD]">
          <form onSubmit={handleAuth} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[#2B2B2B] mb-1.5">Email 信箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="block w-full rounded-xl border border-[#E7C9CD] px-4 py-2.5 text-sm text-[#2B2B2B] placeholder-[#AAAAAA] focus:border-[#A35D5D] focus:ring-2 focus:ring-[#A35D5D]/15 outline-none transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#2B2B2B] mb-1.5">密碼</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="請輸入密碼"
                className="block w-full rounded-xl border border-[#E7C9CD] px-4 py-2.5 text-sm text-[#2B2B2B] placeholder-[#AAAAAA] focus:border-[#A35D5D] focus:ring-2 focus:ring-[#A35D5D]/15 outline-none transition"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-[#E7C9CD] text-[#A35D5D] focus:ring-[#A35D5D]"
              />
              <label htmlFor="remember-me" className="text-sm text-[#555555]">記住我</label>
            </div>

            {authMsg && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {authMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex justify-center rounded-xl bg-[#A35D5D] hover:bg-[#8F4A4A] px-4 py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-60 transition-colors"
            >
              {submitting ? "登入中..." : "登入"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
