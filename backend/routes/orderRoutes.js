const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { verifyToken, verifyStaffOrAdmin } = require('../middleware/authMiddleware');

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

// Route Lấy danh sách đơn hàng cá nhân của chính người đăng nhập (Yêu cầu đăng nhập)
router.get('/my-orders', verifyToken, orderController.getMyOrders);

// Route Lấy danh sách toàn bộ Đơn hàng (Chỉ Admin và Staff)
router.get('/', verifyToken, verifyStaffOrAdmin, orderController.getOrders);

// Route Lấy danh sách các yêu cầu hủy đơn hàng chờ duyệt (Chỉ Admin và Staff)
router.get('/admin/cancel-requests', verifyToken, verifyStaffOrAdmin, orderController.getCancelRequests);

// Route Xem chi tiết 1 Đơn hàng (Yêu cầu đăng nhập + tự kiểm tra quyền sở hữu hoặc quyền quản trị)
router.get('/:id', verifyToken, orderController.getOrderById);

// Route Khách hàng gửi yêu cầu hủy đơn hoặc tự hủy trực tiếp (Yêu cầu đăng nhập)
router.post('/:id/cancel-request', verifyToken, orderController.requestOrderCancel);

// Route Staff/Admin xử lý yêu cầu hủy đơn (Chỉ Admin và Staff)
router.post('/:id/handle-cancel', verifyToken, verifyStaffOrAdmin, orderController.handleOrderCancel);

// Route Staff/Admin nhận xử lý đơn hàng chuyển sang processing (Chỉ Admin và Staff)
router.post('/:id/receive', verifyToken, verifyStaffOrAdmin, orderController.receiveOrder);

// Route Cập nhật Trạng thái Đơn hàng (Chỉ Admin và Staff)
router.put('/:id/status', verifyToken, verifyStaffOrAdmin, orderController.updateOrderStatus);

module.exports = router;
