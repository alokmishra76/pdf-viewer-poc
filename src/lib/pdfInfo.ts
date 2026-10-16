/**
 * A linearized ("web-optimized") PDF declares itself in its first object,
 * within the first kilobyte: `<< /Linearized 1 ... >>`. Reading 1 KB from the
 * disk-backed File is instant, even for a 1 GB document.
 *
 * Why it matters (measured with Apryse WebViewer 12 on a 1 GB file):
 *  - linearized: opens in ~1 s, reads ~100 MB, memory stays nearly flat
 *  - not linearized: Apryse must read the entire file first (8-17 s, +1 GB memory)
 */
export async function isLinearized(file: Blob): Promise<boolean> {
  const head = await file.slice(0, 1024).text();
  return /\/Linearized\s/.test(head);
}
