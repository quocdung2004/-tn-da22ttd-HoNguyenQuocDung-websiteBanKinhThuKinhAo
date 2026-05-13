const mongoose = require('mongoose');

const saleSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true }, // VD: "SUMMER2026"
  discountPercent: { type: Number }, // VD: 15 (%)
  discountAmount: { type: Number }, // Giảm số tiền tĩnh (VD: 50000)
  expiryDate: { type: Date, required: true },
  isActive: { type: Boolean, default: true }
});

module.exports = mongoose.model('Sale', saleSchema);