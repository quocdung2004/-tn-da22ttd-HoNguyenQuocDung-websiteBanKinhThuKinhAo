const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  title: { type: String },
  imageUrl: { type: String, required: true },
  targetUrl: { type: String }, // Link click vào chuyển hướng (VD: sang trang Sale)
  isActive: { type: Boolean, default: true },
  displayOrder: { type: Number, default: 0 } // Dùng để sắp xếp thứ tự hiển thị slide
});

module.exports = mongoose.model('Banner', bannerSchema);