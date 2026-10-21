/**
 * Google Apps Script that receives the diary backup and writes it into a
 * Google Sheet.
 *
 * SETUP (about five minutes, once):
 *
 *  1. Create a blank Google Sheet.
 *  2. Open it, then Extensions -> Apps Script.
 *  3. Delete whatever is in the editor and paste this whole file in.
 *  4. Project Settings -> Script Properties, and add:
 *       BACKUP_TOKEN     = the same secret as GOOGLE_SHEET_TOKEN in .env
 *       SPREADSHEET_ID   = the id from the sheet URL
 *                          (https://docs.google.com/spreadsheets/d/<ID>/edit)
 *
 *     A script created from inside the sheet already knows which sheet it
 *     belongs to, so SPREADSHEET_ID is only needed when the script was
 *     created standalone. It is still worth setting: the id is sent back with
 *     every backup, so the app can warn when the copy lands in a spreadsheet
 *     other than the one you expected.
 *  5. Deploy -> New deployment -> Type "Web app".
 *       Execute as  : Me
 *       Who has access: Anyone
 *  6. Copy the "Web app URL" that ends in /exec. That is
 *     GOOGLE_SHEET_SCRIPT_URL in .env.
 *
 * The script only ever writes. It never reads the diary back, and it refuses
 * every request that does not carry the shared token.
 */

var TAB_TRIPS = "Trips";
var TAB_DAILY = "Daily Summary";
var TAB_MONTHLY = "Monthly Summary";
var TAB_META = "Meta";

var PROP_TOKEN = "BACKUP_TOKEN";
var PROP_SHEET_ID = "SPREADSHEET_ID";

/**
 * Columns that must stay plain text.
 *
 * Without this, Google Sheets would silently turn "2026-10-20" and
 * "2026-10-20T05:30:00.000Z" into date values, and then the backup could no
 * longer tell whether a row had actually changed.
 */
var TEXT_COLUMNS = {};
TEXT_COLUMNS[TAB_TRIPS] = [2, 8, 9]; // tripDate, createdAt, updatedAt
TEXT_COLUMNS[TAB_DAILY] = [1]; // date
TEXT_COLUMNS[TAB_MONTHLY] = [1]; // month
TEXT_COLUMNS[TAB_META] = [2]; // value

/** A harmless status endpoint, handy for checking the deployment. */
function doGet() {
  return json_({ ok: true, service: "diary-backup" });
}

function doPost(e) {
  try {
    var expected = PropertiesService.getScriptProperties().getProperty(
      PROP_TOKEN,
    );
    if (!expected) {
      return json_({ ok: false, error: "The backup token is not set." }, 503);
    }

    var provided = readToken_(e);
    if (!provided || provided !== expected) {
      return json_({ ok: false, error: "Unauthorized." }, 401);
    }

    if (!e || !e.postData || !e.postData.contents) {
      return json_({ ok: false, error: "Empty request body." }, 400);
    }

    var payload = JSON.parse(e.postData.contents);
    if (!payload || !payload.tabs) {
      return json_({ ok: false, error: "Unexpected payload." }, 400);
    }

    var spreadsheet = getSpreadsheet_();
    var rows = writeTabs_(spreadsheet, payload.tabs);

    return json_({
      ok: true,
      rows: rows,
      spreadsheetId: spreadsheet.getId(),
    });
  } catch (error) {
    return json_(
      {
        ok: false,
        error: String(error && error.message ? error.message : error),
      },
      500,
    );
  }
}

/** The token may arrive in a header or, as a fallback, in the query string. */
function readToken_(e) {
  if (e && e.requestHeaders) {
    var headers = e.requestHeaders;
    var fromHeader = headers["X-Backup-Token"] || headers["x-backup-token"];
    if (fromHeader) return String(fromHeader).trim();
  }
  if (e && e.parameter && e.parameter.token) {
    return String(e.parameter.token).trim();
  }
  return "";
}

/**
 * The spreadsheet to write to.
 *
 * A bound script (one created from inside the sheet) knows its own sheet, so
 * the id only has to be set when the script was created standalone.
 */
function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty(PROP_SHEET_ID);
  if (id) return SpreadsheetApp.openById(id.trim());

  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;

  throw new Error(
    "No spreadsheet is configured. Set the " + PROP_SHEET_ID + " script property.",
  );
}

function getOrCreateTab_(spreadsheet, name) {
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  return sheet;
}

/**
 * Write every tab.
 *
 * The trips tab is updated in place, keyed on the trip id, so only rows that
 * really changed are written and any cell that was edited by hand survives.
 * The summary tabs are small and are rewritten in full.
 */
function writeTabs_(spreadsheet, tabs) {
  var tripRows = tabs[TAB_TRIPS] || [];
  var tripSheet = getOrCreateTab_(spreadsheet, TAB_TRIPS);
  applyTextFormat_(tripSheet, TAB_TRIPS, tripRows);
  var written = upsertByKey_(tripSheet, tripRows);

  var dailyRows = tabs[TAB_DAILY] || [];
  var dailySheet = getOrCreateTab_(spreadsheet, TAB_DAILY);
  applyTextFormat_(dailySheet, TAB_DAILY, dailyRows);
  writeFull_(dailySheet, dailyRows);

  var monthlyRows = tabs[TAB_MONTHLY] || [];
  var monthlySheet = getOrCreateTab_(spreadsheet, TAB_MONTHLY);
  applyTextFormat_(monthlySheet, TAB_MONTHLY, monthlyRows);
  writeFull_(monthlySheet, monthlyRows);

  var metaRows = tabs[TAB_META] || [];
  var metaSheet = getOrCreateTab_(spreadsheet, TAB_META);
  applyTextFormat_(metaSheet, TAB_META, metaRows);
  writeFull_(metaSheet, metaRows);

  return written;
}

/** Keep the date-like columns as text so they can be compared reliably. */
function applyTextFormat_(sheet, tabName, rows) {
  var columns = TEXT_COLUMNS[tabName] || [];
  if (!columns.length) return;
  var width = rows.length ? rows[0].length : 1;
  for (var c = 0; c < columns.length; c++) {
    var column = columns[c];
    if (column > width) continue;
    sheet.getRange(1, column, sheet.getMaxRows(), 1).setNumberFormat("@");
  }
}

/** Replace the whole tab. Used for the small summary tabs. */
function writeFull_(sheet, rows) {
  sheet.clearContents();
  if (!rows.length) return;

  var width = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].length > width) width = rows[i].length;
  }
  sheet.getRange(1, 1, rows.length, width).setValues(rows);
}

/**
 * Insert or update rows, keyed on the first column.
 *
 * Rows that are not in the payload are removed, rows that are unchanged are
 * left alone, and only the difference is sent to Google.
 */
function upsertByKey_(sheet, rows) {
  if (!rows || !rows.length) return 0;

  var width = rows[0].length;
  var existing = {};

  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var values = sheet.getRange(2, 1, lastRow - 1, width).getValues();
    for (var i = 0; i < values.length; i++) {
      var key = values[i][0];
      if (key !== "" && key !== null && key !== undefined) {
        existing[String(key)] = { row: i + 2, values: values[i] };
      }
    }
  }

  var updates = [];
  var appends = [];
  var seen = {};

  for (var r = 1; r < rows.length; r++) {
    var row = rows[r];
    var rowKey = String(row[0]);
    seen[rowKey] = true;

    var current = existing[rowKey];
    if (current) {
      if (!sameRow_(current.values, row)) {
        updates.push({ row: current.row, values: row });
      }
    } else {
      appends.push(row);
    }
  }

  var stale = [];
  for (var existingKey in existing) {
    if (!Object.prototype.hasOwnProperty.call(existing, existingKey)) continue;
    if (!seen[existingKey]) stale.push(existing[existingKey].row);
  }

  // Updates first, while the original row numbers are still valid.
  for (var u = 0; u < updates.length; u++) {
    sheet.getRange(updates[u].row, 1, 1, width).setValues([updates[u].values]);
  }

  // Deletions from the bottom up, so the remaining row numbers stay valid.
  stale.sort(function (a, b) {
    return b - a;
  });
  for (var d = 0; d < stale.length; d++) {
    sheet.deleteRow(stale[d]);
  }

  // New rows go to the bottom.
  if (appends.length > 0) {
    var start = Math.max(sheet.getLastRow() + 1, 2);
    sheet.getRange(start, 1, appends.length, width).setValues(appends);
  }

  sheet.getRange(1, 1, 1, width).setValues([rows[0]]);

  return rows.length - 1;
}

/** Compare a stored row with an incoming row, ignoring formatting. */
function sameRow_(stored, incoming) {
  var length = Math.max(stored.length, incoming.length);
  for (var i = 0; i < length; i++) {
    if (normalizeCell_(stored[i]) !== normalizeCell_(incoming[i])) {
      return false;
    }
  }
  return true;
}

function normalizeCell_(value) {
  if (value === null || value === undefined) return "";
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd'T'HH:mm:ss.SSS",
    );
  }
  return String(value);
}

function json_(object, status) {
  var output = ContentService.createTextOutput(JSON.stringify(object));
  output.setMimeType(ContentService.MimeType.JSON);
  if (status) output.setStatusCode(status);
  return output;
}
