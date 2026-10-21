import type { SheetPayload } from "./sheet-payload";

/**
 * Pushes a sheet payload to the Google Sheet.
 *
 * The Sheet is written through an Apps Script web app: the script is bound to
 * the spreadsheet, checks a shared secret, and writes the tabs with
 * `setValues`. That keeps the Google side dependency-free (no service account
 * key to manage, no `googleapis` package in the bundle) and lets the Sheet
 * stay an ordinary spreadsheet the owner can open and read.
 *
 * The token travels in the `X-Backup-Token` header and is never logged.
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
      headers: {
        "Content-Type": "application/json",
        "X-Backup-Token": token,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      // The Apps Script endpoint is a plain web app, never a browser session.
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

  let parsed: { ok?: boolean; rows?: number; spreadsheetId?: string };
  try {
    parsed = JSON.parse(body) as typeof parsed;
  } catch {
    // A 2xx with an unreadable body still means the request was accepted.
    return { rows: 0, spreadsheetId: "" };
  }

  if (parsed.ok === false) {
    throw new Error(
      typeof parsed.rows === "number"
        ? `Google Sheet backup failed (${parsed.rows}).`
        : "Google Sheet backup failed.",
    );
  }

  const spreadsheetId = parsed.spreadsheetId ?? "";

  // The script writes to the sheet it is bound to. If that is not the sheet
  // the owner expects, the copy would quietly end up somewhere they are not
  // looking. The backup still succeeds — the mismatch is reported so it can
  // be noticed and fixed.
  const expectedId = process.env.GOOGLE_SHEET_ID?.trim();
  if (expectedId && spreadsheetId && expectedId !== spreadsheetId) {
    console.warn(
      `Backup: the Google Sheet backup went to spreadsheet ${spreadsheetId}, but GOOGLE_SHEET_ID says ${expectedId}. Check that the Apps Script is bound to the right sheet.`,
    );
  }

  return {
    rows: typeof parsed.rows === "number" ? parsed.rows : 0,
    spreadsheetId,
  };
}
