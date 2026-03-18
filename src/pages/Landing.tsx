import React from "react";
import { useNavigate } from "react-router-dom";

export default function Landing() {
  const nav = useNavigate();
  return (
    <div className="min-h-screen bg-[#FCF7F8] flex items-center justify-center p-4">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none flex justify-center items-center">
        <div className="w-[600px] h-[600px] bg-[#A35D5D]/10 rounded-full blur-[100px] absolute -top-20 -left-20 animate-pulse" />
        <div className="w-[500px] h-[500px] bg-[#E7C9CD]/30 rounded-full blur-[100px] absolute -bottom-20 -right-20 animate-pulse delay-700" />
      </div>

      <div className="max-w-3xl w-full z-10 relative">
        <div className="bg-white border border-[#E7C9CD] shadow-xl rounded-2xl p-20 flex flex-col items-center text-center">
          <div className="text-4xl font-bold text-[#2B2B2B] mb-12 tracking-wide">
            LINE MGM 好友裂變行銷系統
          </div>

          <div className="flex justify-center w-full">
            <button
              className="inline-flex items-center justify-center text-xl px-12 py-4 rounded-xl hover:scale-105 transition-transform duration-200 shadow-md bg-[#A35D5D] hover:bg-[#8F4A4A] text-white font-bold"
              onClick={() => nav("/login")}
            >
              前往系統
            </button>
          </div>
        </div>

        <div className="mt-8 text-center text-sm text-[#6B6B6B] opacity-60">
          © <a href="https://www.gentlerdigit.com/" target="_blank" rel="noopener noreferrer" className="hover:text-gray-700 hover:underline transition-colors">柔兒數位 Gentler Digit</a>. All rights reserved.
        </div>
      </div>
    </div>
  );
}
