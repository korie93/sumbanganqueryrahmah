type BrandLogoProps = {
  alt?: string;
  className?: string;
  decorative?: boolean;
  imageClassName?: string;
  priority?: boolean;
};

export function BrandLogo({
  alt = "SQR System logo",
  className,
  decorative = false,
  imageClassName,
  priority = false,
}: BrandLogoProps) {
  const resolvedAlt = decorative ? "" : alt;

  return (
    <picture className={className}>
      <source srcSet="/brand/sqr-logo-minimal.webp" type="image/webp" />
      {decorative ? (
        <img
          src="/brand/sqr-logo-minimal.svg"
          alt={resolvedAlt}
          aria-hidden="true"
          className={imageClassName}
          width={128}
          height={128}
          decoding="async"
          loading={priority ? "eager" : "lazy"}
        />
      ) : (
        <img
          src="/brand/sqr-logo-minimal.svg"
          alt={resolvedAlt}
          className={imageClassName}
          width={128}
          height={128}
          decoding="async"
          loading={priority ? "eager" : "lazy"}
        />
      )}
    </picture>
  );
}
