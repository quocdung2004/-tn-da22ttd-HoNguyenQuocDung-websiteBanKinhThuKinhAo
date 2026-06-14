const mongoose = require('mongoose');

const prescriptionSchema = new mongoose.Schema({
  // Liên kết ngược lại bảng User thông qua username
  username: { type: String, ref: 'User', required: true }, 
  
  // Thông số Mắt Phải (OD) & Mắt Trái (OS)
  rightEye: { sphere: Number, cylinder: Number, axis: Number },
  leftEye: { sphere: Number, cylinder: Number, axis: Number },
  pd: { type: Number }, // Khoảng cách đồng tử
  
  issuedDate: { type: Date, default: Date.now },
  note: { type: String }
});

prescriptionSchema.index({ username: 1 }, { unique: true });

module.exports = mongoose.model('Prescription', prescriptionSchema);
