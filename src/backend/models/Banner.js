const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  subtitle: { type: String, default: '', trim: true },
  imageUrl: { type: String, required: true, trim: true },
  targetUrl: { type: String, default: '/', trim: true },
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

bannerSchema.index({ isActive: 1, startDate: 1, endDate: 1, sortOrder: 1 });

module.exports = mongoose.model('Banner', bannerSchema);
