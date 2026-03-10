/**
 * Google Apps Script — Chat backend for Art Grants
 *
 * This script lives on the CHAT spreadsheet (separate from form responses).
 * Passphrases and chat messages are stored here; form data stays public.
 *
 * TABS:
 *   "_codes"   — passphrase lookup (Slug, Passphrase, Name, Role)
 *   "<slug>"   — per-project chat tabs (auto-created, hidden)
 *
 * _codes tab layout (columns A–D):
 *   Column A: Project slug (or * for admin/global access)
 *   Column B: Passphrase
 *   Column C: Display name (shown as message author)
 *   Column D: Role (Artist or Liaison)
 *
 * Example:
 *   *                    | admin-secret | Art Grants Committee | Liaison
 *   echoes-of-dust       | u5gv9f       | Jonas Johansson      | Artist
 *   echoes-of-dust       | dv2uhe       |                      | Liaison
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

var SITE_URL = 'https://nobodies-collective.github.io/art-grants';

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

// ─── Authentication ───────────────────────────────────────────────────

function verifyCode(ss, project, code) {
  var codesTab = ss.getSheetByName('_codes');
  if (!codesTab) return false;

  var data = codesTab.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var slug = (data[i][0] || '').toString().trim();
    var passphrase = (data[i][1] || '').toString().trim();
    var name = (data[i][2] || '').toString().trim();
    var role = (data[i][3] || '').toString().trim();
    if (passphrase === code) {
      if (slug === '*') return { role: role || 'Liaison', name: name || 'Art Grants Committee' };
      if (slug === project) return { role: role || 'Artist', name: name || 'Artist' };
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

    var ss = getSpreadsheet();
    var auth = verifyCode(ss, project, code);
    if (!auth) {
      return jsonResponse({ error: 'Invalid passphrase' });
    }

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

    var ss = getSpreadsheet();

    // Verify passphrase (returns role without posting)
    if (action === 'verify') {
      if (!project || !code) return jsonResponse({ error: 'Missing required fields' });
      var auth = verifyCode(ss, project, code);
      if (!auth) return jsonResponse({ error: 'Invalid passphrase' });
      return jsonResponse({ ok: true, role: auth.role });
    }

    // Actions that require auth (via GET for cross-origin compatibility)
    if (action === 'post' || action === 'edit' || action === 'delete') {
      if (!project || !code) return jsonResponse({ error: 'Missing required fields' });

      var auth = verifyCode(ss, project, code);
      if (!auth) return jsonResponse({ error: 'Invalid passphrase' });

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

    // Default: fetch messages (no auth required)
    if (!project) return jsonResponse({ error: 'Missing project parameter' });

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
