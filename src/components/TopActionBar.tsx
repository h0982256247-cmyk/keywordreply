import React, { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

type Props = {
  title?: string;
  backTo?: string;
  backLabel?: string;
  left?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export default function TopActionBar({
  title,
  backTo,
  backLabel = "返回",
  left,
  actions,
  className = "",
}: Props) {
  const nav = useNavigate();

  return (
    <div className={`sticky top-0 z-50 bg-white border-b border-[#E7C9CD] ${className}`}>
      <div className="h-14 px-4 md:px-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {backTo && (
            <button
              onClick={() => nav(backTo)}
              className="text-sm text-[#6B6B6B] hover:text-[#2B2B2B] hover:bg-[#F0F0F0] px-2 py-1 rounded-md transition-colors whitespace-nowrap"
              title={backLabel}
            >
              ← {backLabel}
            </button>
          )}
          {left}
          {title && (
            <div className="min-w-0">
              <div className="text-base font-semibold text-[#2B2B2B] truncate">{title}</div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {actions}
        </div>
      </div>
    </div>
  );
}
