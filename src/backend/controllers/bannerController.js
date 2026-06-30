const Banner = require('../models/Banner');

const normalizeBannerPayload = (body, file) => {
  const startDate = body.startDate ? new Date(body.startDate) : new Date();
  const endDate = body.endDate ? new Date(body.endDate) : null;

  // Lấy URL ảnh từ file upload (Cloudinary) hoặc giữ nguyên link cũ gửi từ client
  const imageUrl = file ? file.path : body.imageUrl?.trim();

  return {
    title: body.title?.trim(),
    subtitle: body.subtitle?.trim() || '',
    imageUrl,
    targetUrl: body.targetUrl?.trim() || '/',
    sortOrder: Number(body.sortOrder || 0),
    isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
    startDate,
    endDate
  };
};

const validateBannerPayload = (payload) => {
  if (!payload.title) return 'Vui lòng nhập tiêu đề banner.';
  if (!payload.imageUrl) return 'Vui lòng tải lên hình ảnh banner.';
  if (Number.isNaN(payload.startDate.getTime())) return 'Ngày bắt đầu không hợp lệ.';
  if (payload.endDate && Number.isNaN(payload.endDate.getTime())) return 'Ngày kết thúc không hợp lệ.';
  if (payload.endDate && payload.startDate > payload.endDate) {
    return 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.';
  }
  if (Number.isNaN(payload.sortOrder)) return 'Thứ tự hiển thị không hợp lệ.';
  return null;
};

exports.getActiveBanners = async (req, res) => {
  try {
    const now = new Date();
    const banners = await Banner.find({
      isActive: true,
      startDate: { $lte: now },
      $or: [
        { endDate: null },
        { endDate: { $gte: now } }
      ]
    }).sort({ sortOrder: 1, createdAt: -1 });

    res.json({ success: true, banners });
  } catch (error) {
    console.error('Loi tai banner customer:', error);
    res.status(500).json({ success: false, message: 'Loi may chu khi tai banner.' });
  }
};

exports.getAdminBanners = async (req, res) => {
  try {
    const banners = await Banner.find()
      .populate('createdBy', 'name username')
      .sort({ sortOrder: 1, createdAt: -1 });

    res.json({ success: true, banners });
  } catch (error) {
    console.error('Loi tai banner admin:', error);
    res.status(500).json({ success: false, message: 'Loi may chu khi tai danh sach banner.' });
  }
};

exports.createBanner = async (req, res) => {
  try {
    const payload = normalizeBannerPayload(req.body, req.file);
    const validationError = validateBannerPayload(payload);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const banner = new Banner({
      ...payload,
      createdBy: req.user?.id
    });
    await banner.save();

    res.status(201).json({ success: true, message: 'Them banner thanh cong.', banner });
  } catch (error) {
    console.error('Loi tao banner:', error);
    res.status(500).json({ success: false, message: 'Loi may chu khi tao banner.' });
  }
};

exports.updateBanner = async (req, res) => {
  try {
    const payload = normalizeBannerPayload(req.body, req.file);
    const validationError = validateBannerPayload(payload);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const banner = await Banner.findByIdAndUpdate(req.params.id, payload, { new: true });
    if (!banner) {
      return res.status(404).json({ success: false, message: 'Khong tim thay banner.' });
    }

    res.json({ success: true, message: 'Cap nhat banner thanh cong.', banner });
  } catch (error) {
    console.error('Loi cap nhat banner:', error);
    res.status(500).json({ success: false, message: 'Loi may chu khi cap nhat banner.' });
  }
};

exports.toggleBanner = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    if (!banner) {
      return res.status(404).json({ success: false, message: 'Khong tim thay banner.' });
    }

    banner.isActive = !banner.isActive;
    await banner.save();

    res.json({ success: true, message: 'Cap nhat trang thai banner thanh cong.', banner });
  } catch (error) {
    console.error('Loi an hien banner:', error);
    res.status(500).json({ success: false, message: 'Loi may chu khi cap nhat trang thai banner.' });
  }
};

exports.deleteBanner = async (req, res) => {
  try {
    const banner = await Banner.findByIdAndDelete(req.params.id);
    if (!banner) {
      return res.status(404).json({ success: false, message: 'Khong tim thay banner.' });
    }

    res.json({ success: true, message: 'Xoa banner thanh cong.' });
  } catch (error) {
    console.error('Loi xoa banner:', error);
    res.status(500).json({ success: false, message: 'Loi may chu khi xoa banner.' });
  }
};
