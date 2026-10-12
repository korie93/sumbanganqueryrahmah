import { SQR_BRAND_ASSETS, SQR_BRAND_DIMENSIONS } from "@shared/brand-assets";

type BrandLogoProps = {
  alt?: string;
  className?: string;
  decorative?: boolean;
  imageClassName?: string;
  priority?: boolean;
  variant?: "full" | "icon";
  theme?: "light" | "dark" | "auto";
};

/** Original SQR artwork, selected for the surface theme without recoloring or distortion. */
export function BrandLogo({
  alt = "Sumbangan Query Rahmah (SQR)",
  className,
  decorative = false,
  imageClassName,
  priority = false,
  variant = "icon",
  theme = "auto",
}: BrandLogoProps) {
  const resolvedAlt = decorative ? "" : alt.trim() || "Sumbangan Query Rahmah (SQR)";
  const themes = theme === "auto" ? ["light", "dark"] as const : [theme];
  const dimensions = SQR_BRAND_DIMENSIONS[variant];
  const decorativeProps = decorative ? { "aria-hidden": "true" as const } : {};

  return (
    <span
      className={["sqr-brand-logo", className].filter(Boolean).join(" ")}
      data-brand-variant={variant}
      data-brand-theme={theme}
      {...decorativeProps}
    >
      {themes.map((assetTheme) => (
        <img
          key={assetTheme}
          src={SQR_BRAND_ASSETS[variant][assetTheme]}
          alt={resolvedAlt}
          role={decorative ? "presentation" : undefined}
          className={["sqr-brand-logo__image", imageClassName].filter(Boolean).join(" ")}
          data-brand-image-theme={assetTheme}
          width={dimensions.width}
          height={dimensions.height}
          decoding="async"
          loading={priority ? "eager" : "lazy"}
        />
      ))}
    </span>
  );
}
