const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware xác thực Token JWT và tiền kiểm tra block state từ DB
exports.verifyToken = async (req, res, next) => {
  const token = req.header('Authorization')?.split(' ')[1]; 
  
  if (!token) {
    return res.status(401).json({ success: false, message: 'Truy cập bị từ chối. Không tìm thấy token!' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Tiền kiểm tra trạng thái tài khoản tươi từ DB đề phòng bị khóa giữa phiên
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Tài khoản không tồn tại trên hệ thống!' });
    }
    
    if (user.isBlocked) {
      return res.status(403).json({ success: false, message: 'Tài khoản của bạn đã bị khóa bởi Quản trị viên!' });
    }

    req.user = { id: user._id, username: user.username, role: user.role, name: user.name };
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn!' });
  }
};

// Soft auth for public endpoints that can return extra fields to admins.
exports.optionalVerifyToken = async (req, res, next) => {
  const token = req.header('Authorization')?.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || user.isBlocked) {
      req.user = null;
      return next();
    }

    req.user = { id: user._id, username: user.username, role: user.role, name: user.name };
    return next();
  } catch (error) {
    req.user = null;
    return next();
  }
};

// Middleware xác thực quyền hạn Quản trị viên tối cao (Admin - role === 1)
exports.verifyAdmin = (req, res, next) => {
  if (req.user && req.user.role === 1) {
    next();
  } else {
    return res.status(403).json({ success: false, message: 'Quyền truy cập bị từ chối. Chỉ dành cho Admin!' });
  }
};

// Middleware xác thực quyền hạn Nhân viên hoặc Admin (Staff hoặc Admin)
exports.verifyStaffOrAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 1 || req.user.role === 2)) {
    next();
  } else {
    return res.status(403).json({ success: false, message: 'Từ chối truy cập. Bạn không có quyền hạn này!' });
  }
};
