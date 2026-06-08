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
      originalPriceAtPurchase: { type: Number, default: 0 }, // Giá gốc của sản phẩm lúc mua
      discountAtPurchase: { type: Number, default: 0 }, // Số tiền được giảm cho 1 sản phẩm
      saleIdAtPurchase: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', default: null }, // ID của chiến dịch giảm giá được áp dụng (nếu có)
      hasPrescription: { type: Boolean, default: false },
      od: { type: String }, // Độ mắt phải
      os: { type: String },  // Độ mắt trái
      
       // Thông số độ cận chi tiết (Prescription Profile Fields)
      prescriptionMode: { type: String, enum: ['none', 'saved', 'custom'], default: 'none' },
      od_sph: { type: Number },
      od_cyl: { type: Number },
      od_axis: { type: Number },
      os_sph: { type: Number },
      os_cyl: { type: Number },
      os_axis: { type: Number },
      pd: { type: Number },
      rxDate: { type: Date },
      rxNote: { type: String }
    }
  ],
  
  total: { type: Number, required: true },
  paymentMethod: { type: String, enum: ['cod', 'banking'], default: 'cod' },
  status: { 
    type: String, 
    enum: ['pending', 'paid', 'processing', 'shipping', 'shipped', 'completed', 'cancelled', 'cancel_requested'], 
    default: 'pending' 
  },
  
  // --- THÔNG TIN HỦY ĐƠN & HOÀN TIỀN (PHASE 1) ---
  previousStatusBeforeCancelRequest: { type: String }, // Lưu trạng thái trước khi gửi yêu cầu hủy để dễ rollback
  refundStatus: { 
    type: String, 
    enum: ['none', 'pending', 'wallet_refunded', 'rejected'], 
    default: 'none' 
  },
  cancelReason: { type: String },
  cancelRequestedAt: { type: Date },
  cancelRejectReason: { type: String },
  refundHandledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  refundHandledAt: { type: Date },
  processingStartedAt: { type: Date },
  stockRestored: { type: Boolean, default: false }, // Biến cờ bảo vệ chống hoàn stock trùng lặp
  quotaRestored: { type: Boolean, default: false }, // Biến cờ bảo vệ chống hoàn quota sale trùng lặp

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);