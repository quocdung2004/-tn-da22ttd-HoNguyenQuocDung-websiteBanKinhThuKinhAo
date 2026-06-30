const Brand = require('../models/Brand');

// [POST] Thêm nhãn hàng mới
exports.createBrand = async (req, res) => {
  try {
    const { name, origin } = req.body;
    let logoUrl = '';

    // Nếu có file đính kèm, Cloudinary đã tự up và trả về link trong req.file.path
    if (req.file) {
      logoUrl = req.file.path; 
    }

    const newBrand = new Brand({ name, origin, logoUrl });
    await newBrand.save();

    res.status(201).json({ success: true, message: 'Thêm Nhãn hàng thành công!', brand: newBrand });
  } catch (error) {
    console.error('Lỗi thêm Brand:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ!' });
  }
};

// [GET] Lấy danh sách nhãn hàng
exports.getBrands = async (req, res) => {
  try {
    const brands = await Brand.find().sort({ _id: -1 }); // Lấy mới nhất lên đầu
    res.json({ success: true, brands });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi máy chủ!' });
  }
};