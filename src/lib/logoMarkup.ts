export function logoSvgMarkup(): string {
  return `
    <defs>
      <linearGradient id="strip-logo-gold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFE7A1" />
        <stop offset="55%" stop-color="#F7C44F" />
        <stop offset="100%" stop-color="#D99A18" />
      </linearGradient>
      <linearGradient id="strip-logo-cyan" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#A6F5FF" />
        <stop offset="100%" stop-color="#56D9F3" />
      </linearGradient>
    </defs>
    <g>
      <path
        d="M16 1.6 L17.8 12.2 L30.4 16 L17.8 19.8 L16 30.4 L14.2 19.8 L1.6 16 L14.2 12.2 Z"
        fill="url(#strip-logo-gold)"
      />
      <path
        d="M16 6.6 L18.55 13.45 L25.4 16 L18.55 18.55 L16 25.4 L13.45 18.55 L6.6 16 L13.45 13.45 Z"
        fill="url(#strip-logo-gold)"
        opacity="0.78"
      />
      <path
        d="M9.1 9.2 C11.5 6.95 14.75 5.8 18.05 6.05 C22.55 6.4 26.35 8.35 27.7 11.55"
        fill="none"
        stroke="url(#strip-logo-cyan)"
        stroke-width="1.45"
        stroke-linecap="round"
        opacity="0.95"
      />
      <path
        d="M22.95 8.1 C26.3 9.05 28.45 11.1 28.55 13.95 C28.7 18.2 23.9 22.75 17.15 24.9 C10.35 27.05 4.75 25.95 3.45 22.3 C2.4 19.4 4.3 15.7 8.05 12.75"
        fill="none"
        stroke="url(#strip-logo-gold)"
        stroke-width="1.7"
        stroke-linecap="round"
      />
      <path
        d="M22.8 22.7 C20.4 25.05 17.15 26.2 13.85 25.95 C9.45 25.65 5.7 23.75 4.3 20.65"
        fill="none"
        stroke="url(#strip-logo-cyan)"
        stroke-width="1.45"
        stroke-linecap="round"
        opacity="0.95"
      />
      <circle cx="7.2" cy="22.35" r="1.72" fill="url(#strip-logo-gold)" />
      <circle cx="27.35" cy="13.9" r="1.08" fill="url(#strip-logo-gold)" />
    </g>
  `;
}
