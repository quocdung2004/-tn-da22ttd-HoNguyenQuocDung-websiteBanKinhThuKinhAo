const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const uploadCloud = require('../config/cloudinary');
const { verifyToken, verifyStaffOrAdmin } = require('../middleware/authMiddleware');

// Cấu hình Middleware "Bắt File" (Hứng nhiều định dạng cùng lúc từ FormData)
const cpUpload = uploadCloud.fields([
  { name: 'images', maxCount: 10 },   // Hứng mảng ảnh, tối đa 10 file
  { name: 'arModel', maxCount: 1 }    // Hứng file 3D, tối đa 1 file
]);

// Route Lấy danh sách (Ai cũng xem được)
router.get('/', productController.getProducts);

// Route Thêm (Yêu cầu Staff/Admin)
router.post('/', verifyToken, verifyStaffOrAdmin, cpUpload, productController.createProduct);

// Route Sửa (Yêu cầu Staff/Admin)
router.put('/:id', verifyToken, verifyStaffOrAdmin, cpUpload, productController.updateProduct);

// Route Xóa (Yêu cầu Staff/Admin)
router.delete('/:id', verifyToken, verifyStaffOrAdmin, productController.deleteProduct);

// Route Khôi phục (Yêu cầu Staff/Admin)
router.put('/:id/restore', verifyToken, verifyStaffOrAdmin, productController.restoreProduct);

module.exports = router;