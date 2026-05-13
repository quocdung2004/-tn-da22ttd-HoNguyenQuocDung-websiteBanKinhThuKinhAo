const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true }, // VD: "Kính râm", "Kính cận"
  slug: { type: String, unique: true }, // VD: "kinh-ram" (Dùng cho URL)
  description: { type: String }
});

module.exports = mongoose.model('Category', categorySchema);