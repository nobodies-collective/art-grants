/**
 * Google Apps Script — Auto-generate chat passphrase on form submission
 *
 * This script goes on the PROPOSALS spreadsheet (the one receiving form responses).
 * It auto-creates a passphrase in the chat spreadsheet when a new proposal is submitted.
 *
 * SETUP:
 * 1. Open the proposals spreadsheet (form responses)
 * 2. Go to Extensions → Apps Script
 * 3. Paste this entire file into Code.gs
 * 4. Click the clock icon (Triggers) in the left sidebar
 * 5. Click "+ Add Trigger"
 *    - Function: onFormSubmit
 *    - Event source: From spreadsheet
 *    - Event type: On form submit
 * 6. Save and authorize when prompted
 *
 * When someone submits the form, this script will:
 * - Generate a slug from the title
 * - Generate a random passphrase
 * - Add a row to the _codes tab in the chat spreadsheet
 * - Optionally email the passphrase to the submitter
 */

var CHAT_SPREADSHEET_ID = '1nujQxJi7tvuqjc3PB0fb535VqU7ol6FJgqMd6pU6u-8';

function onFormSubmit(e) {
  try {
    var row = e.values || e.range.getSheet().getRange(e.range.getRow(), 1, 1, e.range.getSheet().getLastColumn()).getValues()[0];
    var headers = e.range.getSheet().getRange(1, 1, 1, e.range.getSheet().getLastColumn()).getValues()[0];

    // Find Title and Artist name columns (case-insensitive)
    var title = '';
    var artist = '';
    var email = '';
    for (var i = 0; i < headers.length; i++) {
      var h = (headers[i] || '').toString().toLowerCase().trim();
      if (h === 'title') title = (row[i] || '').toString().trim();
      if (h.indexOf('artist') >= 0 || h === 'name') artist = (row[i] || '').toString().trim();
      if (h.indexOf('email') >= 0) email = (row[i] || '').toString().trim();
    }

    if (!title) return;

    var slug = generateSlug(title);
    var passphrase = generatePassphrase();
    var displayName = artist || 'Proposer';

    // Write to chat spreadsheet _codes tab
    var chatSS = SpreadsheetApp.openById(CHAT_SPREADSHEET_ID);
    var codesTab = chatSS.getSheetByName('_codes');

    if (!codesTab) {
      codesTab = chatSS.insertSheet('_codes');
    }

    codesTab.appendRow([slug, passphrase, displayName]);

    // Email the passphrase to the submitter if we have their email
    if (email) {
      MailApp.sendEmail({
        to: email,
        subject: 'Your project discussion passphrase — ' + title,
        body: 'Hi ' + (artist || 'there') + ',\n\n' +
              'Your proposal "' + title + '" has been received.\n\n' +
              'To participate in the project discussion on the Art Grants platform, ' +
              'use this passphrase:\n\n' +
              '  ' + passphrase + '\n\n' +
              'Keep this passphrase private — it identifies you in the discussion.\n\n' +
              'Art Grants'
      });
    }

  } catch (err) {
    Logger.log('onFormSubmit error: ' + err.message);
  }
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
  var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  var result = '';
  for (var i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
