const Order = require('../models/Order');
const Product = require('../models/Product');

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

// [PUT] Cập nhật Trạng thái Đơn hàng (Dành cho Admin/Staff)
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status: newStatus } = req.body;
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

    // 3. Xử lý hoàn trả tồn kho (stock) khi hủy đơn
    // Chỉ hoàn stock nếu đơn hàng chuyển sang 'cancelled' và trước đó chưa bị hủy
    if (newStatus === 'cancelled' && oldStatus !== 'cancelled') {
      for (const item of order.items) {
        const product = await Product.findById(item.productId);
        if (product) {
          product.stock = (product.stock || 0) + item.quantity;
          await product.save();
        }
      }
    }

    // 4. Lưu lại trạng thái mới
    order.status = newStatus;
    await order.save();

    res.json({ success: true, message: 'Cập nhật trạng thái đơn hàng thành công!', order });
  } catch (error) {
    console.error('Lỗi cập nhật trạng thái Đơn hàng:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật trạng thái đơn!' });
  }
};
