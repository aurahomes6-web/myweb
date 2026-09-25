import type { AccentKind, VisualKind } from '@/types'
import { accentPalettes, type AccentPalette } from '@/config/accents'
import { cn } from '@/lib/cn'

interface PropertyVisualProps {
  image: string | null
  accent: AccentKind
  variant: VisualKind
  label?: string
  className?: string
  onImageError?: () => void
}

function MoonScene({ accent }: { accent: AccentPalette }) {
  return (
    <g>
      <defs>
        <linearGradient id="rv-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#17352d" />
          <stop offset="100%" stopColor="#0b1a14" />
        </linearGradient>
        <linearGradient id="rv-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#27513f" />
          <stop offset="55%" stopColor={`rgba(${accent.rgb}, 0.16)`} />
          <stop offset="100%" stopColor="#17352d" />
        </linearGradient>
        <radialGradient id="rv-moon-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={`rgba(${accent.rgb}, 0.85)`} />
          <stop offset="45%" stopColor={`rgba(${accent.rgb}, 0.32)`} />
          <stop offset="100%" stopColor={`rgba(${accent.rgb}, 0)`} />
        </radialGradient>
        <linearGradient id="rv-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2f5a47" />
          <stop offset="100%" stopColor="#142d23" />
        </linearGradient>
      </defs>

      <rect width="800" height="600" fill="url(#rv-wall)" />

      <rect x="340" y="60" width="420" height="430" rx="4" fill="url(#rv-sky)" />
      <rect x="340" y="60" width="420" height="430" fill="none" stroke="#4c6b5d" strokeWidth="2" />

      <circle cx="680" cy="170" r="26" fill="#f7f4ec" opacity="0.9" />
      <circle cx="680" cy="170" r="64" fill="url(#rv-moon-glow)" />

      <path
        d="M340 340 L420 300 L470 320 L560 275 L630 305 L700 270 L760 290 L760 430 L340 430 Z"
        fill="#12261f"
      />
      <g fill="#2b5243" opacity="0.9">
        <rect x="410" y="350" width="30" height="52" />
        <rect x="455" y="330" width="26" height="72" />
        <rect x="530" y="345" width="32" height="57" />
        <rect x="590" y="320" width="22" height="82" />
      </g>
      <g fill="#3a614f">
        <rect x="450" y="395" width="10" height="7" />
        <rect x="545" y="352" width="7" height="8" />
        <rect x="600" y="338" width="8" height="7" />
      </g>

      <rect x="0" y="494" width="800" height="106" fill="url(#rv-floor)" />
      <rect x="0" y="494" width="800" height="1.5" fill="#4c6b5d" />

      <line x1="120" y1="494" x2="120" y2="250" stroke="#577263" strokeWidth="4" strokeLinecap="round" />
      <line x1="124" y1="494" x2="124" y2="250" stroke="#62806f" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M96 250 Q120 232 148 250 L128 250 Q120 244 112 250 Z" fill="#577263" />
      <circle cx="120" cy="235" r="14" fill="#577263" />

      <ellipse cx="120" cy="494" rx="150" ry="70" fill={`rgba(${accent.rgb}, 0.03)`} />
      <path d="M100 494 L120 305 Q120 300 126 300 L126 494 Z" fill={`rgba(${accent.rgb}, 0.07)`} />

      <path
        d="M520 600 C500 570 470 555 430 545 C470 545 500 520 510 480 C525 520 555 540 600 538 C560 552 535 575 520 600 Z"
        fill="#0e211b"
      />
      <path
        d="M520 600 C510 580 500 570 480 560 C505 565 512 555 518 542 C525 560 545 572 575 570 C555 580 545 590 540 600 Z"
        fill="#163126"
        opacity="0.85"
      />
      <rect x="472" y="585" width="88" height="11" rx="5" fill="#0b1a14" />
    </g>
  )
}

function DawnScene({ accent }: { accent: AccentPalette }) {
  return (
    <g>
      <defs>
        <linearGradient id="rv-dawn-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#12261f" />
          <stop offset="100%" stopColor="#0a1712" />
        </linearGradient>
        <linearGradient id="rv-dawn-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#27513f" />
          <stop offset="55%" stopColor={`rgba(${accent.rgb}, 0.15)`} />
          <stop offset="100%" stopColor="#1c3a2e" />
        </linearGradient>
        <linearGradient id="rv-dawn-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={`rgba(${accent.rgb}, 0)`} />
          <stop offset="50%" stopColor={`rgba(${accent.rgb}, 0.7)`} />
          <stop offset="100%" stopColor={`rgba(${accent.rgb}, 0)`} />
        </linearGradient>
        <radialGradient id="rv-dawn-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={accent.bright} stopOpacity="0.8" />
          <stop offset="60%" stopColor={`rgba(${accent.rgb}, 0.3)`} stopOpacity="0.3" />
          <stop offset="100%" stopColor={`rgba(${accent.rgb}, 0)`} stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="800" height="600" fill="url(#rv-dawn-wall)" />

      <rect x="60" y="70" width="500" height="380" rx="6" fill="url(#rv-dawn-sky)" />
      <rect x="60" y="70" width="500" height="380" fill="none" stroke="#4c6b5d" strokeWidth="2" />

      <rect x="60" y="70" width="500" height="14" fill="#2b5243" />

      <line x1="130" y1="84" x2="130" y2="440" stroke="#4e6f60" strokeWidth="2" />
      <line x1="430" y1="84" x2="430" y2="440" stroke="#4e6f60" strokeWidth="2" />
      <line x1="60" y1="180" x2="560" y2="180" stroke="#416150" strokeWidth="2" />
      <line x1="60" y1="300" x2="560" y2="300" stroke="#416150" strokeWidth="2" />

      <ellipse cx="300" cy="330" rx="180" ry="90" fill="url(#rv-dawn-sun)" />
      <rect x="60" y="300" width="500" height="2.5" fill="url(#rv-dawn-line)" />

      <path
        d="M60 420 C160 380 240 400 330 370 C420 342 480 360 560 330 L560 450 L60 450 Z"
        fill="#173d2c"
      />

      <rect x="620" y="140" width="120" height="200" rx="4" fill="#1c3a2e" stroke="#4c6b5d" strokeWidth="1.5" />
      <rect x="670" y="180" width="20" height="120" rx="2" fill={`rgba(${accent.rgb}, 0.35)`} />
      <rect x="645" y="352" width="70" height="8" rx="4" fill="#2b5243" />

      <rect x="150" y="470" width="500" height="130" fill="#122920" />
      <rect x="150" y="470" width="500" height="1.5" fill="#4c6b5d" />

      <path d="M190 470 L232 470 L232 410 L190 410 Z" fill="#1f3f32" />
      <rect x="196" y="416" width="30" height="48" rx="10" fill={`rgba(${accent.rgb}, 0.14)`} />
      <rect x="184" y="470" width="54" height="10" rx="5" fill="#163126" />

      <path d="M600 470 L590 440 C586 424 588 415 600 415 C612 415 614 424 610 440 L600 470 Z" fill="#1c3a2e" />
    </g>
  )
}

function EveningScene({ accent }: { accent: AccentPalette }) {
  return (
    <g>
      <defs>
        <linearGradient id="rv-eve-wall" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#17352d" />
          <stop offset="100%" stopColor="#0b1a14" />
        </linearGradient>
        <linearGradient id="rv-eve-panel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={`rgba(${accent.rgb}, 0.22)`} />
          <stop offset="100%" stopColor={`rgba(${accent.rgb}, 0.05)`} />
        </linearGradient>
        <radialGradient id="rv-eve-lamp" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={accent.bright} stopOpacity="0.85" />
          <stop offset="100%" stopColor={`rgba(${accent.rgb}, 0)`} stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="800" height="600" fill="url(#rv-eve-wall)" />

      <rect x="540" y="80" width="180" height="420" fill="url(#rv-eve-panel)" />
      <rect x="540" y="80" width="180" height="420" fill="none" stroke={`rgba(${accent.rgb}, 0.3)`} strokeWidth="1.5" />

      <circle cx="630" cy="300" r="96" fill="url(#rv-eve-lamp)" />

      <circle cx="150" cy="140" r="90" fill={`rgba(${accent.rgb}, 0.05)`} />
      <circle cx="150" cy="140" r="3" fill={accent.bright} opacity="0.7" />
      <circle cx="250" cy="110" r="2" fill={accent.bright} opacity="0.5" />
      <circle cx="120" cy="220" r="2" fill={accent.bright} opacity="0.4" />
      <circle cx="330" cy="150" r="2" fill={accent.bright} opacity="0.45" />

      <rect x="160" y="280" width="240" height="170" rx="4" fill="#142d23" stroke="#4c6b5d" strokeWidth="1.5" />
      <g transform="translate(190, 310)">
        <text y="34" fontFamily="Space Grotesk, sans-serif" fontWeight="500" fontSize="20" letterSpacing="6" fill="#d8be8a">
          AURA
        </text>
        <rect y="58" width="180" height="2" fill={`rgba(${accent.rgb}, 0.5)`} />
        <rect y="72" width="150" height="2" fill="#2f5946" />
        <rect y="82" width="170" height="2" fill="#2b5243" />
        <rect y="92" width="120" height="2" fill="#2b5243" />
      </g>

      <rect x="0" y="450" width="800" height="150" fill="#0e211b" />
      <rect x="0" y="450" width="800" height="1.5" fill="#4c6b5d" />

      <rect x="90" y="330" width="120" height="120" rx="6" fill="#142d23" stroke="#4c6b5d" strokeWidth="1.5" />
      <rect x="108" y="348" width="84" height="84" rx="3" fill={`rgba(${accent.rgb}, 0.12)`} />

      <line x1="620" y1="450" x2="620" y2="210" stroke="#577263" strokeWidth="4" strokeLinecap="round" />
      <path d="M596 210 Q620 188 646 210 L624 210 Q620 202 618 210 Z" fill="#577263" />
      <circle cx="620" cy="196" r="13" fill={accent.main} opacity="0.85" />
      <circle cx="620" cy="196" r="34" fill={`rgba(${accent.rgb}, 0.18)`} />

      <path
        d="M290 470 C270 442 235 428 200 420 C238 418 260 398 268 362 C282 400 312 420 352 420 C316 432 298 448 290 470 Z"
        fill="#12261f"
      />
      <path
        d="M290 470 C278 452 262 442 246 434 C264 438 272 428 276 416 C288 432 308 442 330 440 C314 450 304 462 300 470 Z"
        fill="#163126"
        opacity="0.8"
      />
      <rect x="246" y="452" width="88" height="10" rx="5" fill="#0e211b" />
    </g>
  )
}

function Grain() {
  return (
    <>
      <filter id="rv-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.06 0" />
      </filter>
      <rect width="800" height="600" filter="url(#rv-grain)" opacity="0.5" />
    </>
  )
}

export default function PropertyVisual({
  image,
  accent,
  variant,
  label,
  className,
  onImageError,
}: PropertyVisualProps) {
  const palette = accentPalettes[accent]

  if (image) {
    return (
      <img
        src={image}
        alt={label ?? 'AURA HOMES property'}
        onError={onImageError}
        className={cn('h-full w-full object-cover', className)}
      />
    )
  }

  return (
    <svg
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={label ?? 'AURA HOMES property artwork'}
      className={cn('h-full w-full', className)}
    >
      {variant === 'moon' && <MoonScene accent={palette} />}
      {variant === 'dawn' && <DawnScene accent={palette} />}
      {variant === 'evening' && <EveningScene accent={palette} />}
      <Grain />
    </svg>
  )
}