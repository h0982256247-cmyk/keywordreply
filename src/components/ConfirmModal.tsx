import React from "react";

type Props = {
  open: boolean;
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export default function ConfirmModal({
  open,
  title = "確認操作",
  description,
  confirmText = "確認",
  cancelText = "取消",
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={busy ? undefined : onClose} />
      <div className="relative w-[92%] max-w-sm bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/60 overflow-hidden">
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </div>
            <div>
              <div className="text-base font-semibold text-[#2B2B2B]">{title}</div>
              {description && <div className="text-xs text-[#AAAAAA] mt-0.5">{description}</div>}
            </div>
          </div>
        </div>
        <div className="px-6 pb-6 flex justify-end gap-2">
          <button
            className="px-4 py-2.5 text-sm text-[#555555] hover:bg-[#F5F5F5] rounded-xl transition-colors font-medium disabled:opacity-50"
            onClick={onClose}
            disabled={busy}
          >
            {cancelText}
          </button>
          <button
            className={`px-5 py-2.5 text-sm font-semibold text-white rounded-xl transition-colors shadow-sm disabled:opacity-50 ${
              danger ? "bg-red-500 hover:bg-red-600" : "bg-[#A35D5D] hover:bg-[#8F4A4A]"
            }`}
            onClick={() => { onConfirm(); onClose(); }}
            disabled={busy}
          >
            {busy ? "處理中…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
