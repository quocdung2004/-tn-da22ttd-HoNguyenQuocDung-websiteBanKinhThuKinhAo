const express = require('express');
const multer = require('multer');
const router = express.Router();
const productController = require('../controllers/productController');
const uploadCloud = require('../config/cloudinary');
const { verifyToken, verifyAdmin, optionalVerifyToken } = require('../middleware/authMiddleware');

const cpUpload = uploadCloud.fields([
  { name: 'images', maxCount: 10 },
  { name: 'arModel', maxCount: 1 }
]);

const handleProductUpload = (req, res, next) => {
  cpUpload(req, res, (error) => {
    if (!error) return next();

    console.error('Loi upload file san pham:', error);

    const isClientUploadError =
      error instanceof multer.MulterError ||
      error.statusCode === 400 ||
      error.http_code === 400;

    return res.status(isClientUploadError ? 400 : 502).json({
      success: false,
      message: error.message || 'Khong the tai file san pham.'
    });
  });
};

router.get('/', optionalVerifyToken, productController.getProducts);
router.get('/shop', optionalVerifyToken, productController.getProductsShop);
router.get('/:id', optionalVerifyToken, productController.getProductById);
router.post('/', verifyToken, verifyAdmin, handleProductUpload, productController.createProduct);
router.put('/:id', verifyToken, verifyAdmin, handleProductUpload, productController.updateProduct);
router.delete('/:id', verifyToken, verifyAdmin, productController.deleteProduct);
router.put('/:id/restore', verifyToken, verifyAdmin, productController.restoreProduct);

module.exports = router;
