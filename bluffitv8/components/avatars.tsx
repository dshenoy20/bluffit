"use client";

/**
 * The 8 BluffIt avatars — simple illustrated characters, consistent style:
 * colored rounded-square background, cream face, expressive eyes/mouth, one
 * signature accessory each. Pure inline SVG (no images, crisp at any size).
 */

import type { ReactNode } from "react";
import { AVATARS } from "@/lib/avatarData";

export { AVATARS, isAvatarKey, type AvatarInfo } from "@/lib/avatarData";

const FACE = "#fde8c9"; // shared face tone
const DARK = "#1e293b";

/* Shared face base: circle + optional eyes/mouth (some avatars override). */
function Face({ children }: { children?: ReactNode }) {
  return (
    <>
      <circle cx="32" cy="36" r="19" fill={FACE} />
      {children}
    </>
  );
}

function Smile({ y = 43, w = 7 }: { y?: number; w?: number }) {
  return (
    <path
      d={`M${32 - w} ${y} Q32 ${y + 6} ${32 + w} ${y}`}
      stroke={DARK}
      strokeWidth="2.4"
      strokeLinecap="round"
      fill="none"
    />
  );
}

function Eyes({ y = 34 }: { y?: number }) {
  return (
    <>
      <circle cx="25" cy={y} r="2.4" fill={DARK} />
      <circle cx="39" cy={y} r="2.4" fill={DARK} />
    </>
  );
}

const ART: Record<string, ReactNode> = {
  /* 1. The Cool One — black shades, confident smirk */
  cool: (
    <Face>
      <rect x="18" y="29" width="12" height="7.5" rx="2.5" fill={DARK} />
      <rect x="34" y="29" width="12" height="7.5" rx="2.5" fill={DARK} />
      <rect x="29" y="31.4" width="6" height="2.4" fill={DARK} />
      <path d="M26 45 Q34 50 40 44" stroke={DARK} strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </Face>
  ),
  /* 2. The Pirate — red bandana, eye patch, cheeky grin */
  pirate: (
    <Face>
      {/* bandana */}
      <path d="M13 33 Q13 15 32 15 Q51 15 51 33 L51 30 Q32 22 13 30 Z" fill="#dc2626" />
      <path d="M13 27 Q32 19 51 27 Q51 31 32 26 Q13 31 13 27 Z" fill="#b91c1c" />
      {/* bandana knot + tails */}
      <circle cx="50" cy="27" r="3.2" fill="#dc2626" />
      <path d="M52 29 q6 2 8 7 q-6 -1 -9 -4 M53 26 q7 -1 10 2 q-5 2 -10 1" fill="#b91c1c" />
      {/* bandana dots */}
      <circle cx="24" cy="21.5" r="1.3" fill="#fecaca" />
      <circle cx="33" cy="19.5" r="1.3" fill="#fecaca" />
      <circle cx="41" cy="21.5" r="1.3" fill="#fecaca" />
      {/* eye patch + strap */}
      <path d="M14 30 L30 26.5 M35 26 L50 24" stroke={DARK} strokeWidth="2" strokeLinecap="round" />
      <circle cx="25" cy="34" r="5.2" fill={DARK} />
      {/* open eye */}
      <circle cx="39.5" cy="34" r="2.4" fill={DARK} />
      {/* cheeky grin */}
      <path d="M25 44 Q32 50 40 43 Q36 46.5 32 46.5 Q28 46.5 25 44 Z" fill={DARK} />
    </Face>
  ),
  /* 3. The Detective — deerstalker-style hat, one raised brow, hmm mouth */
  detective: (
    <Face>
      <path d="M13 28 Q32 8 51 28 L51 31 Q32 25 13 31 Z" fill="#92603a" />
      <rect x="9" y="27.5" width="14" height="4.5" rx="2.2" fill="#7c4f2e" />
      <rect x="41" y="27.5" width="14" height="4.5" rx="2.2" fill="#7c4f2e" />
      <circle cx="25" cy="37" r="2.4" fill={DARK} />
      <circle cx="39" cy="36" r="2.4" fill={DARK} />
      <path d="M35 30 q4 -2.5 8 0" stroke={DARK} strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M27 46 h9" stroke={DARK} strokeWidth="2.4" strokeLinecap="round" />
    </Face>
  ),
  /* 4. The Trickster — wink + wide mischievous grin */
  trickster: (
    <Face>
      <circle cx="25" cy="33" r="2.4" fill={DARK} />
      <path d="M35.5 33 h7" stroke={DARK} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M23 42 Q32 52 41 42 Q37 46 32 46 Q27 46 23 42 Z" fill={DARK} />
      <path d="M20 26 q4 -3 8 -1 M36 25 q4 -2 8 1" stroke={DARK} strokeWidth="2" strokeLinecap="round" fill="none" />
    </Face>
  ),
  /* 5. The Cowboy — wide-brim hat, easy smile */
  cowboy: (
    <Face>
      <path d="M22 24 Q22 14 32 14 Q42 14 42 24 Z" fill="#8a5a33" />
      <path d="M10 26 Q32 33 54 26 Q54 30 46 30 L18 30 Q10 30 10 26 Z" fill="#8a5a33" />
      <rect x="22" y="21" width="20" height="4" fill="#6d4426" />
      <Eyes y={36} />
      <Smile y={44} />
    </Face>
  ),
  /* 6. The Chef — white toque, rosy cheeks, friendly smile */
  chef: (
    <Face>
      <path d="M20 26 Q16 15 26 15 Q28 9 34 11 Q40 8 42 15 Q50 16 44 26 Z" fill="#fff" />
      <rect x="21" y="24" width="22" height="5" rx="2" fill="#e2e8f0" />
      <Eyes y={36} />
      <circle cx="21.5" cy="41" r="2.6" fill="#fca5a5" opacity="0.8" />
      <circle cx="42.5" cy="41" r="2.6" fill="#fca5a5" opacity="0.8" />
      <Smile y={44} />
    </Face>
  ),
  /* 7. The Ninja — mask covering all but the eyes */
  ninja: (
    <Face>
      <path d="M13 36 a19 19 0 0 1 38 0 v6 a19 13 0 0 1 -38 0 Z" fill={DARK} />
      <rect x="17" y="30" width="30" height="8" rx="4" fill={FACE} />
      <circle cx="25" cy="34" r="2.4" fill={DARK} />
      <circle cx="39" cy="34" r="2.4" fill={DARK} />
      <path d="M47 32 l8 -5 M47 35 l9 -1" stroke={DARK} strokeWidth="2.6" strokeLinecap="round" />
    </Face>
  ),
  /* 8. The Wizard — starred pointed hat, knowing smile */
  wizard: (
    <Face>
      <path d="M32 6 L44 28 H20 Z" fill="#5b21b6" />
      <path d="M16 28 h32 v4 q-16 4 -32 0 Z" fill="#7c3aed" />
      <path d="M31 14 l1.2 2.6 2.8 .3 -2.1 1.9 .6 2.8 -2.5 -1.5 -2.5 1.5 .6 -2.8 -2.1 -1.9 2.8 -.3 Z" fill="#fbbf24" />
      <Eyes y={38} />
      <path d="M26 45 Q32 49 38 45" stroke={DARK} strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </Face>
  ),
};

const SIZE_PX = { xs: 24, sm: 32, md: 44, lg: 64, xl: 88 } as const;

export function AvatarIcon({
  avatar,
  size = "md",
  className = "",
}: {
  avatar: string;
  size?: keyof typeof SIZE_PX;
  className?: string;
}) {
  const info = AVATARS.find((a) => a.key === avatar);
  if (!info) return null;
  const px = SIZE_PX[size];
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 64 64"
      className={`shrink-0 ${className}`}
      role="img"
      aria-label={info.label}
    >
      <defs>
        <linearGradient id={`bg-${info.key}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={info.bg} />
          <stop offset="100%" stopColor={info.bg2} />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="16" fill={`url(#bg-${info.key})`} />
      {ART[info.key]}
    </svg>
  );
}

/** Avatar if the player picked one, otherwise the letter-circle fallback. */
export function PlayerAvatar({
  avatar,
  name,
  size = "md",
}: {
  avatar?: string;
  name: string;
  size?: keyof typeof SIZE_PX;
}) {
  if (avatar && AVATARS.some((a) => a.key === avatar)) {
    return <AvatarIcon avatar={avatar} size={size} className="rounded-xl shadow-lg" />;
  }
  return <FallbackLetter name={name} px={SIZE_PX[size]} />;
}

const FALLBACK_GRADIENTS = [
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

function FallbackLetter({ name, px }: { name: string; px: number }) {
  const grad = FALLBACK_GRADIENTS[hashString(name) % FALLBACK_GRADIENTS.length];
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br font-black text-white shadow-lg ${grad}`}
      style={{ width: px, height: px, fontSize: px * 0.45 }}
      aria-hidden
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
