const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { verifyToken } = require('../middleware/authMiddleware');

// Middleware phụ để kiểm tra xem user có phải Admin (1) hoặc Staff (2) không
const verifyStaffOrAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 1 || req.user.role === 2)) {
    next();
  } else {
    return res.status(403).json({ success: false, message: 'Từ chối truy cập. Bạn không có quyền hạn này!' });
  }
};

// Route Tạo Đơn hàng mới (mọi đối tượng truy cập, tự trích xuất token nếu có)
router.post('/', (req, res, next) => {
  // Thử trích xuất token để gắn thông tin user nếu có, nhưng không chặn nếu không có
  const token = req.header('Authorization')?.split(' ')[1];
  if (token) {
    const jwt = require('jsonwebtoken');
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
    } catch (e) {
      // Bỏ qua lỗi token hết hạn khi thanh toán của khách vãng lai
    }
  }
  next();
}, orderController.createOrder);

// Route Lấy danh sách toàn bộ Đơn hàng (Chỉ Admin và Staff)
router.get('/', verifyToken, verifyStaffOrAdmin, orderController.getOrders);

// Route Cập nhật Trạng thái Đơn hàng (Chỉ Admin và Staff)
router.put('/:id/status', verifyToken, verifyStaffOrAdmin, orderController.updateOrderStatus);

module.exports = router;
