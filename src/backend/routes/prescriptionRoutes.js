const express = require('express');
const router = express.Router();
const prescriptionController = require('../controllers/prescriptionController');
const { verifyToken } = require('../middleware/authMiddleware');

router.get('/', verifyToken, prescriptionController.getPrescription);
router.post('/', verifyToken, prescriptionController.savePrescription);

module.exports = router;
