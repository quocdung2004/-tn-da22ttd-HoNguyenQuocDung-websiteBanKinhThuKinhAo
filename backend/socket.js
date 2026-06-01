const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/User');

let io = null;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: '*', // Hỗ trợ kết nối tự do từ client dev/prod
      methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
  });

  // Middleware xác thực bảo mật JWT cho kết nối Socket
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers['authorization']?.split(' ')[1];
      
      if (!token) {
        return next(new Error('Authentication error: Token missing'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Tiền truy vấn DB kiểm tra trạng thái tài khoản tươi
      const user = await User.findById(decoded.id);
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      if (user.isBlocked) {
        return next(new Error('Authentication error: Account is blocked'));
      }

      // Đính kèm thông tin user hợp lệ vào socket instance
      socket.user = {
        id: user._id.toString(),
        username: user.username,
        role: user.role,
        name: user.name
      };

      next();
    } catch (err) {
      console.error('Socket authentication error:', err.message);
      return next(new Error('Authentication error: Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const { id, role, username } = socket.user;
    console.log(`🔌 [Socket.IO] Người dùng ${username} (ID: ${id}, Role: ${role}) đã kết nối thành công.`);

    // 1. Join room cá nhân của khách hàng
    socket.join(`user:${id}`);

    // 2. Join room quản lý (Staff/Admin)
    if (role === 1) {
      socket.join('admin');
      socket.join('staff');
      console.log(`👑 [Socket.IO] ${username} đã tham gia room admin và staff.`);
    } else if (role === 2) {
      socket.join('staff');
      console.log(`👤 [Socket.IO] ${username} đã tham gia room staff.`);
    }

    socket.on('disconnect', () => {
      console.log(`❌ [Socket.IO] Người dùng ${username} (ID: ${id}) đã ngắt kết nối.`);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO is not initialized yet!');
  }
  return io;
};

// HELPER EMITTERS
const emitToUser = (userId, event, payload) => {
  if (io) {
    io.to(`user:${userId}`).emit(event, payload);
  }
};

const emitToStaff = (event, payload) => {
  if (io) {
    io.to('staff').emit(event, payload);
  }
};

const emitToAdmin = (event, payload) => {
  if (io) {
    io.to('admin').emit(event, payload);
  }
};

module.exports = {
  initSocket,
  getIO,
  emitToUser,
  emitToStaff,
  emitToAdmin
};
