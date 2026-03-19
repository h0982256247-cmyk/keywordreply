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
      <div className="absolute inset-0 bg-black/40" onClick={busy ? undefined : onClose} />
      <div className="relative w-[92%] max-w-md bg-white rounded-2xl shadow-xl border border-[#E7C9CD] p-5">
        <div className="text-lg font-semibold text-[#2B2B2B]">{title}</div>
        {description && <div className="text-sm text-[#6B6B6B] mt-2 leading-relaxed">{description}</div>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            className="px-3 py-2 text-sm rounded-lg border border-[#E8E8E8] text-[#555555] hover:bg-[#F5F5F5] disabled:opacity-50 transition-colors"
            onClick={onClose}
            disabled={busy}
          >
            {cancelText}
          </button>
          <button
            className={`px-3 py-2 text-sm rounded-lg text-white font-semibold disabled:opacity-50 transition-colors ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-[#A35D5D] hover:bg-[#8F4A4A]"
            }`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "處理中…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
