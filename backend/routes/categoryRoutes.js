const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { verifyToken } = require('../middleware/authMiddleware');

router.get('/', categoryController.getCategories);
router.post('/', verifyToken, categoryController.createCategory);

module.exports = router;