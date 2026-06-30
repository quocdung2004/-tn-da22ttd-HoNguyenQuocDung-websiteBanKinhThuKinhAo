const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const adminShipperController = require('../controllers/adminShipperController');
const { verifyToken, verifyStaffOrAdmin, optionalVerifyToken, verifyAdminOnly } = require('../middleware/authMiddleware');

// Route Tạo Đơn hàng mới (mọi đối tượng truy cập, tự trích xuất token nếu có)
router.post('/', optionalVerifyToken, orderController.createOrder);

// Route Lấy danh sách đơn hàng cá nhân của chính người đăng nhập (Yêu cầu đăng nhập)
router.get('/my-orders', verifyToken, orderController.getMyOrders);

// --- SHIPPER ENDPOINTS (ROLE: SHIPPER / SHIPPERS WORKFLOW) ---
// Lấy danh sách đơn hàng được phân phối cho shipper hiện tại
router.get('/shipper/assigned', verifyToken, orderController.getShipperAssignedOrders);

// Shipper gửi yêu cầu đối soát nộp tiền COD về công ty
router.post('/shipper/reconcile', verifyToken, orderController.requestReconciliation);

// Cập nhật kết quả giao hàng của Shipper (Thành công / Thất bại)
router.put('/shipper/:id/delivery', verifyToken, orderController.updateShipperDeliveryStatus);

// Shipper xác nhận đã thu hồi hàng vật lý đổi trả từ khách hàng
router.put('/shipper/:id/physical-return', verifyToken, orderController.confirmPhysicalReturn);

// --- ADMIN/STAFF SHIPPER MANAGEMENT ---
// Lấy danh sách đơn hàng chờ phân công (status: 'processing' và shipperId: null)
router.get('/admin/shipper-pending', verifyToken, verifyStaffOrAdmin, adminShipperController.getPendingOrders);

// Lấy danh sách shippers (role === 3)
router.get('/admin/shippers-list', verifyToken, verifyStaffOrAdmin, adminShipperController.getShippersList);

// Phân công shipper cho đơn hàng
router.post('/admin/assign-shipper', verifyToken, verifyStaffOrAdmin, adminShipperController.assignShipper);

// Lấy danh sách yêu cầu đối soát nộp tiền (codStatus === 'pending_reconciliation')
router.get('/admin/reconciliation-requests', verifyToken, verifyStaffOrAdmin, adminShipperController.getReconciliationRequests);

// Duyệt đối soát nộp tiền cho shipper
router.post('/admin/approve-reconciliation', verifyToken, verifyAdminOnly, adminShipperController.approveReconciliation);

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
