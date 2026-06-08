const express = require('express');
const router = express.Router();
const bannerController = require('../controllers/bannerController');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');

router.get('/', bannerController.getActiveBanners);
router.get('/admin', verifyToken, verifyAdmin, bannerController.getAdminBanners);
router.post('/', verifyToken, verifyAdmin, bannerController.createBanner);
router.put('/:id', verifyToken, verifyAdmin, bannerController.updateBanner);
router.patch('/:id/toggle', verifyToken, verifyAdmin, bannerController.toggleBanner);
router.delete('/:id', verifyToken, verifyAdmin, bannerController.deleteBanner);

module.exports = router;
