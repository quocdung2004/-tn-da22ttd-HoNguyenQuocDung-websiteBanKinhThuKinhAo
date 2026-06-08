const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Sale = require('../models/Sale');

const REVENUE_STATUSES = ['paid', 'processing', 'shipping', 'shipped', 'completed'];
const LOW_STOCK_THRESHOLD = 5;

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const startOfYear = (date) => new Date(date.getFullYear(), 0, 1);

const toNumber = (value) => Number(value || 0);
const toId = (value) => value?._id?.toString?.() || value?.toString?.() || '';

const getItemPrice = (item) => toNumber(item.priceAtPurchase || item.price);

const getDashboardItemCost = (item, productInfo) => {
  if (toNumber(item.importPriceAtPurchase) > 0) {
    return toNumber(item.importPriceAtPurchase);
  }
  if (toNumber(productInfo?.importPrice) > 0) {
    return toNumber(productInfo.importPrice);
  }
  return 0;
};

const compactProduct = (product) => ({
  _id: toId(product),
  name: product?.name || 'San pham khong xac dinh',
  images: product?.images || [],
  price: toNumber(product?.price),
  stock: toNumber(product?.stock),
  importPrice: toNumber(product?.importPrice),
  inventoryValue: toNumber(product?.stock) * toNumber(product?.importPrice),
  brand: product?.brand || null,
  category: product?.category || null
});

const addEntityMetric = (map, key, name, revenue, quantity) => {
  const safeKey = key || name || 'unknown';
  const current = map.get(safeKey) || {
    _id: safeKey,
    name: name || 'Khong xac dinh',
    revenue: 0,
    quantitySold: 0
  };

  current.revenue += revenue;
  current.quantitySold += quantity;
  map.set(safeKey, current);
};

const sortedMetrics = (map, sortKey, limit = 10) => (
  Array.from(map.values())
    .sort((a, b) => toNumber(b[sortKey]) - toNumber(a[sortKey]))
    .slice(0, limit)
);

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

// [GET] Dashboard V2 - operational KPIs for admin dashboard tabs.
exports.getDashboardV2Data = async (req, res) => {
  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const monthStart = startOfMonth(now);
    const yearStart = startOfYear(now);

    const [
      allProducts,
      validOrders,
      totalOrders,
      totalCustomers,
      orderStatusAggregation,
      pendingItemsAggregation,
      inventoryAggregation,
      recentOrders,
      saleCampaigns
    ] = await Promise.all([
      Product.find().populate('brand category').lean(),
      Order.find({ status: { $in: REVENUE_STATUSES } }).lean(),
      Order.countDocuments(),
      User.countDocuments({ role: 0 }),
      Order.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Order.aggregate([
        { $match: { status: 'pending' } },
        { $unwind: '$items' },
        {
          $group: {
            _id: null,
            totalPendingItems: { $sum: { $ifNull: ['$items.quantity', 0] } }
          }
        }
      ]),
      Product.aggregate([
        { $match: { isActive: { $ne: false } } },
        {
          $group: {
            _id: null,
            totalSKU: { $sum: 1 },
            totalStockQuantity: { $sum: { $ifNull: ['$stock', 0] } },
            inventoryValue: {
              $sum: {
                $multiply: [
                  { $ifNull: ['$stock', 0] },
                  { $ifNull: ['$importPrice', 0] }
                ]
              }
            },
            outOfStockCount: {
              $sum: {
                $cond: [
                  { $eq: [{ $ifNull: ['$stock', 0] }, 0] },
                  1,
                  0
                ]
              }
            },
            negativeStockCount: {
              $sum: {
                $cond: [
                  { $lt: [{ $ifNull: ['$stock', 0] }, 0] },
                  1,
                  0
                ]
              }
            },
            lowStockCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gt: [{ $ifNull: ['$stock', 0] }, 0] },
                      { $lte: [{ $ifNull: ['$stock', 0] }, LOW_STOCK_THRESHOLD] }
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]),
      Order.find().sort({ createdAt: -1 }).limit(5).lean(),
      Sale.find().sort({ createdAt: -1 }).lean()
    ]);

    const productMap = new Map(allProducts.map((product) => [toId(product), product]));
    const activeProducts = allProducts.filter((product) => product.isActive !== false);
    const outOfStockProducts = activeProducts
      .filter((product) => toNumber(product.stock) === 0)
      .map(compactProduct)
      .sort((a, b) => a.stock - b.stock);
    const lowStockOnlyProducts = activeProducts
      .filter((product) => toNumber(product.stock) > 0 && toNumber(product.stock) <= LOW_STOCK_THRESHOLD)
      .map(compactProduct)
      .sort((a, b) => a.stock - b.stock);
    const legacyLowStockProducts = activeProducts
      .filter((product) => toNumber(product.stock) <= LOW_STOCK_THRESHOLD)
      .map(compactProduct)
      .sort((a, b) => a.stock - b.stock);

    const rawStatusCounts = orderStatusAggregation.reduce((acc, item) => {
      acc[item._id || 'unknown'] = item.count || 0;
      return acc;
    }, {});

    const orderStatusCounts = {
      pending: rawStatusCounts.pending || 0,
      processing: rawStatusCounts.processing || 0,
      shipping: (rawStatusCounts.shipping || 0) + (rawStatusCounts.shipped || 0),
      shipped: rawStatusCounts.shipped || 0,
      completed: rawStatusCounts.completed || 0,
      cancelled: rawStatusCounts.cancelled || 0,
      paid: rawStatusCounts.paid || 0,
      cancelRequested: rawStatusCounts.cancel_requested || 0,
      total: totalOrders
    };

    const productSales = new Map();
    const categoryMetrics = new Map();
    const brandMetrics = new Map();
    const productCountByCategoryMap = new Map();
    const saleMetrics = new Map(
      saleCampaigns.map((sale) => [toId(sale), {
        _id: toId(sale),
        name: sale.name,
        discountType: sale.discountType,
        discountValue: toNumber(sale.discountValue),
        startDate: sale.startDate,
        endDate: sale.endDate,
        isActive: sale.isActive !== false,
        usageLimitType: sale.usageLimitType,
        usageLimit: sale.usageLimit,
        usedCount: toNumber(sale.usedCount),
        ordersGeneratedSet: new Set(),
        revenueGenerated: 0
      }])
    );

    activeProducts.forEach((product) => {
      const categoryName = product.category?.name || 'Chua phan loai';
      const current = productCountByCategoryMap.get(categoryName) || 0;
      productCountByCategoryMap.set(categoryName, current + 1);
    });

    let totalRevenue = 0;
    let totalProfit = 0;
    let totalItemsSold = 0;
    let revenueToday = 0;
    let revenueThisMonth = 0;
    let revenueThisYear = 0;
    let profitThisMonth = 0;
    let profitThisYear = 0;

    validOrders.forEach((order) => {
      const orderCreatedAt = order.createdAt ? new Date(order.createdAt) : null;
      const orderId = toId(order);

      order.items.forEach((item) => {
        const productId = toId(item.productId);
        const productInfo = productMap.get(productId);
        const quantity = toNumber(item.quantity);
        const price = getItemPrice(item);
        const cost = getDashboardItemCost(item, productInfo);
        const itemRevenue = price * quantity;
        const itemProfit = (price - cost) * quantity;

        totalRevenue += itemRevenue;
        totalProfit += itemProfit;
        totalItemsSold += quantity;

        if (orderCreatedAt && orderCreatedAt >= todayStart) {
          revenueToday += itemRevenue;
        }
        if (orderCreatedAt && orderCreatedAt >= monthStart) {
          revenueThisMonth += itemRevenue;
          profitThisMonth += itemProfit;
        }
        if (orderCreatedAt && orderCreatedAt >= yearStart) {
          revenueThisYear += itemRevenue;
          profitThisYear += itemProfit;
        }

        if (productId) {
          const currentProduct = productSales.get(productId) || {
            ...(productInfo ? compactProduct(productInfo) : {
              _id: productId,
              name: 'San pham da an/xoa',
              images: [],
              price: 0,
              stock: 0,
              importPrice: 0,
              brand: null,
              category: null
            }),
            sold: 0,
            revenue: 0,
            profit: 0
          };

          currentProduct.sold += quantity;
          currentProduct.revenue += itemRevenue;
          currentProduct.profit += itemProfit;
          productSales.set(productId, currentProduct);
        }

        const category = productInfo?.category;
        addEntityMetric(
          categoryMetrics,
          toId(category) || 'uncategorized',
          category?.name || 'Chua phan loai',
          itemRevenue,
          quantity
        );

        const brand = productInfo?.brand;
        addEntityMetric(
          brandMetrics,
          toId(brand) || 'unknown-brand',
          brand?.name || 'Khong xac dinh',
          itemRevenue,
          quantity
        );

        const saleId = toId(item.saleIdAtPurchase);
        if (saleId) {
          const saleMetric = saleMetrics.get(saleId);
          if (saleMetric) {
            saleMetric.ordersGeneratedSet.add(orderId);
            saleMetric.revenueGenerated += itemRevenue;
          }
        }
      });
    });

    const bestSellingProducts = Array.from(productSales.values())
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 5);

    const topCategoriesByRevenue = sortedMetrics(categoryMetrics, 'revenue');
    const topCategoriesByQuantity = sortedMetrics(categoryMetrics, 'quantitySold');
    const topBrandsByRevenue = sortedMetrics(brandMetrics, 'revenue');
    const topBrandsByQuantity = sortedMetrics(brandMetrics, 'quantitySold');

    const brandStats = topBrandsByRevenue.map((brand) => ({
      brand: brand.name,
      revenue: brand.revenue,
      percent: totalRevenue > 0 ? (brand.revenue / totalRevenue) * 100 : 0
    }));

    const saleCampaignAnalytics = Array.from(saleMetrics.values())
      .map((sale) => {
        const remainingCount = sale.usageLimitType === 'limited'
          ? Math.max(toNumber(sale.usageLimit) - sale.usedCount, 0)
          : null;

        return {
          _id: sale._id,
          name: sale.name,
          discountType: sale.discountType,
          discountValue: sale.discountValue,
          startDate: sale.startDate,
          endDate: sale.endDate,
          isActive: sale.isActive,
          usageLimitType: sale.usageLimitType,
          usageLimit: sale.usageLimit,
          usedCount: sale.usedCount,
          remainingCount,
          ordersGenerated: sale.ordersGeneratedSet.size,
          revenueGenerated: sale.revenueGenerated
        };
      })
      .sort((a, b) => b.revenueGenerated - a.revenueGenerated);

    const inventoryRaw = inventoryAggregation[0] || {};
    const inventory = {
      totalProducts: allProducts.length,
      totalSKU: toNumber(inventoryRaw.totalSKU),
      totalStockQuantity: toNumber(inventoryRaw.totalStockQuantity),
      outOfStockCount: toNumber(inventoryRaw.outOfStockCount),
      negativeStockCount: toNumber(inventoryRaw.negativeStockCount),
      lowStockCount: toNumber(inventoryRaw.lowStockCount),
      inventoryValue: toNumber(inventoryRaw.inventoryValue),
      outOfStockProducts,
      lowStockProducts: lowStockOnlyProducts
    };

    const productCountByCategory = Array.from(productCountByCategoryMap.entries())
      .map(([categoryName, count]) => ({ categoryName, count }))
      .sort((a, b) => b.count - a.count);

    res.json({
      success: true,
      generatedAt: now,

      revenue: {
        today: revenueToday,
        thisMonth: revenueThisMonth,
        thisYear: revenueThisYear,
        lifetime: totalRevenue
      },
      profit: {
        thisMonth: profitThisMonth,
        thisYear: profitThisYear,
        lifetime: totalProfit
      },
      orders: orderStatusCounts,
      inventory,
      topProducts: bestSellingProducts,
      bestSellingProducts,
      topCategories: {
        byRevenue: topCategoriesByRevenue,
        byQuantity: topCategoriesByQuantity
      },
      topBrands: {
        byRevenue: topBrandsByRevenue,
        byQuantity: topBrandsByQuantity
      },
      saleCampaignAnalytics,

      totalRevenue,
      totalProfit,
      totalOrders,
      totalItemsSold,
      totalProducts: allProducts.length,
      totalCustomers,
      totalPendingOrders: orderStatusCounts.pending,
      totalPendingItems: toNumber(pendingItemsAggregation[0]?.totalPendingItems),
      lowStockProducts: legacyLowStockProducts,
      recentOrders,
      brandStats,
      productCountByCategory
    });
  } catch (error) {
    console.error('Dashboard V2 aggregation error:', error);
    res.status(500).json({
      success: false,
      message: 'Khong the tong hop du lieu Dashboard V2.'
    });
  }
};
