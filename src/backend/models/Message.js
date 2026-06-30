const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  // Liên kết trực tiếp với cuộc hội thoại
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
  
  // Người gửi tin nhắn (Khách hàng hoặc Staff/Admin)
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Vai trò của người gửi
  senderRole: {
    type: Number,
    enum: [0, 1, 2], // 0: Customer, 1: Admin, 2: Staff
    required: true
  },
  
  content: {
    type: String,
    required: true
  },
  
  isRead: {
    type: Boolean,
    default: false
  },
  
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Index hỗ trợ truy vấn lịch sử tin nhắn cực nhanh theo thứ tự thời gian
messageSchema.index({ conversationId: 1, timestamp: 1 });

module.exports = mongoose.model('Message', messageSchema);