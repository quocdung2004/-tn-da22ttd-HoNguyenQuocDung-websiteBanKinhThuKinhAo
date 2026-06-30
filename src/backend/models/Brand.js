const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema({
  name: { type: String, required: true }, // VD: "RayBan", "Gucci"
  logoUrl: { type: String },
  origin: { type: String } // Xuất xứ
});

module.exports = mongoose.model('Brand', brandSchema);