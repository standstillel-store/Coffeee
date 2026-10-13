import type { CSSProperties } from 'react';

/** Style React yang boleh memuat custom property CSS (--nama). */
export type CSSVars = CSSProperties & { [key: `--${string}`]: string | number | undefined };

export const cssVars = (vars: CSSVars): CSSProperties => vars;
