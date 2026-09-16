// Минимальный клиент Google Sheets API v4 для Cloudflare Workers / Node 22+.
// Без googleapis: аутентификация service account через JWT RS256 (Web Crypto),
// дальше обычный fetch. Секреты приходят только из env/bindings и никогда не
// попадают в client bundle — модуль используется только на server-side.

import type { SheetCell } from "./sheets-schema.ts";

export type SheetsTransport = {
  /** Гарантирует строку заголовков на пустом листе (идемпотентно). */
  ensureHeader(tab: string, header: readonly string[]): Promise<void>;
  /** Читает первую колонку листа (кроме заголовка) — для dedupe/upsert. */
  readFirstColumn(tab: string): Promise<string[]>;
  /** Добавляет строки в конец листа. */
  appendRows(tab: string, rows: SheetCell[][]): Promise<void>;
  /** Полностью перезаписывает лист (header + строки). */
  rewriteTab(tab: string, header: readonly string[], rows: SheetCell[][]): Promise<void>;
};

export type ServiceAccountKey = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";

function base64UrlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function signJwtRs256(key: ServiceAccountKey, now: number = Date.now()): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64UrlEncode(
    JSON.stringify({
      iss: key.client_email,
      scope: SHEETS_SCOPE,
      aud: key.token_uri ?? DEFAULT_TOKEN_URI,
      iat: Math.floor(now / 1000),
      exp: Math.floor(now / 1000) + 3600,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(key.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function getGoogleAccessToken(
  key: ServiceAccountKey,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const assertion = await signJwtRs256(key);
  const response = await fetchImpl(key.token_uri ?? DEFAULT_TOKEN_URI, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });
  if (!response.ok) {
    throw new Error(`Google token request failed: ${response.status}`);
  }
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("Google token response has no access_token");
  return body.access_token;
}

export function createGoogleSheetsTransport(input: {
  spreadsheetId: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
}): SheetsTransport {
  const doFetch = input.fetchImpl ?? fetch;
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${input.spreadsheetId}`;
  const authorized = (url: string, init?: RequestInit) =>
    doFetch(url, {
      ...init,
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

  return {
    async ensureHeader(tab, header) {
      const range = encodeURIComponent(`${tab}!A1:A1`);
      const response = await authorized(`${base}/values/${range}`);
      if (!response.ok) {
        throw new Error(`Sheets read header ${tab} failed: ${response.status}`);
      }
      const body = (await response.json()) as { values?: string[][] };
      const current = body.values?.[0]?.[0];
      if (current) return;
      const writeRange = encodeURIComponent(`${tab}!A1`);
      const write = await authorized(`${base}/values/${writeRange}?valueInputOption=RAW`, {
        method: "PUT",
        body: JSON.stringify({ values: [header] }),
      });
      if (!write.ok) {
        throw new Error(`Sheets write header ${tab} failed: ${write.status}`);
      }
    },

    async readFirstColumn(tab) {
      const range = encodeURIComponent(`${tab}!A2:A`);
      const response = await authorized(`${base}/values/${range}`);
      if (!response.ok) {
        throw new Error(`Sheets read ${tab} failed: ${response.status}`);
      }
      const body = (await response.json()) as { values?: string[][] };
      return (body.values ?? []).map((row) => String(row[0] ?? ""));
    },

    async appendRows(tab, rows) {
      if (rows.length === 0) return;
      const range = encodeURIComponent(`${tab}!A1`);
      const response = await authorized(
        `${base}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        { method: "POST", body: JSON.stringify({ values: rows }) },
      );
      if (!response.ok) {
        throw new Error(`Sheets append ${tab} failed: ${response.status}`);
      }
    },

    async rewriteTab(tab, header, rows) {
      const allRange = encodeURIComponent(`${tab}!A1:ZZ`);
      const clear = await authorized(`${base}/values/${allRange}:clear`, {
        method: "POST",
        body: "{}",
      });
      if (!clear.ok) {
        throw new Error(`Sheets clear ${tab} failed: ${clear.status}`);
      }
      const range = encodeURIComponent(`${tab}!A1`);
      const response = await authorized(
        `${base}/values/${range}?valueInputOption=RAW`,
        { method: "PUT", body: JSON.stringify({ values: [header, ...rows] }) },
      );
      if (!response.ok) {
        throw new Error(`Sheets write ${tab} failed: ${response.status}`);
      }
    },
  };
}
