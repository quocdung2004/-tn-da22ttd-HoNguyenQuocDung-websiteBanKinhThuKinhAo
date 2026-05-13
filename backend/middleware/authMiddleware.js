const jwt = require('jsonwebtoken');

exports.verifyToken = (req, res, next) => {
  // Lấy token từ header do Frontend gửi lên
  const token = req.header('Authorization')?.split(' ')[1]; 
  
  if (!token) {
    return res.status(401).json({ success: false, message: 'Truy cập bị từ chối. Không tìm thấy token!' });
  }

  try {
    // Dùng chìa khóa bí mật để giải mã token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Gắn thông tin giải mã được (id, username, role) vào req để đi tiếp
    next(); // Cho phép đi qua cổng
  } catch (error) {
    res.status(401).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn!' });
  }
};