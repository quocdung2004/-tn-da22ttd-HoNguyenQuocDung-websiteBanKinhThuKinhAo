const Banner = require('../models/Banner');

const normalizeBannerPayload = (body) => {
  const startDate = body.startDate ? new Date(body.startDate) : new Date();
  const endDate = body.endDate ? new Date(body.endDate) : null;

  return {
    title: body.title?.trim(),
    subtitle: body.subtitle?.trim() || '',
    imageUrl: body.imageUrl?.trim(),
    targetUrl: body.targetUrl?.trim() || '/',
    sortOrder: Number(body.sortOrder || 0),
    isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
    startDate,
    endDate
  };
};

const validateBannerPayload = (payload) => {
  if (!payload.title) return 'Vui long nhap tieu de banner.';
  if (!payload.imageUrl) return 'Vui long nhap URL hinh anh banner.';
  if (Number.isNaN(payload.startDate.getTime())) return 'Ngay bat dau khong hop le.';
  if (payload.endDate && Number.isNaN(payload.endDate.getTime())) return 'Ngay ket thuc khong hop le.';
  if (payload.endDate && payload.startDate > payload.endDate) {
    return 'Ngay bat dau phai nho hon hoac bang ngay ket thuc.';
  }
  if (Number.isNaN(payload.sortOrder)) return 'Thu tu hien thi khong hop le.';
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
    const payload = normalizeBannerPayload(req.body);
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
    const payload = normalizeBannerPayload(req.body);
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
