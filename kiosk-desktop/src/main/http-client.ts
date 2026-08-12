import * as http from 'http';
import * as https from 'https';

/**
 * Tiny dependency-free JSON HTTP client (GET/POST) shared by every module
 * that talks to the HDSP backend: print-config-cache.ts, kiosk-auth-client.ts,
 * heartbeat-service.ts. Centralizing this avoids each of them re-implementing
 * its own http/https request plumbing (the "no duplicated logic" code-quality
 * requirement) and keeps the one retry/timeout policy in one place.
 */

export interface HttpJsonResult<T> {
  status: number;
  body: T;
}

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

function request<T>(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  options: { body?: unknown; headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<HttpJsonResult<T>> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (err) {
      reject(err);
      return;
    }

    const payload = options.body !== undefined ? JSON.stringify(options.body) : undefined;
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.request(
      parsed,
      {
        method,
        timeout: options.timeoutMs ?? 5000,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...options.headers,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          let body: unknown = undefined;
          try {
            body = raw ? JSON.parse(raw) : undefined;
          } catch {
            // Non-JSON response body -- leave body undefined, caller decides
            // whether that matters based on status.
          }
          if (status >= 400) {
            const message =
              (body && typeof body === 'object' && 'message' in body
                ? String((body as { message: unknown }).message)
                : undefined) ?? `HTTP ${status} from ${url}`;
            reject(new HttpError(status, message));
            return;
          }
          resolve({ status, body: body as T });
        });
      },
    );

    req.on('timeout', () => req.destroy(new Error(`Timed out calling ${url}`)));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

export function getJson<T>(url: string, headers?: Record<string, string>, timeoutMs?: number): Promise<T> {
  return request<T>('GET', url, { headers, timeoutMs }).then((r) => r.body);
}

export function postJson<T>(url: string, body: unknown, headers?: Record<string, string>, timeoutMs?: number): Promise<T> {
  return request<T>('POST', url, { body, headers, timeoutMs }).then((r) => r.body);
}

export function patchJson<T>(url: string, body: unknown, headers?: Record<string, string>, timeoutMs?: number): Promise<T> {
  return request<T>('PATCH', url, { body, headers, timeoutMs }).then((r) => r.body);
}
