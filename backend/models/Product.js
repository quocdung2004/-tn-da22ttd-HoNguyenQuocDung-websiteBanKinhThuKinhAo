const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  description: { type: String },
  images: [{ type: String }],
  arUrl: { type: String }, // Lưu link file AR/Video dùng để try-on
  stock: { type: Number, default: 0 }, // Số lượng tồn kho

  // Liên kết khóa ngoại (Foreign Key)
  brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);