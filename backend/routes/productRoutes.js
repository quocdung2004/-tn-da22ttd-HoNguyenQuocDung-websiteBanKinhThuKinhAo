const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const uploadCloud = require('../config/cloudinary');
const { verifyToken } = require('../middleware/authMiddleware');

// Cấu hình Middleware "Bắt File" (Hứng nhiều định dạng cùng lúc từ FormData)
const cpUpload = uploadCloud.fields([
  { name: 'images', maxCount: 10 },   // Hứng mảng ảnh, tối đa 10 file
  { name: 'arModel', maxCount: 1 }    // Hứng file 3D, tối đa 1 file
]);

// Route Lấy danh sách (Ai cũng xem được)
router.get('/', productController.getProducts);

// Route Thêm (Cần ID, Token và đi qua trạm kiểm tra File cpUpload)
router.post('/', verifyToken, cpUpload, productController.createProduct);

// Route Sửa (Cần ID, Token và đi qua trạm kiểm tra File cpUpload)
router.put('/:id', verifyToken, cpUpload, productController.updateProduct);

// Route Xóa (Chỉ cần ID và Token, không dính dáng đến file)
router.delete('/:id', verifyToken, productController.deleteProduct);

// Route Khôi phục (Cần ID và Token)
router.put('/:id/restore', verifyToken, productController.restoreProduct);

module.exports = router;