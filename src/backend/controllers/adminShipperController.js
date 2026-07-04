const Order = require('../models/Order');
const User = require('../models/User');
const { createNotificationAndEmit } = require('../utils/notificationHelper');
const { emitToUser, emitToStaff, emitToAdmin } = require('../socket');

// 1. API getPendingOrders: Lấy danh sách đơn cần phân công đi giao (status: 'processing' và shipperId chưa có)
exports.getPendingOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      status: 'processing',
      $or: [
        { shipperId: null },
        { shipperId: '' }
      ]
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      orders
    });
  } catch (error) {
    console.error('Lỗi lấy đơn hàng chờ phân công:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy đơn hàng chờ phân công!' });
  }
};

// 2. API getShippersList: Truy vấn bảng User tìm danh sách tài khoản có role: 3 (Shipper)
exports.getShippersList = async (req, res) => {
  try {
    // Tìm các User có role === 3
    const shippers = await User.find({ role: 3 }, 'username name phone email');

    res.json({
      success: true,
      shippers
    });
  } catch (error) {
    console.error('Lỗi lấy danh sách shipper:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách shipper!' });
  }
};

// 3. API assignShipper: Nhận orderId và shipperUsername, cập nhật vào đơn hàng
exports.assignShipper = async (req, res) => {
  try {
    const { orderId, shipperUsername } = req.body;

    if (!orderId || !shipperUsername) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp mã đơn hàng và tài khoản Shipper!' });
    }

    // Kiểm tra shipper có tồn tại và đúng role không
    const shipper = await User.findOne({ username: shipperUsername, role: 3 });
    if (!shipper) {
      return res.status(404).json({ success: false, message: 'Shipper không tồn tại hoặc không hợp lệ!' });
    }

    // Tìm đơn hàng
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng!' });
    }

    if (order.status !== 'processing') {
      return res.status(400).json({ success: false, message: 'Đơn hàng phải ở trạng thái "Đang xử lý" để phân công vận chuyển!' });
    }

    // Cập nhật thông tin phân công
    order.shipperId = shipperUsername;
    // Trạng thái status vẫn giữ nguyên 'processing' (chỉ đổi sang 'shipping' sau khi shipper quét QR xác nhận nhận hàng)
    order.codStatus = order.paymentMethod === 'cod' ? 'pending' : 'no_cod';

    await order.save();

    // Tạo thông báo cho shipper (nếu shipper online hoặc lưu trong DB)
    await createNotificationAndEmit({
      userId: shipper._id,
      type: 'delivery',
      title: 'Đơn hàng mới được phân công',
      message: `Bạn được phân công giao đơn hàng ${order.orderCode} đến khách hàng ${order.customerInfo.name}.`,
      link: '/shipper/dashboard'
    });

    // Phát socket tín hiệu realtime cho Shipper, Staff và Admin
    emitToUser(shipper._id.toString(), 'order:assigned', { id: order._id, orderCode: order.orderCode });
    emitToStaff('order:statusChanged', { id: order._id, orderCode: order.orderCode, status: order.status });
    emitToAdmin('order:statusChanged', { id: order._id, orderCode: order.orderCode, status: order.status });

    res.json({
      success: true,
      message: `Đã phân công đơn hàng ${order.orderCode} thành công cho shipper ${shipper.name || shipperUsername}!`,
      order
    });
  } catch (error) {
    console.error('Lỗi phân công shipper:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi phân công giao hàng!' });
  }
};

// 4. API getReconciliationRequests: Tìm đơn pending_reconciliation và gom nhóm theo shipperId
exports.getReconciliationRequests = async (req, res) => {
  try {
    const requests = await Order.aggregate([
      // Lọc các đơn đang chờ đối soát
      {
        $match: {
          codStatus: 'pending_reconciliation'
        }
      },
      // Lookup sang collection users để lấy thông tin shipper (vì shipperId lưu username)
      {
        $lookup: {
          from: 'users',
          localField: 'shipperId',
          foreignField: 'username',
          as: 'shipperInfo'
        }
      },
      // Giải nén mảng shipperInfo
      {
        $unwind: {
          path: '$shipperInfo',
          preserveNullAndEmptyArrays: true
        }
      },
      // Gom nhóm theo shipperId (username của shipper)
      {
        $group: {
          _id: '$shipperId',
          shipperName: { $first: { $ifNull: ['$shipperInfo.name', '$_id'] } },
          shipperPhone: { $first: '$shipperInfo.phone' },
          orderCount: { $sum: 1 },
          totalCod: { $sum: '$total' },
          orders: {
            $push: {
              _id: '$_id',
              orderCode: '$orderCode',
              total: '$total',
              customerName: '$customerInfo.name',
              paymentMethod: '$paymentMethod',
              createdAt: '$createdAt'
            }
          }
        }
      },
      // Sắp xếp theo tổng tiền nhiều nhất
      {
        $sort: { totalCod: -1 }
      }
    ]);

    res.json({
      success: true,
      requests
    });
  } catch (error) {
    console.error('Lỗi lấy danh sách đối soát:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách đối soát!' });
  }
};

// 5. API approveReconciliation: Nhận vào shipperUsername, duyệt toàn bộ đơn chờ đối soát của Shipper này
exports.approveReconciliation = async (req, res) => {
  try {
    const { shipperUsername } = req.body;

    if (!shipperUsername) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp tài khoản Shipper để duyệt đối soát!' });
    }

    // Tìm các đơn hàng pending_reconciliation của shipper này
    const pendingOrders = await Order.find({
      shipperId: shipperUsername,
      codStatus: 'pending_reconciliation'
    });

    if (pendingOrders.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng chờ đối soát nào của shipper này!' });
    }

    const totalApprovedAmount = pendingOrders.reduce((sum, order) => sum + order.total, 0);

    // Cập nhật trạng thái dòng tiền sang 'reconciled' và đổi status đơn hàng sang 'completed' (hoặc giữ shipped)
    // Tùy theo luồng nghiệp vụ, nộp tiền xong thì đơn COD coi như hoàn tất (completed)
    const orderIds = pendingOrders.map(o => o._id);
    await Order.updateMany(
      { _id: { $in: orderIds } },
      { 
        $set: { 
          codStatus: 'reconciled',
          status: 'completed' // Chuyển đổi trạng thái đơn hàng sang hoàn tất
        } 
      }
    );

    // Tìm thông tin shipper để gửi thông báo
    const shipper = await User.findOne({ username: shipperUsername });
    if (shipper) {
      await createNotificationAndEmit({
        userId: shipper._id,
        type: 'reconciliation',
        title: 'Đã duyệt đối soát tiền mặt',
        message: `Admin đã duyệt đối soát thành công số tiền ${totalApprovedAmount.toLocaleString('vi-VN')}đ cho ${pendingOrders.length} đơn hàng của bạn.`,
        link: '/shipper/dashboard'
      });
      
      // Phát socket báo shipper cập nhật lại màn hình
      emitToUser(shipper._id.toString(), 'reconciliation:approved', { totalApprovedAmount });
    }

    // Báo Staff & Admin cập nhật realtime
    emitToStaff('order:statusChanged', { message: `Duyệt đối soát cho shipper ${shipperUsername}` });
    emitToAdmin('order:statusChanged', { message: `Duyệt đối soát cho shipper ${shipperUsername}` });

    res.json({
      success: true,
      message: `Đã duyệt nộp tiền đối soát thành công số tiền ${totalApprovedAmount.toLocaleString('vi-VN')}đ của shipper ${shipperUsername}!`,
      approvedCount: pendingOrders.length,
      totalApprovedAmount
    });
  } catch (error) {
    console.error('Lỗi duyệt đối soát shipper:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi duyệt đối soát!' });
  }
};

// 6. API rejectReconciliation: Từ chối đối soát dòng tiền của Shipper này (hoàn lại trạng thái pending_submission)
exports.rejectReconciliation = async (req, res) => {
  try {
    const { shipperUsername } = req.body;

    if (!shipperUsername) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp tài khoản Shipper để từ chối đối soát!' });
    }

    // Tìm các đơn hàng pending_reconciliation của shipper này
    const pendingOrders = await Order.find({
      shipperId: shipperUsername,
      codStatus: 'pending_reconciliation'
    });

    if (pendingOrders.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng chờ đối soát nào của shipper này!' });
    }

    const totalRejectedAmount = pendingOrders.reduce((sum, order) => sum + order.total, 0);

    // Hoàn lại trạng thái dòng tiền sang 'pending_submission' và giữ status đơn hàng là 'shipped'
    const orderIds = pendingOrders.map(o => o._id);
    await Order.updateMany(
      { _id: { $in: orderIds } },
      { 
        $set: { 
          codStatus: 'pending_submission',
          status: 'shipped'
        } 
      }
    );

    // Tìm thông tin shipper để gửi thông báo
    const shipper = await User.findOne({ username: shipperUsername });
    if (shipper) {
      await createNotificationAndEmit({
        userId: shipper._id,
        type: 'reconciliation',
        title: 'Bị từ chối đối soát tiền mặt',
        message: `Admin đã từ chối đối soát số tiền ${totalRejectedAmount.toLocaleString('vi-VN')}đ của bạn. Vui lòng kiểm tra lại tiền mặt bàn giao.`,
        link: '/shipper/dashboard'
      });
      
      // Phát socket báo shipper cập nhật lại màn hình
      emitToUser(shipper._id.toString(), 'reconciliation:rejected', { totalRejectedAmount });
    }

    // Báo Staff & Admin cập nhật realtime
    emitToStaff('order:statusChanged', { message: `Từ chối đối soát cho shipper ${shipperUsername}` });
    emitToAdmin('order:statusChanged', { message: `Từ chối đối soát cho shipper ${shipperUsername}` });

    res.json({
      success: true,
      message: `Đã từ chối nộp tiền đối soát số tiền ${totalRejectedAmount.toLocaleString('vi-VN')}đ của shipper ${shipperUsername}! Trạng thái đơn đã hoàn về Đã giao (Chờ nộp tiền).`,
      rejectedCount: pendingOrders.length,
      totalRejectedAmount
    });
  } catch (error) {
    console.error('Lỗi từ chối đối soát shipper:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi từ chối đối soát!' });
  }
};
