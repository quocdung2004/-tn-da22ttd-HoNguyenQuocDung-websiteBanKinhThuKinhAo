const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');

// Đăng ký các API báo cáo thống kê dành cho trang Admin Dashboard
router.get('/finance', verifyToken, verifyAdmin, dashboardController.getFinanceReport);
router.get('/finance/comparison', verifyToken, verifyAdmin, dashboardController.getFinancialComparison);
router.get('/logistics', verifyToken, verifyAdmin, dashboardController.getLogisticsReport);
router.get('/products', verifyToken, verifyAdmin, dashboardController.getProductsReport);
router.get('/customers', verifyToken, verifyAdmin, dashboardController.getCustomersReport);
router.get('/products/performance', verifyToken, verifyAdmin, dashboardController.getProductsPerformance);
router.get('/brands/top', verifyToken, verifyAdmin, dashboardController.getTopBrandsReport);
router.get('/orders/ratio', verifyToken, verifyAdmin, dashboardController.getOrderRatio);
router.get('/details/orders', verifyToken, verifyAdmin, dashboardController.getOrderDetailReport);
router.get('/details/inventory', verifyToken, verifyAdmin, dashboardController.getInventoryDetailReport);

module.exports = router;

