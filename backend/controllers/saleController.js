const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Category = require('../models/Category');
const mongoose = require('mongoose');

// [POST] /api/sales - Tạo mới chiến dịch khuyến mãi (Admin)
exports.createSale = async (req, res) => {
  try {
    const { name, description, discountType, discountValue, startDate, endDate, applicableProducts, applicableCategories } = req.body;

    // 1. Validation dữ liệu cơ bản
    if (!name || !discountType || !discountValue || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp đầy đủ: Tên, Loại giảm giá, Giá trị giảm, Ngày bắt đầu và Ngày kết thúc!' });
    }

    if (discountType === 'percent' && (discountValue <= 0 || discountValue > 100)) {
      return res.status(400).json({ success: false, message: 'Phần trăm giảm giá phải nằm trong khoảng từ 1% đến 100%!' });
    }

    if (discountType === 'fixed' && discountValue <= 0) {
      return res.status(400).json({ success: false, message: 'Số tiền giảm giá tĩnh phải lớn hơn 0!' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end <= start) {
      return res.status(400).json({ success: false, message: 'Ngày kết thúc phải diễn ra sau ngày bắt đầu!' });
    }

    const newSale = new Sale({
      name,
      description,
      discountType,
      discountValue: Number(discountValue),
      startDate: start,
      endDate: end,
      applicableProducts: applicableProducts || [],
      applicableCategories: applicableCategories || [],
      createdBy: req.user?.id || null
    });

    await newSale.save();
    res.status(201).json({ success: true, message: 'Tạo chiến dịch khuyến mãi thành công!', sale: newSale });
  } catch (error) {
    console.error('❌ Lỗi tạo chiến dịch Sale:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tạo chiến dịch Sale!', error: error.message });
  }
};

// [GET] /api/sales - Lấy danh sách chiến dịch khuyến mãi (Tất cả vai trò, hỗ trợ query lọc)
exports.getSales = async (req, res) => {
  try {
    const sales = await Sale.find()
      .populate('applicableProducts', 'name price')
      .populate('applicableCategories', 'name')
      .populate('createdBy', 'username name')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, sales });
  } catch (error) {
    console.error('❌ Lỗi lấy danh sách Sale:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách Sale!' });
  }
};

// [GET] /api/sales/:id - Chi tiết chiến dịch khuyến mãi
exports.getSaleById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Định dạng ID Sale không hợp lệ!' });
    }

    const sale = await Sale.findById(id)
      .populate('applicableProducts', 'name price')
      .populate('applicableCategories', 'name');

    if (!sale) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy chiến dịch khuyến mãi tương ứng!' });
    }

    res.status(200).json({ success: true, sale });
  } catch (error) {
    console.error('❌ Lỗi lấy chi tiết Sale:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ!' });
  }
};

// [PUT] /api/sales/:id - Cập nhật chiến dịch khuyến mãi (Admin)
exports.updateSale = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Định dạng ID Sale không hợp lệ!' });
    }

    const { name, description, discountType, discountValue, startDate, endDate, isActive, applicableProducts, applicableCategories } = req.body;

    const sale = await Sale.findById(id);
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy chiến dịch để cập nhật!' });
    }

    // Validation nâng cao nếu có chỉnh sửa loại giảm giá
    if (discountType) {
      sale.discountType = discountType;
    }
    if (discountValue !== undefined) {
      const val = Number(discountValue);
      if (sale.discountType === 'percent' && (val <= 0 || val > 100)) {
        return res.status(400).json({ success: false, message: 'Phần trăm giảm giá phải từ 1% đến 100%!' });
      }
      if (sale.discountType === 'fixed' && val <= 0) {
        return res.status(400).json({ success: false, message: 'Giá giảm tĩnh phải lớn hơn 0!' });
      }
      sale.discountValue = val;
    }

    if (name) sale.name = name;
    if (description !== undefined) sale.description = description;
    
    if (startDate) sale.startDate = new Date(startDate);
    if (endDate) sale.endDate = new Date(endDate);

    if (sale.endDate <= sale.startDate) {
      return res.status(400).json({ success: false, message: 'Ngày kết thúc phải diễn ra sau ngày bắt đầu!' });
    }

    if (isActive !== undefined) {
      sale.isActive = isActive === true || isActive === 'true';
    }

    if (applicableProducts) sale.applicableProducts = applicableProducts;
    if (applicableCategories) sale.applicableCategories = applicableCategories;

    await sale.save();

    const updatedSale = await Sale.findById(id)
      .populate('applicableProducts', 'name price')
      .populate('applicableCategories', 'name');

    res.status(200).json({ success: true, message: 'Cập nhật khuyến mãi thành công!', sale: updatedSale });
  } catch (error) {
    console.error('❌ Lỗi cập nhật Sale:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật!', error: error.message });
  }
};

// [DELETE] /api/sales/:id - Xóa hoàn toàn hoặc vô hiệu hóa chiến dịch khuyến mãi (Admin)
exports.deleteSale = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Định dạng ID Sale không hợp lệ!' });
    }

    const sale = await Sale.findByIdAndDelete(id);
    if (!sale) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy chiến dịch khuyến mãi!' });
    }

    res.status(200).json({ success: true, message: 'Đã xóa hoàn toàn chiến dịch khuyến mãi khỏi hệ thống!' });
  } catch (error) {
    console.error('❌ Lỗi xóa Sale:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ!' });
  }
};
