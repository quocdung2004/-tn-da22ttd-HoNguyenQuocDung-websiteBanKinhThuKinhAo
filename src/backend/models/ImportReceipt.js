const mongoose = require('mongoose');

const importReceiptSchema = new mongoose.Schema({
  receiptCode: { type: String, required: true, unique: true, index: true }, // Mã nhập kho (VD: NK20260521xxx)
  date: { type: Date, default: Date.now },
  creator: { type: String, default: 'Admin' }, // Giữ tương thích ngược
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Lưu ID người lập
  creatorName: { type: String }, // Lưu Tên hoặc Username người lập
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true },
    importPrice: { type: Number, required: true }
  }],
  note: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('ImportReceipt', importReceiptSchema);
