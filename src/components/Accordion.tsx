import React from "react";

export function AccordionSection({ title, subtitle, open, onToggle, children, right, accent }: {
  title: string; subtitle?: string; open: boolean; onToggle: () => void; children: React.ReactNode; right?: React.ReactNode; accent?: string;
}) {
  return (
    <div className={`bg-white rounded-2xl overflow-hidden transition-all duration-150 ${open ? "shadow-[0_4px_20px_rgba(0,0,0,0.07)] border border-slate-200" : "shadow-sm border border-slate-200 hover:shadow-md hover:border-slate-300"}`}>
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-5 py-4 text-left transition-colors ${open ? "border-b border-slate-100 bg-white" : "hover:bg-slate-50/60"}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {accent && <div className={`w-1 h-5 rounded-full flex-shrink-0 ${accent}`} />}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-800 leading-snug">{title}</div>
            {subtitle ? <div className="text-xs text-slate-400 mt-0.5">{subtitle}</div> : null}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          {right}
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className={`transition-transform duration-200 text-slate-400 ${open ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </div>
      </button>
      {open ? (
        <div className="px-5 py-4 bg-slate-50/40">
          {children}
        </div>
      ) : null}
    </div>
  );
}
