// ═══════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════
const state = {
  user: null,
  token: null,
  chats: [],
  currentChatId: null,
  messages: [],
  ws: null,
  wsReconnectTimer: null,
  chatPolling: null,
  msgPolling: null,
  deleteTargetId: null,
  deleteMsgTargetId: null,
  searchTimer: null,
  groupMode: false,
  selectedUserIds: new Set(),
};

let flag = true;
let senderFlag = true;

// ═══════════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════════
function qs(sel) { return document.querySelector(sel); }

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000 && d.getDate() === now.getDate())
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (diff < 172800000) return 'Вчера';
  if (diff < 604800000) return d.toLocaleDateString('ru-RU', { weekday: 'short' });
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function formatTimeShort(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function scrollMessages(smooth = true) {
  const m = qs('#messages');
  m.scrollTo({ top: m.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
}

function markActive(chatId) {
  qs('#chat-list').querySelectorAll('.chat-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === chatId);
  });
}

function isMobile() {
  return window.innerWidth <= 680;
}

function backToSidebar() {
  qs('#sidebar').classList.remove('hidden-mobile');
  qs('#chat-area').classList.add('hidden-mobile');
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function showToast(msg, duration = 3000) {
  const t = qs('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

function openModal(id) {
  qs('#' + id).classList.add('open');
}

function closeModal(id) {
  qs('#' + id).classList.remove('open');
}

function getChatName(chat) {
  if (chat.isGroup) return chat.name || 'Группа';
  if (chat.participants) {
    const other = chat.participants.find(p => p.id !== state.user.id);
    if (other) return other.displayName || other.username || 'Пользователь';
  }
  return 'Чат';
}

function getOtherParticipant(chat) {
  if (!chat.participants || chat.isGroup) return null;
  return chat.participants.find(p => p.id !== state.user.id) || null;
}

// ═══════════════════════════════════════════════
//  API
// ═══════════════════════════════════════════════
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (state.token) opts.headers['Authorization'] = `Bearer ${state.token}`;
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
  return data;
}

async function apiForm(method, path, formData) {
  const opts = { method, headers: {} };
  if (state.token) opts.headers['Authorization'] = `Bearer ${state.token}`;
  opts.body = formData;
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
  return data;
}

// ═══════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════
async function login(username, password) {
  const data = await api('POST', '/api/auth/login', { username, password });
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify(data.user));
}

async function register(username, password, displayName, recoveryCode) {
  const data = await api('POST', '/api/auth/register', { username, password, displayName, recoveryCode });
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify(data.user));
}

async function resetPassword(username, recoveryCode, newPassword) {
  await api('POST', '/api/auth/reset-password', { username, recoveryCode, newPassword });
}

async function logout() {
  try { await api('POST', '/api/auth/logout'); } catch (_) { }
  state.token = null;
  state.user = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  stopPolling();
  disconnectWs();
  showAuth();
}

async function checkAuth() {
  const token = localStorage.getItem('token');
  if (!token) return false;
  state.token = token;
  state.user = JSON.parse(localStorage.getItem('user') || 'null');
  try {
    const data = await api('GET', '/api/auth/me');
    state.user = data;
    localStorage.setItem('user', JSON.stringify(data));
    return true;
  } catch (_) {
    state.token = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    return false;
  }
}

// ═══════════════════════════════════════════════
//  AVATAR UPLOAD
// ═══════════════════════════════════════════════
async function uploadAvatar(file) {
  const formData = new FormData();
  formData.append('avatar', file);
  try {
    const data = await apiForm('POST', '/api/auth/avatar', formData);
    state.user = { ...state.user, avatarUrl: data.avatarUrl };
    localStorage.setItem('user', JSON.stringify(state.user));
    updateAvatarDisplays();
    showToast('Аватар обновлён');
  } catch (e) {
    showToast(e.message || 'Ошибка загрузки аватара');
  }
}

function updateAvatarDisplays() {
  const url = state.user && state.user.avatarUrl;
  const sidebarAvatar = qs('#my-avatar-btn');
  if (sidebarAvatar) {
    if (url) {
      sidebarAvatar.innerHTML = `<img src="${url}" alt="avatar">`;
    } else {
      sidebarAvatar.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.58-7 8-7s8 3 8 7"/>
      </svg>`;
    }
  }
  updateProfileAvatar();
}

function updateProfileAvatar() {
  const url = state.user && state.user.avatarUrl;
  const bigEl = qs('#profile-avatar-big');
  if (!bigEl) return;
  const initial = state.user ? (state.user.displayName || state.user.username || '?').charAt(0).toUpperCase() : '?';
  if (url) {
    bigEl.innerHTML = `<img src="${url}" alt="avatar">`;
  } else {
    bigEl.textContent = initial;
  }
}

async function updateProfile(field, value) {
  try {
    const data = await api('PATCH', '/api/auth/profile', { [field]: value });
    state.user = { ...state.user, ...data.user };
    renderProfilePanel();
    updateAvatarDisplays();
    showToast('Сохранено');
  } catch (e) {
    showToast(e.message || 'Ошибка сохранения', true);
    throw e;
  }
}

function startInlineEdit(item, field, currentValue) {
  const content = item.querySelector('.profile-item-content');
  const editBtn = item.querySelector('.profile-edit-btn');
  if (!content || item.dataset.editing === '1') return;
  item.dataset.editing = '1';
  editBtn.style.display = 'none';

  const label = content.querySelector('.profile-item-label');
  const hint = content.querySelector('.profile-item-value');
  label.style.display = 'none';
  hint.style.display = 'none';

  const row = document.createElement('div');
  row.className = 'profile-item-edit-row';

  const input = document.createElement('input');
  input.className = 'profile-item-input';
  input.value = currentValue;
  if (field === 'username') {
    input.placeholder = 'username';
    input.autocapitalize = 'none';
    input.autocorrect = 'off';
  } else {
    input.placeholder = 'Имя';
  }

  const saveBtn = document.createElement('button');
  saveBtn.className = 'profile-item-action-btn save';
  saveBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
  saveBtn.title = 'Сохранить';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'profile-item-action-btn cancel';
  cancelBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  cancelBtn.title = 'Отмена';

  row.appendChild(input);
  row.appendChild(saveBtn);
  row.appendChild(cancelBtn);
  content.appendChild(row);
  input.focus();
  input.select();

  function stopEdit() {
    item.dataset.editing = '0';
    editBtn.style.display = '';
    label.style.display = '';
    hint.style.display = '';
    content.removeChild(row);
  }

  saveBtn.onclick = async () => {
    const newVal = input.value.trim();
    if (!newVal || newVal === currentValue) { stopEdit(); return; }
    saveBtn.disabled = true;
    try {
      await updateProfile(field, newVal);
      stopEdit();
    } catch (_) {
      saveBtn.disabled = false;
      input.focus();
    }
  };

  cancelBtn.onclick = stopEdit;

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveBtn.onclick();
    if (e.key === 'Escape') stopEdit();
  });
}

// ═══════════════════════════════════════════════
//  WEBSOCKET
// ═══════════════════════════════════════════════
function connectWs() {
  if (!state.token) return;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${location.host}/ws?token=${state.token}`;
  const ws = new WebSocket(url);
  ws.onopen = () => { state.ws = ws; };
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'message') {
        if (msg.chatId === state.currentChatId) {
          state.messages.push(msg.data);
          appendMessage(msg.data, false);
          scrollMessages();
          markRead(state.currentChatId);
        }
        loadChats();
      } else if (msg.type === 'delete_message') {
        state.messages = state.messages.filter(m => m.id !== msg.messageId);
        const el = qs(`[data-msg-id="${msg.messageId}"]`);
        if (el) el.remove();
        if (msg.chatId === state.currentChatId && !state.messages.length) {
          renderMessages();
        }
        loadChats();
      }
    } catch (_) { }
  };
  ws.onclose = () => {
    state.ws = null;
    state.wsReconnectTimer = setTimeout(connectWs, 5000);
  };
  ws.onerror = () => ws.close();
}

function disconnectWs() {
  clearTimeout(state.wsReconnectTimer);
  if (state.ws) { state.ws.close(); state.ws = null; }
}

// ═══════════════════════════════════════════════
//  CHATS
// ═══════════════════════════════════════════════

Notification.requestPermission().then(permission => {
  if (permission === 'granted') {
    // Если разрешено — показываем уведомление
    // showNotification('Уведомления включены.');
  } else {
    // Иначе сообщаем пользователю
    alert('Разрешение на отправку уведомлений не получено.');
  }
});

function showNotification(message) {
  // Создаём новое уведомление
  const notification = new Notification('Уведомление от сайта', {
    body: message,          // Основной текст
    icon: '/static/fav.jpg',// Путь к иконке (необязательно)
  });

  // При клике на уведомление — фокусируется на вкладке, где оно было создано
  notification.onclick = function(event) {
    event.preventDefault(); // Предотвращаем любые стандартные действия (если таковые имеются)

    // Явно фокусируется на окне/вкладке, где было создано уведомление
    // self === window в глобальном контексте
    self.focus();

    // Также можно закрыть уведомление после клика
    notification.close();
  };
}

async function loadChats() {
  try {
    const chats = await api('GET', '/api/chats');
    state.chats = chats;
    renderChatList();
  } catch (_) { }
}

async function openChat(chatId) {
  state.currentChatId = chatId;
  const chat = state.chats.find(c => c.id === chatId);
  if (!chat) return;

  const other = getOtherParticipant(chat);
  renderChatHeader(chat, other);

  qs('#chat-placeholder').style.display = 'none';
  qs('#chat-view').style.display = 'flex';
  qs('#chat-view').style.flexDirection = 'column';

  if (isMobile()) {
    qs('#sidebar').classList.add('hidden-mobile');
    qs('#chat-area').classList.remove('hidden-mobile');
  }

  markActive(chatId);
  await loadMessages(chatId, false);
  markRead(chatId);
}

async function loadMessages(chatId, isNotOpeningChat = true) {
  try {
    const msgs = await api('GET', `/api/chats/${chatId}/messages`);
    console.log(JSON.stringify(state.messages) !== JSON.stringify(msgs) && flag && isNotOpeningChat && senderFlag);
    if (JSON.stringify(state.messages) !== JSON.stringify(msgs) && flag && isNotOpeningChat && senderFlag) {
      flag = false;
      const chat = state.chats.find(c => c.id === chatId);
      const chatName = chat ? getChatName(chat) : 'Чат';
      showNotification('У Вас новое сообщение в чате "' + chatName + '"');
    } else if (JSON.stringify(state.messages) === JSON.stringify(msgs) && !flag && isNotOpeningChat && senderFlag) {
      flag = true;
    }
    senderFlag = true;
    state.messages = msgs;
    renderMessages();
    scrollMessages(false);
  } catch (_) { }
}

async function sendMessage() {
  const input = qs('#msg-input');
  const content = input.value.trim();
  if (!content || !state.currentChatId) return;
  input.value = '';
  autoResize(input);
  try {
    const msg = await api('POST', `/api/chats/${state.currentChatId}/messages`, { content });
    state.messages.push(msg);
    appendMessage(msg, true);
    senderFlag = false;
    scrollMessages();
    loadChats();
  } catch (e) {
    showToast(e.message || 'Ошибка отправки');
  }
}

async function createChat(participantId) {
  try {
    const chat = await api('POST', '/api/chats', { participantIds: [participantId] });
    await loadChats();
    closeModal('new-chat-modal');
    await openChat(chat.id);
  } catch (e) {
    showToast(e.message || 'Ошибка создания чата');
  }
}

async function createGroupChat(name, participantIds) {
  try {
    const chat = await api('POST', '/api/chats', {
      name,
      participantIds,
      isGroup: true,
    });
    await loadChats();
    closeModal('new-chat-modal');
    resetGroupModal();
    await openChat(chat.id);
  } catch (e) {
    showToast(e.message || 'Ошибка создания группы');
  }
}

function resetGroupModal() {
  state.selectedUserIds.clear();
  state.groupMode = false;
  qs('#modal-tab-direct').classList.add('active');
  qs('#modal-tab-group').classList.remove('active');
  qs('#group-name-wrap').classList.remove('visible');
  qs('#group-name-input').value = '';
  qs('#selected-users-bar').classList.remove('visible');
  qs('#selected-users-bar').innerHTML = '';
  qs('#modal-create-btn').classList.remove('visible');
  qs('#user-search-input').value = '';
  qs('#users-list').innerHTML = '';
}

async function deleteChat(chatId) {
  try {
    await api('DELETE', `/api/chats/${chatId}`);
    state.chats = state.chats.filter(c => c.id !== chatId);
    if (state.currentChatId === chatId) {
      state.currentChatId = null;
      qs('#chat-placeholder').style.display = 'flex';
      qs('#chat-view').style.display = 'none';
      if (isMobile()) backToSidebar();
    }
    renderChatList();
  } catch (e) {
    showToast(e.message || 'Ошибка удаления');
  }
}

async function deleteMessage(msgId) {
  try {
    await api('DELETE', `/api/messages/${msgId}`);
    state.messages = state.messages.filter(m => m.id !== msgId);
    const el = qs(`[data-msg-id="${msgId}"]`);
    if (el) el.remove();
    if (!state.messages.length) renderMessages();
    loadChats();
  } catch (e) {
    showToast(e.message || 'Ошибка удаления сообщения');
  }
}

async function markRead(chatId) {
  try { await api('POST', `/api/chats/${chatId}/read`); } catch (_) { }
}

// ═══════════════════════════════════════════════
//  POLLING
// ═══════════════════════════════════════════════
function startPolling() {
  state.chatPolling = setInterval(loadChats, 6000);
  state.msgPolling = setInterval(() => {
    if (state.currentChatId) loadMessages(state.currentChatId);
  }, 3500);
}

function stopPolling() {
  clearInterval(state.chatPolling);
  clearInterval(state.msgPolling);
}

// ═══════════════════════════════════════════════
//  RENDER
// ═══════════════════════════════════════════════
function renderChatList() {
  const q = qs('#search-input').value.toLowerCase();
  const list = qs('#chat-list');
  const chats = q
    ? state.chats.filter(c => getChatName(c).toLowerCase().includes(q))
    : state.chats;

  if (!chats.length) {
    list.innerHTML = `<div style="padding:32px 16px;text-align:center;color:var(--text-secondary);font-size:14px">${q ? 'Ничего не найдено' : 'Нет чатов. Нажмите + чтобы начать'}</div>`;
    return;
  }

  list.innerHTML = chats.map(chat => {
    const name = getChatName(chat);
    const other = getOtherParticipant(chat);
    const online = other && other.isOnline;
    const avatarUrl = chat.isGroup ? null : (other && other.avatarUrl);
    const initials = name.charAt(0).toUpperCase();
    const time = chat.lastMessage ? formatTime(chat.lastMessage.createdAt) : '';
    const preview = chat.lastMessage ? escHtml(chat.lastMessage.content) : 'Нет сообщений';
    const badge = chat.unreadCount > 0 ? `<span class="unread-badge">${chat.unreadCount > 99 ? '99+' : chat.unreadCount}</span>` : '';
    const active = chat.id === state.currentChatId ? ' active' : '';
    const onlineDot = online ? '<span class="online-dot"></span>' : '';
    const groupClass = chat.isGroup ? ' group-avatar' : '';
    const avatarContent = avatarUrl
      ? `<img src="${avatarUrl}" alt="avatar">`
      : initials;
    return `<div class="chat-item${active}" data-id="${chat.id}">
      <div class="chat-avatar${groupClass}">${avatarContent}${onlineDot}</div>
      <div class="chat-info">
        <div class="chat-info-top"><span class="chat-name">${escHtml(name)}</span><span class="chat-time">${time}</span></div>
        <div class="chat-info-bottom"><span class="chat-preview">${preview}</span>${badge}</div>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.chat-item').forEach(el => {
    el.addEventListener('click', () => {
      const existingChat = state.chats.find(c => c.id === el.dataset.id);
      if (existingChat) openChat(existingChat.id);
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showDeleteConfirm(el.dataset.id);
    });
  });
}

function renderMessages() {
  const container = qs('#messages');
  if (!state.messages.length) {
    container.innerHTML = '<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-secondary);font-size:14px">Нет сообщений</div>';
    return;
  }
  const chat = state.chats.find(c => c.id === state.currentChatId);
  const isGroup = chat && chat.isGroup;
  let lastDate = '';
  container.innerHTML = state.messages.map(msg => {
    const isSent = msg.senderId === state.user.id;
    const d = new Date(msg.createdAt);
    const dateStr = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    const dateSep = dateStr !== lastDate ? `<div class="msg-date-sep">${dateStr}</div>` : '';
    lastDate = dateStr;
    const senderName = (isGroup && !isSent && msg.sender)
      ? `<div class="msg-sender-name">${escHtml(msg.sender.displayName)}</div>` : '';
    const tick = isSent ? `<span class="msg-tick">${msg.isRead ? '✓✓' : '✓'}</span>` : '';
    const deleteBtn = isSent
      ? `<button class="msg-delete-btn" data-msg-id="${msg.id}" title="Удалить сообщение">
           <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
             <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
             <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
           </svg>
         </button>` : '';
    return `${dateSep}<div class="msg-wrap ${isSent ? 'sent' : 'received'}" data-msg-id="${msg.id}">
      ${deleteBtn}
      ${senderName}
      <div class="msg-bubble">
        <div class="msg-text">${escHtml(msg.content)}</div>
        <div class="msg-meta"><span class="msg-time">${formatTimeShort(msg.createdAt)}</span>${tick}</div>
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.msg-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showDeleteMsgConfirm(btn.dataset.msgId);
    });
  });
}

function appendMessage(msg, isSent) {
  const container = qs('#messages');
  const placeholder = container.querySelector('[style*="flex:1"]');
  if (placeholder) placeholder.remove();

  const chat = state.chats.find(c => c.id === state.currentChatId);
  const isGroup = chat && chat.isGroup;
  const senderName = (isGroup && !isSent && msg.sender)
    ? `<div class="msg-sender-name">${escHtml(msg.sender.displayName)}</div>` : '';

  const div = document.createElement('div');
  div.className = `msg-wrap ${isSent ? 'sent' : 'received'}`;
  div.dataset.msgId = msg.id;
  const tick = isSent ? `<span class="msg-tick">${msg.isRead ? '✓✓' : '✓'}</span>` : '';
  const deleteBtn = isSent
    ? `<button class="msg-delete-btn" data-msg-id="${msg.id}" title="Удалить сообщение">
         <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
           <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
           <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
         </svg>
       </button>` : '';
  div.innerHTML = `${deleteBtn}${senderName}<div class="msg-bubble">
    <div class="msg-text">${escHtml(msg.content)}</div>
    <div class="msg-meta"><span class="msg-time">${formatTimeShort(msg.createdAt)}</span>${tick}</div>
  </div>`;
  div.querySelectorAll('.msg-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => showDeleteMsgConfirm(btn.dataset.msgId));
  });
  container.appendChild(div);
}

function renderChatHeader(chat, other) {
  const name = getChatName(chat);
  qs('#chat-header-name').textContent = name;

  if (chat.isGroup) {
    const count = chat.participants ? chat.participants.length : 0;
    qs('#chat-header-status').textContent = `${count} участников`;
    qs('#chat-header-avatar').innerHTML =
      `<div class="chat-avatar group-avatar" style="width:38px;height:38px;font-size:16px">${name.charAt(0).toUpperCase()}</div>`;
  } else {
    qs('#chat-header-status').textContent = other && other.isOnline ? 'В сети' : 'Не в сети';
    const avatarContent = (other && other.avatarUrl)
      ? `<img src="${other.avatarUrl}" alt="avatar">`
      : name.charAt(0).toUpperCase();
    qs('#chat-header-avatar').innerHTML =
      `<div class="chat-avatar" style="width:38px;height:38px;font-size:16px">${avatarContent}</div>`;
  }
}

function renderProfilePanel() {
  if (!state.user) return;
  const name = state.user.displayName || state.user.username;
  qs('#profile-name-text').textContent = name;
  qs('#profile-username-text').textContent = '@' + state.user.username;
  qs('#profile-info-name').textContent = name;
  qs('#profile-info-username').textContent = state.user.username;
  updateProfileAvatar();
}

// ═══════════════════════════════════════════════
//  MODAL HELPERS — USER SEARCH
// ═══════════════════════════════════════════════
function renderUsersList(users) {
  const list = qs('#users-list');
  if (!users.length) {
    list.innerHTML = '<div class="modal-no-results">Пользователи не найдены</div>';
    return;
  }
  list.innerHTML = users.map(u => {
    const sel = state.selectedUserIds.has(u.id) ? ' selected' : '';
    const gm = state.groupMode ? ' group-mode' : '';
    const avatarContent = u.avatarUrl
      ? `<img src="${u.avatarUrl}" alt="avatar">`
      : (u.displayName || u.username).charAt(0).toUpperCase();
    return `<div class="user-item${sel}${gm}" data-uid="${u.id}" data-name="${escHtml(u.displayName || u.username)}">
      <div class="user-avatar">${avatarContent}</div>
      <div>
        <div class="user-name">${escHtml(u.displayName || u.username)}</div>
        <div class="user-username">@${escHtml(u.username)}</div>
      </div>
      <div class="user-check"></div>
    </div>`;
  }).join('');

  list.querySelectorAll('.user-item').forEach(el => {
    el.addEventListener('click', () => {
      if (!state.groupMode) {
        createChat(el.dataset.uid);
      } else {
        toggleUserSelection(el.dataset.uid, el.dataset.name);
        el.classList.toggle('selected', state.selectedUserIds.has(el.dataset.uid));
        updateSelectedBar();
      }
    });
  });
}

function toggleUserSelection(uid, name) {
  if (state.selectedUserIds.has(uid)) {
    state.selectedUserIds.delete(uid);
  } else {
    state.selectedUserIds.add(uid);
  }
}

function updateSelectedBar() {
  const bar = qs('#selected-users-bar');
  const btn = qs('#modal-create-btn');
  if (state.selectedUserIds.size === 0) {
    bar.classList.remove('visible');
    bar.innerHTML = '';
    btn.classList.remove('visible');
    return;
  }
  bar.classList.add('visible');
  btn.classList.add('visible');
  const tags = Array.from(state.selectedUserIds).map(uid => {
    const el = qs(`[data-uid="${uid}"]`);
    const name = el ? el.dataset.name : uid;
    return `<span class="selected-tag">${escHtml(name)}<button data-uid="${uid}">×</button></span>`;
  }).join('');
  bar.innerHTML = tags;
  bar.querySelectorAll('button[data-uid]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.selectedUserIds.delete(btn.dataset.uid);
      const item = qs(`[data-uid="${btn.dataset.uid}"]`);
      if (item) item.classList.remove('selected');
      updateSelectedBar();
    });
  });
}

async function searchUsers(query) {
  if (!query.trim()) {
    qs('#users-list').innerHTML = '';
    return;
  }
  try {
    const users = await api('GET', `/api/users/search?q=${encodeURIComponent(query)}`);
    renderUsersList(users);
  } catch (_) { }
}

// ═══════════════════════════════════════════════
//  CONFIRM DIALOGS
// ═══════════════════════════════════════════════
function showDeleteConfirm(chatId) {
  state.deleteTargetId = chatId;
  openModal('delete-modal');
}

function showDeleteMsgConfirm(msgId) {
  state.deleteMsgTargetId = msgId;
  openModal('delete-msg-modal');
}

// ═══════════════════════════════════════════════
//  VIEWS
// ═══════════════════════════════════════════════
function showAuth() {
  qs('#auth').style.display = 'flex';
  qs('#app').style.display = 'none';
  qs('#login-view').style.display = 'block';
  qs('#register-view').style.display = 'none';
  qs('#reset-view').style.display = 'none';
}

function showApp() {
  qs('#auth').style.display = 'none';
  qs('#app').style.display = 'flex';
  updateAvatarDisplays();
  renderProfilePanel();
  connectWs();
  loadChats();
  startPolling();
  if (isMobile()) {
    qs('#chat-area').classList.add('hidden-mobile');
  }
}

// ═══════════════════════════════════════════════
//  EVENTS
// ═══════════════════════════════════════════════
function setupEvents() {
  // Auth navigation
  qs('#go-register').onclick = () => {
    qs('#login-view').style.display = 'none';
    qs('#reset-view').style.display = 'none';
    qs('#register-view').style.display = 'block';
    qs('#login-error').style.display = 'none';
  };
  qs('#go-login').onclick = () => {
    qs('#register-view').style.display = 'none';
    qs('#reset-view').style.display = 'none';
    qs('#login-view').style.display = 'block';
    qs('#register-error').style.display = 'none';
  };
  qs('#go-reset').onclick = () => {
    qs('#login-view').style.display = 'none';
    qs('#register-view').style.display = 'none';
    qs('#reset-view').style.display = 'block';
    qs('#reset-error').style.display = 'none';
    qs('#reset-success').style.display = 'none';
  };
  qs('#go-login-from-reset').onclick = () => {
    qs('#reset-view').style.display = 'none';
    qs('#register-view').style.display = 'none';
    qs('#login-view').style.display = 'block';
    qs('#reset-error').style.display = 'none';
    qs('#reset-success').style.display = 'none';
  };

  // Login
  qs('#login-btn').onclick = async () => {
    const u = qs('#login-username').value.trim();
    const p = qs('#login-password').value;
    if (!u || !p) return;
    qs('#login-btn').disabled = true;
    try {
      await login(u, p);
      showApp();
    } catch (e) {
      const el = qs('#login-error');
      el.textContent = e.message || 'Ошибка входа';
      el.style.display = 'block';
    } finally {
      qs('#login-btn').disabled = false;
    }
  };

  // Register
  qs('#register-btn').onclick = async () => {
    const name = qs('#reg-name').value.trim();
    const u = qs('#reg-username').value.trim();
    const p = qs('#reg-password').value;
    const rc = qs('#reg-recovery').value.trim();
    const errEl = qs('#register-error');
    const usernameInput = qs('#reg-username');

    errEl.style.display = 'none';

    // Проверяем, проходит ли значение валидацию по pattern
    if (!usernameInput.validity.valid) {
      errEl.textContent = 'Имя пользователя: только латинские буквы, цифры и подчёркивание';
      errEl.style.display = 'block';
      return; // Прерываем выполнение, если невалидно
    }

    if (!name || !u || !p || !rc) { errEl.textContent = 'Заполните все поля'; errEl.style.display = 'block'; return; }
    if (u.length < 3) { errEl.textContent = 'Имя пользователя: минимум 3 символа'; errEl.style.display = 'block'; return; }
    if (p.length < 6) { errEl.textContent = 'Пароль: минимум 6 символов'; errEl.style.display = 'block'; return; }
    if (!/^\d{8}$/.test(rc)) { errEl.textContent = 'Код восстановления: ровно 8 цифр'; errEl.style.display = 'block'; return; }

    qs('#register-btn').disabled = true;
    try {
      await register(u, p, name, rc);
      showApp();
    } catch (e) {
      errEl.textContent = e.message || 'Ошибка регистрации';
      errEl.style.display = 'block';
    } finally {
      qs('#register-btn').disabled = false;
    }
  };

  // Reset password
  qs('#reset-btn').onclick = async () => {
    const u = qs('#reset-username').value.trim();
    const rc = qs('#reset-code').value.trim();
    const np = qs('#reset-newpass').value;
    const errEl = qs('#reset-error');
    const okEl = qs('#reset-success');
    errEl.style.display = 'none';
    okEl.style.display = 'none';
    if (!u || !rc || !np) { errEl.textContent = 'Заполните все поля'; errEl.style.display = 'block'; return; }
    if (!/^\d{8}$/.test(rc)) { errEl.textContent = 'Код восстановления: ровно 8 цифр'; errEl.style.display = 'block'; return; }
    if (np.length < 6) { errEl.textContent = 'Новый пароль: минимум 6 символов'; errEl.style.display = 'block'; return; }
    qs('#reset-btn').disabled = true;
    try {
      await resetPassword(u, rc, np);
      okEl.textContent = 'Пароль успешно изменён. Теперь войдите с новым паролем.';
      okEl.style.display = 'block';
      qs('#reset-username').value = '';
      qs('#reset-code').value = '';
      qs('#reset-newpass').value = '';
    } catch (e) {
      errEl.textContent = e.message || 'Ошибка сброса пароля';
      errEl.style.display = 'block';
    } finally {
      qs('#reset-btn').disabled = false;
    }
  };

  // Enter key handlers
  [qs('#login-username'), qs('#login-password')].forEach(el => {
    el.addEventListener('keydown', e => { if (e.key === 'Enter') qs('#login-btn').click(); });
  });

  // --- НОВЫЙ КОД: Валидация пароля при вводе ---
  qs('#reg-password').addEventListener('input', function(e) {
      const validRegex = /^[a-zA-Z0-9!@#$%^&*(),.?":{}|<>[\]\\;'`~\-=_+]*$/; // Только разрешенные символы
      let value = e.target.value;

      // Проверяем, соответствует ли текущее значение регулярному выражению
      if (!validRegex.test(value)) {
          // Если нет, очищаем строку от недопустимых символов
          const cleanedValue = value.replace(/[^a-zA-Z0-9!@#$%^&*(),.?":{}|<>[\]\\;'`~\-=_+]/g, '');
          e.target.value = cleanedValue;
          // Опционально: показать краткое сообщение пользователю
          // showToast("Пароль содержит недопустимые символы. Они были удалены.", 2000);
      }
  });
  // --- КОНЕЦ НОВОГО КОДА ---

  // Search chats
  qs('#search-input').addEventListener('input', () => renderChatList());

  // New chat button
  qs('#new-chat-btn').onclick = () => {
    resetGroupModal();
    openModal('new-chat-modal');
  };
  qs('#new-chat-modal').addEventListener('click', e => {
    if (e.target === qs('#new-chat-modal')) closeModal('new-chat-modal');
  });

  // Modal tabs
  qs('#modal-tab-direct').onclick = () => {
    state.groupMode = false;
    state.selectedUserIds.clear();
    qs('#modal-tab-direct').classList.add('active');
    qs('#modal-tab-group').classList.remove('active');
    qs('#group-name-wrap').classList.remove('visible');
    qs('#selected-users-bar').classList.remove('visible');
    qs('#selected-users-bar').innerHTML = '';
    qs('#modal-create-btn').classList.remove('visible');
    const query = qs('#user-search-input').value;
    if (query) searchUsers(query);
  };
  qs('#modal-tab-group').onclick = () => {
    state.groupMode = true;
    qs('#modal-tab-group').classList.add('active');
    qs('#modal-tab-direct').classList.remove('active');
    qs('#group-name-wrap').classList.add('visible');
    const query = qs('#user-search-input').value;
    if (query) searchUsers(query);
  };

  // User search input
  qs('#user-search-input').addEventListener('input', e => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => searchUsers(e.target.value), 300);
  });

  // Create group button
  qs('#modal-create-btn').onclick = () => {
    const name = qs('#group-name-input').value.trim();
    if (!name) { showToast('Введите название группы'); return; }
    if (state.selectedUserIds.size === 0) { showToast('Выберите хотя бы одного участника'); return; }
    createGroupChat(name, Array.from(state.selectedUserIds));
  };

  // Send message
  qs('#send-btn').onclick = sendMessage;
  qs('#msg-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  qs('#msg-input').addEventListener('input', () => autoResize(qs('#msg-input')));

  // Back button (mobile)
  qs('#back-btn').onclick = backToSidebar;

  // Delete chat
  qs('#delete-chat-btn').onclick = () => {
    if (state.currentChatId) showDeleteConfirm(state.currentChatId);
  };
  qs('#cancel-delete').onclick = () => closeModal('delete-modal');
  qs('#confirm-delete').onclick = async () => {
    closeModal('delete-modal');
    if (state.deleteTargetId) await deleteChat(state.deleteTargetId);
  };

  // Delete message confirm
  qs('#cancel-delete-msg').onclick = () => closeModal('delete-msg-modal');
  qs('#confirm-delete-msg').onclick = async () => {
    closeModal('delete-msg-modal');
    if (state.deleteMsgTargetId) await deleteMessage(state.deleteMsgTargetId);
  };

  // Profile panel
  qs('#my-avatar-btn').onclick = () => {
    renderProfilePanel();
    qs('#profile-panel').classList.add('open');
  };
  qs('#close-profile').onclick = () => qs('#profile-panel').classList.remove('open');
  qs('#logout-btn').onclick = logout;

  // Inline profile editing
  qs('#profile-item-name').querySelector('.profile-edit-btn').onclick = () => {
    const val = state.user ? (state.user.displayName || '') : '';
    startInlineEdit(qs('#profile-item-name'), 'displayName', val);
  };
  qs('#profile-item-username').querySelector('.profile-edit-btn').onclick = () => {
    const val = state.user ? (state.user.username || '') : '';
    startInlineEdit(qs('#profile-item-username'), 'username', val);
  };

  // Theme toggle
  qs('#theme-btn').onclick = () => {
    const html = document.documentElement;
    html.setAttribute('data-theme', html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  };

  // Avatar upload
  const avatarInput = qs('#avatar-upload-input');
  qs('#profile-avatar-container').onclick = () => avatarInput.click();
  avatarInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) uploadAvatar(file);
    avatarInput.value = '';
  });
}

// ═══════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════
async function init() {
  setupEvents();
  const ok = await checkAuth();
  if (ok) {
    showApp();
  } else {
    showAuth();
  }
}

document.addEventListener('DOMContentLoaded', init);
