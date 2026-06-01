const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { verifyToken } = require('../middleware/authMiddleware');

// 1. Tải danh sách thông báo phân quyền tối đa 50 đơn
router.get('/', verifyToken, notificationController.getNotifications);

// 2. Đánh dấu đã đọc tất cả thông báo của người dùng
router.put('/read-all', verifyToken, notificationController.markAllAsRead);

// 3. Đánh dấu đã đọc một thông báo đơn lẻ
router.put('/:id/read', verifyToken, notificationController.markAsRead);

module.exports = router;
