const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');
const { getActiveSales, attachSaleInfoToProduct } = require('../utils/saleHelper');

const populateProduct = {
  path: 'productId',
  populate: [
    { path: 'brand', select: 'name' },
    { path: 'category', select: 'name' }
  ]
};

exports.getWishlist = async (req, res) => {
  try {
    const wishlistItems = await Wishlist.find({ userId: req.user.id })
      .populate(populateProduct)
      .sort({ createdAt: -1 });

    const activeSales = await getActiveSales();
    const items = wishlistItems.map((item) => ({
      _id: item._id,
      createdAt: item.createdAt,
      product: item.productId ? attachSaleInfoToProduct(item.productId, activeSales) : null
    }));

    res.json({ success: true, items });
  } catch (error) {
    console.error('Loi lay wishlist:', error);
    res.status(500).json({ success: false, message: 'Loi may chu khi lay danh sach yeu thich!' });
  }
};

exports.addToWishlist = async (req, res) => {
  try {
    const { productId } = req.params;
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Khong tim thay san pham!' });
    }

    if (product.isActive === false) {
      return res.status(400).json({ success: false, message: 'San pham nay khong con kinh doanh!' });
    }

    const existingItem = await Wishlist.findOne({ userId: req.user.id, productId });
    if (existingItem) {
      return res.json({ success: true, message: 'San pham da co trong danh sach yeu thich!' });
    }

    await Wishlist.create({ userId: req.user.id, productId });
    res.status(201).json({ success: true, message: 'Da them san pham vao danh sach yeu thich!' });
  } catch (error) {
    if (error.code === 11000) {
      return res.json({ success: true, message: 'San pham da co trong danh sach yeu thich!' });
    }

    console.error('Loi them wishlist:', error);
    res.status(500).json({ success: false, message: 'Loi may chu khi them yeu thich!' });
  }
};

exports.removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.params;
    await Wishlist.deleteOne({ userId: req.user.id, productId });
    res.json({ success: true, message: 'Da bo san pham khoi danh sach yeu thich!' });
  } catch (error) {
    console.error('Loi xoa wishlist:', error);
    res.status(500).json({ success: false, message: 'Loi may chu khi xoa yeu thich!' });
  }
};

exports.checkWishlist = async (req, res) => {
  try {
    const { productId } = req.params;
    const item = await Wishlist.findOne({ userId: req.user.id, productId });
    res.json({ success: true, isWishlisted: Boolean(item) });
  } catch (error) {
    console.error('Loi kiem tra wishlist:', error);
    res.status(500).json({ success: false, message: 'Loi may chu khi kiem tra yeu thich!' });
  }
};
