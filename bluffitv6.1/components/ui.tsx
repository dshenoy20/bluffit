"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SoundToggle } from "./SoundToggle";

/* ================= buttons ================= */

export function Button({
  children,
  onClick,
  disabled,
  loading,
  variant = "primary",
  size = "md",
  type = "button",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "lg";
  type?: "button" | "submit";
  title?: string;
}) {
  const base =
    "relative w-full select-none rounded-2xl font-bold tracking-wide transition-all duration-200 " +
    "active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none " +
    "disabled:active:scale-100 disabled:hover:translate-y-0";
  const sizes = {
    md: "px-5 py-3 text-base",
    lg: "px-6 py-4 text-lg",
  };
  const styles = {
    primary:
      "bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 " +
      "shadow-[0_10px_28px_-10px_rgba(251,191,36,0.65)] " +
      "hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-10px_rgba(251,191,36,0.8)]",
    secondary:
      "bg-slate-800 text-white ring-1 ring-white/10 " +
      "hover:-translate-y-0.5 hover:bg-slate-700 hover:ring-white/20",
    ghost:
      "bg-transparent text-slate-400 ring-1 ring-white/10 hover:text-white hover:ring-white/25",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      className={`${base} ${sizes[size]} ${styles[variant]}`}
    >
      <span className={loading ? "opacity-0" : ""}>{children}</span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Dots dark={variant === "primary"} />
        </span>
      )}
    </button>
  );
}

/* ================= surfaces ================= */

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`glass anim-fade-up w-full max-w-md rounded-3xl p-6 ring-1 ring-white/10 sm:p-7 ${className}`}
    >
      {children}
    </div>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return (
    <main className="stage flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-8 text-white">
      <SoundToggle />
      {children}
    </main>
  );
}

/* ================= brand ================= */

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <h1
      className={`select-none font-black tracking-tight ${
        small ? "text-3xl" : "anim-float text-6xl sm:text-7xl"
      }`}
      style={{ textShadow: "0 0 48px rgba(251,191,36,0.35)" }}
    >
      <span className="bg-gradient-to-b from-amber-200 to-amber-500 bg-clip-text text-transparent">
        Bluff
      </span>
      <span className="text-white">It</span>
      <span className="anim-wiggle inline-block origin-bottom bg-gradient-to-b from-amber-200 to-amber-500 bg-clip-text text-transparent">
        !
      </span>
    </h1>
  );
}

/* ================= inputs ================= */

export function TextInput({
  value,
  onChange,
  placeholder,
  maxLength,
  autoFocus,
  uppercase,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  maxLength?: number;
  autoFocus?: boolean;
  uppercase?: boolean;
  label?: string;
}) {
  return (
    <label className="block w-full">
      {label && (
        <span className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-500">
          {label}
        </span>
      )}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        autoFocus={autoFocus}
        className={`w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3.5 text-lg
          text-white placeholder-slate-500 outline-none transition-all duration-200
          focus:border-amber-400/60 focus:bg-slate-900 focus:shadow-[0_0_0_4px_rgba(251,191,36,0.15)]
          ${uppercase ? "text-center font-black uppercase tracking-[0.4em]" : ""}`}
      />
    </label>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      key={String(children)}
      className="anim-shake rounded-xl bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-300 ring-1 ring-rose-500/30"
      role="alert"
    >
      {children}
    </p>
  );
}

/* ================= timer ================= */

/** Circular countdown ring. Amber, turning rose in the last 10 seconds. */
export function CircularTimer({
  endsAt,
  totalSeconds,
  now,
  size = 64,
}: {
  endsAt: number;
  totalSeconds: number;
  now: number;
  size?: number;
}) {
  const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const frac = Math.max(0, Math.min(1, (endsAt - now) / (totalSeconds * 1000)));
  const urgent = remaining <= 10;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      className={`relative shrink-0 ${urgent ? "anim-pop-in" : ""}`}
      style={{ width: size, height: size }}
      role="timer"
      aria-label={`${remaining} seconds left`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={urgent ? "#fb7185" : "#fbbf24"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          className="transition-[stroke-dashoffset,stroke] duration-1000 ease-linear"
        />
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center font-black tabular-nums ${
          urgent ? "text-rose-300" : "text-amber-300"
        } ${size >= 60 ? "text-xl" : "text-sm"}`}
      >
        {remaining}
      </span>
    </div>
  );
}

/* ================= progress / badges ================= */

export function RoundProgress({ round, total }: { round: number; total: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="shrink-0 text-xs font-bold uppercase tracking-widest text-slate-500">
        Round {round} of {total}
      </span>
      {total <= 10 ? (
        <div className="flex gap-1.5">
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i < round - 1
                  ? "w-4 bg-amber-400/40"
                  : i === round - 1
                    ? "w-6 bg-amber-400"
                    : "w-4 bg-white/10"
              }`}
            />
          ))}
        </div>
      ) : (
        /* long games get a slim continuous bar instead of 20-30 dots */
        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-amber-400 transition-[width] duration-500"
            style={{ width: `${(round / total) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function Chip({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "amber" | "emerald" }) {
  const tones = {
    slate: "bg-white/5 text-slate-300 ring-white/10",
    amber: "bg-amber-400/10 text-amber-300 ring-amber-400/30",
    emerald: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/30",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ring-1 ${tones[tone]}`}>
      {children}
    </span>
  );
}

/* ================= avatars ================= */

const AVATAR_GRADIENTS = [
  "from-amber-400 to-orange-500",
  "from-sky-400 to-blue-600",
  "from-emerald-400 to-teal-600",
  "from-fuchsia-400 to-purple-600",
  "from-rose-400 to-red-600",
  "from-lime-400 to-green-600",
  "from-cyan-400 to-sky-600",
  "from-violet-400 to-indigo-600",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const grad = AVATAR_GRADIENTS[hashString(name) % AVATAR_GRADIENTS.length];
  const sizes = { sm: "h-8 w-8 text-sm", md: "h-11 w-11 text-lg", lg: "h-14 w-14 text-2xl" };
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-black text-white shadow-lg ${grad} ${sizes[size]}`}
      aria-hidden
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/* ================= copy ================= */

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {}
      }}
      className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold ring-1 transition-all duration-200 ${
        copied
          ? "bg-emerald-400/15 text-emerald-300 ring-emerald-400/40"
          : "bg-white/5 text-slate-300 ring-white/10 hover:-translate-y-0.5 hover:text-white hover:ring-white/25"
      }`}
      title={`Copy ${label}`}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? "Copied!" : label}
    </button>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="12" height="12" rx="2.5" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/* ================= waiting / loading ================= */

export function Dots({ dark = false }: { dark?: boolean }) {
  const color = dark ? "bg-slate-900" : "bg-amber-300";
  return (
    <span className="inline-flex items-end gap-1" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${color}`}
          style={{ animation: `dot-bounce 1.2s ${i * 0.15}s infinite ease-in-out` }}
        />
      ))}
    </span>
  );
}

export function WaitingNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-400">
      {children} <Dots />
    </p>
  );
}

export function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="anim-fade-up flex flex-col items-center gap-3 py-10">
      <Dots />
      <p className="text-sm font-semibold text-slate-500">{label}</p>
    </div>
  );
}

/* ================= animated number ================= */

/** Smoothly counts toward `value` whenever it changes. */
export function useCountUp(value: number, durationMs = 800): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    const start = performance.now();
    let raf: number;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);
  return display;
}

/* ================= confetti ================= */

const CONFETTI_COLORS = ["#fbbf24", "#f59e0b", "#38bdf8", "#34d399", "#f472b6", "#a78bfa", "#ffffff"];

interface Piece {
  left: number; delay: number; duration: number; color: string; size: number; tilt: number;
}

/** Lightweight CSS confetti overlay. Renders ~70 pieces, then fades out. */
export function Confetti() {
  const [pieces, setPieces] = useState<Piece[]>([]);
  useEffect(() => {
    setPieces(
      Array.from({ length: 70 }, () => ({
        left: Math.random() * 100,
        delay: Math.random() * 2.2,
        duration: 2.8 + Math.random() * 2.2,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        size: 6 + Math.random() * 7,
        tilt: Math.random() * 360,
      }))
    );
  }, []);
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 block"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.45,
            backgroundColor: p.color,
            borderRadius: 2,
            transform: `rotate(${p.tilt}deg)`,
            animation: `confetti-fall ${p.duration}s ${p.delay}s cubic-bezier(0.25,0.46,0.45,0.94) forwards`,
          }}
        />
      ))}
    </div>
  );
}
