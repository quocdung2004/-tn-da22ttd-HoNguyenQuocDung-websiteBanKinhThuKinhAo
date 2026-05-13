const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderCode: { type: String, required: true, unique: true }, 
  
  // Liên kết đến Khách hàng, Đơn kính, và Voucher
  username: { type: String, ref: 'User', required: true },
  prescriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prescription' },
  saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },

  customerInfo: {
    name: { type: String }, phone: { type: String }, address: { type: String }
  },
  
  items: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      quantity: { type: Number },
      priceAtPurchase: { type: Number } // Lưu giá tại thời điểm mua (tránh việc sau này sản phẩm tăng giá làm sai lệch bill cũ)
    }
  ],
  
  total: { type: Number, required: true },
  paymentMethod: { type: String, enum: ['cod', 'banking'], default: 'cod' },
  status: { type: String, enum: ['pending', 'paid', 'processing', 'shipped', 'completed', 'cancelled'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);