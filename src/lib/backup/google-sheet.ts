import type { SheetPayload } from "./sheet-payload";

/**
 * Pushes a sheet payload to the Google Sheet.
 *
 * The Sheet is written through an Apps Script web app that checks a shared
 * secret and writes each tab with `setValues`. That keeps the Google side
 * dependency-free (no service account key to manage, no `googleapis` package
 * in the bundle) and lets the Sheet stay an ordinary spreadsheet the owner
 * can open and read.
 *
 * Apps Script web apps cannot read custom request headers, so the token
 * travels in the JSON body as `token`. It is never logged.
 */

/** Give up on a slow Apps Script rather than holding the caller hostage. */
const REQUEST_TIMEOUT_MS = 20_000;

/** True when both the webhook URL and the shared token are present. */
export function isGoogleSheetConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SHEET_SCRIPT_URL && process.env.GOOGLE_SHEET_TOKEN,
  );
}

export type PushSheetResult = {
  /** Number of trip rows the script reported writing. */
  rows: number;
  /** The spreadsheet the script actually wrote to. */
  spreadsheetId: string;
};

/** The JSON shape our Apps Script (Code.gs) answers with. */
type ScriptResponse = {
  ok?: boolean;
  error?: string;
  rows?: number;
  spreadsheetId?: string;
};

/**
 * Send the payload to the Apps Script endpoint.
 *
 * Throws on any failure so the caller can record it. The error message never
 * contains the URL, the token or customer data.
 */
export async function pushToGoogleSheet(
  payload: SheetPayload,
): Promise<PushSheetResult> {
  const url = process.env.GOOGLE_SHEET_SCRIPT_URL;
  const token = process.env.GOOGLE_SHEET_TOKEN;

  if (!url || !token) {
    throw new Error("Google Sheet backup is not configured.");
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      // text/plain avoids a CORS-style preflight that Apps Script can't answer.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      // Token goes in the body: Apps Script cannot see request headers.
      body: JSON.stringify({ token, ...payload }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      // Apps Script answers with a redirect before the real response.
      redirect: "follow",
    });
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "TimeoutError"
        ? "timed out"
        : "could not be reached";
    throw new Error(`Google Sheet backup ${reason}.`);
  }

  const body = await response.text();

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Google Sheet backup was rejected (bad token).");
    }
    throw new Error(
      `Google Sheet backup failed with HTTP ${response.status}.`,
    );
  }

  // Apps Script returns HTTP 200 even for errors, so the body decides.
  let parsed: ScriptResponse;
  try {
    parsed = JSON.parse(body) as ScriptResponse;
  } catch {
    // Usually Google's HTML error page: wrong, stale or undeployed script URL.
    const text = body.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  // console.log("HTTP status:", response.status, "final url:", response.url);
  // console.log("Readable text:", text.slice(0, 400));
  
  throw new Error("Google Sheet backup returned an unreadable response (wrong or stale script URL?).");

  }

  // Only a clear { ok: true } counts as success.
  if (parsed.ok !== true) {
    throw new Error(
      `Google Sheet backup failed: ${parsed.error ?? "unknown error"}`,
    );
  }

  const spreadsheetId = parsed.spreadsheetId ?? "";

  // If the script wrote to a different spreadsheet than the owner expects,
  // the copy would quietly end up somewhere they are not looking. The backup
  // still succeeds; the mismatch is reported so it can be noticed and fixed.
  const expectedId = process.env.GOOGLE_SHEET_ID?.trim();
  if (expectedId && spreadsheetId && expectedId !== spreadsheetId) {
    console.warn(
      `Backup: the Google Sheet backup went to spreadsheet ${spreadsheetId}, but GOOGLE_SHEET_ID says ${expectedId}. Check SPREADSHEET_ID in the Apps Script properties.`,
    );
  }

  return {
    rows: typeof parsed.rows === "number" ? parsed.rows : 0,
    spreadsheetId,
  };
}