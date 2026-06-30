const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  // Tham chiếu trực tiếp đến User ID của khách hàng
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true // Mỗi khách hàng có duy nhất 1 cuộc hội thoại
  },
  
  // Staff tiếp nhận hội thoại này (nullable)
  assignedStaff: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Trạng thái hội thoại
  status: {
    type: String,
    enum: ['open', 'closed'],
    default: 'open'
  },
  
  // Tin nhắn mới nhất
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  
  // Số tin nhắn chưa đọc
  unreadCountByStaff: {
    type: Number,
    default: 0
  },
  unreadCountByCustomer: {
    type: Number,
    default: 0
  }
}, { 
  timestamps: true // Tự động tạo và cập nhật createdAt, updatedAt
});

// Index hỗ trợ truy vấn nhanh danh sách hội thoại theo thứ tự hoạt động mới nhất
conversationSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
