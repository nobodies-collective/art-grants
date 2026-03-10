/**
 * Google Apps Script — Form submission handler for Art Grants
 *
 * This script lives on the FORM RESPONSES spreadsheet.
 * On new submission it:
 *   1. Sets Slug, Status, Messaging On in the form sheet
 *   2. Generates passphrases and writes them to the Chat spreadsheet's _codes tab
 *
 * SETUP:
 * 1. Open the Form Responses spreadsheet in Google Sheets
 * 2. Go to Extensions → Apps Script, paste this file
 * 3. Add trigger: Clock icon → + Add Trigger
 *    - Function: onFormSubmit
 *    - Event source: From spreadsheet
 *    - Event type: On form submit
 *
 * NOTE: The script needs access to the Chat spreadsheet.
 * On first run, Google will ask you to authorize access.
 */

var FORM_TAB_NAME = 'Form responses 1';
var ADMIN_HEADERS = ['Slug', 'Status', 'Messaging On'];
var CHAT_SPREADSHEET_ID = '1YRh6qcl74SX_o-4lvlxzZpLBjiA8FUXn1nHb2EL3-6w';

// ─── Helpers ──────────────────────────────────────────────────────────

function generateSlug(title) {
  return (title || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function generatePassphrase() {
  var chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  var result = '';
  for (var i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
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
    var nameIdx = findHeaderIndex(headers, ['name']);
    var slugIdx = findHeaderIndex(headers, ['slug']);
    var statusIdx = findHeaderIndex(headers, ['status']);
    var messagingOnIdx = findHeaderIndex(headers, ['messaging on']);

    if (titleIdx === -1 || slugIdx === -1) return;

    var title = sheet.getRange(row, titleIdx + 1).getValue().toString().trim();
    if (!title) return;

    var artistName = nameIdx !== -1 ? sheet.getRange(row, nameIdx + 1).getValue().toString().trim() : '';
    var slug = generateSlug(title);

    // Set admin fields in form sheet
    sheet.getRange(row, slugIdx + 1).setValue(slug);
    if (statusIdx !== -1) {
      sheet.getRange(row, statusIdx + 1).setValue('Under Review');
    }
    if (messagingOnIdx !== -1) {
      sheet.getRange(row, messagingOnIdx + 1).setValue('TRUE');
    }

    // Generate passphrases and write to Chat spreadsheet
    var artistPass = generatePassphrase();
    var liaisonPass = generatePassphrase();

    try {
      var chatSS = SpreadsheetApp.openById(CHAT_SPREADSHEET_ID);
      var codesTab = chatSS.getSheetByName('_codes');
      if (codesTab) {
        codesTab.appendRow([slug, artistPass, artistName, 'Artist']);
        codesTab.appendRow([slug, liaisonPass, '', 'Liaison']);
        Logger.log('onFormSubmit: wrote passphrases to _codes for "' + slug + '"');
      } else {
        Logger.log('onFormSubmit: _codes tab not found in Chat spreadsheet');
      }
    } catch (chatErr) {
      Logger.log('onFormSubmit: could not write to Chat spreadsheet: ' + chatErr.message);
    }

    Logger.log('onFormSubmit: processed "' + title + '" (' + slug + ')');
  } catch (err) {
    Logger.log('onFormSubmit error: ' + err.message);
  }
}
