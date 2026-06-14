const Order = require('../models/Order');
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
        { _id: item.saleIdAtPurchase, usageLimitType: 'limited' },
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
        await Product.findByIdAndUpdate(reservedStock.productId, {
          $inc: { stock: reservedStock.quantity }
        });
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
            $inc: { stock: -qty }
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
            console.log(`[STOCK_RESTORED] Hoàn lại tồn kho cho sản phẩm ${product.name} (ID: ${product._id}) từ đơn hàng bị hủy, số lượng: ${item.quantity}`);
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
