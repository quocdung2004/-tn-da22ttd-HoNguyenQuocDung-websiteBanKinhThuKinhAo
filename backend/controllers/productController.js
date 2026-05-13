const Product = require('../models/Product');

// [POST] Thêm Sản phẩm
exports.createProduct = async (req, res) => {
  try {
    // Lấy các trường text từ req.body (Lưu ý: arUrl không lấy ở đây nữa vì nó đã thành File)
    const { name, price, description, stock, brand, category } = req.body;
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
      name, price, description, images, arUrl, stock, brand, category
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
    // Dùng populate để lấy luôn tên Brand và Category thay vì chỉ lấy cái ID
    const products = await Product.find()
      .populate('brand', 'name') 
      .populate('category', 'name')
      .sort({ createdAt: -1 });

    res.json({ success: true, products });
  } catch (error) {
    console.error('Lỗi lấy Product:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ!' });
  }
};

// [PUT] Cập nhật Sản phẩm
exports.updateProduct = async (req, res) => {
  try {
    const { name, price, description, stock, brand, category } = req.body;
    
    // Tạo object chứa dữ liệu mới cơ bản
    let updateData = { name, price, description, stock, brand, category };

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

    res.json({ success: true, message: 'Cập nhật thành công!', product: updatedProduct });
  } catch (error) {
    console.error('Lỗi cập nhật Product:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ!' });
  }
};

// [DELETE] Xóa Sản phẩm
exports.deleteProduct = async (req, res) => {
  try {
    const deletedProduct = await Product.findByIdAndDelete(req.params.id);
    
    if (!deletedProduct) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm!' });
    }

    res.json({ success: true, message: 'Đã xóa sản phẩm thành công!' });
  } catch (error) {
    console.error('Lỗi xóa Product:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ!' });
  }
};