import { CHAT_SCRIPT_URL } from './constants.js';
import { escapeHtml, renderMarkdown } from './utils.js';

function getUserToken() {
  let token = localStorage.getItem('chat-token');
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem('chat-token', token);
  }
  return token;
}

async function fetchChatMessages(slug) {
  if (!CHAT_SCRIPT_URL) return [];
  try {
    const params = new URLSearchParams({ project: slug, token: getUserToken() });
    const res = await fetch(`${CHAT_SCRIPT_URL}?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    if (data.error) return [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function postChatMessage(slug, name, message) {
  if (!CHAT_SCRIPT_URL) {
    throw new Error('Chat posting is not configured. Set CHAT_SCRIPT_URL in constants.js.');
  }
  const params = new URLSearchParams({
    action: 'post',
    project: slug,
    name,
    message,
    token: getUserToken(),
  });
  const res = await fetch(`${CHAT_SCRIPT_URL}?${params}`);
  if (!res.ok) throw new Error('Failed to post message');
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function editChatMessage(slug, messageId, newMessage) {
  if (!CHAT_SCRIPT_URL) throw new Error('Chat not configured.');
  const params = new URLSearchParams({
    action: 'edit',
    project: slug,
    id: String(messageId),
    message: newMessage,
    token: getUserToken(),
  });
  const res = await fetch(`${CHAT_SCRIPT_URL}?${params}`);
  if (!res.ok) throw new Error('Failed to edit message');
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function deleteChatMessage(slug, messageId) {
  if (!CHAT_SCRIPT_URL) throw new Error('Chat not configured.');
  const params = new URLSearchParams({
    action: 'delete',
    project: slug,
    id: String(messageId),
    token: getUserToken(),
  });
  const res = await fetch(`${CHAT_SCRIPT_URL}?${params}`);
  if (!res.ok) throw new Error('Failed to delete message');
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

  const messagesEl = document.createElement('div');
  messagesEl.className = 'chat-messages';
  messagesEl.innerHTML = '<p class="chat-loading">Loading discussion...</p>';
  container.appendChild(messagesEl);

  const slug = proposal.slug;
  const savedName = localStorage.getItem('chat-name') || '';

  function refreshMessages() {
    return fetchChatMessages(slug).then((messages) => {
      messagesEl.innerHTML = '';
      if (!messages.length) {
        messagesEl.innerHTML = '<p class="chat-empty">No messages yet.</p>';
        container.classList.add('chat-empty-state');
      } else {
        container.classList.remove('chat-empty-state');
        messages.forEach((msg) => {
          messagesEl.appendChild(renderMessage(msg, slug, refreshMessages));
        });
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
      container.classList.add('chat-ready');
    });
  }

  refreshMessages();

  if (CHAT_SCRIPT_URL && proposal.messagingOn) {
    const draftKey = 'chat-draft-' + slug;
    const savedDraft = localStorage.getItem(draftKey) || '';
    let debounceTimer = null;

    const form = document.createElement('form');
    form.className = 'chat-form';
    form.innerHTML = `
      <div class="chat-compose">
        <textarea id="chat-msg-${slug}" name="message" class="chat-input chat-textarea" placeholder="Write a message..." rows="2" required></textarea>
      </div>
      <div class="chat-bottom">
        <input type="text" id="chat-name-${slug}" name="name" class="chat-input chat-name" placeholder="Your name" required value="${escapeHtml(savedName)}" />
        <button type="submit" class="chat-send">Send</button>
      </div>
    `;

    const textarea = form.querySelector('.chat-textarea');
    const nameInput = form.querySelector('.chat-name');

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

    // Save name on change
    nameInput.addEventListener('input', () => {
      localStorage.setItem('chat-name', nameInput.value.trim());
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
      const nameVal = nameInput.value.trim();
      const message = textarea.value.trim();
      if (!nameVal || !message) return;

      const btn = form.querySelector('.chat-send');
      btn.disabled = true;
      btn.textContent = 'Sending...';
      try {
        await postChatMessage(slug, nameVal, message);
        localStorage.setItem('chat-name', nameVal);
        // Clear compose
        textarea.value = '';
        localStorage.removeItem(draftKey);
        textarea.style.height = 'auto';
        // Refresh messages
        refreshMessages();
      } catch (err) {
        console.error('Chat send error:', err);
        errorEl.textContent = err.message || 'Failed to send message. Please try again.';
        errorEl.style.display = '';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Send';
      }
    });
    const hintEl = document.createElement('p');
    hintEl.className = 'chat-hint';
    hintEl.textContent = 'You can edit or delete your own messages from the same browser. Clearing your browser cache will remove this ability.';

    container.appendChild(form);
    container.appendChild(errorEl);
    container.appendChild(hintEl);
  }

  return container;
}

function renderMessage(msg, slug, onRefresh) {
  const el = document.createElement('div');
  el.className = 'chat-message';

  const author = (msg.author || 'Anonymous').trim();
  const canModify = msg.isOwn === true;

  const actionsHTML = canModify ? `
    <span class="chat-message-actions">
      <button type="button" class="chat-action-btn chat-edit-btn" title="Edit">Edit</button>
      <button type="button" class="chat-action-btn chat-delete-btn" title="Delete">Delete</button>
    </span>
  ` : '';

  el.innerHTML = `
    <div class="chat-message-header">
      <span class="chat-message-author">${escapeHtml(author)}</span>
      <span class="chat-message-time">${escapeHtml(formatTimestamp(msg.timestamp))}</span>
      ${actionsHTML}
    </div>
    <div class="chat-message-body md-content">${renderMarkdown(msg.message)}</div>
  `;

  if (canModify) {
    el.querySelector('.chat-edit-btn').addEventListener('click', () => {
      enterEditMode(el, msg, slug, onRefresh);
    });

    el.querySelector('.chat-delete-btn').addEventListener('click', async () => {
      if (!confirm('Delete this message?')) return;
      const btn = el.querySelector('.chat-delete-btn');
      btn.disabled = true;
      btn.textContent = '...';
      try {
        await deleteChatMessage(slug, msg.id);
        onRefresh();
      } catch (err) {
        alert('Failed to delete: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'Delete';
      }
    });
  }

  return el;
}

function enterEditMode(el, msg, slug, onRefresh) {
  const bodyEl = el.querySelector('.chat-message-body');
  const originalHTML = bodyEl.innerHTML;

  bodyEl.innerHTML = '';
  bodyEl.classList.add('chat-editing');

  const textarea = document.createElement('textarea');
  textarea.className = 'chat-edit-textarea';
  textarea.value = msg.message;
  textarea.rows = 3;

  const btnRow = document.createElement('div');
  btnRow.className = 'chat-edit-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'chat-edit-save';
  saveBtn.textContent = 'Save';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'chat-edit-cancel';
  cancelBtn.textContent = 'Cancel';

  btnRow.append(saveBtn, cancelBtn);
  bodyEl.append(textarea, btnRow);
  textarea.focus();

  cancelBtn.addEventListener('click', () => {
    bodyEl.innerHTML = originalHTML;
    bodyEl.classList.remove('chat-editing');
  });

  saveBtn.addEventListener('click', async () => {
    const newText = textarea.value.trim();
    if (!newText) return;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    try {
      await editChatMessage(slug, msg.id, newText);
      onRefresh();
    } catch (err) {
      alert('Failed to save: ' + err.message);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  });
}
