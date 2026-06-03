const express = require('express');
const router = express.Router();
const saleController = require('../controllers/saleController');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');

// 1. Xem danh sách & Chi tiết chiến dịch (Khách hàng & Staff/Admin đều được phép xem)
router.get('/', saleController.getSales);
router.get('/:id', saleController.getSaleById);

// 2. Quản lý khuyến mãi (Bắt buộc đăng nhập và phải có quyền Admin (1))
router.post('/', verifyToken, verifyAdmin, saleController.createSale);
router.put('/:id', verifyToken, verifyAdmin, saleController.updateSale);
router.delete('/:id', verifyToken, verifyAdmin, saleController.deleteSale);

module.exports = router;
