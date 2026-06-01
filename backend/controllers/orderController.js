const Order = require('../models/Order');
const Product = require('../models/Product');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const User = require('../models/User');
const { createNotificationAndEmit, checkAndEmitLowStockNotification } = require('../utils/notificationHelper');
const { emitToUser, emitToStaff, emitToAdmin, getIO } = require('../socket');

// Helper tự động lấy hoặc tạo ví mới cho khách hàng
const getOrCreateWallet = async (userId) => {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = new Wallet({ userId, balance: 0, lockedBalance: 0 });
    await wallet.save();
  }
  return wallet;
};

// [POST] Tạo Đơn hàng mới
exports.createOrder = async (req, res) => {
  try {
    const { orderCode, username, customerInfo, items, total, paymentMethod, status } = req.body;

    // 1. Kiểm tra mã đơn hàng đã tồn tại chưa
    const existingOrder = await Order.findOne({ orderCode });
    if (existingOrder) {
      return res.status(400).json({ success: false, message: 'Mã đơn hàng này đã tồn tại!' });
    }

    // 2. Lấy giá nhập (importPrice) hiện tại từ Product và trừ tồn kho
    const enrichedItems = [];
    for (const item of items) {
      const product = await Product.findById(item.productId);
      let importPriceAtPurchase = 0;
      if (product) {
        importPriceAtPurchase = product.importPrice || 0;
        // Khấu trừ tồn kho của sản phẩm
        product.stock = Math.max(0, product.stock - item.quantity);
        await product.save();

        // ================= REALTIME STOCK INTEGRATION =================
        // Phát tín hiệu cập nhật tồn kho sỉ/lẻ
        getIO().emit('product:stockUpdated', {
          productId: product._id.toString(),
          stock: product.stock,
          reason: 'order_created'
        });
        // Kiểm tra và gửi cảnh báo tồn kho thấp (stock <= 5)
        await checkAndEmitLowStockNotification(product);
        // ===============================================================
      }
      enrichedItems.push({
        productId: item.productId,
        quantity: item.quantity,
        priceAtPurchase: item.priceAtPurchase || item.price || 0,
        importPriceAtPurchase: importPriceAtPurchase,
        hasPrescription: item.hasPrescription || false,
        od: item.od || '',
        os: item.os || ''
      });
    }

    // 3. Tạo đơn hàng mới
    const newOrder = new Order({
      orderCode,
      username: username || req.user?.username || null, // Lấy username từ req.body hoặc token giải mã
      customerInfo,
      items: enrichedItems,
      total,
      paymentMethod,
      status: status || 'pending'
    });

    await newOrder.save();

    // ================= REALTIME INTEGRATION (PHASE 4) =================
    const customerName = customerInfo?.name || username || 'Khách vãng lai';
    
    // Gửi thông báo DB + Socket cho nhóm Staff và Admin quản trị đơn
    await createNotificationAndEmit({
      roleTarget: 'staff',
      type: 'order',
      title: 'Có đơn hàng mới',
      message: `Khách hàng ${customerName} vừa đặt thành công đơn hàng mới ${orderCode}`,
      link: '/staff'
    });

    await createNotificationAndEmit({
      roleTarget: 'admin',
      type: 'order',
      title: 'Có đơn hàng mới',
      message: `Khách hàng ${customerName} vừa đặt thành công đơn hàng mới ${orderCode}`,
      link: '/admin'
    });

    // Phát Socket signal báo tải lại danh sách đơn hàng cho Staff và Admin
    emitToStaff('order:new', { id: newOrder._id, orderCode });
    emitToAdmin('order:new', { id: newOrder._id, orderCode });
    // ==================================================================

    res.status(201).json({ success: true, message: 'Đơn hàng đã được ghi nhận thành công!', order: newOrder });

  } catch (error) {
    console.error('Lỗi tạo Đơn hàng:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tạo đơn hàng!' });
  }
};

// [GET] Lấy danh sách Đơn hàng (Dành cho Admin/Staff)
exports.getOrders = async (req, res) => {
  try {
    const isStaff = req.user?.role === 2;

    // Populate lấy đầy đủ thông tin sản phẩm và hãng
    const orders = await Order.find()
      .populate({
        path: 'items.productId',
        select: 'name images price brand category',
        populate: [
          { path: 'brand', select: 'name' },
          { path: 'category', select: 'name' }
        ]
      })
      .sort({ createdAt: -1 });

    // Bảo mật: Nếu là Staff, ẩn toàn bộ importPriceAtPurchase khỏi phản hồi JSON thô
    const sanitizedOrders = orders.map(order => {
      const orderObj = order.toObject();
      if (isStaff) {
        orderObj.items = orderObj.items.map(item => {
          delete item.importPriceAtPurchase;
          return item;
        });
      }
      return orderObj;
    });

    res.json({ success: true, orders: sanitizedOrders });
  } catch (error) {
    console.error('Lỗi lấy danh sách Đơn hàng:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tải đơn hàng!' });
  }
};

// [GET] Lấy danh sách đơn hàng cá nhân của Customer đăng nhập
exports.getMyOrders = async (req, res) => {
  try {
    const username = req.user?.username;
    if (!username) {
      return res.status(400).json({ success: false, message: 'Không thể xác định danh tính tài khoản!' });
    }

    const orders = await Order.find({ username })
      .populate({
        path: 'items.productId',
        select: 'name images price brand category',
        populate: [
          { path: 'brand', select: 'name' },
          { path: 'category', select: 'name' }
        ]
      })
      .sort({ createdAt: -1 });

    // Customer xem đơn của họ thì không trả về importPriceAtPurchase
    const sanitizedOrders = orders.map(order => {
      const orderObj = order.toObject();
      orderObj.items = orderObj.items.map(item => {
        delete item.importPriceAtPurchase;
        return item;
      });
      return orderObj;
    });

    res.json({ success: true, orders: sanitizedOrders });
  } catch (error) {
    console.error('Lỗi lấy danh sách Đơn hàng cá nhân:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tải lịch sử đơn hàng!' });
  }
};

// [GET] Xem chi tiết đơn hàng cá nhân hoặc quản trị (Bảo mật Ownership tối ưu)
exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id)
      .populate({
        path: 'items.productId',
        select: 'name images price brand category',
        populate: [
          { path: 'brand', select: 'name' },
          { path: 'category', select: 'name' }
        ]
      });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng!' });
    }

    // Kiểm tra quyền sở hữu hoặc quyền quản trị
    const isAdminOrStaff = req.user?.role === 1 || req.user?.role === 2;
    const isOwner = order.username && order.username === req.user?.username;

    if (!isAdminOrStaff && !isOwner) {
      return res.status(403).json({ success: false, message: 'Từ chối quyền truy cập! Bạn không sở hữu đơn hàng này.' });
    }

    // Bảo mật: Khách hàng thường hoặc Nhân viên Staff không được xem giá nhập sỉ
    const orderObj = order.toObject();
    const isStaff = req.user?.role === 2;
    const isCustomer = req.user?.role === 0;

    if (isStaff || isCustomer) {
      orderObj.items = orderObj.items.map(item => {
        delete item.importPriceAtPurchase;
        return item;
      });
    }

    res.json({ success: true, order: orderObj });
  } catch (error) {
    console.error('Lỗi tải chi tiết đơn hàng:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tải chi tiết đơn!' });
  }
};

// [PUT] Cập nhật Trạng thái Đơn hàng (Dành cho Admin/Staff)
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status: newStatus, cancelReason } = req.body;
    const { id } = req.params; // ID của đơn hàng trong MongoDB (_id)

    // 1. Tìm đơn hàng
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng!' });
    }

    const oldStatus = order.status;

    // 2. Phân quyền: Staff (role 2) bắt buộc phải cập nhật theo luồng hợp lệ
    if (req.user?.role === 2) {
      const isValidTransition = (
        (oldStatus === 'pending' && newStatus === 'processing') ||
        (oldStatus === 'paid' && newStatus === 'processing') ||
        (oldStatus === 'processing' && newStatus === 'shipping') ||
        (oldStatus === 'shipping' && newStatus === 'completed') ||
        (['pending', 'paid', 'processing'].includes(oldStatus) && newStatus === 'cancelled')
      );

      if (!isValidTransition && oldStatus !== newStatus) {
        return res.status(400).json({
          success: false,
          message: `Nhân viên không được chuyển đổi trạng thái bất hợp lệ từ '${oldStatus}' sang '${newStatus}'!`
        });
      }
    }

    // Ràng buộc nhập lý do hủy đơn đối với trạng thái cancelled
    if (newStatus === 'cancelled') {
      if (!cancelReason || !cancelReason.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Bắt buộc phải cung cấp lý do chi tiết khi thực hiện hủy đơn hàng!'
        });
      }
      order.cancelReason = cancelReason.trim();
    }

    // 3. Xử lý hoàn trả tồn kho (stock) khi hủy đơn
    // Chỉ hoàn stock nếu đơn hàng chuyển sang 'cancelled' và trước đó chưa bị hủy (an toàn, tránh double recovery)
    if (newStatus === 'cancelled' && oldStatus !== 'cancelled') {
      if (!order.stockRestored) {
        for (const item of order.items) {
          const product = await Product.findById(item.productId);
          if (product) {
            product.stock = (product.stock || 0) + item.quantity;
            await product.save();

            // ================= REALTIME STOCK INTEGRATION =================
            getIO().emit('product:stockUpdated', {
              productId: product._id.toString(),
              stock: product.stock,
              reason: 'order_cancelled'
            });
            await checkAndEmitLowStockNotification(product);
            // ===============================================================
          }
        }
        order.stockRestored = true;
      }
    }

    // 4. Lưu lại trạng thái mới
    order.status = newStatus;
    await order.save();

    // ================= REALTIME INTEGRATION (PHASE 4) =================
    // 1. Tạo thông báo lưu DB cho chủ sở hữu đơn hàng
    if (order.username) {
      const targetUser = await User.findOne({ username: order.username });
      if (targetUser) {
        let title = 'Trạng thái đơn hàng đã cập nhật';
        let message = `Đơn hàng ${order.orderCode} đã được cập nhật trạng thái mới.`;

        if (newStatus === 'cancelled') {
          title = 'Đơn hàng của bạn đã bị HỦY';
          message = `Đơn hàng ${order.orderCode} đã bị hủy. Lý do: ${order.cancelReason}`;
        } else {
          const getStatusText = (st) => {
            switch (st) {
              case 'pending': return 'chờ xác nhận';
              case 'paid': return 'đã thanh toán';
              case 'processing': return 'đang xử lý';
              case 'shipping': return 'đang giao hàng';
              case 'shipped': return 'đã giao hàng';
              case 'completed': return 'hoàn tất';
              default: return st;
            }
          };
          message = `Đơn hàng ${order.orderCode} đã chuyển sang trạng thái: ${getStatusText(newStatus)}`;
        }

        await createNotificationAndEmit({
          userId: targetUser._id,
          type: 'order',
          title,
          message,
          link: '/my-orders'
        });

        // Phát Socket tới riêng khách hàng sở hữu đơn
        emitToUser(targetUser._id.toString(), 'order:statusChanged', { id: order._id, orderCode: order.orderCode, status: newStatus });
      }
    }

    // 2. Phát Socket signal cho Staff và Admin đồng bộ danh sách quản lý
    emitToStaff('order:statusChanged', { id: order._id, orderCode: order.orderCode, status: newStatus });
    emitToAdmin('order:statusChanged', { id: order._id, orderCode: order.orderCode, status: newStatus });
    // ==================================================================

    // Bảo mật: Nếu là Staff, ẩn toàn bộ importPriceAtPurchase khỏi phản hồi JSON thô để giữ bí mật giá sỉ
    const orderObj = order.toObject();
    if (req.user?.role === 2) {
      orderObj.items = orderObj.items.map(item => {
        delete item.importPriceAtPurchase;
        return item;
      });
    }

    res.json({ success: true, message: 'Cập nhật trạng thái đơn hàng thành công!', order: orderObj });
  } catch (error) {
    console.error('Lỗi cập nhật trạng thái Đơn hàng:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật trạng thái đơn!' });
  }
};

// ==================== HỆ THỐNG HỦY ĐƠN & HOÀN TIỀN (PHASE 1) ====================

// [POST] Khách hàng tự hủy hoặc gửi yêu cầu hủy đơn hàng
exports.requestOrderCancel = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const isStaff = req.user?.role === 2;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng!' });
    }

    // Bảo mật: Chống hack chéo đơn hàng (BOLA)
    if (order.username !== req.user?.username) {
      return res.status(403).json({ success: false, message: 'Từ chối truy cập! Bạn không sở hữu đơn hàng này.' });
    }

    const status = order.status;
    if (['cancelled', 'completed', 'shipping', 'shipped', 'cancel_requested'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Trạng thái đơn hàng không khả dụng để gửi yêu cầu hủy!' });
    }

    // 1. COD tự hủy trực tiếp trong vòng 5 phút đầu
    if (status === 'pending' && order.paymentMethod === 'cod') {
      const timeDiff = Date.now() - new Date(order.createdAt).getTime();
      if (timeDiff <= 5 * 60 * 1000) { // 5 phút
        order.status = 'cancelled';
        
        // Hoàn tồn kho an toàn
        if (!order.stockRestored) {
          for (const item of order.items) {
            const product = await Product.findById(item.productId);
            if (product) {
              product.stock = (product.stock || 0) + item.quantity;
              await product.save();

              // ================= REALTIME STOCK INTEGRATION =================
              getIO().emit('product:stockUpdated', {
                productId: product._id.toString(),
                stock: product.stock,
                reason: 'order_cancelled'
              });
              await checkAndEmitLowStockNotification(product);
              // ===============================================================
            }
          }
          order.stockRestored = true;
        }

        await order.save();

        // ================= REALTIME INTEGRATION (PHASE 4) =================
        // Hủy trực tiếp COD -> phát Socket signal trạng thái thay đổi
        if (req.user?.id) {
          emitToUser(req.user.id.toString(), 'order:statusChanged', { id: order._id, orderCode: order.orderCode, status: 'cancelled' });
        }
        emitToStaff('order:statusChanged', { id: order._id, orderCode: order.orderCode, status: 'cancelled' });
        emitToAdmin('order:statusChanged', { id: order._id, orderCode: order.orderCode, status: 'cancelled' });
        // ==================================================================

        const orderObj = order.toObject();
        if (isStaff) {
          orderObj.items = orderObj.items.map(item => {
            delete item.importPriceAtPurchase;
            return item;
          });
        }

        return res.json({ success: true, message: 'Tự hủy đơn hàng COD thành công (trong vòng 5 phút đầu)!', order: orderObj });
      }
    }

    // 2. Chuyển đổi trạng thái sang gửi yêu cầu hủy chờ duyệt
    order.previousStatusBeforeCancelRequest = status;
    order.status = 'cancel_requested';
    order.refundStatus = 'pending';
    order.cancelReason = reason || 'Khách hàng yêu cầu hủy đơn';
    order.cancelRequestedAt = new Date();

    await order.save();

    // ================= REALTIME INTEGRATION (PHASE 4) =================
    // Gửi thông báo DB + Realtime cho staff và admin duyệt
    const customerName = order.username || 'Khách hàng';

    await createNotificationAndEmit({
      roleTarget: 'staff',
      type: 'order',
      title: 'Có yêu cầu hủy đơn mới',
      message: `Khách hàng ${customerName} vừa yêu cầu hủy đơn hàng ${order.orderCode}`,
      link: '/staff/cancel-requests'
    });

    await createNotificationAndEmit({
      roleTarget: 'admin',
      type: 'order',
      title: 'Có yêu cầu hủy đơn mới',
      message: `Khách hàng ${customerName} vừa yêu cầu hủy đơn hàng ${order.orderCode}`,
      link: '/admin/cancel-requests'
    });

    // Phát Socket signal yêu cầu hủy đơn
    emitToStaff('order:cancelRequested', { id: order._id, orderCode: order.orderCode });
    emitToAdmin('order:cancelRequested', { id: order._id, orderCode: order.orderCode });
    // ==================================================================

    const orderObj = order.toObject();
    if (isStaff) {
      orderObj.items = orderObj.items.map(item => {
        delete item.importPriceAtPurchase;
        return item;
      });
    }

    res.json({ success: true, message: 'Gửi yêu cầu hủy đơn hàng thành công, vui lòng chờ duyệt!', order: orderObj });

  } catch (error) {
    console.error('Lỗi gửi yêu cầu hủy đơn:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi yêu cầu hủy đơn!' });
  }
};

// [GET] Lấy danh sách các yêu cầu hủy đơn hàng chờ duyệt (Staff/Admin)
exports.getCancelRequests = async (req, res) => {
  try {
    const isStaff = req.user?.role === 2;

    const orders = await Order.find({ status: 'cancel_requested' })
      .populate({
        path: 'items.productId',
        select: 'name images price brand category',
        populate: [
          { path: 'brand', select: 'name' },
          { path: 'category', select: 'name' }
        ]
      })
      .sort({ cancelRequestedAt: -1 });

    // Bảo mật: Ẩn giá gốc sỉ với Staff
    const sanitizedOrders = orders.map(order => {
      const orderObj = order.toObject();
      if (isStaff) {
        orderObj.items = orderObj.items.map(item => {
          delete item.importPriceAtPurchase;
          return item;
        });
      }
      return orderObj;
    });

    res.json({ success: true, orders: sanitizedOrders });
  } catch (error) {
    console.error('Lỗi lấy danh sách yêu cầu hủy đơn:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tải yêu cầu hủy!' });
  }
};

// [POST] Staff/Admin Chấp nhận hoặc Từ chối yêu cầu hủy đơn hàng
exports.handleOrderCancel = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, rejectReason } = req.body; // action: 'approve' hoặc 'reject'
    const isStaff = req.user?.role === 2;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng!' });
    }

    if (order.status !== 'cancel_requested') {
      return res.status(400).json({ success: false, message: 'Đơn hàng không nằm trong trạng thái yêu cầu hủy!' });
    }

    let customerUser = null;
    if (order.username) {
      customerUser = await User.findOne({ username: order.username });
    }

    if (action === 'approve') {
      // --- DUYỆT CHẤP NHẬN HỦY ĐƠN ---
      order.status = 'cancelled';

      // 1. Hoàn trả tồn kho an toàn chống trùng lặp
      if (!order.stockRestored) {
        for (const item of order.items) {
          const product = await Product.findById(item.productId);
          if (product) {
            product.stock = (product.stock || 0) + item.quantity;
            await product.save();

            // ================= REALTIME STOCK INTEGRATION =================
            getIO().emit('product:stockUpdated', {
              productId: product._id.toString(),
              stock: product.stock,
              reason: 'order_cancelled'
            });
            await checkAndEmitLowStockNotification(product);
            // ===============================================================
          }
        }
        order.stockRestored = true;
      }

      // 2. Kiểm tra hoàn tiền cho đơn đã đóng tiền Banking
      const isPaidBefore = ['paid', 'processing'].includes(order.previousStatusBeforeCancelRequest) || order.status === 'paid';
      const isBanking = order.paymentMethod === 'banking';

      if (isBanking && isPaidBefore) {
        // Chỉ hoàn tiền vào ví nếu refundStatus đang là 'pending' (Chống double refund tối đa)
        if (order.refundStatus === 'pending') {
          if (customerUser) {
            const wallet = await getOrCreateWallet(customerUser._id);

            // Cộng tiền số dư khả dụng
            wallet.balance += order.total;
            await wallet.save();

            // Ghi chép lịch sử giao dịch ví
            const transaction = new WalletTransaction({
              walletId: wallet._id,
              userId: customerUser._id,
              amount: order.total,
              balanceAfter: wallet.balance,
              type: 'refund',
              status: 'success',
              referenceId: order._id,
              referenceType: 'Order',
              note: `Hoàn tiền ví nội bộ cho đơn hàng hủy thành công: ${order.orderCode}`
            });
            await transaction.save();

            order.refundStatus = 'wallet_refunded';
          } else {
            order.refundStatus = 'none'; // Dự phòng cho khách vãng lai
          }
        }
      } else {
        // Đơn COD hoặc chưa thanh toán
        order.refundStatus = 'none';
      }

      order.refundHandledBy = req.user?.id;
      order.refundHandledAt = new Date();

      await order.save();

      // ================= REALTIME INTEGRATION (PHASE 4) =================
      if (customerUser) {
        await createNotificationAndEmit({
          userId: customerUser._id,
          type: 'order',
          title: 'Yêu cầu hủy đơn hàng đã được CHẤP NHẬN',
          message: `Yêu cầu hủy đơn hàng ${order.orderCode} đã được phê duyệt và hoàn tiền thành công`,
          link: '/my-orders'
        });

        // Bắn socket cho khách
        emitToUser(customerUser._id.toString(), 'order:cancelHandled', { id: order._id, orderCode: order.orderCode, action: 'approve' });
      }

      // Bắn socket báo staff/admin đồng bộ
      emitToStaff('order:cancelHandled', { id: order._id, orderCode: order.orderCode, action: 'approve' });
      emitToAdmin('order:cancelHandled', { id: order._id, orderCode: order.orderCode, action: 'approve' });
      // ==================================================================

      const orderObj = order.toObject();
      if (isStaff) {
        orderObj.items = orderObj.items.map(item => {
          delete item.importPriceAtPurchase;
          return item;
        });
      }

      return res.json({ success: true, message: 'Đã duyệt chấp nhận hủy đơn và hoàn tiền ví nội bộ thành công!', order: orderObj });

    } else if (action === 'reject') {
      // --- TỪ CHỐI DUYỆT HỦY ĐƠN ---
      if (!rejectReason) {
        return res.status(400).json({ success: false, message: 'Bắt buộc phải cung cấp lý do từ chối hủy đơn!' });
      }

      // Khôi phục trạng thái cũ, fallback nếu bị thiếu previousStatusBeforeCancelRequest
      let fallbackStatus = 'paid';
      if (order.paymentMethod === 'cod') {
        fallbackStatus = 'pending';
      }

      order.status = order.previousStatusBeforeCancelRequest || fallbackStatus;
      order.cancelRejectReason = rejectReason;
      order.refundStatus = 'rejected';
      order.refundHandledBy = req.user?.id;
      order.refundHandledAt = new Date();

      await order.save();

      // ================= REALTIME INTEGRATION (PHASE 4) =================
      if (customerUser) {
        await createNotificationAndEmit({
          userId: customerUser._id,
          type: 'order',
          title: 'Yêu cầu hủy đơn hàng bị TỪ CHỐI',
          message: `Yêu cầu hủy đơn hàng ${order.orderCode} bị từ chối. Lý do: ${rejectReason.trim()}`,
          link: '/my-orders'
        });

        // Bắn socket cho khách
        emitToUser(customerUser._id.toString(), 'order:cancelHandled', { id: order._id, orderCode: order.orderCode, action: 'reject' });
      }

      // Bắn socket báo staff/admin đồng bộ
      emitToStaff('order:cancelHandled', { id: order._id, orderCode: order.orderCode, action: 'reject' });
      emitToAdmin('order:cancelHandled', { id: order._id, orderCode: order.orderCode, action: 'reject' });
      // ==================================================================

      const orderObj = order.toObject();
      if (isStaff) {
        orderObj.items = orderObj.items.map(item => {
          delete item.importPriceAtPurchase;
          return item;
        });
      }

      return res.json({ success: true, message: 'Từ chối yêu cầu hủy đơn hàng thành công!', order: orderObj });

    } else {
      return res.status(400).json({ success: false, message: 'Hành động duyệt hủy không hợp lệ!' });
    }

  } catch (error) {
    console.error('Lỗi xử lý yêu cầu hủy đơn:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xử lý duyệt hủy đơn!' });
  }
};

// [POST] Staff/Admin nhận xử lý đơn hàng (Chuyển sang processing và khóa tự hủy COD)
exports.receiveOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const isStaff = req.user?.role === 2;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng!' });
    }

    if (!['pending', 'paid'].includes(order.status)) {
      return res.status(400).json({ success: false, message: 'Đơn hàng không ở trạng thái sẵn sàng để nhận xử lý!' });
    }

    order.status = 'processing';
    order.processingStartedAt = new Date();
    await order.save();

    // ================= REALTIME INTEGRATION (PHASE 4) =================
    // Nhận xử lý đơn hàng -> đổi trạng thái đơn hàng -> gửi thông báo và Socket signal
    if (order.username) {
      const customerUser = await User.findOne({ username: order.username });
      if (customerUser) {
        await createNotificationAndEmit({
          userId: customerUser._id,
          type: 'order',
          title: 'Trạng thái đơn hàng đã cập nhật',
          message: `Đơn hàng ${order.orderCode} đang được xử lý chuẩn bị gửi hàng`,
          link: '/my-orders'
        });

        // Bắn socket cho khách
        emitToUser(customerUser._id.toString(), 'order:statusChanged', { id: order._id, orderCode: order.orderCode, status: 'processing' });
      }
    }

    // Bắn socket báo staff/admin đồng bộ danh sách đơn hàng
    emitToStaff('order:statusChanged', { id: order._id, orderCode: order.orderCode, status: 'processing' });
    emitToAdmin('order:statusChanged', { id: order._id, orderCode: order.orderCode, status: 'processing' });
    // ==================================================================

    const orderObj = order.toObject();
    if (isStaff) {
      orderObj.items = orderObj.items.map(item => {
        delete item.importPriceAtPurchase;
        return item;
      });
    }

    res.json({ success: true, message: 'Nhân viên đã nhận xử lý đơn hàng thành công!', order: orderObj });

  } catch (error) {
    console.error('Lỗi nhận xử lý đơn hàng:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi nhận xử lý đơn!' });
  }
};
