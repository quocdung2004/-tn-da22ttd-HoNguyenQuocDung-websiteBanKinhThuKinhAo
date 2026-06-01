const express = require('express');
const router = express.Router();
const brandController = require('../controllers/brandController');
const uploadCloud = require('../config/cloudinary');
const { verifyToken, verifyStaffOrAdmin } = require('../middleware/authMiddleware');

// Khách hàng ai cũng xem được hãng kính
router.get('/', brandController.getBrands);

// CHỈ ADMIN/STAFF mới được thêm hãng kính (Kèm tính năng upload ảnh 'logo')
router.post('/', verifyToken, verifyStaffOrAdmin, uploadCloud.single('logo'), brandController.createBrand);

module.exports = router;