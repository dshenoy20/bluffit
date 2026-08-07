"use client";

import { useState, type ReactNode } from "react";

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  type?: "button" | "submit";
  title?: string;
}) {
  const base =
    "w-full rounded-xl px-5 py-3 font-bold text-lg transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100";
  const styles = {
    primary: "bg-amber-400 text-slate-900 hover:bg-amber-300",
    secondary: "bg-slate-700 text-white hover:bg-slate-600",
    ghost: "bg-transparent text-slate-300 hover:text-white border border-slate-600",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="w-full max-w-md rounded-2xl bg-slate-800/80 p-6 shadow-xl ring-1 ring-slate-700">
      {children}
    </div>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-slate-900 px-4 py-8 text-white">
      {children}
    </main>
  );
}

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <h1
      className={`select-none font-black tracking-tight ${
        small ? "text-2xl" : "text-5xl sm:text-6xl"
      }`}
    >
      <span className="text-amber-400">Bluff</span>
      <span className="text-white">It</span>
      <span className="text-amber-400">!</span>
    </h1>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  maxLength,
  autoFocus,
  uppercase,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  maxLength?: number;
  autoFocus?: boolean;
  uppercase?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      autoFocus={autoFocus}
      className={`w-full rounded-xl bg-slate-700 px-4 py-3 text-lg text-white placeholder-slate-400 outline-none ring-amber-400 focus:ring-2 ${
        uppercase ? "uppercase tracking-widest" : ""
      }`}
    />
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="text-sm font-semibold text-rose-400">{children}</p>;
}

/** Countdown bar + numeric seconds. */
export function TimerBar({
  endsAt,
  totalSeconds,
  now,
}: {
  endsAt: number;
  totalSeconds: number;
  now: number;
}) {
  const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const pct = Math.max(0, Math.min(100, ((endsAt - now) / (totalSeconds * 1000)) * 100));
  return (
    <div className="w-full">
      <div className="mb-1 flex justify-between text-sm text-slate-400">
        <span>Time left</span>
        <span className={remaining <= 10 ? "font-bold text-rose-400" : ""}>{remaining}s</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700">
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
            remaining <= 10 ? "bg-rose-400" : "bg-amber-400"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {}
      }}
      className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-semibold text-slate-200 hover:bg-slate-600"
      title={`Copy ${label}`}
    >
      {copied ? "Copied!" : `Copy ${label}`}
    </button>
  );
}

export function WaitingNote({ children }: { children: ReactNode }) {
  return (
    <p className="animate-pulse text-center text-slate-400">{children}</p>
  );
}

export function RoundBadge({ round, total }: { round: number; total: number }) {
  return (
    <span className="rounded-full bg-slate-700 px-3 py-1 text-sm font-bold text-amber-300">
      Round {round} / {total}
    </span>
  );
}
