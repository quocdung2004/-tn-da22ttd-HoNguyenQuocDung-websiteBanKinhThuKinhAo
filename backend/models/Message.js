const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  // Ai gửi, ai nhận đều tham chiếu đến username trong bảng User
  senderUsername: { type: String, ref: 'User', required: true },
  receiverUsername: { type: String, ref: 'User', required: true },
  
  content: { type: String, required: true },
  isRead: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', messageSchema);