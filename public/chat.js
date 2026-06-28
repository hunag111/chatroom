// ===== 多语言 =====
let lang = sessionStorage.getItem('lang') || localStorage.getItem('lang') || 'zh-CN';
const t = () => i18n[lang];

function applyLang() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const k = el.dataset.i18n;
    if (t()[k] !== undefined) el.textContent = t()[k];
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const k = el.dataset.i18nPh;
    if (t()[k] !== undefined) el.placeholder = t()[k];
  });
}

// ===== 恢复状态 =====
const username = sessionStorage.getItem('username');
const roomId = sessionStorage.getItem('roomId');
let users = JSON.parse(sessionStorage.getItem('users') || '[]');
if (!username || !roomId) window.location.href = 'index.html';

applyLang();

const socket = io();

// ===== DOM =====
const messagesEl = document.getElementById('messages');
const msgInput = document.getElementById('msg-input');
const sendBtn = document.getElementById('send-btn');
const userListEl = document.getElementById('user-list');
const userCountEl = document.getElementById('user-count');
const onlineCountEl = document.getElementById('online-count');
const roomIdDisplay = document.getElementById('room-id-display');
const topbarRoomId = document.getElementById('topbar-room-id');
const copyBtn = document.getElementById('copy-btn');
const copyTip = document.getElementById('copy-tip');
const leaveBtn = document.getElementById('leave-btn');
const menuBtn = document.getElementById('menu-btn');
const sidebarClose = document.getElementById('sidebar-close');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const imgInput = document.getElementById('img-input');
const uploadPreview = document.getElementById('upload-preview');
const previewImg = document.getElementById('preview-img');
const previewCancel = document.getElementById('preview-cancel');
const previewSend = document.getElementById('preview-send');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxBg = document.getElementById('lightbox-bg');

// ===== 初始化 =====
roomIdDisplay.textContent = roomId;
topbarRoomId.textContent = roomId;
renderUsers(users);

socket.emit('join-room', { roomId, username }, ({ success, users: nu, error }) => {
  if (error) console.log('rejoin:', error);
  if (nu) { users = nu; renderUsers(users); }
});

// ===== 渲染用户 =====
function renderUsers(list) {
  userListEl.innerHTML = '';
  const n = list.length;
  userCountEl.textContent = n;
  onlineCountEl.textContent = n;
  list.forEach(name => {
    const li = document.createElement('li');
    li.className = 'user-item';
    const av = document.createElement('span');
    av.className = 'user-av';
    av.textContent = name.charAt(0).toUpperCase();
    av.style.background = nameColor(name);
    li.appendChild(av);
    const sp = document.createElement('span');
    sp.className = 'user-name';
    sp.textContent = name;
    li.appendChild(sp);
    if (name === username) {
      const me = document.createElement('span');
      me.className = 'me-label';
      me.textContent = t().me;
      li.appendChild(me);
    }
    userListEl.appendChild(li);
  });
}

// ===== 渲染消息 =====
function removeWelcome() {
  const wb = document.getElementById('welcome-block');
  if (wb) wb.remove();
}

function appendMsg({ type, username: sender, message, imageUrl, timestamp }) {
  removeWelcome();
  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isSelf = sender === username;

  if (type === 'system') {
    const d = document.createElement('div');
    d.className = 'sys-msg';
    d.textContent = message;
    messagesEl.appendChild(d);
  } else {
    const row = document.createElement('div');
    row.className = `msg-row ${isSelf ? 'self' : ''}`;

    if (!isSelf) {
      const av = document.createElement('div');
      av.className = 'msg-av';
      av.textContent = sender.charAt(0).toUpperCase();
      av.style.background = nameColor(sender);
      row.appendChild(av);
    }

    const wrap = document.createElement('div');
    wrap.className = 'msg-wrap';

    if (!isSelf) {
      const sn = document.createElement('div');
      sn.className = 'msg-sender-name';
      sn.textContent = sender;
      wrap.appendChild(sn);
    }

    if (type === 'image' && imageUrl) {
      const bubble = document.createElement('div');
      bubble.className = 'msg-bubble img-bubble';
      const img = document.createElement('img');
      img.className = 'chat-img';
      img.src = imageUrl;
      img.alt = 'image';
      img.loading = 'lazy';
      img.addEventListener('click', () => openLightbox(imageUrl));
      bubble.appendChild(img);
      wrap.appendChild(bubble);
    } else {
      const bubble = document.createElement('div');
      bubble.className = 'msg-bubble';
      bubble.textContent = message;
      wrap.appendChild(bubble);
    }

    const tm = document.createElement('div');
    tm.className = 'msg-time';
    tm.textContent = time;
    wrap.appendChild(tm);

    row.appendChild(wrap);
    messagesEl.appendChild(row);
  }

  messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
}

// ===== Socket 事件 =====
socket.on('new-message', payload => appendMsg({ type: payload.type || 'text', ...payload }));

socket.on('user-joined', ({ username: name, users: nu }) => {
  users = nu; renderUsers(users);
  appendMsg({ type: 'system', message: `👋 ${name} ${t().joined}`, timestamp: Date.now() });
});

socket.on('user-left', ({ username: name, users: nu }) => {
  users = nu; renderUsers(users);
  appendMsg({ type: 'system', message: `👋 ${name} ${t().left}`, timestamp: Date.now() });
});

socket.on('disconnect', () => {
  appendMsg({ type: 'system', message: `⚠️ ${t().disconnected}`, timestamp: Date.now() });
});

socket.on('connect', () => {
  if (roomId && username) socket.emit('join-room', { roomId, username }, () => {});
});

// ===== 发文字 =====
function sendText() {
  const txt = msgInput.value.trim();
  if (!txt) return;
  socket.emit('send-message', { message: txt, type: 'text' });
  msgInput.value = '';
  msgInput.focus();
}

sendBtn.addEventListener('click', sendText);
msgInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
});

// ===== 图片上传 =====
let pendingFile = null;

imgInput.addEventListener('change', () => {
  const file = imgInput.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    alert(t().imageOnly); imgInput.value = ''; return;
  }
  if (file.size > 10 * 1024 * 1024) {
    alert(t().imageTooBig); imgInput.value = ''; return;
  }
  pendingFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    previewImg.src = e.target.result;
    uploadPreview.style.display = 'flex';
  };
  reader.readAsDataURL(file);
  imgInput.value = '';
});

previewCancel.addEventListener('click', () => {
  pendingFile = null;
  uploadPreview.style.display = 'none';
  previewImg.src = '';
});

previewSend.addEventListener('click', async () => {
  if (!pendingFile) return;
  previewSend.disabled = true;
  previewSend.textContent = '上传中...';
  try {
    const fd = new FormData();
    fd.append('image', pendingFile);
    const res = await fetch('/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.url) {
      socket.emit('send-message', { message: '', type: 'image', imageUrl: data.url });
      uploadPreview.style.display = 'none';
      previewImg.src = '';
      pendingFile = null;
    } else {
      alert(t().imageError);
    }
  } catch {
    alert(t().imageError);
  }
  previewSend.disabled = false;
  previewSend.textContent = '发送图片';
});

// ===== 灯箱 =====
function openLightbox(src) {
  lightboxImg.src = src;
  lightbox.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  lightbox.style.display = 'none';
  document.body.style.overflow = '';
}
lightboxBg.addEventListener('click', closeLightbox);
lightboxImg.addEventListener('click', e => e.stopPropagation());

// ===== 复制房间号 =====
copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(roomId).then(() => {
    copyTip.classList.remove('hidden');
    setTimeout(() => copyTip.classList.add('hidden'), 2000);
  });
});

// ===== 退出 =====
leaveBtn.addEventListener('click', () => { sessionStorage.clear(); window.location.href = 'index.html'; });

// ===== 侧边栏 =====
const openSidebar = () => { sidebar.classList.add('open'); overlay.classList.add('show'); };
const closeSidebar = () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); };
menuBtn.addEventListener('click', openSidebar);
sidebarClose.addEventListener('click', closeSidebar);
overlay.addEventListener('click', closeSidebar);

// ===== 颜色工具 =====
function nameColor(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  const colors = ['#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316','#eab308','#22c55e','#14b8a6','#3b82f6','#06b6d4'];
  return colors[Math.abs(h) % colors.length];
}
