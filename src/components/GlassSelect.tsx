import React, { useState, useRef, useEffect } from "react";

export type SelectOption = { value: string; label: string };

interface GlassSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
  /** "xs" = px-2 py-1.5 text-xs, "sm" = px-3 py-2 text-sm (default), "lg" = px-4 py-3 text-sm */
  size?: "xs" | "sm" | "lg";
  placeholder?: string;
  /** Extra rounded style, e.g. "rounded-2xl" */
  rounded?: string;
}

export default function GlassSelect({
  value,
  onChange,
  options,
  className = "",
  size = "sm",
  placeholder = "請選擇",
  rounded,
}: GlassSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const selected = options.find((o) => o.value === value);
  const displayLabel = selected?.label ?? placeholder;

  const roundedClass = rounded ?? (size === "lg" ? "rounded-2xl" : "rounded-lg");

  const triggerSize =
    size === "xs"
      ? "px-2 py-1.5 text-xs"
      : size === "lg"
      ? "px-4 py-3 text-sm"
      : "px-3 py-2 text-sm";

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-2 bg-white border border-[#E7C9CD] text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#A35D5D]/15 focus:border-[#A35D5D] transition-all ${roundedClass} ${triggerSize}`}
      >
        <span className="truncate">{displayLabel}</span>
        <svg
          className={`flex-shrink-0 text-[#A35D5D] transition-transform duration-150 ${open ? "rotate-180" : ""} ${size === "xs" ? "w-3 h-3" : "w-4 h-4"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={listRef}
          className="absolute left-0 top-full mt-1 z-[200] min-w-full bg-white border border-[#E7C9CD] rounded-xl shadow-xl overflow-auto max-h-60 py-1"
          style={{ width: "max-content", minWidth: "100%" }}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full text-left flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                  isSelected
                    ? "bg-[#FBEBEE] text-[#A35D5D] font-semibold"
                    : "text-[#2B2B2B] hover:bg-[#FFF7F8] hover:text-[#2B2B2B]"
                }`}
              >
                <span className="w-3.5 flex-shrink-0">
                  {isSelected && (
                    <svg className="w-3.5 h-3.5 text-[#A35D5D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
