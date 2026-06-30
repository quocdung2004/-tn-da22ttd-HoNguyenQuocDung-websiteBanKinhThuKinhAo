const express = require('express');
const router = express.Router();
const importReceiptController = require('../controllers/importReceiptController');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');

// Đăng ký route lập phiếu nhập (Chỉ Admin - sử dụng verifyAdmin tập trung)
router.post('/', verifyToken, verifyAdmin, importReceiptController.createReceipt);

// Đăng ký route xem lịch sử nhập (Chỉ Admin - sử dụng verifyAdmin tập trung)
router.get('/', verifyToken, verifyAdmin, importReceiptController.getReceipts);

module.exports = router;
