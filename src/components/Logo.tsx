import { siteConfig } from "@/config/site";

/**
 * Brand logo image. Use light on dark backgrounds (white wordmark).
 * Files: public/logo.png (transparent, for light backgrounds) and public/logo-light.png.
 */
export function Logo({ light = false, className = "" }: { light?: boolean; className?: string }) {
  return (
    <img
      src={light ? "/logo-light.png" : "/logo.png"}
      alt={siteConfig.brand.name}
      width={1000}
      height={250}
      decoding="async"
      className={`h-9 w-auto sm:h-11 ${className}`}
    />
  );
}
