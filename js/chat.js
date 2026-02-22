import { CHAT_SPREADSHEET_ID, CHAT_SCRIPT_URL } from './constants.js';
import { escapeHtml } from './utils.js';

const CHAT_CSV_BASE = `https://docs.google.com/spreadsheets/d/e/${CHAT_SPREADSHEET_ID}/pub?output=csv`;

// Cache fetched tab list so we only request it once per session
let knownTabs = null;

async function fetchTabList() {
  if (knownTabs) return knownTabs;
  const url = `https://docs.google.com/spreadsheets/d/e/${CHAT_SPREADSHEET_ID}/pubhtml`;
  try {
    const res = await fetch(url);
    if (!res.ok) return {};
    const html = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const links = doc.querySelectorAll('#sheet-menu li a');
    const tabs = {};
    links.forEach((a) => {
      const name = a.textContent.trim();
      const href = a.getAttribute('href') || '';
      const match = href.match(/gid=(\d+)/);
      if (match) tabs[name] = match[1];
    });
    knownTabs = tabs;
    return tabs;
  } catch {
    return {};
  }
}

async function fetchChatMessages(slug) {
  try {
    const tabs = await fetchTabList();
    const gid = tabs[slug];
    if (!gid) return [];

    const csvUrl = `${CHAT_CSV_BASE}&gid=${gid}`;
    const res = await fetch(csvUrl);
    if (!res.ok) return [];
    const text = await res.text();
    return parseChatCSV(text);
  } catch {
    return [];
  }
}

function parseChatCSV(text) {
  if (!text || !text.trim()) return [];
  const lines = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '"') {
      if (inQuotes && next === '"') { field += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      row.push(field.trim()); field = '';
    } else if ((c === '\n' || c === '\r') && !inQuotes) {
      if (c === '\r' && next === '\n') i++;
      row.push(field.trim());
      if (row.some(cell => cell)) lines.push(row);
      row = []; field = '';
    } else {
      field += c;
    }
  }
  if (field || row.length) { row.push(field.trim()); if (row.some(c => c)) lines.push(row); }
  if (lines.length < 2) return [];

  return lines.slice(1).map(r => ({
    timestamp: r[0] || '',
    author: r[1] || '',
    role: r[2] || '',
    message: r[3] || '',
  }));
}

async function postChatMessage(slug, code, message) {
  if (!CHAT_SCRIPT_URL) {
    throw new Error('Chat posting is not configured. Set CHAT_SCRIPT_URL in constants.js.');
  }
  const res = await fetch(CHAT_SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify({ project: slug, code, message }),
  });
  if (!res.ok) throw new Error('Failed to post message');
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

function formatTimestamp(raw) {
  if (!raw) return '';
  try {
    const d = new Date(raw);
    if (isNaN(d)) return raw;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return raw;
  }
}

export function createChatSection(proposal) {
  const container = document.createElement('div');
  container.className = 'chat-section';

  const heading = document.createElement('h3');
  heading.className = 'chat-heading';
  heading.textContent = 'Project Discussion';
  container.appendChild(heading);

  const messagesEl = document.createElement('div');
  messagesEl.className = 'chat-messages';
  messagesEl.innerHTML = '<p class="chat-loading">Loading discussion...</p>';
  container.appendChild(messagesEl);

  fetchChatMessages(proposal.slug).then((messages) => {
    messagesEl.innerHTML = '';
    if (!messages.length) {
      messagesEl.innerHTML = '<p class="chat-empty">No messages yet.</p>';
    } else {
      messages.forEach((msg) => {
        messagesEl.appendChild(renderMessage(msg));
      });
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  });

  if (CHAT_SCRIPT_URL && proposal.statusKey === 'under-review') {
    const form = document.createElement('form');
    form.className = 'chat-form';
    form.innerHTML = `
      <input type="text" name="code" class="chat-input chat-code" placeholder="Passphrase" required />
      <div class="chat-compose">
        <textarea name="message" class="chat-input chat-textarea" placeholder="Write a message..." rows="2" required></textarea>
        <button type="submit" class="chat-send">Send</button>
      </div>
    `;

    const errorEl = document.createElement('p');
    errorEl.className = 'chat-error';
    errorEl.style.display = 'none';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      const codeInput = form.querySelector('[name="code"]');
      const messageInput = form.querySelector('[name="message"]');
      const btn = form.querySelector('.chat-send');
      const code = codeInput.value.trim();
      const message = messageInput.value.trim();
      if (!code || !message) return;

      btn.disabled = true;
      btn.textContent = 'Sending...';
      try {
        await postChatMessage(proposal.slug, code, message);
        messageInput.value = '';
        // Refresh messages
        knownTabs = null;
        const messages = await fetchChatMessages(proposal.slug);
        messagesEl.innerHTML = '';
        if (!messages.length) {
          messagesEl.innerHTML = '<p class="chat-empty">No messages yet.</p>';
        } else {
          messages.forEach((msg) => messagesEl.appendChild(renderMessage(msg)));
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }
      } catch (err) {
        console.error('Chat send error:', err);
        errorEl.textContent = err.message || 'Failed to send message. Please try again.';
        errorEl.style.display = '';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Send';
      }
    });
    container.appendChild(form);
    container.appendChild(errorEl);
  }

  return container;
}

function renderMessage(msg) {
  const el = document.createElement('div');
  el.className = 'chat-message';
  const roleClass = msg.role ? ` chat-role-${msg.role.toLowerCase().replace(/\s+/g, '-')}` : '';
  el.innerHTML = `
    <div class="chat-message-header${roleClass}">
      <span class="chat-message-author">${escapeHtml(msg.author)}</span>
      ${msg.role ? `<span class="chat-message-role">${escapeHtml(msg.role)}</span>` : ''}
      <span class="chat-message-time">${escapeHtml(formatTimestamp(msg.timestamp))}</span>
    </div>
    <div class="chat-message-body">${escapeHtml(msg.message)}</div>
  `;
  return el;
}
