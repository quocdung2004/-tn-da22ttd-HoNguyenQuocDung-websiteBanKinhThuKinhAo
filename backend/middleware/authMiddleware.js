const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.verifyToken = async (req, res, next) => {
  // Lấy token từ header do Frontend gửi lên
  const token = req.header('Authorization')?.split(' ')[1]; 
  
  if (!token) {
    return res.status(401).json({ success: false, message: 'Truy cập bị từ chối. Không tìm thấy token!' });
  }

  try {
    // Dùng chìa khóa bí mật để giải mã token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Tiền kiểm tra tài khoản thực tế từ Database xem có bị Khóa mềm không
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Tài khoản không tồn tại trên hệ thống!' });
    }
    
    if (user.isBlocked) {
      return res.status(403).json({ success: false, message: 'Tài khoản của bạn đã bị khóa bởi Quản trị viên!' });
    }

    // Gắn thông tin tươi từ DB vào req để đi tiếp
    req.user = { id: user._id, username: user.username, role: user.role, name: user.name };
    next(); // Cho phép đi qua cổng
  } catch (error) {
    res.status(401).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn!' });
  }
};