/** Inline SVG icons — no emoji in the UI. */
type IconProps = { className?: string; size?: number };

const base = (className?: string, size = 20) =>
  ({ className: className ?? "shrink-0", width: size, height: size, fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const });

export function IconLibrary({ className, size = 20 }: IconProps) {
  const p = base(className, size);
  return (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M4 6h16M4 12h10M4 18h14" />
      <circle cx="18" cy="17" r="3" />
    </svg>
  );
}

export function IconSearch({ className, size = 20 }: IconProps) {
  const p = base(className, size);
  return (
    <svg viewBox="0 0 24 24" {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3-3" />
    </svg>
  );
}

export function IconHeart({ className, size = 20, filled = false }: IconProps & { filled?: boolean }) {
  const p = base(className, size);
  return (
    <svg viewBox="0 0 24 24" {...p} fill={filled ? "currentColor" : "none"}>
      <path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z" />
    </svg>
  );
}

export function IconPlaylist({ className, size = 20 }: IconProps) {
  const p = base(className, size);
  return (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M9 6h12M9 12h12M9 18h12" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" strokeWidth={3} />
    </svg>
  );
}

export function IconSettings({ className, size = 20 }: IconProps) {
  const p = base(className, size);
  return (
    <svg viewBox="0 0 24 24" {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

export function IconPlay({ className, size = 20 }: IconProps) {
  const p = base(className, size);
  return (
    <svg viewBox="0 0 24 24" {...p} fill="currentColor" stroke="none">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export function IconPause({ className, size = 20 }: IconProps) {
  const p = base(className, size);
  return (
    <svg viewBox="0 0 24 24" {...p} fill="currentColor" stroke="none">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

export function IconSkipBack({ className, size = 20 }: IconProps) {
  const p = base(className, size);
  return (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M6 6v12M18 6l-8 6 8 6V6z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconSkipForward({ className, size = 20 }: IconProps) {
  const p = base(className, size);
  return (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M18 6v12M6 6l8 6-8 6V6z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconShuffle({ className, size = 20 }: IconProps) {
  const p = base(className, size);
  return (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
    </svg>
  );
}

export function IconRepeat({ className, size = 20 }: IconProps) {
  const p = base(className, size);
  return (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

export function IconRepeatOne({ className, size = 20 }: IconProps) {
  const p = base(className, size);
  return (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" />
      <text x="12" y="15" textAnchor="middle" fontSize="8" fill="currentColor" stroke="none" fontWeight="600">
        1
      </text>
    </svg>
  );
}

export function IconPlus({ className, size = 20 }: IconProps) {
  const p = base(className, size);
  return (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconMore({ className, size = 20 }: IconProps) {
  const p = base(className, size);
  return (
    <svg viewBox="0 0 24 24" {...p} fill="currentColor" stroke="none">
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  );
}

export function IconClose({ className, size = 20 }: IconProps) {
  const p = base(className, size);
  return (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconChevronDown({ className, size = 20 }: IconProps) {
  const p = base(className, size);
  return (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function IconMusic({ className, size = 20 }: IconProps) {
  const p = base(className, size);
  return (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

export function IconClock({ className, size = 20 }: IconProps) {
  const p = base(className, size);
  return (
    <svg viewBox="0 0 24 24" {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function IconSpark({ className, size = 20 }: IconProps) {
  const p = base(className, size);
  return (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
    </svg>
  );
}

export function IconQueue({ className, size = 20 }: IconProps) {
  const p = base(className, size);
  return (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M3 7h12M3 12h12M3 17h12" />
      <path d="M17 8l6 4-6 4V8z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconChart({ className, size = 20 }: IconProps) {
  const p = base(className, size);
  return (
    <svg viewBox="0 0 24 24" {...p} fill="currentColor" stroke="none">
      <rect x="3" y="14" width="4" height="7" rx="1" />
      <rect x="10" y="9" width="4" height="12" rx="1" />
      <rect x="17" y="4" width="4" height="17" rx="1" />
    </svg>
  );
}

export function IconDownload({ className, size = 20 }: IconProps) {
  const p = base(className, size);
  return (
    <svg viewBox="0 0 24 24" {...p}>
      <path d="M12 3v13M7 11l5 5 5-5" />
      <path d="M3 19h18" strokeWidth={1.75} />
    </svg>
  );
}
