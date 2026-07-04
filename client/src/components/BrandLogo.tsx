type BrandLogoProps = {
  alt?: string;
  className?: string;
  decorative?: boolean;
  imageClassName?: string;
  priority?: boolean;
};

/**
 * Renders the shared brand logo component used across SQR screens.
 */
export function BrandLogo({
  alt = "SQR System logo",
  className,
  decorative = false,
  imageClassName,
  priority = false,
}: BrandLogoProps) {
  const loading = priority ? "eager" : "lazy";
  const resolvedAlt = alt.trim() || "SQR System logo";

  if (decorative) {
    return (
      <picture className={className} aria-hidden="true">
        <source srcSet="/brand/sqr-logo-minimal.webp" type="image/webp" />
        <img
          src="/brand/sqr-logo-minimal.svg"
          alt=""
          role="presentation"
          className={imageClassName}
          width={128}
          height={128}
          decoding="async"
          loading={loading}
        />
      </picture>
    );
  }

  return (
    <picture className={className}>
      <source srcSet="/brand/sqr-logo-minimal.webp" type="image/webp" />
      <img
        src="/brand/sqr-logo-minimal.svg"
        alt={resolvedAlt}
        className={imageClassName}
        width={128}
        height={128}
        decoding="async"
        loading={loading}
      />
    </picture>
  );
}
