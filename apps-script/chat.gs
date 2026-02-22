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
 * Two sources of passphrases:
 *
 * 1. ADMIN passphrase — in the chat spreadsheet, create a tab "_codes":
 *      Column A: *
 *      Column B: your-admin-secret
 *    This works on ALL projects. Messages are tagged "admin".
 *
 * 2. PER-PROJECT passphrase — in the proposals spreadsheet, add a
 *    column called "Passphrase". Each row's passphrase lets that
 *    project's participants post. Messages are tagged "member".
 *
 * NOTE: Each time you update this script, create a NEW deployment
 * (Deploy → Manage deployments → Edit → New version)
 */

var CHAT_SPREADSHEET_ID = '1nujQxJi7tvuqjc3PB0fb535VqU7ol6FJgqMd6pU6u-8';
var PROPOSALS_SPREADSHEET_ID = '1rlp7MPswcL8zYdwG11QKOUUakxjxWW4DU0mDvj8r5rs';

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

    var ss = SpreadsheetApp.openById(CHAT_SPREADSHEET_ID);

    // Verify passphrase and detect role
    var role = verifyCode(ss, project, code);
    if (!role) {
      return jsonResponse({ error: 'Invalid passphrase' });
    }

    var tab = ss.getSheetByName(project);

    if (!tab) {
      tab = ss.insertSheet(project);
      tab.appendRow(['Timestamp', 'Author', 'Role', 'Message']);
      tab.setFrozenRows(1);
    }

    tab.appendRow([new Date(), author, role, message]);

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function verifyCode(chatSS, project, code) {
  // 1. Check admin passphrase from _codes tab in chat spreadsheet
  var codesTab = chatSS.getSheetByName('_codes');
  if (codesTab) {
    var codes = codesTab.getDataRange().getValues();
    for (var i = 0; i < codes.length; i++) {
      var slug = (codes[i][0] || '').toString().trim();
      var passphrase = (codes[i][1] || '').toString().trim();
      if (passphrase === code && slug === '*') return 'admin';
    }
  }

  // 2. Check per-project passphrase from proposals spreadsheet
  try {
    var proposalsSS = SpreadsheetApp.openById(PROPOSALS_SPREADSHEET_ID);
    var sheet = proposalsSS.getSheets()[0]; // First sheet (form responses)
    var data = sheet.getDataRange().getValues();
    var headers = data[0];

    // Find Title and Passphrase columns (case-insensitive)
    var titleCol = -1;
    var codeCol = -1;
    for (var c = 0; c < headers.length; c++) {
      var h = (headers[c] || '').toString().toLowerCase().trim();
      if (h === 'title') titleCol = c;
      if (h === 'passphrase' || h === 'code' || h === 'pass') codeCol = c;
    }

    if (titleCol >= 0 && codeCol >= 0) {
      for (var r = 1; r < data.length; r++) {
        var title = (data[r][titleCol] || '').toString().trim();
        var rowSlug = generateSlug(title);
        var rowCode = (data[r][codeCol] || '').toString().trim();
        if (rowSlug === project && rowCode === code) return 'member';
      }
    }
  } catch (err) {
    // If proposals sheet is inaccessible, skip
  }

  return false;
}

function generateSlug(title) {
  return (title || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function doGet(e) {
  try {
    var project = (e.parameter.project || '').trim();
    if (!project) {
      return jsonResponse({ error: 'Missing project parameter' });
    }

    var ss = SpreadsheetApp.openById(CHAT_SPREADSHEET_ID);
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
