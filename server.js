const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// 端口从环境变量读取（Render 需要）
const PORT = process.env.PORT || 3000;

const io = new Server(server, {
  cors: { origin: '*' }
});

// 图片上传目录
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, crypto.randomUUID() + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('只支持图片格式'));
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// 图片上传接口
app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '上传失败' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// 房间数据
const rooms = new Map();

function generateRoomId() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

io.on('connection', (socket) => {
  socket.on('check-room', (roomId, cb) => cb(rooms.has(roomId.toUpperCase())));

  socket.on('create-room', ({ username, customRoomId }, cb) => {
    let roomId;
    if (customRoomId && customRoomId.trim()) {
      roomId = customRoomId.trim().toUpperCase();
      if (!/^[A-Z0-9]{2,20}$/.test(roomId)) return cb({ error: 'ROOM_ID_INVALID' });
      if (rooms.has(roomId)) return cb({ error: 'ROOM_ID_TAKEN' });
    } else {
      roomId = generateRoomId();
      while (rooms.has(roomId)) roomId = generateRoomId();
    }
    rooms.set(roomId, new Map());
    cb({ roomId });
  });

  socket.on('join-room', ({ roomId, username }, cb) => {
    roomId = roomId.toUpperCase();
    if (!rooms.has(roomId)) return cb({ error: 'ROOM_NOT_FOUND' });
    const room = rooms.get(roomId);
    const names = Array.from(room.values());
    if (names.includes(username)) return cb({ error: 'NAME_TAKEN' });
    socket.join(roomId);
    room.set(socket.id, username);
    socket.data.roomId = roomId;
    socket.data.username = username;
    socket.to(roomId).emit('user-joined', { username, users: Array.from(room.values()), timestamp: Date.now() });
    cb({ success: true, users: Array.from(room.values()) });
  });

  socket.on('send-message', ({ message, type, imageUrl }) => {
    const { roomId, username } = socket.data;
    if (!roomId) return;
    const payload = {
      id: crypto.randomUUID(),
      username,
      message: message ? message.trim() : '',
      type: type || 'text',
      imageUrl: imageUrl || null,
      timestamp: Date.now()
    };
    io.to(roomId).emit('new-message', payload);
  });

  socket.on('disconnect', () => {
    const { roomId, username } = socket.data;
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    room.delete(socket.id);
    if (room.size === 0) rooms.delete(roomId);
    else socket.to(roomId).emit('user-left', { username, users: Array.from(room.values()), timestamp: Date.now() });
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`ChatRoom running on port ${PORT}`));
