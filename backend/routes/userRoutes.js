const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');

// Route này được bảo vệ bởi verifyToken
router.put('/profile', verifyToken, userController.updateProfile);

// Đăng ký các API quản lý tài khoản của Admin (sử dụng verifyAdmin tập trung)
router.get('/', verifyToken, verifyAdmin, userController.getAllUsers);
router.post('/staff', verifyToken, verifyAdmin, userController.createStaff);
router.put('/staff/:id', verifyToken, verifyAdmin, userController.updateStaff);
router.put('/:id/toggle-block', verifyToken, verifyAdmin, userController.toggleBlockUser);

module.exports = router;