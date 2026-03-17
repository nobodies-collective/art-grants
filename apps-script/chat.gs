/**
 * Google Apps Script — Chat backend for Art Grants
 *
 * This script lives on the CHAT spreadsheet (separate from form responses).
 * Anyone can post messages using their name. Email notifications are sent
 * to the artist and liaison(s) when a new message is posted.
 *
 * TABS:
 *   "<slug>"   — per-project chat tabs (auto-created, hidden)
 *
 * SETUP:
 * 1. Open the Chat spreadsheet in Google Sheets
 * 2. Go to Extensions → Apps Script, paste this file
 * 3. Deploy → New deployment → Web app (Execute as: Me, Access: Anyone)
 * 4. Copy deployment URL to js/constants.js as CHAT_SCRIPT_URL
 *
 * NOTE: Each time you update this script, deploy a NEW version
 * (Deploy → Manage deployments → Edit → New version)
 */

// ─── Configuration ────────────────────────────────────────────────────

var SITE_URL = 'https://art.nobodies.team';
var FORM_SPREADSHEET_ID = '1_C6spAHXZodFPOWUzI15-JB43rnFywM5hQo5kS9AMKw';
var FORM_TAB_NAME = 'Art Grants';
var NOTIFY_EMAIL = 'art@nobodies.team';

// ─── Helpers ──────────────────────────────────────────────────────────

function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function escapeHtmlGS(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function jsonResponse(data) {
  var output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function findHeaderIdx(headers, candidates) {
  for (var i = 0; i < headers.length; i++) {
    var h = (headers[i] || '').toString().toLowerCase().trim();
    for (var j = 0; j < candidates.length; j++) {
      if (h === candidates[j].toLowerCase()) return i;
    }
  }
  return -1;
}

// ─── Email notifications ─────────────────────────────────────────────

function sendNotifications(project, authorName, message) {
  try {
    var formSS = SpreadsheetApp.openById(FORM_SPREADSHEET_ID);
    var sheet = formSS.getSheetByName(FORM_TAB_NAME);
    if (!sheet) return;

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var data = sheet.getDataRange().getValues();

    var slugIdx = findHeaderIdx(headers, ['Slug', 'slug']);
    var emailIdx = findHeaderIdx(headers, ['Email address', 'email address', 'Email Address']);
    var titleIdx = findHeaderIdx(headers, ['Title', 'title']);
    var timestampIdx = findHeaderIdx(headers, ['Timestamp', 'timestamp']);

    if (slugIdx === -1) return;

    for (var i = 1; i < data.length; i++) {
      if ((data[i][slugIdx] || '').toString().trim() !== project) continue;

      var title = titleIdx !== -1 ? (data[i][titleIdx] || project).toString() : project;

      var year = '';
      if (timestampIdx !== -1 && data[i][timestampIdx]) {
        var ts = data[i][timestampIdx];
        if (ts instanceof Date) {
          year = ts.getFullYear().toString();
        } else {
          var str = ts.toString().trim();
          var dmyMatch = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          if (dmyMatch) year = dmyMatch[3];
        }
      }

      var emails = [NOTIFY_EMAIL];

      if (emailIdx !== -1 && data[i][emailIdx]) {
        data[i][emailIdx].toString().split(',').forEach(function(e) {
          var trimmed = e.trim();
          if (trimmed && emails.indexOf(trimmed) === -1) emails.push(trimmed);
        });
      }

      var projectUrl = SITE_URL + (year ? '/' + year : '') + '/' + project;
      var subject = 'New message on "' + title + '"';
      var body = authorName + ' wrote:\n\n' + message + '\n\n---\nView project: ' + projectUrl;

      GmailApp.sendEmail(emails.join(','), subject, body);
      break;
    }
  } catch (err) {
    console.log('sendNotifications error: ' + err.message);
  }
}

// ─── Chat API ─────────────────────────────────────────────────────────

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = (data.action || 'post').trim();
    var project = (data.project || '').trim();
    var name = (data.name || '').trim();
    var token = (data.token || '').trim();

    if (!project) {
      return jsonResponse({ error: 'Missing project' });
    }

    var ss = getSpreadsheet();

    if (action === 'post') return handlePost(ss, project, name, (data.message || '').trim(), token);
    if (action === 'edit') return handleEdit(ss, project, token, parseInt(data.id, 10), (data.message || '').trim());
    if (action === 'delete') return handleDelete(ss, project, token, parseInt(data.id, 10));

    return jsonResponse({ error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function handlePost(ss, project, name, message, token) {
  if (!message) return jsonResponse({ error: 'Message is required' });
  if (!name) return jsonResponse({ error: 'Name is required' });
  if (!token) return jsonResponse({ error: 'Missing token' });

  var tab = ss.getSheetByName(project);
  if (!tab) {
    tab = ss.insertSheet(project);
    tab.appendRow(['Timestamp', 'Author', 'Role', 'Message', 'Token']);
    tab.setFrozenRows(1);
    tab.hideSheet();
  }

  tab.appendRow([new Date(), name, '', message, token]);

  // Send email notifications
  sendNotifications(project, name, message);

  return jsonResponse({ ok: true });
}

function handleEdit(ss, project, token, messageId, newMessage) {
  if (!messageId || !newMessage) return jsonResponse({ error: 'Missing id or message' });
  if (!token) return jsonResponse({ error: 'Missing token' });

  var tab = ss.getSheetByName(project);
  if (!tab) return jsonResponse({ error: 'Chat not found' });

  var sheetRow = messageId + 1;
  if (sheetRow < 2 || sheetRow > tab.getLastRow()) {
    return jsonResponse({ error: 'Message not found' });
  }

  var msgToken = tab.getRange(sheetRow, 5).getValue().toString().trim();
  if (msgToken !== token) {
    return jsonResponse({ error: 'You can only edit your own messages' });
  }

  tab.getRange(sheetRow, 4).setValue(newMessage);
  return jsonResponse({ ok: true });
}

function handleDelete(ss, project, token, messageId) {
  if (!messageId) return jsonResponse({ error: 'Missing id' });
  if (!token) return jsonResponse({ error: 'Missing token' });

  var tab = ss.getSheetByName(project);
  if (!tab) return jsonResponse({ error: 'Chat not found' });

  var sheetRow = messageId + 1;
  if (sheetRow < 2 || sheetRow > tab.getLastRow()) {
    return jsonResponse({ error: 'Message not found' });
  }

  var msgToken = tab.getRange(sheetRow, 5).getValue().toString().trim();
  if (msgToken !== token) {
    return jsonResponse({ error: 'You can only delete your own messages' });
  }

  tab.deleteRow(sheetRow);
  return jsonResponse({ ok: true });
}

function doGet(e) {
  try {
    var action = (e.parameter.action || '').trim();
    var project = (e.parameter.project || '').trim();
    var token = (e.parameter.token || '').trim();

    var ss = getSpreadsheet();

    // Actions that modify data (via GET for cross-origin compatibility)
    if (action === 'post' || action === 'edit' || action === 'delete') {
      var name = (e.parameter.name || '').trim();
      if (!project) return jsonResponse({ error: 'Missing project' });

      if (action === 'post') {
        return handlePost(ss, project, name, (e.parameter.message || '').trim(), token);
      }
      if (action === 'edit') {
        return handleEdit(ss, project, token, parseInt(e.parameter.id, 10), (e.parameter.message || '').trim());
      }
      if (action === 'delete') {
        return handleDelete(ss, project, token, parseInt(e.parameter.id, 10));
      }
    }

    // Default: fetch messages (no auth required)
    if (!project) return jsonResponse({ error: 'Missing project parameter' });

    var tab = ss.getSheetByName(project);
    if (!tab || tab.getLastRow() < 2) return jsonResponse([]);

    var rows = tab.getDataRange().getValues();
    var messages = [];
    for (var i = 1; i < rows.length; i++) {
      var msgToken = (rows[i][4] || '').toString().trim();
      messages.push({
        id: i,
        timestamp: rows[i][0] ? rows[i][0].toISOString() : '',
        author: rows[i][1] || '',
        role: rows[i][2] || '',
        message: rows[i][3] || '',
        isOwn: token && msgToken === token,
      });
    }

    return jsonResponse(messages);
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}
