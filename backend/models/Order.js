const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderCode: { type: String, required: true, unique: true }, 
  
  // Liên kết đến Khách hàng (không bắt buộc để hỗ trợ cả khách vãng lai)
  username: { type: String, ref: 'User' },
  prescriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prescription' },
  saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },

  customerInfo: {
    name: { type: String, required: true }, 
    phone: { type: String, required: true }, 
    address: { type: String, required: true }
  },
  
  items: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      quantity: { type: Number, required: true, default: 1 },
      priceAtPurchase: { type: Number, required: true }, // Lưu giá tại thời điểm mua
      importPriceAtPurchase: { type: Number, default: 0 }, // Lưu giá nhập tại thời điểm mua để tính lợi nhuận chuẩn
      hasPrescription: { type: Boolean, default: false },
      od: { type: String }, // Độ mắt phải
      os: { type: String }  // Độ mắt trái
    }
  ],
  
  total: { type: Number, required: true },
  paymentMethod: { type: String, enum: ['cod', 'banking'], default: 'cod' },
  status: { type: String, enum: ['pending', 'paid', 'processing', 'shipping', 'shipped', 'completed', 'cancelled'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);