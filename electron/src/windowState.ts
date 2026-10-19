export interface WindowSize {
  width: number;
  height: number;
  maximized: boolean;
}

interface Size {
  width: number;
  height: number;
}

/**
 * The size to reopen the main window at, from what the last close saved.
 *
 * Anything unreadable falls back to `fallback`. Both are clamped to the current
 * screen's work area, so a size saved on a larger monitor does not open a window
 * bigger than the one it is shown on. The window's minimum wins over the screen.
 */
export function restoredWindowSize(
  saved: Record<string, unknown> | null,
  workArea: Size,
  min: Size,
  fallback: Size,
): WindowSize {
  const clamp = (value: unknown, lo: number, hi: number, dflt: number): number =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.round(Math.max(lo, Math.min(hi, value)))
      : Math.min(hi, dflt);
  return {
    width: clamp(saved?.width, min.width, workArea.width, fallback.width),
    height: clamp(saved?.height, min.height, workArea.height, fallback.height),
    maximized: saved?.maximized === true,
  };
}
