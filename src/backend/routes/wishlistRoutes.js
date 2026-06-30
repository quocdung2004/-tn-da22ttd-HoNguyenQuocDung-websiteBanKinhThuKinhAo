const express = require('express');
const router = express.Router();
const wishlistController = require('../controllers/wishlistController');
const { verifyToken } = require('../middleware/authMiddleware');

const verifyCustomer = (req, res, next) => {
  if (req.user && req.user.role === 0) {
    return next();
  }

  return res.status(403).json({ success: false, message: 'Wishlist chi danh cho khach hang!' });
};

router.use(verifyToken, verifyCustomer);

router.get('/', wishlistController.getWishlist);
router.post('/:productId', wishlistController.addToWishlist);
router.delete('/:productId', wishlistController.removeFromWishlist);
router.get('/check/:productId', wishlistController.checkWishlist);

module.exports = router;
