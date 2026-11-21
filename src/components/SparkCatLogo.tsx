import { useId } from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function SparkCatLogo({ className = '', size = 'md' }: LogoProps) {
  const uid = useId();
  const hexGradientId = `spark-hex-${uid}`;
  const coreGradientId = `spark-core-${uid}`;

  const emblemSizes = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
  };

  const titleSizes = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-2xl',
  };

  const subtitleSizes = {
    sm: 'text-[9px]',
    md: 'text-[10px]',
    lg: 'text-xs',
  };

  return (
    <div className={`inline-flex items-center gap-2.5 group cursor-pointer ${className}`}>
      <div
        className={`relative flex items-center justify-center shrink-0 rounded-lg bg-white border border-slate-200 shadow-xs p-1.5 group-hover:border-blue-700 transition-colors duration-200 ${emblemSizes[size]}`}
      >
        <svg
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          className="w-full h-full"
        >
          <defs>
            <linearGradient id={hexGradientId} x1="10" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#1D4ED8" />
              <stop offset="100%" stopColor="#0F172A" />
            </linearGradient>
            <linearGradient id={coreGradientId} x1="20" y1="14" x2="44" y2="50" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#2563EB" />
              <stop offset="100%" stopColor="#1E3A8A" />
            </linearGradient>
          </defs>

          {/* CAD Isometric Hexagon Frame */}
          <path
            d="M32 7L53 19V45L32 57L11 45V19L32 7Z"
            fill="#F8FAFC"
            stroke={`url(#${hexGradientId})`}
            strokeWidth="2.75"
            strokeLinejoin="round"
          />

          {/* Blueprint drafting cross-axes */}
          <path
            d="M32 7V15M32 49V57M11 19L18 23M46 41L53 45M53 19L46 23M18 41L11 45"
            stroke="#94A3B8"
            strokeWidth="1.6"
            strokeLinecap="round"
          />

          {/* Central 4-Point Precision Spark Star */}
          <path
            d="M32 14L36.2 27.8L50 32L36.2 36.2L32 50L27.8 36.2L14 32L27.8 27.8L32 14Z"
            fill={`url(#${coreGradientId})`}
          />

          {/* Inner CAD diamond core */}
          <path
            d="M32 25.5L38.5 32L32 38.5L25.5 32L32 25.5Z"
            fill="#FFFFFF"
            stroke="#1D4ED8"
            strokeWidth="1.4"
          />

          {/* CAD vertex nodes */}
          <circle cx="32" cy="7" r="2.2" fill="#1D4ED8" />
          <circle cx="53" cy="19" r="2" fill="#0F172A" />
          <circle cx="11" cy="45" r="2" fill="#0F172A" />
        </svg>
      </div>

      <div className="flex flex-col shrink-0 whitespace-nowrap leading-none">
        <span className={`font-display font-bold tracking-tight text-slate-900 ${titleSizes[size]}`}>
          SPARK
        </span>
        <span className={`uppercase tracking-[0.18em] text-slate-500 font-semibold mt-0.5 ${subtitleSizes[size]}`}>
          CAD Design Hub
        </span>
      </div>
    </div>
  );
}
