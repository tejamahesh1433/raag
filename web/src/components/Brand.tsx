/** Raag brand mark — shared logo + wordmark helpers. */

export const APP_NAME = "Raag";
export const APP_TAGLINE = "Your library · private LAN";

export function BrandLogo({
  size = 40,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src="/icon.svg"
      alt=""
      width={size}
      height={size}
      className={`brand-mark shrink-0 ${className}`}
      aria-hidden
    />
  );
}

export function BrandWordmark({
  className = "",
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass =
    size === "lg"
      ? "text-5xl sm:text-6xl"
      : size === "sm"
        ? "text-xl"
        : "text-display-sm text-3xl";
  return (
    <span className={`font-display leading-none tracking-tight text-ink ${sizeClass} ${className}`}>
      {APP_NAME}
    </span>
  );
}
