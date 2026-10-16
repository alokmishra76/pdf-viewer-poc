/**
 * Blank-page detection for page editing.
 */

/**
 * Share of "ink" (dark pixels) on a page thumbnail, ignoring the outer margins
 * where fax headers, footers and punch holes usually are. Scanned paper is
 * never pure white, so the cut-off is "clearly darker than paper", not "not white".
 *
 * Measured on the test packets: blank scans 0.00%, normal pages 22-29%.
 */
export function inkRatio(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 1;
  const x0 = Math.round(canvas.width * 0.06);
  const y0 = Math.round(canvas.height * 0.08);
  const width = canvas.width - 2 * x0;
  const height = canvas.height - 2 * y0;
  if (width <= 0 || height <= 0) return 1;

  const data = ctx.getImageData(x0, y0, width, height).data;
  let ink = 0;
  for (let i = 0; i < data.length; i += 4) {
    const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (luminance < 200) ink++;
  }
  return ink / (data.length / 4);
}

/**
 * Pages with less ink than this are suggested as blank. Kept deliberately low:
 * a page with a single signature line still has more. The user always confirms.
 */
export const BLANK_PAGE_INK_THRESHOLD = 0.005;
