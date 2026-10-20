import { config } from '../config';

/** An error answer from the API: { error: 'CODE', message, details? } */
export class HttpError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly details: Array<{ field: string | null; message: string }> = []
  ) {
    super(message);
  }
}

/** A plain-object copy of HttpError, so it can travel through Redux actions. */
export interface ApiErrorPayload {
  code: string;
  message: string;
  status: number;
}

export function toApiErrorPayload(err: unknown): ApiErrorPayload {
  if (err instanceof HttpError) {
    // For validation errors the field messages are more useful than "Some fields are invalid."
    const detail = err.details.map((d) => d.message).join(' ');
    return { code: err.code, message: detail || err.message, status: err.status };
  }
  return { code: 'UNKNOWN', message: 'Something went wrong. Please try again.', status: 0 };
}

type QueryValue = string | number | boolean | string[] | undefined | null;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Access token, sent as "Authorization: Bearer <token>" */
  token?: string | null;
  /** Query string. Arrays are sent as repeated params (?status=a&status=b); empty values are skipped. */
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
}

function buildQuery(query: Record<string, QueryValue> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.append(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Calls the API and returns the JSON body, or throws an HttpError. */
export async function apiRequest<T>(path: string, { method = 'GET', token, query, body, signal }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${config.apiBase}${path}${buildQuery(query)}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new HttpError('Could not reach the server. Check that the mock server is running.', 'NETWORK', 0);
  }

  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (response.ok) return data as T;

  throw new HttpError(
    data?.message || `The server returned an error (HTTP ${response.status}).`,
    data?.error || 'SERVER',
    response.status,
    data?.details ?? []
  );
}
