const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  // Liên kết 1-1 với đơn hàng
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  
  transactionCode: { type: String }, // Mã giao dịch ngân hàng do PayOS trả về
  amount: { type: Number, required: true },
  status: { type: String, enum: ['SUCCESS', 'FAILED', 'PENDING'], default: 'PENDING' },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transaction', transactionSchema);