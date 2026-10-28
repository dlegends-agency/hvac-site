import type { CSSProperties } from "react";

/** Spread onto an element to fade it in when it scrolls into view. i staggers siblings (0 to 3). */
export const reveal = (i = 0) => ({
  "data-reveal": "",
  style: { "--d": `${(i % 4) * 90}ms` } as CSSProperties,
});

/** Delay helper for load-time entrance animations. */
export const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;
