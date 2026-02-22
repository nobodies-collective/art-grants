/**
 * Google Apps Script — Chat backend for Art Grants
 *
 * SETUP:
 * 1. Open your chat spreadsheet in Google Sheets
 * 2. Go to Extensions → Apps Script
 * 3. Paste this entire file into Code.gs
 * 4. Replace SPREADSHEET_ID below with your spreadsheet's actual ID
 *    (from the URL: https://docs.google.com/spreadsheets/d/THIS_PART/edit)
 * 5. Click Deploy → New deployment
 *    - Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 6. Copy the deployment URL and paste it into js/constants.js as CHAT_SCRIPT_URL
 *
 * PASSPHRASE SETUP:
 * Create a tab called "_codes" in the spreadsheet with two columns:
 *   Column A: Project slug (e.g. "light-installation-2026")
 *   Column B: Passphrase (e.g. "sun42")
 * Only people who know the passphrase can post messages.
 *
 * NOTE: Each time you update this script, create a NEW deployment
 * (Deploy → Manage deployments → Edit → New version)
 */

var SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var project = (data.project || '').trim();
    var author = (data.author || '').trim();
    var code = (data.code || '').trim();
    var message = (data.message || '').trim();

    if (!project || !author || !message) {
      return jsonResponse({ error: 'Missing required fields: project, author, message' });
    }

    if (!code) {
      return jsonResponse({ error: 'Passphrase is required' });
    }

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // Verify passphrase
    if (!verifyCode(ss, project, code)) {
      return jsonResponse({ error: 'Invalid passphrase' });
    }

    var tab = ss.getSheetByName(project);

    if (!tab) {
      tab = ss.insertSheet(project);
      tab.appendRow(['Timestamp', 'Author', 'Role', 'Message']);
      tab.setFrozenRows(1);
    }

    tab.appendRow([new Date(), author, '', message]);

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
    if (slug === project && passphrase === code) {
      return true;
    }
  }
  return false;
}

function doGet(e) {
  try {
    var project = (e.parameter.project || '').trim();
    if (!project) {
      return jsonResponse({ error: 'Missing project parameter' });
    }

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
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
