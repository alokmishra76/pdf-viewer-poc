import { config } from '../config';
import type { DocumentSummary, NetworkProfile, PageEdits } from '../types';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

const authHeaders = () => ({ Authorization: `Bearer ${config.apiToken}` });

async function getJson<T>(path: string, signal?: AbortSignal, withAuth = true): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${config.apiBase}${path}`, {
      headers: withAuth ? authHeaders() : undefined,
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError('Could not reach the API. Check that the mock server is running on the port set in API_TARGET.', 0);
  }
  if (response.status === 401) throw new ApiError('The API rejected the token. Check VITE_API_TOKEN matches the server.', 401);
  if (response.status >= 500 && response.headers.get('content-type')?.includes('text/plain')) {
    // Vite's proxy answers with a plain-text 500/502 when the target server is down
    throw new ApiError('The API server is not running. Start it with "npm start" in the pdf-mock-server folder.', 502);
  }
  if (!response.ok) throw new ApiError(`The API returned ${response.status}.`, response.status);
  return response.json() as Promise<T>;
}

export async function fetchDocuments(signal?: AbortSignal): Promise<DocumentSummary[]> {
  const data = await getJson<{ items: DocumentSummary[] }>('/documents', signal);
  return data.items;
}

export async function fetchNetworkProfiles(signal?: AbortSignal): Promise<{ default: string; profiles: NetworkProfile[] }> {
  return getJson('/network-profiles', signal, false);
}

/** URL for the full PDF, with the demo network profile applied. */
export function documentContentUrl(doc: DocumentSummary, networkProfile: string): string {
  return `${config.apiBase}/documents/${encodeURIComponent(doc.id)}/content?network=${encodeURIComponent(networkProfile)}`;
}

export class EditSaveError extends Error {
  constructor(
    message: string,
    /** VERSION_CONFLICT: someone saved a newer version first; EDIT_IN_PROGRESS: another save is running */
    public readonly code: 'VERSION_CONFLICT' | 'EDIT_IN_PROGRESS' | 'INVALID_EDITS' | 'NOT_FOUND' | 'NETWORK' | 'SERVER'
  ) {
    super(message);
  }
}

/**
 * Saves page changes as a new version on the server. Only the finished page
 * order is sent (a few kilobytes at most), never the PDF itself.
 */
export async function saveDocumentEdits(doc: DocumentSummary, edits: PageEdits): Promise<DocumentSummary> {
  let response: Response;
  try {
    response = await fetch(`${config.apiBase}/documents/${encodeURIComponent(doc.id)}/edits`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseVersion: doc.version, pages: edits.pages }),
    });
  } catch {
    throw new EditSaveError('Could not reach the server. Your changes are still here; try saving again.', 'NETWORK');
  }

  const body = await response.json().catch(() => ({}));
  if (response.ok) return body.document as DocumentSummary;

  const message: string = body.message || `The server returned an error (HTTP ${response.status}).`;
  if (response.status === 409 && body.error === 'EDIT_IN_PROGRESS') throw new EditSaveError(message, 'EDIT_IN_PROGRESS');
  if (response.status === 409) throw new EditSaveError(message, 'VERSION_CONFLICT');
  if (response.status === 400) throw new EditSaveError(message, 'INVALID_EDITS');
  if (response.status === 404) throw new EditSaveError(message, 'NOT_FOUND');
  throw new EditSaveError(message, 'SERVER');
}
