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
      className={`shrink-0 rounded-[22%] shadow-lg ${className}`}
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
      ? "text-4xl sm:text-5xl"
      : size === "sm"
        ? "text-xl"
        : "text-display-sm text-2xl";
  return (
    <span className={`font-display leading-none tracking-tight text-ink ${sizeClass} ${className}`}>
      {APP_NAME}
    </span>
  );
}
