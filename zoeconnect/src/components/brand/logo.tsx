import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The real ZoeConnect brand mark, in three forms:
 *  - "icon": the Z-glyph alone, for compact contexts (favicons, tight nav).
 *  - "icon-text": the icon plus a typed wordmark, for the navbar/footer,
 *    where a crisp system-font label reads better at small sizes than a
 *    rasterized wordmark.
 *  - "full": the actual brand lockup PNG (icon + wordmark + tagline), for
 *    brand moments with room to breathe, like the sign-in page.
 */
export function Logo({
  variant = "icon-text",
  className,
  iconSize = 32,
}: {
  variant?: "icon" | "icon-text" | "full";
  className?: string;
  iconSize?: number;
}) {
  if (variant === "full") {
    return (
      <Image
        src="/brand/logo-full.png"
        alt="ZoeConnect — Connect. Automate. Elevate."
        width={1297}
        height={1022}
        className={cn("h-auto w-full max-w-xs", className)}
        priority
      />
    );
  }

  return (
    <span className={cn("flex items-center gap-2", className)}>
      <Image
        src="/brand/logo-icon.png"
        alt="ZoeConnect"
        width={iconSize}
        height={iconSize * 1.27}
        style={{ height: iconSize, width: "auto" }}
        priority
      />
      {variant === "icon-text" && (
        <span className="font-display text-lg font-semibold tracking-tight">ZoeConnect</span>
      )}
    </span>
  );
}
