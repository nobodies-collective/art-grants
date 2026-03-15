/**
 * Google Apps Script — Form submission handler for Art Grants
 *
 * This script lives on the FORM RESPONSES spreadsheet.
 * On new submission it sets Slug, Status, Messaging On in the form sheet.
 *
 * SETUP:
 * 1. Open the Form Responses spreadsheet in Google Sheets
 * 2. Go to Extensions → Apps Script, paste this file
 * 3. Add trigger: Clock icon → + Add Trigger
 *    - Function: onFormSubmit
 *    - Event source: From spreadsheet
 *    - Event type: On form submit
 */

var FORM_TAB_NAME = 'Art Grants';
var ADMIN_HEADERS = ['Slug', 'Status', 'Messaging On'];

// ─── Helpers ──────────────────────────────────────────────────────────

function generateSlug(title) {
  return (title || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function findHeaderIndex(headers, candidates) {
  for (var i = 0; i < headers.length; i++) {
    var h = (headers[i] || '').toString().toLowerCase().trim();
    for (var j = 0; j < candidates.length; j++) {
      if (h === candidates[j].toLowerCase()) return i;
    }
  }
  return -1;
}

function ensureAdminHeaders(sheet, headers) {
  var slugIdx = findHeaderIndex(headers, ['slug']);
  var startCol;

  if (slugIdx !== -1) {
    startCol = slugIdx + 1;
  } else {
    startCol = headers.length + 1;
    for (var i = headers.length - 1; i >= 0; i--) {
      if ((headers[i] || '').toString().trim() !== '') {
        startCol = i + 2;
        break;
      }
    }
  }

  for (var i = 0; i < ADMIN_HEADERS.length; i++) {
    var col = startCol + i;
    var current = sheet.getRange(1, col).getValue().toString().trim();
    if (!current) {
      sheet.getRange(1, col).setValue(ADMIN_HEADERS[i]);
    }
  }
}

// ─── Form submission trigger ──────────────────────────────────────────

function onFormSubmit(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(FORM_TAB_NAME);
    if (!sheet) return;

    var row = e.range.getRow();
    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, Math.max(lastCol, 26)).getValues()[0];

    ensureAdminHeaders(sheet, headers);
    headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    var titleIdx = findHeaderIndex(headers, ['title']);
    var slugIdx = findHeaderIndex(headers, ['slug']);
    var statusIdx = findHeaderIndex(headers, ['status']);
    var messagingOnIdx = findHeaderIndex(headers, ['messaging on']);

    if (titleIdx === -1 || slugIdx === -1) return;

    var title = sheet.getRange(row, titleIdx + 1).getValue().toString().trim();
    if (!title) return;

    var slug = generateSlug(title);

    // Set admin fields in form sheet
    sheet.getRange(row, slugIdx + 1).setValue(slug);
    if (statusIdx !== -1) {
      sheet.getRange(row, statusIdx + 1).setValue('Under Review');
    }
    if (messagingOnIdx !== -1) {
      sheet.getRange(row, messagingOnIdx + 1).setValue('TRUE');
    }

    Logger.log('onFormSubmit: processed "' + title + '" (' + slug + ')');
  } catch (err) {
    Logger.log('onFormSubmit error: ' + err.message);
  }
}
