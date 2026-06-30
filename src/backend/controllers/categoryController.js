const Category = require('../models/Category');
const slugify = require('slugify');

// [POST] Thêm Danh mục
exports.createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;
    
    // Tự động biến đổi Tên thành Slug (VD: "Kính Cận Nam" -> "kinh-can-nam")
    const slug = slugify(name, {
      lower: true,      // Chuyển thành chữ thường
      strict: true,     // Cắt bỏ các ký tự đặc biệt (@, #, $)
      locale: 'vi'      // Hỗ trợ tiếng Việt chuẩn
    });

    const newCategory = new Category({ name, slug, description });
    await newCategory.save();

    res.status(201).json({ success: true, message: 'Thêm Danh mục thành công!', category: newCategory });

  } catch (error) {
    console.error('Lỗi thêm Category:', error);
    // Bắt lỗi trùng Slug (Mongo Error Code: 11000)
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Tên danh mục này đã tồn tại!' });
    }
    res.status(500).json({ success: false, message: 'Lỗi máy chủ!' });
  }
};

// [GET] Lấy danh sách Danh mục
exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort({ _id: -1 });
    res.json({ success: true, categories });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi máy chủ!' });
  }
};