const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  description: { type: String },
  images: [{ type: String }],
  arUrl: { type: String }, // Lưu link file AR/Video dùng để try-on
  stock: { type: Number, default: 0 }, // Số lượng tồn kho
  importPrice: { type: Number, default: 0 }, // Giá nhập hàng
  averageRating: { type: Number, default: 0 }, // Điểm đánh giá trung bình
  totalReviews: { type: Number, default: 0 }, // Tổng số đánh giá
  soldQuantity: { type: Number, default: 0 }, // Số lượng đã bán

  // Liên kết khóa ngoại (Foreign Key)
  brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  isActive: { type: Boolean, default: true },
  gender: { type: String, enum: ['nam', 'nu', 'unisex'], default: 'unisex' },
  arConfig: {
    splitSingleMeshByDepth: { type: Boolean, default: false },
    frontDepthStartRatio: { type: Number, default: 0.68 },
    templeDepthEndRatio: { type: Number, default: 0.70 },
    frontCenterKeepRatio: { type: Number, default: 0.23 },
    verticalOffsetRatio: { type: Number, default: 0 },
    scaleMultiplier: { type: Number, default: 1 }
  }
}, { timestamps: true });

productSchema.index({ gender: 1 });

module.exports = mongoose.model('Product', productSchema);