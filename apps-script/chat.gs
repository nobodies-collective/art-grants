/**
 * Google Apps Script — Chat backend for Art Grants
 *
 * SETUP:
 * 1. Open your chat spreadsheet in Google Sheets
 * 2. Go to Extensions → Apps Script
 * 3. Paste this entire file into Code.gs
 * 4. Click Deploy → New deployment
 *    - Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the deployment URL and paste it into js/constants.js as CHAT_SCRIPT_URL
 *
 * _codes tab layout (columns A–D):
 *   Column A: Project slug (or * for admin)
 *   Column B: Passphrase
 *   Column C: Display name (shown as message author)
 *   Column D: Role (Artist or Liaison)
 *
 * Example:
 *   *               | admin-secret | Art Grants Committee | Liaison
 *   echoes-of-dust  | u5gv9f       | Artist Name          | Artist
 *
 * NOTE: Each time you update this script, deploy a NEW version
 * (Deploy → Manage deployments → Edit → New version)
 */

// If the script is container-bound (created via Extensions > Apps Script),
// getActiveSpreadsheet() returns the parent sheet automatically.
// Set an ID here only if running as a standalone script.
var SPREADSHEET_ID = null;

function getSpreadsheet() {
  if (SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var project = (data.project || '').trim();
    var code = (data.code || '').trim();
    var message = (data.message || '').trim();

    if (!project || !message) {
      return jsonResponse({ error: 'Missing required fields' });
    }

    if (!code) {
      return jsonResponse({ error: 'Passphrase is required' });
    }

    var ss = getSpreadsheet();

    var auth = verifyCode(ss, project, code);
    if (!auth) {
      return jsonResponse({ error: 'Invalid passphrase' });
    }

    var tab = ss.getSheetByName(project);

    if (!tab) {
      tab = ss.insertSheet(project);
      tab.appendRow(['Timestamp', 'Author', 'Role', 'Message']);
      tab.setFrozenRows(1);
    }

    tab.appendRow([new Date(), auth.name, auth.role, message]);

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function verifyCode(ss, project, code) {
  var codesTab = ss.getSheetByName('_codes');
  if (!codesTab) return false;

  var data = codesTab.getDataRange().getValues();
  for (var i = 0; i < data.length; i++) {
    var slug = (data[i][0] || '').toString().trim();
    var passphrase = (data[i][1] || '').toString().trim();
    var name = (data[i][2] || '').toString().trim();
    var role = (data[i][3] || '').toString().trim();
    if (passphrase === code) {
      if (slug === '*') return { role: role || 'Admin', name: name || 'Art Grants Committee' };
      if (slug === project) return { role: role || 'Artist', name: name || 'Artist' };
    }
  }
  return false;
}

function doGet(e) {
  try {
    var action = (e.parameter.action || '').trim();

    // Handle posting via GET (browsers block cross-origin POST redirects)
    if (action === 'post') {
      var project = (e.parameter.project || '').trim();
      var code = (e.parameter.code || '').trim();
      var message = (e.parameter.message || '').trim();

      if (!project || !message) {
        return jsonResponse({ error: 'Missing required fields' });
      }
      if (!code) {
        return jsonResponse({ error: 'Passphrase is required' });
      }

      var ss = getSpreadsheet();
      var auth = verifyCode(ss, project, code);
      if (!auth) {
        return jsonResponse({ error: 'Invalid passphrase' });
      }

      var tab = ss.getSheetByName(project);
      if (!tab) {
        tab = ss.insertSheet(project);
        tab.appendRow(['Timestamp', 'Author', 'Role', 'Message']);
        tab.setFrozenRows(1);
      }

      tab.appendRow([new Date(), auth.name, auth.role, message]);
      return jsonResponse({ ok: true });
    }

    // Default: fetch messages
    var project = (e.parameter.project || '').trim();
    if (!project) {
      return jsonResponse({ error: 'Missing project parameter' });
    }

    var ss = getSpreadsheet();
    var tab = ss.getSheetByName(project);

    if (!tab || tab.getLastRow() < 2) {
      return jsonResponse([]);
    }

    var rows = tab.getDataRange().getValues();
    var messages = [];
    for (var i = 1; i < rows.length; i++) {
      messages.push({
        timestamp: rows[i][0] ? rows[i][0].toISOString() : '',
        author: rows[i][1] || '',
        role: rows[i][2] || '',
        message: rows[i][3] || '',
      });
    }

    return jsonResponse(messages);
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function jsonResponse(data) {
  var output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
