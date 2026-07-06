const Order = require('../models/Order');

/**
 * 1. API Lấy "Chợ đơn hàng" (getAvailableOrders)
 * Tìm tất cả các Order có status: 'processing' và chưa có shipperId.
 * Sắp xếp theo thời gian tạo cũ nhất lên đầu.
 */
exports.getAvailableOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      status: 'processing',
      $or: [
        { shipperId: null },
        { shipperId: { $exists: false } }
      ]
    }).sort({ createdAt: 1 });

    res.status(200).json({
      success: true,
      data: orders
    });
  } catch (error) {
    console.error('Lỗi khi lấy chợ đơn hàng:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi lấy danh sách đơn hàng chợ!'
    });
  }
};

/**
 * 2. API Shipper tự nhận đơn (claimOrder)
 * Tìm đơn hàng có _id: orderId, status: 'processing', và chưa có shipperId để cập nhật nguyên tử.
 */
exports.claimOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const shipperId = req.user.id; // Lấy từ verifyToken middleware

    // Cập nhật nguyên tử đề phòng tranh chấp (Race Condition)
    const order = await Order.findOneAndUpdate(
      {
        _id: orderId,
        status: 'processing',
        $or: [
          { shipperId: null },
          { shipperId: { $exists: false } }
        ]
      },
      {
        $set: {
          shipperId: shipperId,
          status: 'shipping'
        }
      },
      { new: true }
    );

    if (!order) {
      return res.status(400).json({
        success: false,
        message: 'Đơn hàng không khả dụng hoặc đã có Shipper khác nhận trước!'
      });
    }

    // Phát tín hiệu Socket.IO để thông báo cho Staff và Admin cập nhật UI realtime
    try {
      const { emitToStaff, emitToAdmin } = require('../socket');
      emitToStaff('order:statusChanged', { id: order._id, orderCode: order.orderCode, status: 'shipping' });
      emitToAdmin('order:statusChanged', { id: order._id, orderCode: order.orderCode, status: 'shipping' });
    } catch (socketError) {
      console.warn('[Socket.IO] Lỗi emit khi nhận đơn:', socketError.message);
    }

    res.status(200).json({
      success: true,
      message: 'Nhận đơn hàng đi giao thành công!',
      data: order
    });
  } catch (error) {
    console.error('Lỗi khi nhận đơn hàng:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi nhận đơn hàng!'
    });
  }
};

/**
 * 3. API Lấy "Đơn đang giao của tôi" (getMyDeliveries)
 * Tìm tất cả Order có shipperId khớp và status trong ['shipping', 'shipped'].
 */
exports.getMyDeliveries = async (req, res) => {
  try {
    const shipperId = req.user.id; // Lấy từ verifyToken middleware

    const orders = await Order.find({
      shipperId: shipperId,
      status: { $in: ['shipping', 'shipped'] }
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: orders
    });
  } catch (error) {
    console.error('Lỗi khi lấy đơn hàng đang giao:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi lấy danh sách đơn đang giao!'
    });
  }
};
