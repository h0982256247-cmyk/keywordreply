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
        className={`w-full flex items-center justify-between gap-2 bg-pink-50/70 border border-pink-200 text-stone-800 focus:outline-none focus:ring-2 focus:ring-pink-300/60 focus:border-pink-300 transition-all ${roundedClass} ${triggerSize}`}
      >
        <span className="truncate">{displayLabel}</span>
        <svg
          className={`flex-shrink-0 text-pink-400 transition-transform duration-150 ${open ? "rotate-180" : ""} ${size === "xs" ? "w-3 h-3" : "w-4 h-4"}`}
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
          className="absolute left-0 top-full mt-1 z-[200] min-w-full bg-white/80 backdrop-blur-xl border border-pink-200/80 rounded-xl shadow-xl shadow-pink-100/40 overflow-auto max-h-60 py-1"
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
                    ? "bg-pink-50 text-pink-700 font-semibold"
                    : "text-stone-700 hover:bg-pink-50/60 hover:text-stone-900"
                }`}
              >
                <span className="w-3.5 flex-shrink-0">
                  {isSelected && (
                    <svg className="w-3.5 h-3.5 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
