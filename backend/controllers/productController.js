const Product = require('../models/Product');
const { checkAndEmitLowStockNotification } = require('../utils/notificationHelper');
const { getIO } = require('../socket');
const { getActiveSales, calculateBestSaleForProduct, attachSaleInfoToProduct } = require('../utils/saleHelper');

// Giữ tương thích ngược hoàn hảo cho orderController.js
const resolveProductSalePrice = async (product) => {
  const activeSales = await getActiveSales();
  const res = calculateBestSaleForProduct(product, activeSales);
  return {
    originalPrice: product.price || 0,
    salePrice: res.salePrice,
    discountPercent: res.discountPercent,
    activeSale: res.activeSale
  };
};

exports.resolveProductSalePrice = resolveProductSalePrice;

// [POST] Thêm Sản phẩm
exports.createProduct = async (req, res) => {
  try {
    // Lấy các trường text từ req.body (Lưu ý: arUrl không lấy ở đây nữa vì nó đã thành File)
    const { name, price, description, stock, importPrice, brand, category } = req.body;
    let images = [];
    let arUrl = '';

    // Xử lý mảng ảnh: Nếu có mảng 'images' được up lên, lặp qua để lấy toàn bộ đường link path
    if (req.files && req.files['images']) {
      images = req.files['images'].map(file => file.path);
    }

    // Xử lý file 3D: Lấy link của file arModel đầu tiên (và duy nhất)
    if (req.files && req.files['arModel']) {
      arUrl = req.files['arModel'][0].path;
    }

    const newProduct = new Product({
      name, price, description, images, arUrl, stock, importPrice: Number(importPrice) || 0, brand, category
    });

    await newProduct.save();
    res.status(201).json({ success: true, message: 'Thêm Kính mắt thành công!', product: newProduct });
  } catch (error) {
    console.error('Lỗi thêm Product:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi thêm sản phẩm!' });
  }
};

// [GET] Lấy danh sách Sản phẩm
exports.getProducts = async (req, res) => {
  try {
    // Nếu truyền query all=true thì trả về tất cả (bao gồm cả sản phẩm bị ẩn/xóa mềm - dùng cho Admin)
    // Ngược lại chỉ trả về các sản phẩm đang bán (isActive !== false - dùng cho Customer)
    const filter = req.query.all === 'true' ? {} : { isActive: { $ne: false } };

    const products = await Product.find(filter)
      .populate('brand', 'name') 
      .populate('category', 'name')
      .sort({ createdAt: -1 });

    // Tính toán giá khuyến mãi động cho từng sản phẩm trả về sử dụng saleHelper
    const activeSales = await getActiveSales();
    const resolvedProducts = products.map(product => attachSaleInfoToProduct(product, activeSales));

    res.json({ success: true, products: resolvedProducts });
  } catch (error) {
    console.error('Lỗi lấy Product:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ!' });
  }
};

// [GET] Lấy chi tiết một Sản phẩm
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id)
      .populate('brand', 'name')
      .populate('category', 'name');

    if (!product) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm kính mắt!' });
    }

    // Tính toán khuyến mãi động cho sản phẩm
    const activeSales = await getActiveSales();
    const resolvedProduct = attachSaleInfoToProduct(product, activeSales);

    res.json({ success: true, product: resolvedProduct });
  } catch (error) {
    console.error('Lỗi lấy chi tiết Product:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ!' });
  }
};

// [PUT] Cập nhật Sản phẩm
exports.updateProduct = async (req, res) => {
  try {
    const { name, price, description, stock, importPrice, brand, category, isActive } = req.body;
    
    // Tạo object chứa dữ liệu mới cơ bản
    let updateData = { name, price, description, stock, importPrice: Number(importPrice) || 0, brand, category };
    
    if (isActive !== undefined) {
      updateData.isActive = isActive === 'true' || isActive === true;
    }

    // Nếu Admin có quét chọn tải album ảnh mới lên (sẽ ghi đè ảnh cũ)
    if (req.files && req.files['images']) {
      updateData.images = req.files['images'].map(file => file.path);
    }

    // Nếu Admin có tải file 3D (.glb) mới lên
    if (req.files && req.files['arModel']) {
      updateData.arUrl = req.files['arModel'][0].path;
    }

    // Tìm theo ID và cập nhật (thêm { new: true } để nó trả về data sau khi sửa)
    const updatedProduct = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
    
    if (!updatedProduct) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm!' });
    }

    // ================= REALTIME STOCK INTEGRATION =================
    // Phát tín hiệu cập nhật tồn kho sỉ/lẻ từ chỉnh sửa của Admin
    getIO().emit('product:stockUpdated', {
      productId: updatedProduct._id.toString(),
      stock: updatedProduct.stock,
      reason: 'admin_edit'
    });
    // Kiểm tra và gửi cảnh báo tồn kho thấp (stock <= 5)
    await checkAndEmitLowStockNotification(updatedProduct);
    // ===============================================================

    res.json({ success: true, message: 'Cập nhật thành công!', product: updatedProduct });
  } catch (error) {
    console.error('Lỗi cập nhật Product:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ!' });
  }
};

// [DELETE] Xóa Sản phẩm (Xóa Mềm - Soft Delete)
exports.deleteProduct = async (req, res) => {
  try {
    // Không xóa cứng để tránh mồ côi khóa ngoại trong Đơn hàng (Order) và Lịch sử nhập (ImportReceipt)
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id, 
      { isActive: false }, 
      { new: true }
    );
    
    if (!updatedProduct) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm!' });
    }

    res.json({ success: true, message: 'Đã ẩn (xóa mềm) sản phẩm thành công!', product: updatedProduct });
  } catch (error) {
    console.error('Lỗi xóa Product:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ!' });
  }
};

// [PUT] Khôi phục Sản phẩm đã bị xóa mềm (Dành cho Admin)
exports.restoreProduct = async (req, res) => {
  try {
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id, 
      { isActive: true }, 
      { new: true }
    );
    
    if (!updatedProduct) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm!' });
    }

    res.json({ success: true, message: 'Khôi phục sản phẩm thành công!', product: updatedProduct });
  } catch (error) {
    console.error('Lỗi khôi phục Product:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ!' });
  }
};