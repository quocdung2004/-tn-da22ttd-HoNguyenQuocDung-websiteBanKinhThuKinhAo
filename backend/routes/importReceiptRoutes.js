const express = require('express');
const router = express.Router();
const importReceiptController = require('../controllers/importReceiptController');
const { verifyToken } = require('../middleware/authMiddleware');

// Middleware xác thực quyền hạn Quản trị viên tối cao (role 1)
const verifyAdmin = (req, res, next) => {
  if (req.user && req.user.role === 1) {
    next();
  } else {
    return res.status(403).json({ success: false, message: 'Quyền hạn bị từ chối. Chức năng này chỉ dành riêng cho Admin!' });
  }
};

// Đăng ký route lập phiếu nhập (Chỉ Admin)
router.post('/', verifyToken, verifyAdmin, importReceiptController.createReceipt);

// Đăng ký route xem lịch sử nhập (Chỉ Admin)
router.get('/', verifyToken, verifyAdmin, importReceiptController.getReceipts);

module.exports = router;
