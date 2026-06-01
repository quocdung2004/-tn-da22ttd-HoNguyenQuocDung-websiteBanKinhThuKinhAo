const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null // null nếu là thông báo chung cho nhóm quyền hạn
  },
  roleTarget: {
    type: String,
    enum: ['admin', 'staff', null],
    default: null // null nếu gửi cho Customer cụ thể qua userId
  },
  type: {
    type: String,
    required: true // 'order', 'wallet', 'withdraw', 'stock', 'dispute'
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  link: {
    type: String,
    default: '' // Đường dẫn điều hướng phía frontend
  },
  isRead: {
    type: Boolean,
    default: false
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
