const Notification = require('../models/Notification');
const { emitToUser, emitToStaff, emitToAdmin } = require('../socket');

/**
 * Tạo thông báo lưu vào MongoDB và phát sự kiện realtime đến Room Socket.IO tương ứng.
 * 
 * @param {Object} params
 * @param {String} params.userId - Gửi cho Customer cụ thể (Object ID hoặc String)
 * @param {String} params.roleTarget - Gửi cho nhóm quyền hạn ('admin' | 'staff' | null)
 * @param {String} params.type - Loại thông báo ('order' | 'wallet' | 'withdraw' | 'stock' | 'dispute')
 * @param {String} params.title - Tiêu đề thông báo
 * @param {String} params.message - Nội dung thông báo chi tiết
 * @param {String} params.link - Đường dẫn điều hướng ở Frontend
 * @param {Object} params.metadata - Siêu dữ liệu bổ sung
 */
const createNotificationAndEmit = async ({
  userId = null,
  roleTarget = null,
  type,
  title,
  message,
  link = '',
  metadata = {}
}) => {
  try {
    // 1. Lưu thông báo vào MongoDB
    const notification = await Notification.create({
      userId,
      roleTarget,
      type,
      title,
      message,
      link,
      metadata
    });

    const payload = {
      success: true,
      notification
    };

    // 2. Phát tín hiệu realtime qua Socket.IO tới đúng Room đối tượng thụ nhận
    if (userId) {
      // Gửi cho Customer hoặc cá nhân Staff/Admin cụ thể
      emitToUser(userId.toString(), 'notification:new', payload);
    }

    if (roleTarget === 'staff') {
      // Gửi cho nhóm Nhân viên & Admin
      emitToStaff('notification:new', payload);
    } else if (roleTarget === 'admin') {
      // Gửi cho nhóm Admin tối cao
      emitToAdmin('notification:new', payload);
    }

    return notification;
  } catch (error) {
    console.error('⚠️ Thất bại khi tạo/phát thông báo realtime:', error);
    // Trả về null thay vì crash luồng chính của controller
    return null;
  }
};

/**
 * Kiểm tra tồn kho của sản phẩm, nếu dưới hoặc bằng 5 sẽ gửi cảnh báo tới Admin và Staff (chống spam).
 * 
 * @param {Object} product - Đối tượng Product nguyên bản
 */
const checkAndEmitLowStockNotification = async (product) => {
  try {
    const productId = product._id.toString();
    const stock = product.stock;

    if (stock <= 5) {
      // Tìm xem đã có thông báo chưa đọc nào thuộc loại cảnh báo kho (stock) cho sản phẩm này chưa
      const existing = await Notification.findOne({
        type: 'stock',
        'metadata.productId': productId,
        isRead: false
      });

      if (!existing) {
        // 1. Gửi thông báo cho Staff (Link: /staff)
        await createNotificationAndEmit({
          roleTarget: 'staff',
          type: 'stock',
          title: 'Sản phẩm sắp hết hàng',
          message: `Sản phẩm "${product.name}" chỉ còn lại ${stock} chiếc trong kho.`,
          link: '/staff',
          metadata: { productId }
        });

        // 2. Gửi thông báo cho Admin (Link: /admin/products)
        await createNotificationAndEmit({
          roleTarget: 'admin',
          type: 'stock',
          title: 'Sản phẩm sắp hết hàng',
          message: `Sản phẩm "${product.name}" chỉ còn lại ${stock} chiếc trong kho. Vui lòng nhập sỉ bổ sung!`,
          link: '/admin/products',
          metadata: { productId }
        });
      }
    }
  } catch (error) {
    console.error('⚠️ Lỗi kiểm tra cảnh báo tồn kho thấp:', error);
  }
};

module.exports = {
  createNotificationAndEmit,
  checkAndEmitLowStockNotification
};
