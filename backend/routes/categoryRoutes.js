const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { verifyToken, verifyStaffOrAdmin } = require('../middleware/authMiddleware');

// Khách hàng ai cũng xem được danh mục
router.get('/', categoryController.getCategories);

// CHỈ ADMIN/STAFF mới được thêm danh mục
router.post('/', verifyToken, verifyStaffOrAdmin, categoryController.createCategory);

module.exports = router;