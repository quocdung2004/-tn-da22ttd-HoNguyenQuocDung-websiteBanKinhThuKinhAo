const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { verifyToken, verifyStaffOrAdmin } = require('../middleware/authMiddleware');

// ================= PHÂN HỆ KHÁCH HÀNG (CUSTOMER - Yêu cầu đăng nhập) =================

// Lấy thông tin ví hiện tại & lịch sử biến động giao dịch
router.get('/', verifyToken, walletController.getWallet);

// Gửi yêu cầu rút tiền ví nội bộ về tài khoản ngân hàng
router.post('/withdraw', verifyToken, walletController.withdrawRequest);

// Khách hàng tự hủy yêu cầu rút tiền còn đang chờ duyệt
router.post('/withdraw/:id/cancel', verifyToken, walletController.cancelWithdrawRequest);

// Khách hàng khiếu nại chưa nhận được tiền cho yêu cầu đã giải ngân
router.post('/withdraw/:id/dispute', verifyToken, walletController.disputeWithdrawRequest);


// ================= PHÂN HỆ QUẢN TRỊ (STAFF & ADMIN - Yêu cầu Token + Quyền Nhân viên/Admin) =================

// Xem danh sách toàn bộ các yêu cầu rút tiền trên hệ thống
router.get('/admin/withdrawals', verifyToken, verifyStaffOrAdmin, walletController.getAdminWithdrawals);

// Phê duyệt yêu cầu rút tiền (Nhập mã đối soát ngân hàng)
router.post('/admin/withdrawals/:id/approve', verifyToken, verifyStaffOrAdmin, walletController.approveWithdrawal);

// Từ chối yêu cầu rút tiền (Bắt buộc cung cấp lý do từ chối)
router.post('/admin/withdrawals/:id/reject', verifyToken, verifyStaffOrAdmin, walletController.rejectWithdrawal);

// Staff/Admin xử lý và giải quyết khiếu nại giải ngân
router.post('/admin/withdrawals/:id/resolve', verifyToken, verifyStaffOrAdmin, walletController.resolveWithdrawDispute);

module.exports = router;
