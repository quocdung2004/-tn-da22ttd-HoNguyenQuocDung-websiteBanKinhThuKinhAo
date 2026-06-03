const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { verifyToken, verifyStaffOrAdmin } = require('../middleware/authMiddleware');

// 1. Khách hàng: Lấy hoặc tự khởi động cuộc hội thoại của họ
router.get('/my-conversation', verifyToken, chatController.getMyConversation);

// 2. Nhân viên/Admin: Lấy danh sách toàn bộ cuộc hội thoại hiện có
router.get('/conversations', verifyToken, verifyStaffOrAdmin, chatController.getConversations);

// 3. Khách hàng & Nhân viên: Lấy lịch sử tin nhắn của một cuộc hội thoại (Có kiểm tra quyền sở hữu nội bộ)
router.get('/messages/:conversationId', verifyToken, chatController.getMessages);

// 4. Khách hàng & Nhân viên: Đánh dấu cuộc hội thoại đã được đọc hoàn toàn
router.put('/read/:conversationId', verifyToken, chatController.markConversationRead);

// 5. Nhân viên/Admin: Đóng cuộc hội thoại khi kết thúc ca chăm sóc
router.put('/close/:conversationId', verifyToken, verifyStaffOrAdmin, chatController.closeConversation);

// 6. Nhân viên/Admin: Staff tự nhận xử lý cuộc chat hoặc Admin gán cho một Staff cụ thể
router.put('/assign/:conversationId', verifyToken, verifyStaffOrAdmin, chatController.assignStaffToConversation);

module.exports = router;
