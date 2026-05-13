const express = require('express');
const router = express.Router();
const brandController = require('../controllers/brandController');
const uploadCloud = require('../config/cloudinary');
const { verifyToken } = require('../middleware/authMiddleware');

// Khách hàng ai cũng xem được hãng kính
router.get('/', brandController.getBrands);

// CHỈ ADMIN/STAFF mới được thêm hãng kính (Kèm tính năng upload ảnh 'logo')
router.post('/', verifyToken, uploadCloud.single('logo'), brandController.createBrand);

module.exports = router;