const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');

// [GET] Tải dữ liệu thống kê tổng quan (Dashboard)
exports.getDashboardData = async (req, res) => {
  try {
    // 1. Tải toàn bộ danh sách sản phẩm để phục vụ tìm kiếm/fallback và nhóm dữ liệu an toàn
    const allProducts = await Product.find().populate('brand category');

    // 2. Lọc tất cả đơn hàng hợp lệ đã thanh toán hoặc đang xử lý/giao (Loại trừ cancelled, pending, cancel_requested)
    const validOrders = await Order.find({ 
      status: { $in: ['paid', 'processing', 'shipping', 'shipped', 'completed'] } 
    });

    // 2b. Lọc tất cả đơn hàng chờ xác nhận (pending)
    const pendingOrders = await Order.find({ status: 'pending' });
    const totalPendingOrders = pendingOrders.length;
    const totalPendingItems = pendingOrders.reduce((sum, o) => sum + o.items.reduce((s, item) => s + (item.quantity || 0), 0), 0);

    // Hàm tiện ích xác định giá vốn sỉ (cost) cho từng item dựa trên độ ưu tiên:
    // Độ ưu tiên 1: Giá trị importPriceAtPurchase ghi nhận lúc mua hàng
    // Độ ưu tiên 2: Fallback về product.importPrice hiện hành trong DB
    // Độ ưu tiên 3: Mặc định bằng 0
    const getItemCost = (item, productInfo) => {
      if (item.importPriceAtPurchase && item.importPriceAtPurchase > 0) {
        return item.importPriceAtPurchase;
      }
      if (productInfo && productInfo.importPrice && productInfo.importPrice > 0) {
        return productInfo.importPrice;
      }
      return 0;
    };

    // 3. Tính toán Doanh thu thực tế (totalRevenue) và Lợi nhuận thực tế (totalProfit) chi tiết theo từng sản phẩm
    let totalRevenue = 0;
    let totalProfit = 0;

    validOrders.forEach(order => {
      order.items.forEach(item => {
        const qty = item.quantity || 0;
        const price = item.priceAtPurchase || item.price || 0;
        const productInfo = allProducts.find(p => p._id.toString() === item.productId?.toString());
        const cost = getItemCost(item, productInfo);

        totalRevenue += price * qty;
        totalProfit += (price - cost) * qty;
      });
    });

    // 4. Tính toán số lượng đơn và số lượng sản phẩm bán ra
    const totalOrders = await Order.countDocuments();
    const totalItemsSold = validOrders.reduce((sum, o) => sum + o.items.reduce((s, item) => s + (item.quantity || 0), 0), 0);

    // 5. Thống kê số lượng tất cả Sản phẩm hiện hữu và Khách hàng đăng ký
    const totalProducts = await Product.countDocuments();
    const totalCustomers = await User.countDocuments({ role: 0 }); // Khách hàng thông thường

    // 6. Cảnh báo sản phẩm sắp hết hàng (stock <= 5) và chỉ lấy sản phẩm active
    const lowStockProducts = await Product.find({ 
      stock: { $lte: 5 }, 
      isActive: { $ne: false } 
    }).populate('brand category');

    // 7. Lấy 5 đơn hàng mới nhất trên hệ thống để Admin theo dõi kịp thời
    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(5);

    // 8. Tính Top 5 sản phẩm bán chạy nhất (bestSellingProducts) từ các đơn hàng hợp lệ
    const productSales = {}; // maps productId -> { sold, revenue, profit }

    validOrders.forEach(order => {
      order.items.forEach(item => {
        if (item.productId) {
          const prodId = item.productId.toString();
          if (!productSales[prodId]) {
            productSales[prodId] = { sold: 0, revenue: 0, profit: 0 };
          }

          const qty = item.quantity || 0;
          const price = item.priceAtPurchase || item.price || 0;
          const productInfo = allProducts.find(p => p._id.toString() === prodId);
          const cost = getItemCost(item, productInfo);

          productSales[prodId].sold += qty;
          productSales[prodId].revenue += price * qty;
          productSales[prodId].profit += (price - cost) * qty;
        }
      });
    });

    const bestSellingProducts = Object.entries(productSales)
      .map(([id, stats]) => {
        const productInfo = allProducts.find(p => p._id.toString() === id);

        // Thiết lập fallback nếu sản phẩm đã bị xóa hoặc ẩn khỏi DB để ngăn chặn dashboard crash
        const productName = productInfo ? productInfo.name : 'Sản phẩm đã ẩn/xóa';
        const productImages = productInfo ? productInfo.images : [];
        const productPrice = productInfo ? productInfo.price : 0;
        const productStock = productInfo ? productInfo.stock : 0;
        const productBrand = productInfo ? productInfo.brand : null;
        const productCategory = productInfo ? productInfo.category : null;

        return {
          _id: id,
          name: productName,
          images: productImages,
          price: productPrice,
          stock: productStock,
          brand: productBrand,
          category: productCategory,
          sold: stats.sold,
          revenue: stats.revenue,
          profit: stats.profit
        };
      })
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 5);

    // 9. Tính toán doanh thu và tỷ lệ phần trăm thị phần thương hiệu (brandStats) dựa trên doanh thu lịch sử
    const brandRevenue = {};
    validOrders.forEach(order => {
      order.items.forEach(item => {
        if (item.productId) {
          const prodId = item.productId.toString();
          const productInfo = allProducts.find(p => p._id.toString() === prodId);
          const brandName = productInfo?.brand?.name || 'Không xác định';
          const price = item.priceAtPurchase || item.price || 0;
          const qty = item.quantity || 0;

          brandRevenue[brandName] = (brandRevenue[brandName] || 0) + (price * qty);
        }
      });
    });

    const brandStats = Object.entries(brandRevenue)
      .map(([brand, revenue]) => ({
        brand,
        revenue,
        percent: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // 10. Đếm số lượng sản phẩm hoạt động hiện hành theo từng Danh mục (productCountByCategory)
    const activeProducts = await Product.find({ isActive: { $ne: false } }).populate('category');
    const categoryCounts = {};
    activeProducts.forEach(prod => {
      const catName = prod.category?.name || 'Chưa phân loại';
      categoryCounts[catName] = (categoryCounts[catName] || 0) + 1;
    });

    const productCountByCategory = Object.entries(categoryCounts).map(([categoryName, count]) => ({
      categoryName,
      count
    }));

    // Trả kết quả thống kê chính xác tuyệt đối về Client
    res.json({
      success: true,
      totalRevenue,
      totalProfit,
      totalOrders,
      totalItemsSold,
      totalProducts,
      totalCustomers,
      lowStockProducts,
      recentOrders,
      bestSellingProducts,
      topProducts: bestSellingProducts, // Cho khả năng tương thích ngược
      brandStats,
      productCountByCategory,
      totalPendingOrders,
      totalPendingItems
    });

  } catch (error) {
    console.error('❌ Lỗi khi tổng hợp dữ liệu Dashboard:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Có lỗi xảy ra trong quá trình tổng hợp báo cáo kinh doanh!' 
    });
  }
};
