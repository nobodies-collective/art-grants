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

async function editChatMessage(slug, code, messageId, newMessage) {
  if (!CHAT_SCRIPT_URL) throw new Error('Chat not configured.');
  const params = new URLSearchParams({
    action: 'edit',
    project: slug,
    code,
    id: String(messageId),
    message: newMessage,
  });
  const res = await fetch(`${CHAT_SCRIPT_URL}?${params}`);
  if (!res.ok) throw new Error('Failed to edit message');
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function deleteChatMessage(slug, code, messageId) {
  if (!CHAT_SCRIPT_URL) throw new Error('Chat not configured.');
  const params = new URLSearchParams({
    action: 'delete',
    project: slug,
    code,
    id: String(messageId),
  });
  const res = await fetch(`${CHAT_SCRIPT_URL}?${params}`);
  if (!res.ok) throw new Error('Failed to delete message');
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function verifyPassphrase(slug, code) {
  if (!CHAT_SCRIPT_URL) return null;
  try {
    const params = new URLSearchParams({
      action: 'verify',
      project: slug,
      code,
    });
    const res = await fetch(`${CHAT_SCRIPT_URL}?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error || !data.ok) return null;
    return data.role;
  } catch {
    return null;
  }
}

/**
 * Extract ?code= from URL, save to localStorage, clean URL.
 */
function extractCodeFromURL(slug) {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  if (code) {
    localStorage.setItem('chat-code-' + slug, code);
    // Clean the code from the URL
    url.searchParams.delete('code');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
    return code;
  }
  return null;
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

  const slug = proposal.slug;

  // Extract code from URL if present
  const urlCode = extractCodeFromURL(slug);
  const savedCode = localStorage.getItem('chat-code-' + slug) || '';
  const code = urlCode || savedCode;

  // If we have a code (from URL or localStorage), verify it to get the role
  if (code && CHAT_SCRIPT_URL) {
    verifyPassphrase(slug, code).then((role) => {
      if (role) {
        localStorage.setItem('chat-code-' + slug, code);
        localStorage.setItem('chat-role-' + slug, role);
        // Hide passphrase input if visible
        const codeInput = container.querySelector('.chat-code');
        if (codeInput) codeInput.closest('.chat-bottom').querySelector('.chat-code').style.display = 'none';
        // Re-render messages with edit/delete buttons
        refreshMessages();
      }
    });
  }

  function refreshMessages() {
    fetchChatMessages(slug).then((messages) => {
      messagesEl.innerHTML = '';
      if (!messages.length) {
        messagesEl.innerHTML = '<p class="chat-empty">No messages yet.</p>';
      } else {
        messages.forEach((msg) => {
          messagesEl.appendChild(renderMessage(msg, slug, refreshMessages));
        });
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    });
  }

  refreshMessages();

  if (CHAT_SCRIPT_URL && proposal.statusKey === 'under-review') {
    const draftKey = 'chat-draft-' + slug;
    const savedDraft = localStorage.getItem(draftKey) || '';
    let debounceTimer = null;

    const hasCode = !!code;

    const form = document.createElement('form');
    form.className = 'chat-form';
    form.innerHTML = `
      <div class="chat-compose">
        <label for="chat-msg-${slug}" class="visually-hidden">Message</label>
        <textarea id="chat-msg-${slug}" name="message" class="chat-input chat-textarea" placeholder="Write a message..." rows="2" required></textarea>
      </div>
      <div class="chat-bottom">
        <label for="chat-code-${slug}" class="visually-hidden">Passphrase</label>
        <input type="text" id="chat-code-${slug}" name="code" class="chat-input chat-code" placeholder="Passphrase" required value="${escapeHtml(code)}" ${hasCode ? 'style="display:none"' : ''} />
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
      const codeVal = codeInput.value.trim();
      const message = textarea.value.trim();
      if (!codeVal || !message) return;

      btn.disabled = true;
      btn.textContent = 'Sending...';
      try {
        const result = await postChatMessage(slug, codeVal, message);
        localStorage.setItem('chat-code-' + slug, codeVal);
        if (result.role) localStorage.setItem('chat-role-' + slug, result.role);
        // Hide passphrase after successful auth
        codeInput.style.display = 'none';
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
        // Show passphrase field if auth failed
        codeInput.style.display = '';
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

function renderMessage(msg, slug, onRefresh) {
  const el = document.createElement('div');
  el.className = 'chat-message';

  const role = (msg.role || 'Artist').trim();
  const roleKey = role.toLowerCase().replace(/\s+/g, '-');

  // Check ownership: stored role must match message role
  const savedRole = localStorage.getItem('chat-role-' + slug) || '';
  const canModify = savedRole && savedRole === role;

  const actionsHTML = canModify ? `
    <span class="chat-message-actions">
      <button type="button" class="chat-action-btn chat-edit-btn" title="Edit">Edit</button>
      <button type="button" class="chat-action-btn chat-delete-btn" title="Delete">Delete</button>
    </span>
  ` : '';

  el.innerHTML = `
    <div class="chat-message-header chat-role-${roleKey}">
      <span class="chat-message-role">${escapeHtml(role)}</span>
      <span class="chat-message-time">${escapeHtml(formatTimestamp(msg.timestamp))}</span>
      ${actionsHTML}
    </div>
    <div class="chat-message-body md-content">${renderMarkdown(msg.message)}</div>
  `;

  if (canModify) {
    const savedCode = localStorage.getItem('chat-code-' + slug) || '';

    el.querySelector('.chat-edit-btn').addEventListener('click', () => {
      enterEditMode(el, msg, slug, savedCode, onRefresh);
    });

    el.querySelector('.chat-delete-btn').addEventListener('click', async () => {
      if (!confirm('Delete this message?')) return;
      const btn = el.querySelector('.chat-delete-btn');
      btn.disabled = true;
      btn.textContent = '...';
      try {
        await deleteChatMessage(slug, savedCode, msg.id);
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

function enterEditMode(el, msg, slug, code, onRefresh) {
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
      await editChatMessage(slug, code, msg.id, newText);
      onRefresh();
    } catch (err) {
      alert('Failed to save: ' + err.message);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  });
}
