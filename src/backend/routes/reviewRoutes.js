const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { verifyToken, verifyAdmin, verifyStaffOrAdmin } = require('../middleware/authMiddleware');

// Check if authenticated user is eligible to review a product
router.get('/eligible/:productId', verifyToken, reviewController.checkEligibility);

// Save or update a review for a product
router.post('/', verifyToken, reviewController.saveReview);

// Get reviews for a single product (public)
router.get('/product/:productId', reviewController.getProductReviews);

// Get all reviews (Staff/Admin only)
router.get('/', verifyToken, verifyStaffOrAdmin, reviewController.getAllReviews);

// Delete a review (Admin only)
router.delete('/:id', verifyToken, verifyAdmin, reviewController.deleteReview);

// Reply to a review (Staff/Admin)
router.put('/:id/reply', verifyToken, verifyStaffOrAdmin, reviewController.replyReview);

module.exports = router;
