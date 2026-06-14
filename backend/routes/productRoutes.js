const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const uploadCloud = require('../config/cloudinary');
const { verifyToken, verifyAdmin, optionalVerifyToken } = require('../middleware/authMiddleware');

// Cấu hình Middleware "Bắt File" (Hứng nhiều định dạng cùng lúc từ FormData)
const cpUpload = uploadCloud.fields([
  { name: 'images', maxCount: 10 },   // Hứng mảng ảnh, tối đa 10 file
  { name: 'arModel', maxCount: 1 }    // Hứng file 3D, tối đa 1 file
]);

// Route Lấy danh sách (Ai cũng xem được)
router.get('/', optionalVerifyToken, productController.getProducts);

// Route Lấy chi tiết một sản phẩm (Ai cũng xem được)
router.get('/:id', optionalVerifyToken, productController.getProductById);

// Route Thêm (Yêu cầu Admin)
router.post('/', verifyToken, verifyAdmin, cpUpload, productController.createProduct);

// Route Sửa (Yêu cầu Admin)
router.put('/:id', verifyToken, verifyAdmin, cpUpload, productController.updateProduct);

// Route Xóa (Yêu cầu Admin)
router.delete('/:id', verifyToken, verifyAdmin, productController.deleteProduct);

// Route Khôi phục (Yêu cầu Admin)
router.put('/:id/restore', verifyToken, verifyAdmin, productController.restoreProduct);

module.exports = router;
