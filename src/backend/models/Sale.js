const mongoose = require('mongoose');

const saleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  discountType: { type: String, enum: ['percent', 'fixed'], required: true },
  discountValue: { type: Number, required: true }, // VD: 15 (%) hoặc 50000 (đ)
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  isActive: { type: Boolean, default: true },
  applicableProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  applicableCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  usageLimitType: { type: String, enum: ['unlimited', 'limited'], default: 'unlimited' },
  usageLimit: { type: Number, default: null },
  usedCount: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Tự động tạo chỉ mục thời gian cho các chiến dịch để truy vấn nhanh
saleSchema.index({ startDate: 1, endDate: 1, isActive: 1 });

module.exports = mongoose.model('Sale', saleSchema);