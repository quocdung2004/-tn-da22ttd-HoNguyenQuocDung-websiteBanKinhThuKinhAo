const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Conversation = require('./models/Conversation');
const Message = require('./models/Message');

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

    // ── NỘP BÀI PHASE 3: REALTIME CHAT SOCKET EVENTS ──

    // Event 1: Tham gia phòng hội thoại cụ thể
    socket.on('chat:join_conversation', async ({ conversationId }) => {
      try {
        if (!conversationId) return;
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          return socket.emit('chat:error', { message: 'Không tìm thấy cuộc hội thoại!' });
        }

        // Khách hàng chỉ được vào phòng của chính mình, Staff/Admin vào được tất cả
        if (role === 0 && conversation.customer.toString() !== id) {
          return socket.emit('chat:error', { message: 'Từ chối tham gia! Bạn không sở hữu cuộc hội thoại này.' });
        }

        socket.join(`conversation:${conversationId}`);
        console.log(`💬 [Socket.IO] ${username} đã tham gia phòng conversation:${conversationId}`);
      } catch (err) {
        console.error('Lỗi chat:join_conversation socket:', err.message);
      }
    });

    // Event 2: Gửi tin nhắn mới (Lưu DB trước, Emit sau)
    socket.on('chat:send_message', async ({ conversationId, content }) => {
      try {
        if (!conversationId || !content || !content.trim()) {
          return socket.emit('chat:error', { message: 'Nội dung tin nhắn không được để trống!' });
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          return socket.emit('chat:error', { message: 'Không tìm thấy cuộc hội thoại!' });
        }

        // Kiểm tra phân quyền truy cập
        if (role === 0 && conversation.customer.toString() !== id) {
          return socket.emit('chat:error', { message: 'Từ chối gửi! Bạn không thuộc cuộc hội thoại này.' });
        }

        // Kiểm tra trạng thái đóng/mở cuộc hội thoại
        if (conversation.status === 'closed') {
          return socket.emit('chat:error', { message: 'Cuộc hội thoại đã đóng. Hãy liên hệ Staff để mở lại.' });
        }

        // 1. Lưu tin nhắn vào MongoDB
        const message = await Message.create({
          conversationId,
          sender: id,
          senderRole: role,
          content: content.trim()
        });

        // 2. Cập nhật Conversation tương ứng
        conversation.lastMessage = message._id;
        if (role === 0) {
          conversation.unreadCountByStaff += 1;
        } else {
          conversation.unreadCountByCustomer += 1;
        }
        await conversation.save();

        // 3. Populate thông tin cập nhật mới nhất của cuộc hội thoại để đồng bộ giao diện
        const updatedConversation = await Conversation.findById(conversationId)
          .populate('customer', 'username name email phone')
          .populate('assignedStaff', 'username name')
          .populate('lastMessage');

        // 4. Phát tin nhắn mới vào phòng hội thoại
        io.to(`conversation:${conversationId}`).emit('chat:new_message', message);

        // 5. Phát tin tức cập nhật hội thoại cho toàn bộ Staff và Khách hàng tương ứng
        io.to('staff').emit('conversation:updated', updatedConversation);
        io.to(`user:${conversation.customer.toString()}`).emit('conversation:updated', updatedConversation);

        console.log(`✉️ [Socket.IO] ${username} đã gửi tin nhắn vào hội thoại ${conversationId}`);
      } catch (err) {
        console.error('Lỗi chat:send_message socket:', err.message);
        socket.emit('chat:error', { message: 'Lỗi máy chủ khi xử lý tin nhắn!' });
      }
    });

    // Event 3: Báo hiệu đang gõ tin nhắn (Typing animation)
    socket.on('chat:typing', async ({ conversationId, isTyping }) => {
      try {
        if (!conversationId) return;
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) return;

        // Phân quyền
        if (role === 0 && conversation.customer.toString() !== id) return;

        // Broadcast tới các thành viên khác trong phòng chat
        socket.to(`conversation:${conversationId}`).emit('chat:typing', {
          conversationId,
          username,
          name: socket.user.name || username,
          isTyping
        });
      } catch (err) {
        console.error('Lỗi chat:typing socket:', err.message);
      }
    });

    // Event 4: Đánh dấu đã đọc hội thoại qua socket
    socket.on('chat:mark_read', async ({ conversationId }) => {
      try {
        if (!conversationId) return;
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) return;

        // Phân quyền
        if (role === 0) {
          if (conversation.customer.toString() !== id) return;
          conversation.unreadCountByCustomer = 0;
        } else {
          conversation.unreadCountByStaff = 0;
        }
        await conversation.save();

        const updatedConversation = await Conversation.findById(conversationId)
          .populate('customer', 'username name email phone')
          .populate('assignedStaff', 'username name')
          .populate('lastMessage');

        // Đồng bộ tin tức
        io.to('staff').emit('conversation:updated', updatedConversation);
        io.to(`user:${conversation.customer.toString()}`).emit('conversation:updated', updatedConversation);
      } catch (err) {
        console.error('Lỗi chat:mark_read socket:', err.message);
      }
    });

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
