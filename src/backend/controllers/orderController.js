const Order = require('../models/Order');
const jwt = require('jsonwebtoken');
const Product = require('../models/Product');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const User = require('../models/User');
const Sale = require('../models/Sale');
const { createNotificationAndEmit, checkAndEmitLowStockNotification } = require('../utils/notificationHelper');
const { emitToUser, emitToStaff, emitToAdmin, getIO } = require('../socket');
const { resolveProductSalePrice } = require('./productController');
const { buildPaymentCancelToken } = require('../utils/paymentCancelToken');

// Helper tự động lấy hoặc tạo ví mới cho khách hàng
const getOrCreateWallet = async (userId) => {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = new Wallet({ userId, balance: 0, lockedBalance: 0 });
    await wallet.save();
  }
  return wallet;
};

// Helper hoàn trả quota khuyến mãi an toàn khi hủy/thất bại đơn hàng
const restoreSaleQuotaForOrder = async (order) => {
  if (order.quotaRestored) return;
  for (const item of order.items) {
    if (item.saleIdAtPurchase) {
      await Sale.findOneAndUpdate(
        { _id: item.saleIdAtPurchase },
        { $inc: { usedCount: -item.quantity } }
      );
    }
  }
  order.quotaRestored = true;
};

// [POST] Tạo Đơn hàng mới
exports.createOrder = async (req, res) => {
  const reservedStocks = [];
  const reservedSaleQuotas = [];
  let orderPersisted = false;

  const rollbackOrderCreateReservations = async () => {
    if (reservedStocks.length === 0 && reservedSaleQuotas.length === 0) return;

    console.warn('[ORDER_CREATE_ROLLBACK_START]', {
      reservedStocks: reservedStocks.length,
      reservedSaleQuotas: reservedSaleQuotas.length
    });

    for (const reservedStock of reservedStocks) {
      try {
        console.warn('[ORDER_CREATE_STOCK_ROLLBACK]', reservedStock);
        const prod = await Product.findById(reservedStock.productId);
        if (prod) {
          prod.stock = (prod.stock || 0) + reservedStock.quantity;
          prod.soldQuantity = Math.max(0, (prod.soldQuantity || 0) - reservedStock.quantity);
          await prod.save();
        }
      } catch (rollbackError) {
        console.error('[ORDER_CREATE_STOCK_ROLLBACK_FAILED]', {
          productId: reservedStock.productId,
          quantity: reservedStock.quantity,
          error: rollbackError.message
        });
      }
    }

    for (const reservedSaleQuota of reservedSaleQuotas) {
      try {
        console.warn('[ORDER_CREATE_SALE_ROLLBACK]', reservedSaleQuota);
        await Sale.findByIdAndUpdate(reservedSaleQuota.saleId, {
          $inc: { usedCount: -reservedSaleQuota.quantity }
        });
      } catch (rollbackError) {
        console.error('[ORDER_CREATE_SALE_ROLLBACK_FAILED]', {
          saleId: reservedSaleQuota.saleId,
          quantity: reservedSaleQuota.quantity,
          error: rollbackError.message
        });
      }
    }

    reservedStocks.length = 0;
    reservedSaleQuotas.length = 0;
    console.warn('[ORDER_CREATE_ROLLBACK_DONE]');
  };

  try {
    const { orderCode, customerInfo, items, paymentMethod } = req.body;

    // 1. Kiểm tra mã đơn hàng đã tồn tại chưa
    const existingOrder = await Order.findOne({ orderCode });
    if (existingOrder) {
      return res.status(400).json({ success: false, message: 'Mã đơn hàng này đã tồn tại!' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Đơn hàng phải chứa ít nhất 1 sản phẩm!' });
    }

    // 2. PASS 1: Kiểm tra tính hợp lệ của toàn bộ sản phẩm và tồn kho trước khi thực hiện thay đổi
    const productsCache = {};
    for (const item of items) {
      if (!item.productId) {
        return res.status(400).json({ success: false, message: 'Thiếu thông tin ID sản phẩm!' });
      }
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 999) {
        return res.status(400).json({
          success: false,
          message: 'Số lượng sản phẩm không hợp lệ. Số lượng phải là số nguyên từ 1 đến 999.'
        });
      }
      item.quantity = quantity;

      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(400).json({ success: false, message: `Sản phẩm với ID ${item.productId} không tồn tại trên hệ thống!` });
      }
      if (product.isActive === false) {
        return res.status(400).json({ success: false, message: `Sản phẩm kính mắt "${product.name}" hiện đã ngưng kinh doanh!` });
      }
      if (product.stock < item.quantity) {
        return res.status(400).json({ 
          success: false, 
          message: `Sản phẩm "${product.name}" đã hết hàng hoặc không đủ tồn kho (còn lại: ${product.stock}, yêu cầu: ${item.quantity})!` 
        });
      }
      productsCache[item.productId.toString()] = product;
    }

    // 3. PASS 2: Tính toán giá tiền động từ server, trừ tồn kho và tạo đơn
    const enrichedItems = [];
    let calculatedTotal = 0;

    const { getActiveSales } = require('../utils/saleHelper');
    const Sale = require('../models/Sale');
    
    // Tải danh sách chiến dịch khuyến mãi đang hiệu lực để tính toán và chia sẻ quota nội bộ đơn hàng
    const activeSales = await getActiveSales();
    const saleUsageIncrements = {};

    for (const item of items) {
      const product = productsCache[item.productId.toString()];
      const importPriceAtPurchase = product.importPrice || 0;
      
      // GIẢI QUYẾT GIÁ KHUYẾN MÃI DƯỚI SERVER (Tuyệt đối không tin cậy frontend gửi lên, truyền activeSales cache)
      const saleDetails = await resolveProductSalePrice(product, activeSales);
      const finalPriceAtPurchase = saleDetails.salePrice;
      const finalOriginalPriceAtPurchase = saleDetails.originalPrice;
      const finalDiscountAtPurchase = saleDetails.originalPrice - saleDetails.salePrice;
      const finalSaleIdAtPurchase = saleDetails.activeSale ? saleDetails.activeSale._id : null;

      // Cập nhật quota ảo nội bộ trong bản sao activeSales để các item tiếp theo cùng sale nhận biết đúng
      if (finalSaleIdAtPurchase) {
        const saleIdStr = finalSaleIdAtPurchase.toString();
        const localSale = activeSales.find(s => s._id.toString() === saleIdStr);
        if (localSale) {
          localSale.usedCount = (localSale.usedCount || 0) + item.quantity;
        }
        saleUsageIncrements[saleIdStr] = (saleUsageIncrements[saleIdStr] || 0) + item.quantity;
      }

      // Cộng dồn tổng tiền thực tế trên server
      calculatedTotal += finalPriceAtPurchase * item.quantity;

      enrichedItems.push({
        productId: item.productId,
        quantity: item.quantity,
        priceAtPurchase: finalPriceAtPurchase,
        importPriceAtPurchase: importPriceAtPurchase,
        originalPriceAtPurchase: finalOriginalPriceAtPurchase,
        discountAtPurchase: finalDiscountAtPurchase,
        saleIdAtPurchase: finalSaleIdAtPurchase,
        hasPrescription: item.hasPrescription || false,
        od: item.od || '',
        os: item.os || '',
        od_sph: item.od_sph !== undefined ? Number(item.od_sph) : null,
        od_cyl: item.od_cyl !== undefined ? Number(item.od_cyl) : null,
        od_axis: item.od_axis !== undefined ? Number(item.od_axis) : null,
        os_sph: item.os_sph !== undefined ? Number(item.os_sph) : null,
        os_cyl: item.os_cyl !== undefined ? Number(item.os_cyl) : null,
        os_axis: item.os_axis !== undefined ? Number(item.os_axis) : null,
        pd: item.pd !== undefined ? Number(item.pd) : null,
        rxDate: item.rxDate ? new Date(item.rxDate) : null,
        rxNote: item.rxNote || '',
        prescriptionMode: item.prescriptionMode || 'none'
      });
    }

    // 3.5. Kiểm tra và giữ quota atomically
    try {
      for (const [saleId, qty] of Object.entries(saleUsageIncrements)) {
        const saleDoc = await Sale.findById(saleId);
        if (!saleDoc) continue;

        if (saleDoc.usageLimitType === 'limited') {
          const updatedSale = await Sale.findOneAndUpdate(
            {
              _id: saleId,
              usageLimitType: 'limited',
              $expr: { $lte: [ { $add: [ "$usedCount", qty ] }, "$usageLimit" ] }
            },
            { $inc: { usedCount: qty } },
            { new: true }
          );

          if (!updatedSale) {
            const err = new Error(`Rất tiếc, chiến dịch khuyến mãi "${saleDoc.name}" vừa hết lượt sử dụng (đã bán hết)!`);
            err.saleName = saleDoc.name;
            throw err;
          }
          reservedSaleQuotas.push({ saleId, quantity: qty });
        } else {
          // Unlimited
          await Sale.findByIdAndUpdate(saleId, { $inc: { usedCount: qty } });
          reservedSaleQuotas.push({ saleId, quantity: qty, isUnlimited: true });
        }
      }
    } catch (error) {
      // Hoàn lại quota cho các sale đã giữ thành công trước đó
      await rollbackOrderCreateReservations();
      return res.status(400).json({ 
        success: false, 
        message: error.message || 'Lỗi kiểm tra giới hạn sử dụng khuyến mãi.' 
      });
    }

    // 3.6. Quota giữ thành công, tiến hành lưu tồn kho của các sản phẩm atomically
    try {
      for (const item of items) {
        const product = productsCache[item.productId.toString()];
        const qty = Number(item.quantity);

        console.log(`[STOCK_RESERVED] Đang giữ tồn kho cho sản phẩm ${product.name} (ID: ${product._id}), số lượng: ${qty}`);
        const updatedProduct = await Product.findOneAndUpdate(
          {
            _id: product._id,
            stock: { $gte: qty }
          },
          {
            $inc: { stock: -qty, soldQuantity: qty }
          },
          {
            new: true
          }
        );

        if (!updatedProduct) {
          const err = new Error(`Sản phẩm "${product.name}" đã hết hàng hoặc không đủ tồn kho!`);
          err.productName = product.name;
          throw err;
        }

        reservedStocks.push({ productId: product._id, quantity: qty, name: product.name });

        // ================= REALTIME STOCK INTEGRATION =================
        getIO().emit('product:stockUpdated', {
          productId: product._id.toString(),
          stock: updatedProduct.stock,
          reason: 'order_created'
        });
        await checkAndEmitLowStockNotification(updatedProduct);
        // ===============================================================
      }
    } catch (stockError) {
      console.warn(`[STOCK_ROLLBACK] Lỗi thiếu tồn kho. Tiến hành rollback toàn bộ tồn kho đã giữ...`);
      await rollbackOrderCreateReservations();

      return res.status(400).json({ 
        success: false, 
        message: stockError.message || 'Lỗi không đủ tồn kho sản phẩm.' 
      });
    }

    // 4. Tạo đơn hàng mới
    const newOrder = new Order({
      orderCode,
      username: req.user?.username || null,
      customerInfo,
      items: enrichedItems,
      total: calculatedTotal, // Lưu tổng tiền tuyệt đối an toàn tính toán bởi server
      paymentMethod,
      status: 'pending'
    });

    await newOrder.save();
    orderPersisted = true;

    // ================= REALTIME INTEGRATION (PHASE 4) =================
    const customerName = customerInfo?.name || req.user?.username || 'Khách vãng lai';
    
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

    const paymentCancelToken = paymentMethod === 'banking'
      ? buildPaymentCancelToken(orderCode)
      : null;

    res.status(201).json({ success: true, message: 'Đơn hàng đã được ghi nhận thành công!', order: newOrder, paymentCancelToken });

  } catch (error) {
    if (!orderPersisted) {
      await rollbackOrderCreateReservations();
    }
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
      // Chặn 1: Nếu order.shipperId tồn tại VÀ req.user.role === 2
      if (order.shipperId) {
        return res.status(403).json({
          success: false,
          message: 'Đơn hàng đang do Shipper phụ trách. Bạn không có quyền thay đổi!'
        });
      }

      // Khai báo một object map validTransitions tương ứng với logic Frontend
      const validTransitions = {
        pending: ['pending', 'processing', 'cancelled'],
        paid: ['paid', 'processing', 'cancelled'],
        processing: ['processing', 'shipping'],
        shipping: ['shipping'],
        completed: ['completed'],
        cancelled: ['cancelled']
      };

      const allowedStatuses = validTransitions[oldStatus] || [oldStatus];

      // Chặn 2: Kiểm tra trạng thái mới (newStatus) có nằm trong mảng trạng thái hợp lệ của currentStatus hay không
      if (!allowedStatuses.includes(newStatus)) {
        return res.status(400).json({
          success: false,
          message: 'Chuyển đổi trạng thái không hợp lệ'
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
            console.log(`[STOCK_RESTORED] Hoàn lại tồn kho cho sản phẩm ${product.name} (ID: ${product._id}) từ đơn hàng bị hủy, số lượng: ${item.quantity}`);
            product.stock = (product.stock || 0) + item.quantity;
            product.soldQuantity = Math.max(0, (product.soldQuantity || 0) - item.quantity);
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
      // Hoàn trả quota khuyến mãi
      await restoreSaleQuotaForOrder(order);
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
              console.log(`[STOCK_RESTORED] Hoàn lại tồn kho cho sản phẩm ${product.name} (ID: ${product._id}) từ đơn hàng bị hủy, số lượng: ${item.quantity}`);
              product.stock = (product.stock || 0) + item.quantity;
              product.soldQuantity = Math.max(0, (product.soldQuantity || 0) - item.quantity);
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

        // Hoàn trả quota khuyến mãi
        await restoreSaleQuotaForOrder(order);

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

    // Task 2: Chặn Staff (role 2) duyệt hủy đơn hàng đã xuất kho (processing/shipping)
    if (action === 'approve' && req.user?.role === 2) {
      const originalStatus = order.previousStatusBeforeCancelRequest;
      if (['processing', 'shipping'].includes(originalStatus)) {
        return res.status(403).json({
          success: false,
          message: 'Bạn không có quyền hủy đơn hàng đã xuất kho. Vui lòng liên hệ Admin!'
        });
      }
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
            console.log(`[STOCK_RESTORED] Hoàn lại tồn kho cho sản phẩm ${product.name} (ID: ${product._id}) từ đơn hàng bị hủy, số lượng: ${item.quantity}`);
            product.stock = (product.stock || 0) + item.quantity;
            product.soldQuantity = Math.max(0, (product.soldQuantity || 0) - item.quantity);
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

      // Hoàn trả quota khuyến mãi
      await restoreSaleQuotaForOrder(order);

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

// ==================== HỆ THỐNG GIAO HÀNG & ĐỐI SOÁT CHO SHIPPER (MERN STACK) ====================

// [GET] Lấy danh sách đơn hàng được phân phối cho shipper hiện tại
exports.getShipperAssignedOrders = async (req, res) => {
  try {
    const shipperId = req.user.username;

    // Tìm các đơn hàng:
    // 1. Đơn đang đi giao: status: 'shipping'
    // 2. Đơn đối soát: status: 'shipped' + codStatus: 'pending_submission' HOẶC status: 'cancelled' + codStatus: 'pending_return'
    // 3. Đơn thu hồi: returnPhysicalStatus: 'pending'
    const orders = await Order.find({
      shipperId,
      $or: [
        { status: 'processing' },
        { status: 'shipping' },
        { status: 'shipped', codStatus: 'pending_submission' },
        { status: 'cancelled', codStatus: 'pending_return' },
        { returnPhysicalStatus: 'pending' }
      ]
    }).populate({
      path: 'items.productId',
      select: 'name code price images' // select fields cần thiết
    });

    // Bảo mật nghiêm ngặt: Tab 3 (Thu hồi đổi trả) ẩn hoàn toàn giá trị sản phẩm
    const sanitizedOrders = orders.map(order => {
      const orderObj = order.toObject();
      
      // Nếu đơn hàng đang ở trạng thái chờ thu hồi hàng vật lý
      if (orderObj.returnPhysicalStatus === 'pending') {
        // Xóa hoàn toàn các trường giá trị để bảo mật hàng hóa, tránh rủi ro
        delete orderObj.total;
        if (orderObj.items) {
          orderObj.items = orderObj.items.map(item => {
            delete item.priceAtPurchase;
            delete item.importPriceAtPurchase;
            delete item.originalPriceAtPurchase;
            delete item.discountAtPurchase;
            if (item.productId) {
              delete item.productId.price;
            }
            return item;
          });
        }
      }
      return orderObj;
    });

    res.json({ success: true, orders: sanitizedOrders });
  } catch (error) {
    console.error('Lỗi lấy đơn hàng của shipper:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách đơn giao!' });
  }
};

// [PUT] Cập nhật kết quả giao hàng của Shipper (Thành công / Thất bại)
exports.updateShipperDeliveryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { deliveryStatus } = req.body; // 'success' hoặc 'failed'
    const shipperId = req.user.username;

    const order = await Order.findOne({ _id: id, shipperId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng hoặc đơn hàng không được phân công cho bạn!' });
    }

    if (order.status !== 'shipping') {
      return res.status(400).json({ success: false, message: 'Đơn hàng không ở trạng thái đang đi giao!' });
    }

    if (deliveryStatus === 'success') {
      // Đồng bộ trạng thái đơn hàng Banking: chuyển thẳng sang completed, tránh bị kẹt ở shipped
      if (order.paymentMethod === 'banking') {
        order.status = 'completed';
        order.codStatus = 'no_cod';
      } else {
        order.status = 'shipped';
        order.codStatus = 'pending_submission'; // COD chuyển sang pending_submission chờ đối soát
      }
    } else if (deliveryStatus === 'failed') {
      order.status = 'cancelled';
      order.codStatus = order.paymentMethod === 'cod' ? 'pending_return' : 'no_cod';
      // Kích hoạt luồng thu hồi hàng vật lý (hiển thị trên Tab Thu Hồi của Shipper)
      order.returnPhysicalStatus = 'pending';
      
      // Hoàn trả tồn kho tự động nếu đơn bị hủy
      if (!order.stockRestored) {
        for (const item of order.items) {
          const product = await Product.findById(item.productId);
          if (product) {
            product.stock = (product.stock || 0) + item.quantity;
            product.soldQuantity = Math.max(0, (product.soldQuantity || 0) - item.quantity);
            await product.save();
            
            getIO().emit('product:stockUpdated', {
              productId: product._id.toString(),
              stock: product.stock,
              reason: 'delivery_failed_cancelled'
            });
          }
        }
        order.stockRestored = true;
      }
      await restoreSaleQuotaForOrder(order);
    } else {
      return res.status(400).json({ success: false, message: 'Kết quả giao hàng không hợp lệ!' });
    }

    await order.save();

    // Đồng bộ realtime danh sách đơn hàng cho Staff và Admin
    emitToStaff('order:statusChanged', { id: order._id, orderCode: order.orderCode, status: order.status });
    emitToAdmin('order:statusChanged', { id: order._id, orderCode: order.orderCode, status: order.status });

    res.json({ success: true, message: 'Cập nhật trạng thái giao hàng thành công!', order });
  } catch (error) {
    console.error('Lỗi cập nhật giao hàng của shipper:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật giao hàng!' });
  }
};

// [POST] Shipper gửi yêu cầu đối soát nộp tiền COD về công ty
exports.requestReconciliation = async (req, res) => {
  try {
    const shipperId = req.user.username;

    // Tìm các đơn hàng COD của shipper này đã giao thành công nhưng chưa nộp tiền mặt
    const pendingOrders = await Order.find({
      shipperId,
      status: 'shipped',
      paymentMethod: 'cod',
      codStatus: 'pending_submission'
    });

    if (pendingOrders.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Không tìm thấy tiền mặt COD nào đang giữ cần nộp đối soát!'
      });
    }

    // Tính tổng tiền mặt thu hộ đang giữ
    const totalAmount = pendingOrders.reduce((sum, order) => sum + order.total, 0);

    // Chuyển toàn bộ sang trạng thái PENDING_RECONCILIATION (Chờ Admin duyệt nộp tiền)
    const orderIds = pendingOrders.map(o => o._id);
    await Order.updateMany(
      { _id: { $in: orderIds } },
      { $set: { codStatus: 'pending_reconciliation' } }
    );

    // Tạo thông báo cho hệ thống quản trị
    await createNotificationAndEmit({
      roleTarget: 'admin',
      type: 'reconciliation',
      title: 'Yêu cầu nộp tiền đối soát mới',
      message: `Shipper ${req.user.name || req.user.username} đã gửi yêu cầu đối soát số tiền ${totalAmount.toLocaleString('vi-VN')}đ cho ${pendingOrders.length} đơn hàng.`,
      link: '/admin/reconciliation'
    });

    emitToAdmin('reconciliation:requested', { shipperId, totalAmount, count: pendingOrders.length });

    res.json({
      success: true,
      message: 'Gửi yêu cầu đối soát tiền mặt thành công! Số dư hiện tại trên màn hình shipper đã được reset về 0.',
      reconciledCount: pendingOrders.length,
      totalAmount
    });
  } catch (error) {
    console.error('Lỗi gửi yêu cầu đối soát:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi gửi yêu cầu đối soát tiền!' });
  }
};

// [PUT] Shipper xác nhận đã thu hồi hàng vật lý đổi trả từ khách hàng (Tab 3)
exports.confirmPhysicalReturn = async (req, res) => {
  try {
    const { id } = req.params;
    const shipperId = req.user.username;

    const order = await Order.findOne({ _id: id, shipperId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng đổi trả được phân công!' });
    }

    if (order.returnPhysicalStatus !== 'pending') {
      return res.status(400).json({ success: false, message: 'Đơn hàng không ở trạng thái chờ thu hồi hàng vật lý!' });
    }

    // Cập nhật trạng thái thu hồi hàng vật lý thành công
    order.returnPhysicalStatus = 'returned';
    await order.save();

    // Gửi thông báo cho Nhân viên (Staff) để xử lý hoàn tiền ví hoặc đổi sản phẩm mới
    await createNotificationAndEmit({
      roleTarget: 'staff',
      type: 'return',
      title: 'Đã thu hồi hàng vật lý đổi trả',
      message: `Shipper đã xác nhận thu hồi đủ hàng vật lý của đơn hàng ${order.orderCode}. Vui lòng làm thủ tục tiếp theo.`,
      link: '/staff/orders'
    });

    emitToStaff('return:physicalReturned', { id: order._id, orderCode: order.orderCode });

    res.json({ success: true, message: 'Xác nhận đã thu hồi hàng vật lý thành công! Đã gửi thông báo cho Staff xử lý ví tiền.' });
  } catch (error) {
    console.error('Lỗi xác nhận thu hồi hàng vật lý:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xác nhận thu hồi hàng!' });
  }
};

// [GET] Sinh mã QR token bảo mật cho đơn hàng
exports.generateOrderQRToken = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng!' });
    }

    const qrToken = jwt.sign(
      { orderId: order._id, orderCode: order.orderCode },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ success: true, qrToken });
  } catch (error) {
    console.error('Lỗi tạo QR token:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi sinh mã QR token!' });
  }
};

// [GET] Shipper quét mã QR lấy thông tin chi tiết đơn hàng
exports.scanOrder = async (req, res) => {
  try {
    const { qrToken } = req.params;
    if (!qrToken) {
      return res.status(400).json({ success: false, message: 'Thiếu mã QR Token!' });
    }

    let decoded;
    try {
      decoded = jwt.verify(qrToken, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(400).json({ success: false, message: 'Mã QR không hợp lệ hoặc đã hết hạn!' });
    }

    const order = await Order.findById(decoded.orderId).populate({
      path: 'items.productId',
      select: 'name code price images'
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng tương ứng với mã QR này!' });
    }

    res.json({ success: true, order });
  } catch (error) {
    console.error('Lỗi khi quét đơn hàng:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi giải mã quét QR đơn hàng!' });
  }
};

// [POST] Shipper bấm nhận nhiệm vụ giao đơn hàng
exports.acceptOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    const shipperUsername = req.user.username;

    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Thiếu mã đơn hàng!' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng!' });
    }

    // Vá lỗi Logic Hồi sinh đơn hàng (Anti-Zombie): Chỉ cho phép nhận đơn ở trạng thái processing
    if (order.status !== 'processing') {
      return res.status(400).json({ 
        success: false, 
        message: 'Đơn hàng không ở trạng thái chờ giao, không thể nhận nhiệm vụ!' 
      });
    }

    if (order.shipperId && order.shipperId !== shipperUsername) {
      return res.status(400).json({ success: false, message: 'Đơn hàng này đã được nhận bởi một Shipper khác!' });
    }

    order.shipperId = shipperUsername;
    order.status = 'shipping';
    order.codStatus = order.paymentMethod === 'cod' ? 'pending' : 'no_cod';

    await order.save();

    emitToStaff('order:statusChanged', { id: order._id, orderCode: order.orderCode, status: 'shipping' });
    emitToAdmin('order:statusChanged', { id: order._id, orderCode: order.orderCode, status: 'shipping' });

    res.json({ 
      success: true, 
      message: 'Nhận nhiệm vụ giao hàng thành công! Đơn hàng đã chuyển sang trạng thái Đang giao hàng.', 
      order 
    });
  } catch (error) {
    console.error('Lỗi khi nhận đơn hàng:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi nhận đơn hàng!' });
  }
};

// [POST] Shipper chốt đơn (Thành công -> completed hoặc thất bại -> cancelled)
exports.updateShipperStatus = async (req, res) => {
  try {
    const { orderId, deliveryStatus } = req.body;
    const shipperUsername = req.user.username;

    if (!orderId || !deliveryStatus) {
      return res.status(400).json({ success: false, message: 'Thiếu mã đơn hàng hoặc trạng thái giao hàng!' });
    }

    const order = await Order.findOne({ _id: orderId, shipperId: shipperUsername });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng hoặc bạn không được phân công giao đơn này!' });
    }

    if (order.status !== 'shipping') {
      return res.status(400).json({ success: false, message: 'Đơn hàng không ở trạng thái Đang giao hàng!' });
    }

    if (deliveryStatus === 'success') {
      if (order.paymentMethod === 'cod') {
        order.status = 'shipped';
        order.codStatus = 'pending_submission';
      } else {
        order.status = 'completed';
        order.codStatus = 'no_cod';
      }
    } else if (deliveryStatus === 'failed') {
      order.status = 'cancelled';
      order.codStatus = order.paymentMethod === 'cod' ? 'pending_return' : 'no_cod';
      // Kích hoạt luồng thu hồi hàng vật lý (hiển thị trên Tab Thu Hồi của Shipper)
      order.returnPhysicalStatus = 'pending';

      if (!order.stockRestored) {
        for (const item of order.items) {
          const product = await Product.findById(item.productId);
          if (product) {
            product.stock = (product.stock || 0) + item.quantity;
            product.soldQuantity = Math.max(0, (product.soldQuantity || 0) - item.quantity);
            await product.save();

            getIO().emit('product:stockUpdated', {
              productId: product._id.toString(),
              stock: product.stock,
              reason: 'delivery_failed_cancelled'
            });
          }
        }
        order.stockRestored = true;
      }
      await restoreSaleQuotaForOrder(order);
    } else {
      return res.status(400).json({ success: false, message: 'Trạng thái giao hàng không hợp lệ!' });
    }

    await order.save();

    emitToStaff('order:statusChanged', { id: order._id, orderCode: order.orderCode, status: order.status });
    emitToAdmin('order:statusChanged', { id: order._id, orderCode: order.orderCode, status: order.status });

    res.json({ 
      success: true, 
      message: 'Cập nhật trạng thái giao hàng thành công!', 
      order 
    });
  } catch (error) {
    console.error('Lỗi khi chốt đơn hàng:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi chốt đơn hàng!' });
  }
};

