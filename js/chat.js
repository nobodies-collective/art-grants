import { CHAT_SCRIPT_URL } from './constants.js';
import { escapeHtml } from './utils.js';

async function fetchChatMessages(slug) {
  if (!CHAT_SCRIPT_URL) return [];
  try {
    const params = new URLSearchParams({ project: slug });
    const res = await fetch(`${CHAT_SCRIPT_URL}?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    if (data.error) return [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function postChatMessage(slug, code, message) {
  if (!CHAT_SCRIPT_URL) {
    throw new Error('Chat posting is not configured. Set CHAT_SCRIPT_URL in constants.js.');
  }
  // Use GET with action=post so the redirect from Apps Script works
  // (POST + cross-origin redirect is blocked by browsers)
  const params = new URLSearchParams({
    action: 'post',
    project: slug,
    code,
    message,
  });
  const res = await fetch(`${CHAT_SCRIPT_URL}?${params}`);
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
    const savedCode = localStorage.getItem('chat-code-' + proposal.slug) || '';

    const form = document.createElement('form');
    form.className = 'chat-form';
    form.innerHTML = `
      <div class="chat-compose">
        <label for="chat-msg-${proposal.slug}" class="visually-hidden">Message</label>
        <textarea id="chat-msg-${proposal.slug}" name="message" class="chat-input chat-textarea" placeholder="Write a message..." rows="2" required></textarea>
      </div>
      <div class="chat-bottom">
        <label for="chat-code-${proposal.slug}" class="visually-hidden">Passphrase</label>
        <input type="text" id="chat-code-${proposal.slug}" name="code" class="chat-input chat-code" placeholder="Passphrase" required value="${escapeHtml(savedCode)}" />
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
        localStorage.setItem('chat-code-' + proposal.slug, code);
        messageInput.value = '';
        // Refresh messages
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
