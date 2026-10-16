/**
 * The page-list model behind page editing.
 *
 * Every page shown in the editor is a "token": a page of the file on disk (the
 * "base file"), or a new blank page, plus its rotation. The editor's state is
 * simply the ordered list of tokens. Moving, swapping, inserting, duplicating,
 * deleting, rotating, undo and redo all produce a new list, and
 * `applyPageList` changes the viewer to match it with as few operations as
 * possible.
 *
 * Saved edits are page lists too (see PageEdits in types.ts). The cached copy
 * of a document is "base file + saved page lists", so `composeChain` rebuilds
 * the current version's pages from the base file without any download.
 */
import type { LegacyPageEdits, PageEdits, PageListEntry, SavedEdits } from '../types';
import type { Rotation, ViewerHandle } from '../viewer/ApryseViewer';

export type Rotation0 = 0 | Rotation;

export type PageRef = { kind: 'base'; base: number } | { kind: 'blank'; width: number; height: number };

export interface PageToken {
  /** Stable identity while editing; the first copy of base page N is "b:N" */
  id: string;
  ref: PageRef;
  /** Clockwise rotation relative to the page as stored in the base file */
  rotate: Rotation0;
}

let counter = 0;
export const newTokenId = (prefix: 'c' | 'n') => `${prefix}:${Date.now().toString(36)}:${++counter}`;

const addRotation = (a: number, b: number) => ((((a + b) % 360) + 360) % 360) as Rotation0;

export function identityTokens(pageCount: number): PageToken[] {
  return Array.from({ length: pageCount }, (_, i) => ({ id: `b:${i + 1}`, ref: { kind: 'base', base: i + 1 }, rotate: 0 }));
}

function isLegacy(edits: SavedEdits): edits is LegacyPageEdits {
  return !('pages' in edits);
}

/** Expands one saved edit set into entries for each output page. */
function expandEntries(edits: SavedEdits, previousCount: number) {
  type Out = { page: number; rotate: number } | { blank: { width: number; height: number } };
  const out: Out[] = [];
  if (isLegacy(edits)) {
    const deleted = new Set(edits.deletePages);
    const rotation = new Map(edits.rotatePages.map((r) => [r.page, r.degrees]));
    for (let page = 1; page <= previousCount; page++) {
      if (!deleted.has(page)) out.push({ page, rotate: rotation.get(page) ?? 0 });
    }
    return out;
  }
  for (const entry of edits.pages) {
    if ('blank' in entry) out.push({ blank: entry.blank });
    else {
      const from = 'page' in entry ? entry.page : entry.from;
      const to = 'page' in entry ? entry.page : entry.to;
      for (let page = from; page <= to; page++) out.push({ page, rotate: entry.rotate ?? 0 });
    }
  }
  return out;
}

/** The pages of the latest version, built from the base file and the saved edits (oldest first). */
export function composeChain(basePageCount: number, chain: SavedEdits[]): PageToken[] {
  let pages = identityTokens(basePageCount);
  for (const edits of chain) {
    const previous = pages;
    pages = expandEntries(edits, previous.length).map((entry) => {
      if ('blank' in entry) return { id: newTokenId('n'), ref: { kind: 'blank', ...entry.blank }, rotate: 0 };
      const source = previous[entry.page - 1];
      return { ...source, rotate: addRotation(source.rotate, entry.rotate) };
    });
  }
  // Give every repeated page its own identity: first copy keeps "b:N", later ones are copies
  const seen = new Set<string>();
  return pages.map((token) => {
    if (seen.has(token.id)) return { ...token, id: newTokenId('c') };
    seen.add(token.id);
    return token;
  });
}

export function sameList(a: PageToken[], b: PageToken[]): boolean {
  return a.length === b.length && a.every((t, i) => t.id === b[i].id && t.rotate === b[i].rotate);
}

/**
 * Turns the edited list into what the server expects: page numbers of the
 * version being edited, as compact ranges.
 */
export function toServerEdits(target: PageToken[], versionPages: PageToken[]): PageEdits {
  const byId = new Map(versionPages.map((t, i) => [t.id, i]));
  const byBase = new Map<number, number>();
  versionPages.forEach((t, i) => {
    if (t.ref.kind === 'base' && !byBase.has(t.ref.base)) byBase.set(t.ref.base, i);
  });

  const entries: PageListEntry[] = [];
  for (const token of target) {
    if (token.ref.kind === 'blank') {
      const turned = token.rotate === 90 || token.rotate === 270;
      entries.push({ blank: turned ? { width: token.ref.height, height: token.ref.width } : { width: token.ref.width, height: token.ref.height } });
      continue;
    }
    const index = byId.get(token.id) ?? byBase.get(token.ref.base);
    if (index === undefined) throw new Error('A page in the edited list does not exist in this version.');
    const page = index + 1;
    const rotate = addRotation(token.rotate, -versionPages[index].rotate);
    const last = entries[entries.length - 1];
    if (last && 'from' in last && last.to === page - 1 && (last.rotate ?? 0) === rotate) last.to = page;
    else entries.push(rotate ? { from: page, to: page, rotate } : { from: page, to: page });
  }
  return { pages: entries.map((e) => ('from' in e && e.from === e.to ? { page: e.from, ...(e.rotate ? { rotate: e.rotate } : {}) } : e)) };
}

/** Indexes of the longest increasing subsequence of `values` (these pages don't need to move). */
function longestIncreasing(values: number[]): Set<number> {
  const tails: number[] = [];
  const tailIndex: number[] = [];
  const previous = new Array<number>(values.length).fill(-1);
  values.forEach((value, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < value) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = value;
    tailIndex[lo] = i;
    previous[i] = lo > 0 ? tailIndex[lo - 1] : -1;
  });
  const keep = new Set<number>();
  let i = tailIndex[tails.length - 1] ?? -1;
  while (i >= 0) {
    keep.add(i);
    i = previous[i];
  }
  return keep;
}

/**
 * Changes the viewer from `working` (what it shows now) to `target`.
 * Returns the new working list. Steps:
 *   1. add pages that are new (blank pages; copies or restored pages from the base file)
 *   2. remove pages that are gone (one call)
 *   3. move only the pages that are out of order (fewest moves)
 *   4. fix rotations (one call per angle)
 */
export async function applyPageList(viewer: ViewerHandle, working: PageToken[], target: PageToken[]): Promise<PageToken[]> {
  let w = working.map((t) => ({ ...t }));
  const targetIds = new Set(target.map((t) => t.id));
  const workingIds = new Set(w.map((t) => t.id));

  // 1. Add new pages at the end; step 3 moves them into place
  const missing = target.filter((t) => !workingIds.has(t.id));
  for (const token of missing) {
    if (token.ref.kind === 'blank') {
      await viewer.insertBlankPage(w.length + 1, token.ref.width, token.ref.height);
      w.push({ ...token, rotate: 0 });
    }
  }
  // Copies and restored pages: copy from a page already in the document when there
  // is one (cheap); otherwise take it from the base file (opens it once, ~6 s for 1 GB)
  const fromLibrary: PageToken[] = [];
  for (const token of missing) {
    if (token.ref.kind !== 'base') continue;
    const base = token.ref.base;
    const sourceIndex = w.findIndex((t) => t.ref.kind === 'base' && t.ref.base === base);
    if (sourceIndex >= 0) {
      await viewer.copyPage(sourceIndex + 1, w.length + 1);
      // The copy keeps the source page's current rotation
      w.push({ ...token, rotate: w[sourceIndex].rotate });
    } else {
      fromLibrary.push(token);
    }
  }
  if (fromLibrary.length > 0) {
    await viewer.insertFromSource(
      fromLibrary.map((t) => (t.ref as { base: number }).base),
      w.length + 1
    );
    w.push(...fromLibrary.map((t) => ({ ...t, rotate: 0 as Rotation0 })));
  }

  // 2. Remove pages that are not in the target
  const toRemove = w.map((t, i) => (targetIds.has(t.id) ? 0 : i + 1)).filter(Boolean);
  if (toRemove.length > 0) {
    await viewer.removePages(toRemove);
    w = w.filter((t) => targetIds.has(t.id));
  }

  // 3. Reorder: pages in the longest already-ordered run stay put; each other page
  //    goes right after the page that precedes it in the target
  const position = new Map(w.map((t, i) => [t.id, i]));
  const stay = longestIncreasing(target.map((t) => position.get(t.id)!));
  for (let k = 0; k < target.length; k++) {
    if (stay.has(k)) continue;
    const from = w.findIndex((t) => t.id === target[k].id);
    let to = k === 0 ? 0 : w.findIndex((t) => t.id === target[k - 1].id) + 1;
    if (from < to) to -= 1; // index after the page is taken out
    if (from === to) continue;
    // Apryse inserts before a page number counted before the move
    const insertBefore = to < from ? to + 1 : to + 2;
    await viewer.movePage(from + 1, insertBefore);
    const [moved] = w.splice(from, 1);
    w.splice(to, 0, moved);
  }

  // 4. Rotations
  const byDegrees = new Map<Rotation, number[]>();
  target.forEach((t, i) => {
    const diff = addRotation(t.rotate, -w[i].rotate);
    if (diff) byDegrees.set(diff, [...(byDegrees.get(diff) ?? []), i + 1]);
  });
  for (const [degrees, pages] of byDegrees) await viewer.rotatePages(pages, degrees);

  return target.map((t) => ({ ...t }));
}
