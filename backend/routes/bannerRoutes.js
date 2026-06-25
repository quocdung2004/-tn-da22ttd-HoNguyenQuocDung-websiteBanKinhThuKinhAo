const express = require('express');
const router = express.Router();
const bannerController = require('../controllers/bannerController');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');

const uploadCloud = require('../config/cloudinary');

router.get('/', bannerController.getActiveBanners);
router.get('/admin', verifyToken, verifyAdmin, bannerController.getAdminBanners);
router.post('/', verifyToken, verifyAdmin, uploadCloud.single('image'), bannerController.createBanner);
router.put('/:id', verifyToken, verifyAdmin, uploadCloud.single('image'), bannerController.updateBanner);
router.patch('/:id/toggle', verifyToken, verifyAdmin, bannerController.toggleBanner);
router.delete('/:id', verifyToken, verifyAdmin, bannerController.deleteBanner);

module.exports = router;
