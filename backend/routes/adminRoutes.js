const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');

// Đăng ký route thống kê báo cáo (Yêu cầu đăng nhập + vai trò Admin - sử dụng verifyAdmin tập trung)
router.get('/dashboard', verifyToken, verifyAdmin, adminController.getDashboardData);
router.get('/dashboard-v2', verifyToken, verifyAdmin, adminController.getDashboardV2Data);

module.exports = router;
