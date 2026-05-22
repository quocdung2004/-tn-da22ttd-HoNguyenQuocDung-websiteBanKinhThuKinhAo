const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken } = require('../middleware/authMiddleware');

// Route này được bảo vệ bởi verifyToken
router.put('/profile', verifyToken, userController.updateProfile);

// Bộ lọc phân quyền: Chỉ cho Admin (role === 1) đi qua
const verifyAdmin = (req, res, next) => {
  if (req.user && req.user.role === 1) {
    next();
  } else {
    return res.status(403).json({ success: false, message: 'Quyền truy cập bị từ chối. Chỉ dành cho Admin!' });
  }
};

// Đăng ký các API quản lý tài khoản của Admin
router.get('/', verifyToken, verifyAdmin, userController.getAllUsers);
router.post('/staff', verifyToken, verifyAdmin, userController.createStaff);
router.put('/staff/:id', verifyToken, verifyAdmin, userController.updateStaff);
router.put('/:id/toggle-block', verifyToken, verifyAdmin, userController.toggleBlockUser);

module.exports = router;