export interface DocumentSummary {
  id: string;
  title: string;
  documentType: string;
  fileName: string;
  chaseId: string;
  patient: { name: string; mrn: string };
  provider: string;
  dateOfService: string;
  version: number;
  synthetic: boolean;
  pageCount: number;
  createdAt: string;
  sizeBytes: number;
  sizeLabel: string;
  contentUrl: string;
  webOptimized?: boolean;
  updatedAt?: string;
}

/**
 * One entry of the finished page order sent to the server. Page numbers refer
 * to the version being edited. Rotation is clockwise. Blank sizes are in PDF
 * points (612 x 792 = US Letter portrait).
 */
export type PageListEntry =
  | { page: number; rotate?: 90 | 180 | 270 }
  | { from: number; to: number; rotate?: 90 | 180 | 270 }
  | { blank: { width: number; height: number } };

/**
 * Page changes, as sent to the server: the finished document as an ordered
 * list of pages. Pages left out are deleted; a page listed twice is duplicated.
 */
export interface PageEdits {
  pages: PageListEntry[];
}

/** The earlier delete/rotate format. Still understood when reopening older cached copies. */
export interface LegacyPageEdits {
  deletePages: number[];
  rotatePages: { page: number; degrees: 90 | 180 | 270 }[];
}

export type SavedEdits = PageEdits | LegacyPageEdits;

export interface NetworkProfile {
  name: string;
  label: string;
  mbps: number | null;
  latencyMs: number;
}

export type DownloadErrorCode =
  | 'NETWORK'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'SERVER'
  | 'INCOMPLETE'
  | 'DISK_FULL'
  | 'UNSUPPORTED';

/**
 * on-demand: web-optimized file, Apryse reads only the byte ranges it needs from disk.
 * full:      file is not web-optimized, so Apryse has to load all of it.
 */
export type LoadMode = 'on-demand' | 'full';

/** Why a document was loaded in full (shown in the status line). */
export type FullLoadReason = 'not-optimized' | 'no-service-worker' | 'includes-edits' | 'editing';

/** Everything the preview pane needs to know about the selected document. */
export type PreviewState =
  | { status: 'idle' }
  | {
      status: 'downloading';
      received: number;
      total: number;
      bytesPerSecond: number | null;
    }
  | { status: 'opening'; fromCache: boolean; loadMode: LoadMode; purpose?: 'view' | 'editing' }
  | {
      status: 'ready';
      fromCache: boolean;
      loadMode: LoadMode;
      fullReason?: FullLoadReason;
      downloadMs: number | null;
      openMs: number;
    }
  | { status: 'cancelled' }
  | { status: 'error'; code: DownloadErrorCode | 'VIEWER'; message: string };
