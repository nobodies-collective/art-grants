/**
 * Google Apps Script — Chat + passphrase backend for Art Grants
 *
 * This script lives on the FORM SHEET (the single source of truth).
 * Everything is in one spreadsheet: form responses, admin columns, and chat tabs.
 *
 * TABS:
 *   "Form Responses 1"  — form submissions + admin columns (Slug, Passphrases, Status, etc.)
 *   "<slug>"            — per-project chat tabs (auto-created, hidden)
 *
 * Form Responses tab layout:
 *   Columns A–AG: form data (Timestamp, Year, Category, Title, Name, About,
 *     Description, Scale & Footprint, Sound, Support Needed,
 *     Total Project Budget (EUR), Early Entry, Other Funding, Budget,
 *     Summary, Materials, Engineering & structure, Safety & Risk Management,
 *     Build Transport & Strike, Placement Preferences, Technology, Power,
 *     Experience & Interaction, Grant Request (EUR), Documents, Team,
 *     Sex-positive, Type)
 *   Column AI: Slug               (auto-generated from Title)
 *   Column AJ: Passphrase Artist  (auto-generated, 6 chars)
 *   Column AK: Passphrase Liaison (auto-generated, 6 chars)
 *   Column AL: Liaison            (manual — liaison name)
 *   Column AM: Liaison Email      (manual — for notifications)
 *   Column AN: Status             (defaults to "Under Review")
 *   Column AO: Messaging On       (TRUE/FALSE)
 *
 * SETUP:
 * 1. Paste this into Extensions → Apps Script on the Form Sheet
 * 2. Deploy → New deployment → Web app (Execute as: Me, Access: Anyone)
 * 3. Copy deployment URL to js/constants.js as CHAT_SCRIPT_URL
 * 4. Publish the Form Responses tab as CSV for the frontend
 * 5. Add trigger (clock icon → + Add Trigger):
 *    - onFormSubmit → From spreadsheet → On form submit
 */

// ─── Configuration ────────────────────────────────────────────────────

var FORM_TAB_NAME = 'Form responses 1';
var SITE_URL = 'https://nobodies-collective.github.io/art-grants';
var ADMIN_HEADERS = ['Year', 'Slug', 'Passphrase Artist', 'Passphrase Liaison', 'Liaison', 'Liaison Email', 'Status', 'Messaging On'];

// ─── Helpers ──────────────────────────────────────────────────────────

function getSS() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

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

function escapeHtmlGS(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

// ─── Form submission trigger ──────────────────────────────────────────

/**
 * Runs when a new form response is submitted.
 * Generates Slug, Artist Passphrase, Liaison Passphrase, defaults Status.
 * Emails the artist their passphrase.
 */
function onFormSubmit(e) {
  try {
    var ss = getSS();
    var sheet = ss.getSheetByName(FORM_TAB_NAME);
    if (!sheet) return;

    var row = e.range.getRow();
    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, Math.max(lastCol, 26)).getValues()[0];

    ensureAdminHeaders(sheet, headers);
    headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    var titleIdx = findHeaderIndex(headers, ['title']);
    var emailIdx = findHeaderIndex(headers, ['email']);
    var yearIdx = findHeaderIndex(headers, ['year']);
    var slugIdx = findHeaderIndex(headers, ['slug']);
    var artistPassIdx = findHeaderIndex(headers, ['artist passphrase', 'passphrase artist', 'passphrase artiste']);
    var statusIdx = findHeaderIndex(headers, ['status']);
    var liaisonPassIdx = findHeaderIndex(headers, ['liaison passphrase', 'passphrase liaison']);
    var messagingOnIdx = findHeaderIndex(headers, ['messaging on']);

    if (titleIdx === -1 || slugIdx === -1) return;
    if (artistPassIdx === -1 || liaisonPassIdx === -1) {
      Logger.log('onFormSubmit: missing passphrase columns. Headers: ' + headers.join(', '));
      return;
    }

    var title = sheet.getRange(row, titleIdx + 1).getValue().toString().trim();
    if (!title) return;

    // Auto-set Year from Timestamp
    if (yearIdx !== -1) {
      var timestamp = sheet.getRange(row, 1).getValue();
      var year = timestamp instanceof Date ? timestamp.getFullYear().toString() : new Date().getFullYear().toString();
      sheet.getRange(row, yearIdx + 1).setValue(year);
    }

    var email = emailIdx !== -1 ? sheet.getRange(row, emailIdx + 1).getValue().toString().trim() : '';
    var slug = generateSlug(title);
    var artistPass = generatePassphrase();
    var liaisonPass = generatePassphrase();

    sheet.getRange(row, slugIdx + 1).setValue(slug);
    sheet.getRange(row, artistPassIdx + 1).setValue(artistPass);
    sheet.getRange(row, statusIdx + 1).setValue('Under Review');
    sheet.getRange(row, liaisonPassIdx + 1).setValue(liaisonPass);
    if (messagingOnIdx !== -1) {
      sheet.getRange(row, messagingOnIdx + 1).setValue('TRUE');
    }

    if (email) {
      try {
        MailApp.sendEmail({
          to: email,
          noReply: true,
          subject: 'Your Art Grant Discussion Passphrase',
          htmlBody:
            '<p>Your proposal <strong>' + escapeHtmlGS(title) + '</strong> has been received.</p>' +
            '<p>Use this link to join the project discussion:</p>' +
            '<p><a href="' + SITE_URL + '/' + (yearIdx !== -1 ? sheet.getRange(row, yearIdx + 1).getValue() : new Date().getFullYear()) + '/' + slug + '?code=' + artistPass + '">Open discussion</a></p>' +
            '<p style="font-size:0.9em;color:#888">Or enter this passphrase manually: <code>' + escapeHtmlGS(artistPass) + '</code></p>',
        });
      } catch (mailErr) {
        Logger.log('Passphrase email error for ' + email + ': ' + mailErr.message);
      }
    }

    Logger.log('onFormSubmit: generated passphrases for "' + title + '" (' + slug + ')');
  } catch (err) {
    Logger.log('onFormSubmit error: ' + err.message);
  }
}

/**
 * Run this manually to backfill passphrases for existing rows.
 * Only fills rows that are missing a slug or artist passphrase.
 * Does NOT send emails — just generates the values.
 */
function backfillPassphrases() {
  var ss = getSS();
  var sheet = ss.getSheetByName(FORM_TAB_NAME);
  if (!sheet || sheet.getLastRow() < 2) {
    Logger.log('backfill: sheet not found or empty');
    return;
  }

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  Logger.log('backfill: found ' + headers.length + ' columns');
  Logger.log('backfill: headers = [' + headers.map(function(h, i) { return i + ':' + JSON.stringify(String(h).trim()); }).join(', ') + ']');

  var titleIdx = findHeaderIndex(headers, ['title']);
  var slugIdx = findHeaderIndex(headers, ['slug']);
  var artistPassIdx = findHeaderIndex(headers, ['artist passphrase', 'passphrase artist', 'passphrase artiste']);
  var statusIdx = findHeaderIndex(headers, ['status']);
  var liaisonPassIdx = findHeaderIndex(headers, ['liaison passphrase', 'passphrase liaison']);

  Logger.log('backfill: titleIdx=' + titleIdx + ' slugIdx=' + slugIdx + ' artistPassIdx=' + artistPassIdx + ' liaisonPassIdx=' + liaisonPassIdx + ' statusIdx=' + statusIdx);

  if (titleIdx === -1 || slugIdx === -1) {
    Logger.log('backfill: could not find Title or Slug column');
    return;
  }
  if (artistPassIdx === -1 || liaisonPassIdx === -1) {
    Logger.log('backfill: could not find passphrase columns');
    return;
  }

  var data = sheet.getDataRange().getValues();
  var count = 0;

  for (var i = 1; i < data.length; i++) {
    var title = (data[i][titleIdx] || '').toString().trim();
    if (!title) continue;

    var row = i + 1; // 1-based sheet row
    var existingSlug = (data[i][slugIdx] || '').toString().trim();
    var existingArtistPass = artistPassIdx !== -1 ? (data[i][artistPassIdx] || '').toString().trim() : '';

    if (existingSlug && existingArtistPass) continue; // already filled

    if (!existingSlug) {
      sheet.getRange(row, slugIdx + 1).setValue(generateSlug(title));
    }
    if (artistPassIdx !== -1 && !existingArtistPass) {
      sheet.getRange(row, artistPassIdx + 1).setValue(generatePassphrase());
    }
    if (statusIdx !== -1 && !(data[i][statusIdx] || '').toString().trim()) {
      sheet.getRange(row, statusIdx + 1).setValue('Under Review');
    }
    if (liaisonPassIdx !== -1 && !(data[i][liaisonPassIdx] || '').toString().trim()) {
      sheet.getRange(row, liaisonPassIdx + 1).setValue(generatePassphrase());
    }

    count++;
  }

  Logger.log('backfill: filled ' + count + ' row(s)');
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

// ─── Authentication ───────────────────────────────────────────────────

function verifyCode(project, code) {
  var ss = getSS();
  var formTab = ss.getSheetByName(FORM_TAB_NAME);
  if (!formTab || formTab.getLastRow() < 2) return false;

  var data = formTab.getDataRange().getValues();
  var headers = data[0];
  var slugIdx = findHeaderIndex(headers, ['slug']);
  var artistPassIdx = findHeaderIndex(headers, ['artist passphrase', 'passphrase artist', 'passphrase artiste']);
  var liaisonPassIdx = findHeaderIndex(headers, ['liaison passphrase', 'passphrase liaison']);
  var emailIdx = findHeaderIndex(headers, ['email']);
  var liaisonNameIdx = findHeaderIndex(headers, ['liaison']);
  var liaisonEmailIdx = findHeaderIndex(headers, ['liaison email']);

  if (slugIdx === -1 || artistPassIdx === -1) return false;

  for (var i = 1; i < data.length; i++) {
    var slug = (data[i][slugIdx] || '').toString().trim();
    if (slug !== project) continue;

    var artistPass = (data[i][artistPassIdx] || '').toString().trim();
    var liaisonPass = liaisonPassIdx !== -1 ? (data[i][liaisonPassIdx] || '').toString().trim() : '';
    var artistEmail = emailIdx !== -1 ? (data[i][emailIdx] || '').toString().trim() : '';
    var liaisonName = liaisonNameIdx !== -1 ? (data[i][liaisonNameIdx] || '').toString().trim() : '';
    var liaisonEmail = liaisonEmailIdx !== -1 ? (data[i][liaisonEmailIdx] || '').toString().trim() : '';

    if (artistPass && artistPass === code) {
      return { role: 'Artist', name: 'Artist', email: artistEmail };
    }
    if (liaisonPass && liaisonPass === code) {
      return { role: 'Liaison', name: liaisonName || 'Liaison', email: liaisonEmail };
    }
  }

  return false;
}

// ─── Chat API ─────────────────────────────────────────────────────────

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = (data.action || 'post').trim();
    var project = (data.project || '').trim();
    var code = (data.code || '').trim();

    if (!project || !code) {
      return jsonResponse({ error: 'Missing required fields' });
    }

    var auth = verifyCode(project, code);
    if (!auth) {
      return jsonResponse({ error: 'Invalid passphrase' });
    }

    var ss = getSS();
    if (action === 'post') return handlePost(ss, project, auth, (data.message || '').trim());
    if (action === 'edit') return handleEdit(ss, project, auth, parseInt(data.id, 10), (data.message || '').trim());
    if (action === 'delete') return handleDelete(ss, project, auth, parseInt(data.id, 10));

    return jsonResponse({ error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function handlePost(ss, project, auth, message) {
  if (!message) return jsonResponse({ error: 'Message is required' });

  var tab = ss.getSheetByName(project);
  if (!tab) {
    tab = ss.insertSheet(project);
    tab.appendRow(['Timestamp', 'Author', 'Role', 'Message']);
    tab.setFrozenRows(1);
    tab.hideSheet();
  }

  tab.appendRow([new Date(), auth.name, auth.role, message]);
  notifyParticipants(project, auth.email, auth.role, message);

  return jsonResponse({ ok: true, role: auth.role });
}

function handleEdit(ss, project, auth, messageId, newMessage) {
  if (!messageId || !newMessage) return jsonResponse({ error: 'Missing id or message' });

  var tab = ss.getSheetByName(project);
  if (!tab) return jsonResponse({ error: 'Chat not found' });

  var sheetRow = messageId + 1;
  if (sheetRow < 2 || sheetRow > tab.getLastRow()) {
    return jsonResponse({ error: 'Message not found' });
  }

  var msgRole = tab.getRange(sheetRow, 3).getValue().toString().trim();
  if (msgRole !== auth.role) {
    return jsonResponse({ error: 'You can only edit your own messages' });
  }

  tab.getRange(sheetRow, 4).setValue(newMessage);
  return jsonResponse({ ok: true });
}

function handleDelete(ss, project, auth, messageId) {
  if (!messageId) return jsonResponse({ error: 'Missing id' });

  var tab = ss.getSheetByName(project);
  if (!tab) return jsonResponse({ error: 'Chat not found' });

  var sheetRow = messageId + 1;
  if (sheetRow < 2 || sheetRow > tab.getLastRow()) {
    return jsonResponse({ error: 'Message not found' });
  }

  var msgRole = tab.getRange(sheetRow, 3).getValue().toString().trim();
  if (msgRole !== auth.role) {
    return jsonResponse({ error: 'You can only delete your own messages' });
  }

  tab.deleteRow(sheetRow);
  return jsonResponse({ ok: true });
}

function doGet(e) {
  try {
    var action = (e.parameter.action || '').trim();
    var project = (e.parameter.project || '').trim();
    var code = (e.parameter.code || '').trim();

    // Verify passphrase (returns role without posting)
    if (action === 'verify') {
      if (!project || !code) return jsonResponse({ error: 'Missing required fields' });
      var auth = verifyCode(project, code);
      if (!auth) return jsonResponse({ error: 'Invalid passphrase' });
      return jsonResponse({ ok: true, role: auth.role });
    }

    // Actions that require auth
    if (action === 'post' || action === 'edit' || action === 'delete') {
      if (!project || !code) return jsonResponse({ error: 'Missing required fields' });

      var auth = verifyCode(project, code);
      if (!auth) return jsonResponse({ error: 'Invalid passphrase' });

      var ss = getSS();

      if (action === 'post') {
        return handlePost(ss, project, auth, (e.parameter.message || '').trim());
      }
      if (action === 'edit') {
        return handleEdit(ss, project, auth, parseInt(e.parameter.id, 10), (e.parameter.message || '').trim());
      }
      if (action === 'delete') {
        return handleDelete(ss, project, auth, parseInt(e.parameter.id, 10));
      }
    }

    // Default: fetch messages
    if (!project) return jsonResponse({ error: 'Missing project parameter' });

    var ss = getSS();
    var tab = ss.getSheetByName(project);

    if (!tab || tab.getLastRow() < 2) return jsonResponse([]);

    var rows = tab.getDataRange().getValues();
    var messages = [];
    for (var i = 1; i < rows.length; i++) {
      messages.push({
        id: i,
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

// ─── Email notifications ──────────────────────────────────────────────

function notifyParticipants(project, senderEmail, senderRole, message) {
  try {
    var ss = getSS();
    var formTab = ss.getSheetByName(FORM_TAB_NAME);
    if (!formTab || formTab.getLastRow() < 2) return;

    var data = formTab.getDataRange().getValues();
    var headers = data[0];
    var slugIdx = findHeaderIndex(headers, ['slug']);
    var emailIdx = findHeaderIndex(headers, ['email']);
    var liaisonEmailIdx = findHeaderIndex(headers, ['liaison email']);

    var recipients = [];

    for (var i = 1; i < data.length; i++) {
      var slug = (data[i][slugIdx] || '').toString().trim();
      if (slug !== project) continue;

      var artistEmail = emailIdx !== -1 ? (data[i][emailIdx] || '').toString().trim() : '';
      var liaisonEmail = liaisonEmailIdx !== -1 ? (data[i][liaisonEmailIdx] || '').toString().trim() : '';
      if (artistEmail) recipients.push(artistEmail);
      if (liaisonEmail) recipients.push(liaisonEmail);
    }

    var seen = {};
    var unique = [];
    for (var j = 0; j < recipients.length; j++) {
      var addr = recipients[j].toLowerCase();
      if (seen[addr]) continue;
      if (addr === (senderEmail || '').toLowerCase()) continue;
      seen[addr] = true;
      unique.push(recipients[j]);
    }

    var prettyProject = project.replace(/-/g, ' ');
    var snippet = message.length > 200 ? message.substring(0, 200) + '...' : message;

    for (var k = 0; k < unique.length; k++) {
      try {
        MailApp.sendEmail({
          to: unique[k],
          noReply: true,
          subject: 'New message in "' + prettyProject + '" — Art Grants',
          htmlBody:
            '<p><strong>' + escapeHtmlGS(senderRole) + '</strong> wrote in <strong>' + escapeHtmlGS(prettyProject) + '</strong>:</p>' +
            '<blockquote style="border-left:3px solid #ccc;padding:4px 12px;color:#555">' + escapeHtmlGS(snippet) + '</blockquote>' +
            '<p><a href="' + SITE_URL + '">Open discussion</a></p>',
        });
      } catch (mailErr) {
        Logger.log('Mail error for ' + unique[k] + ': ' + mailErr.message);
      }
    }
  } catch (err) {
    Logger.log('notifyParticipants error: ' + err.message);
  }
}

function jsonResponse(data) {
  var output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
