import { CHAT_SCRIPT_URL } from './constants.js';
import { escapeHtml, renderMarkdown } from './utils.js';

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

function autoExpand(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
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
    const draftKey = 'chat-draft-' + proposal.slug;
    const savedDraft = localStorage.getItem(draftKey) || '';
    let debounceTimer = null;

    const form = document.createElement('form');
    form.className = 'chat-form';
    form.innerHTML = `
      <div class="chat-compose">
        <label for="chat-msg-${proposal.slug}" class="visually-hidden">Message</label>
        <textarea id="chat-msg-${proposal.slug}" name="message" class="chat-input chat-textarea" placeholder="Write a message..." rows="2" required></textarea>
        <div class="chat-hints"><strong>**bold**</strong> <em>*italic*</em> <code>\`code\`</code> [link](url) — <kbd>Ctrl+Enter</kbd> to send</div>
      </div>
      <div class="chat-bottom">
        <label for="chat-code-${proposal.slug}" class="visually-hidden">Passphrase</label>
        <input type="text" id="chat-code-${proposal.slug}" name="code" class="chat-input chat-code" placeholder="Passphrase" required value="${escapeHtml(savedCode)}" />
        <button type="submit" class="chat-send">Send</button>
      </div>
    `;

    const textarea = form.querySelector('.chat-textarea');

    // Restore draft
    if (savedDraft) {
      textarea.value = savedDraft;
      requestAnimationFrame(() => autoExpand(textarea));
    }

    function saveDraft() {
      localStorage.setItem(draftKey, textarea.value);
    }

    textarea.addEventListener('input', () => {
      autoExpand(textarea);
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(saveDraft, 300);
    });

    // Ctrl/Cmd+Enter to send
    textarea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        form.requestSubmit();
      }
    });

    const errorEl = document.createElement('p');
    errorEl.className = 'chat-error';
    errorEl.style.display = 'none';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      const codeInput = form.querySelector('[name="code"]');
      const btn = form.querySelector('.chat-send');
      const code = codeInput.value.trim();
      const message = textarea.value.trim();
      if (!code || !message) return;

      btn.disabled = true;
      btn.textContent = 'Sending...';
      try {
        await postChatMessage(proposal.slug, code, message);
        localStorage.setItem('chat-code-' + proposal.slug, code);
        // Clear compose
        textarea.value = '';
        localStorage.removeItem(draftKey);
        textarea.style.height = 'auto';
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

  const role = (msg.role || 'Artist').trim();
  const roleKey = role.toLowerCase().replace(/\s+/g, '-');

  el.innerHTML = `
    <div class="chat-message-header chat-role-${roleKey}">
      <span class="chat-message-role">${escapeHtml(role)}</span>
      <span class="chat-message-time">${escapeHtml(formatTimestamp(msg.timestamp))}</span>
    </div>
    <div class="chat-message-body md-content">${renderMarkdown(msg.message)}</div>
  `;
  return el;
}
