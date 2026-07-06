const express = require('express');
const router = express.Router();
const shipperController = require('../controllers/shipper.controller');
const { verifyToken, verifyShipperOnly } = require('../middleware/authMiddleware');

// Bảo vệ tất cả các API dành riêng cho Shipper bằng JWT và kiểm tra role === 3
router.use(verifyToken);
router.use(verifyShipperOnly);

// 1. API Lấy danh sách đơn hàng có sẵn trên chợ (chưa có shipper nhận)
router.get('/available-orders', shipperController.getAvailableOrders);

// 2. API Shipper tự nhận đơn hàng để đi giao
router.put('/claim-order/:orderId', shipperController.claimOrder);

// 3. API Lấy danh sách đơn hàng đang/đã giao của chính Shipper đó
router.get('/my-deliveries', shipperController.getMyDeliveries);

module.exports = router;
