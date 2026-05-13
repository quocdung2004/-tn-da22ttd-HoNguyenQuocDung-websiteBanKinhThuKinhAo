const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken } = require('../middleware/authMiddleware');

// Route này được bảo vệ bởi verifyToken
router.put('/profile', verifyToken, userController.updateProfile);

module.exports = router;