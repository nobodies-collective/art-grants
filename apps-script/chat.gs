/**
 * Google Apps Script — Chat backend for Art Grants
 *
 * This script lives on the CHAT spreadsheet (separate from form responses).
 * Anyone can post messages using their name. Email notifications are sent
 * to the artist and liaison(s) when a new message is posted.
 *
 * TABS:
 *   "<slug>"          — per-project chat tabs (auto-created, hidden)
 *   "_email_queue"    — pending email notifications (auto-created, hidden)
 *
 * SETUP:
 * 1. Open the Chat spreadsheet in Google Sheets
 * 2. Go to Extensions → Apps Script, paste this file
 * 3. Deploy → New deployment → Web app (Execute as: Me, Access: Anyone)
 * 4. Copy deployment URL to js/constants.js as CHAT_SCRIPT_URL
 * 5. Run setupEmailTrigger() once from the editor to create the 1-min trigger
 *
 * NOTE: Each time you update this script, deploy a NEW version
 * (Deploy → Manage deployments → Edit → New version)
 */

// ─── Configuration ────────────────────────────────────────────────────

var SITE_URL = 'https://art.nobodies.team';
var FORM_SPREADSHEET_ID = '1_C6spAHXZodFPOWUzI15-JB43rnFywM5hQo5kS9AMKw';
var FORM_TAB_NAME = 'Art Grants';
var NOTIFY_EMAIL = 'art@nobodies.team';
var QUEUE_TAB = '_email_queue';
var DIGEST_TAB = '_digest_queue';

// ─── Helpers ──────────────────────────────────────────────────────────

function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
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

// ─── Email queue ────────────────────────────────────────────────────

function getQueueSheet() {
  var ss = getSpreadsheet();
  var tab = ss.getSheetByName(QUEUE_TAB);
  if (!tab) {
    tab = ss.insertSheet(QUEUE_TAB);
    tab.appendRow(['Timestamp', 'Project', 'Author', 'Message']);
    tab.setFrozenRows(1);
    tab.hideSheet();
  }
  return tab;
}

function getDigestSheet() {
  var ss = getSpreadsheet();
  var tab = ss.getSheetByName(DIGEST_TAB);
  if (!tab) {
    tab = ss.insertSheet(DIGEST_TAB);
    tab.appendRow(['Timestamp', 'Project', 'Author', 'Message']);
    tab.setFrozenRows(1);
    tab.hideSheet();
  }
  return tab;
}

/** Called from handlePost — queues a notification instead of sending directly */
function queueNotification(project, authorName, message) {
  var queue = getQueueSheet();
  queue.appendRow([new Date(), project, authorName, message]);
  // Also queue for daily digest to art@nobodies.team
  var digest = getDigestSheet();
  digest.appendRow([new Date(), project, authorName, message]);
}

/** Run by time-driven trigger every minute — sends queued emails */
function processEmailQueue() {
  var queue = getQueueSheet();
  if (queue.getLastRow() < 2) return;

  var rows = queue.getDataRange().getValues();
  var formSS = SpreadsheetApp.openById(FORM_SPREADSHEET_ID);
  var sheet = formSS.getSheetByName(FORM_TAB_NAME);
  if (!sheet) return;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var data = sheet.getDataRange().getValues();

  var slugIdx = findHeaderIdx(headers, ['Slug', 'slug']);
  var emailIdx = findHeaderIdx(headers, ['Email address', 'email address', 'Email Address']);
  var titleIdx = findHeaderIdx(headers, ['Title', 'title']);
  var timestampIdx = findHeaderIdx(headers, ['Timestamp', 'timestamp']);
  var messagingOffIdx = findHeaderIdx(headers, ['Messaging Off', 'messaging off']);

  if (slugIdx === -1) return;

  for (var q = 1; q < rows.length; q++) {
    var project = (rows[q][1] || '').toString().trim();
    var authorName = (rows[q][2] || '').toString().trim();
    var message = (rows[q][3] || '').toString().trim();
    if (!project) continue;

    for (var i = 1; i < data.length; i++) {
      var rowSlug = (data[i][slugIdx] || '').toString().trim();
      if (rowSlug !== project) continue;

      // Skip if messaging is turned off for this project
      if (messagingOffIdx !== -1) {
        var msgOff = (data[i][messagingOffIdx] || '').toString().trim().toUpperCase();
        if (msgOff === 'TRUE') break;
      }

      var title = titleIdx !== -1 ? (data[i][titleIdx] || project).toString() : project;
      // Only send individual emails to the artist (not art@nobodies.team — that gets a daily digest)
      var emails = [];

      if (emailIdx !== -1 && data[i][emailIdx]) {
        data[i][emailIdx].toString().split(',').forEach(function(e) {
          var trimmed = e.trim();
          if (trimmed && trimmed !== NOTIFY_EMAIL && emails.indexOf(trimmed) === -1) emails.push(trimmed);
        });
      }

      if (emails.length === 0) break;

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

      var projectUrl = SITE_URL + (year ? '/' + year : '') + '/' + project;
      var subject = 'New message on "' + title + '"';
      var body = authorName + ' wrote:\n\n' + message + '\n\n---\nView project: ' + projectUrl;

      GmailApp.sendEmail(emails.join(','), subject, body);
      console.log('Email sent to ' + emails.join(', ') + ' for project ' + project);
      break;
    }
  }

  // Clear queue
  if (queue.getLastRow() > 1) {
    queue.deleteRows(2, queue.getLastRow() - 1);
  }
}

/** Run once from editor to create the 1-minute trigger for processing email queue */
function setupEmailTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'processEmailQueue') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('processEmailQueue')
    .timeBased()
    .everyMinutes(1)
    .create();
  console.log('Email queue trigger created (every 1 minute)');
}

// ─── Daily digest ──────────────────────────────────────────────────────

/** Run by time-driven trigger at 06:00 — sends a single summary email to art@nobodies.team */
function processDailyDigest() {
  var digest = getDigestSheet();
  if (digest.getLastRow() < 2) return;

  var rows = digest.getDataRange().getValues();

  // Look up project titles from the form spreadsheet
  var formSS = SpreadsheetApp.openById(FORM_SPREADSHEET_ID);
  var sheet = formSS.getSheetByName(FORM_TAB_NAME);
  var titleMap = {};
  var yearMap = {};
  if (sheet) {
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var data = sheet.getDataRange().getValues();
    var slugIdx = findHeaderIdx(headers, ['Slug', 'slug']);
    var titleIdx = findHeaderIdx(headers, ['Title', 'title']);
    var timestampIdx = findHeaderIdx(headers, ['Timestamp', 'timestamp']);
    if (slugIdx !== -1) {
      for (var i = 1; i < data.length; i++) {
        var slug = (data[i][slugIdx] || '').toString().trim();
        if (slug) {
          titleMap[slug] = titleIdx !== -1 ? (data[i][titleIdx] || slug).toString() : slug;
          if (timestampIdx !== -1 && data[i][timestampIdx]) {
            var ts = data[i][timestampIdx];
            if (ts instanceof Date) {
              yearMap[slug] = ts.getFullYear().toString();
            } else {
              var dmyMatch = ts.toString().match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
              if (dmyMatch) yearMap[slug] = dmyMatch[3];
            }
          }
        }
      }
    }
  }

  // Group messages by project
  var grouped = {};
  var projectOrder = [];
  for (var q = 1; q < rows.length; q++) {
    var project = (rows[q][1] || '').toString().trim();
    if (!project) continue;
    if (!grouped[project]) {
      grouped[project] = [];
      projectOrder.push(project);
    }
    grouped[project].push({
      timestamp: rows[q][0],
      author: (rows[q][2] || '').toString().trim(),
      message: (rows[q][3] || '').toString().trim()
    });
  }

  if (projectOrder.length === 0) {
    if (digest.getLastRow() > 1) digest.deleteRows(2, digest.getLastRow() - 1);
    return;
  }

  // Build summary email
  var totalMessages = 0;
  var body = '';
  for (var p = 0; p < projectOrder.length; p++) {
    var proj = projectOrder[p];
    var title = titleMap[proj] || proj;
    var year = yearMap[proj] || '';
    var projectUrl = SITE_URL + (year ? '/' + year : '') + '/' + proj;
    var msgs = grouped[proj];
    totalMessages += msgs.length;

    body += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    body += title + ' (' + msgs.length + ' message' + (msgs.length > 1 ? 's' : '') + ')\n';
    body += projectUrl + '\n\n';

    for (var m = 0; m < msgs.length; m++) {
      body += '  ' + msgs[m].author + ': ' + msgs[m].message + '\n';
    }
    body += '\n';
  }

  var subject = 'Art Grants digest: ' + totalMessages + ' message' + (totalMessages > 1 ? 's' : '') + ' across ' + projectOrder.length + ' project' + (projectOrder.length > 1 ? 's' : '');
  GmailApp.sendEmail(NOTIFY_EMAIL, subject, body);
  console.log('Daily digest sent to ' + NOTIFY_EMAIL + ': ' + totalMessages + ' messages');

  // Clear digest queue
  if (digest.getLastRow() > 1) {
    digest.deleteRows(2, digest.getLastRow() - 1);
  }
}

/** Run once from editor to create the daily 06:00 trigger for digest emails */
function setupDailyDigestTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'processDailyDigest') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('processDailyDigest')
    .timeBased()
    .atHour(6)
    .everyDays(1)
    .create();
  console.log('Daily digest trigger created (06:00 every day)');
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

  // Queue email notification (processed by trigger, not in web app context)
  queueNotification(project, name, message);

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
