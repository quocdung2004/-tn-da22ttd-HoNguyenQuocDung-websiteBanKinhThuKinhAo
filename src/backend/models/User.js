const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true }, 
  password: { type: String }, // Bỏ required để chừa đường cho Google Login
  authProvider: { type: String, enum: ['local', 'google', 'facebook'], default: 'local' },
  email: { type: String },
  role: { type: Number, default: 0 }, // 0: Khách, 1: Admin, 2: Staff
  name: { type: String },
  phone: { type: String },
  isBlocked: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);