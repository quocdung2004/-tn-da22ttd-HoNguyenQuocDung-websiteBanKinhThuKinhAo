const Notification = require('../models/Notification');

// 1. GET /api/notifications (Tải thông báo mới nhất phân quyền bảo mật)
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role; // 1: Admin, 2: Staff, 0: Customer

    let filter = {};

    if (role === 1) {
      // Admin: Nhận tất cả thông báo của chính mình, thông báo role Target admin hoặc staff
      filter = {
        $or: [
          { userId },
          { roleTarget: 'admin' },
          { roleTarget: 'staff' }
        ]
      };
    } else if (role === 2) {
      // Staff: Nhận thông báo của chính mình, hoặc target là staff
      filter = {
        $or: [
          { userId },
          { roleTarget: 'staff' }
        ]
      };
    } else {
      // Customer: Chỉ được nhận thông báo gửi trực tiếp qua userId của họ (BOLA tuyệt đối)
      filter = { userId };
    }

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      notifications
    });
  } catch (error) {
    console.error('Lỗi khi lấy danh sách thông báo:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống khi tải thông báo!' });
  }
};

// 2. PUT /api/notifications/:id/read (Đánh dấu đã đọc thông báo đơn lẻ)
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const role = req.user.role;

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông báo!' });
    }

    // Bảo mật BOLA & Phân quyền
    let isAuthorized = false;
    if (notification.userId && notification.userId.toString() === userId.toString()) {
      isAuthorized = true;
    } else if (notification.roleTarget === 'staff' && (role === 1 || role === 2)) {
      isAuthorized = true;
    } else if (notification.roleTarget === 'admin' && role === 1) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return res.status(403).json({ success: false, message: 'Từ chối truy cập! Bạn không có quyền đọc thông báo này.' });
    }

    notification.isRead = true;
    await notification.save();

    res.json({
      success: true,
      message: 'Đã đánh dấu đã đọc thông báo!',
      notification
    });
  } catch (error) {
    console.error('Lỗi khi đánh dấu đọc thông báo:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống khi xử lý thông báo!' });
  }
};

// 3. PUT /api/notifications/read-all (Đánh dấu tất cả thông báo đã đọc)
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    let filter = {};

    if (role === 1) {
      filter = {
        $or: [
          { userId },
          { roleTarget: 'admin' },
          { roleTarget: 'staff' }
        ]
      };
    } else if (role === 2) {
      filter = {
        $or: [
          { userId },
          { roleTarget: 'staff' }
        ]
      };
    } else {
      filter = { userId };
    }

    // Đánh dấu tất cả là đã đọc
    await Notification.updateMany(
      { ...filter, isRead: false },
      { $set: { isRead: true } }
    );

    res.json({
      success: true,
      message: 'Đã đánh dấu tất cả thông báo là đã đọc thành công!'
    });
  } catch (error) {
    console.error('Lỗi khi đánh dấu đọc tất cả thông báo:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống khi xử lý đọc tất cả!' });
  }
};
