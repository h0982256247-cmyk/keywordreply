import React, { ReactNode } from "react";

type Props = {
  title: string;
  desc?: string;
  icon?: ReactNode;
  actions?: ReactNode;
};

export default function EmptyState({ title, desc, icon, actions }: Props) {
  return (
    <div className="bg-white border border-[#EBEBEB] rounded-xl shadow-sm p-10 text-center">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-[#F0F0F0] flex items-center justify-center text-2xl">
        {icon || "📭"}
      </div>
      <div className="mt-4 text-lg font-semibold text-[#2B2B2B]">{title}</div>
      {desc && <div className="mt-2 text-sm text-[#6B6B6B] max-w-md mx-auto">{desc}</div>}
      {actions && <div className="mt-6 flex items-center justify-center gap-2">{actions}</div>}
    </div>
  );
}
