const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');

// Helper to format date in GMT+7 (YYYY-MM-DD)
const getLocalDateString = (date) => {
  const tzOffset = 7 * 60 * 60 * 1000; // GMT+7 offset
  const localTime = new Date(date.getTime() + tzOffset);
  return localTime.toISOString().split('T')[0];
};

/**
 * 1. Báo cáo Tài chính (/api/dashboard/finance)
 * - Doanh thu, Chi phí, Lợi nhuận gộp theo 7 ngày gần nhất
 * - Tổng tiền COD đang kẹt gom theo codStatus
 */
exports.getFinanceReport = async (req, res) => {
  try {
    // A. 7 Ngày gần nhất (bao gồm hôm nay)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const dailyFinanceAgg = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo },
          status: { $in: ['completed', 'shipped'] }
        }
      },
      {
        $unwind: '$items'
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "+07:00" }
          },
          revenue: { $sum: { $multiply: ['$items.priceAtPurchase', '$items.quantity'] } },
          cost: { $sum: { $multiply: [{ $ifNull: ['$items.importPriceAtPurchase', 0] }, '$items.quantity'] } }
        }
      },
      {
        $project: {
          date: '$_id',
          revenue: 1,
          cost: 1,
          profit: { $subtract: ['$revenue', '$cost'] },
          _id: 0
        }
      },
      {
        $sort: { date: 1 }
      }
    ]);

    // Tạo mảng 7 ngày liên tục để điền dữ liệu (tránh ngày không có đơn bị khuyết)
    const dailyFinance = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = getLocalDateString(date);
      dailyFinance.push({
        date: dateStr,
        'Doanh thu': 0,
        'Chi phí': 0,
        'Lợi nhuận': 0
      });
    }

    dailyFinanceAgg.forEach(item => {
      const day = dailyFinance.find(d => d.date === item.date);
      if (day) {
        day['Doanh thu'] = item.revenue;
        day['Chi phí'] = item.cost;
        day['Lợi nhuận'] = item.profit;
      }
    });

    // B. Dòng tiền COD đang kẹt (pending, pending_submission, pending_reconciliation)
    const codCongestionAgg = await Order.aggregate([
      {
        $match: {
          paymentMethod: 'cod',
          codStatus: { $in: ['pending', 'pending_submission', 'pending_reconciliation'] }
        }
      },
      {
        $group: {
          _id: '$codStatus',
          totalAmount: { $sum: '$total' },
          count: { $sum: 1 }
        }
      }
    ]);

    const codLabels = {
      pending: 'Chờ giao hàng (COD)',
      pending_submission: 'Shipper giữ tiền (Chờ nộp)',
      pending_reconciliation: 'Chờ đối soát dòng tiền'
    };

    const codCongestion = ['pending', 'pending_submission', 'pending_reconciliation'].map(status => {
      const found = codCongestionAgg.find(c => c._id === status);
      return {
        name: codLabels[status],
        value: found ? found.totalAmount : 0,
        count: found ? found.count : 0
      };
    });

    res.json({
      success: true,
      data: {
        dailyFinance,
        codCongestion
      }
    });
  } catch (error) {
    console.error('Lỗi lấy báo cáo tài chính:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy báo cáo tài chính!' });
  }
};

/**
 * 2. Báo cáo Vận hành Shipper (/api/dashboard/logistics)
 * - Thống kê KPI Shipper: Đơn thành công vs. đơn thất bại
 * - Số lượng đơn hàng có returnPhysicalStatus: 'pending' (Cảnh báo hàng hoàn chưa về kho)
 */
exports.getLogisticsReport = async (req, res) => {
  try {
    // A. Gom nhóm theo shipperId để thống kê KPI
    const shipperStatsAgg = await Order.aggregate([
      {
        $match: {
          shipperId: { $ne: null, $ne: '' }
        }
      },
      {
        $group: {
          _id: '$shipperId',
          successCount: {
            $sum: {
              $cond: [
                { $in: ['$status', ['shipped', 'completed']] },
                1,
                0
              ]
            }
          },
          failCount: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'cancelled'] },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: 'username',
          as: 'shipperInfo'
        }
      },
      {
        $unwind: {
          path: '$shipperInfo',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          shipperUsername: '$_id',
          shipperName: { $ifNull: ['$shipperInfo.name', '$_id'] },
          shipperPhone: { $ifNull: ['$shipperInfo.phone', 'N/A'] },
          successCount: 1,
          failCount: 1,
          _id: 0
        }
      }
    ]);

    const shipperKPIs = shipperStatsAgg.map(stat => ({
      name: stat.shipperName,
      username: stat.shipperUsername,
      phone: stat.shipperPhone,
      'Thành công': stat.successCount,
      'Thất bại': stat.failCount
    }));

    // B. Cảnh báo hàng hoàn vật lý chưa về kho (returnPhysicalStatus === 'pending')
    const pendingPhysicalReturns = await Order.countDocuments({ returnPhysicalStatus: 'pending' });

    res.json({
      success: true,
      data: {
        shipperKPIs,
        pendingPhysicalReturns
      }
    });
  } catch (error) {
    console.error('Lỗi lấy báo cáo vận hành shipper:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy báo cáo vận hành!' });
  }
};

/**
 * 3. Báo cáo Kinh doanh Kính mắt (/api/dashboard/products)
 * - Tỷ lệ % số lượng đơn có kính độ (hasPrescription: true) vs kính thời trang (false)
 * - Top 5 sản phẩm bán chạy nhất kèm số lượng tồn kho
 */
exports.getProductsReport = async (req, res) => {
  try {
    // A. Tỷ lệ kính độ vs kính thời trang (Duyệt theo order level dựa vào items.hasPrescription)
    const prescriptionAgg = await Order.aggregate([
      {
        $group: {
          _id: { $anyElementTrue: '$items.hasPrescription' },
          count: { $sum: 1 }
        }
      }
    ]);

    let prescriptionCount = 0;
    let fashionCount = 0;

    prescriptionAgg.forEach(stat => {
      if (stat._id === true) {
        prescriptionCount = stat.count;
      } else {
        fashionCount = stat.count;
      }
    });

    const totalOrders = prescriptionCount + fashionCount;
    const prescriptionPercent = totalOrders > 0 ? parseFloat(((prescriptionCount / totalOrders) * 100).toFixed(1)) : 0;
    const fashionPercent = totalOrders > 0 ? parseFloat((100 - prescriptionPercent).toFixed(1)) : 0;

    const prescriptionRatio = [
      { name: 'Kính độ', value: prescriptionCount, percentage: prescriptionPercent },
      { name: 'Kính thời trang', value: fashionCount, percentage: fashionPercent }
    ];

    // B. Top 5 sản phẩm bán chạy nhất
    const topProducts = await Order.aggregate([
      {
        $match: {
          status: { $in: ['completed', 'shipped'] }
        }
      },
      {
        $unwind: '$items'
      },
      {
        $group: {
          _id: '$items.productId',
          soldQty: { $sum: '$items.quantity' }
        }
      },
      {
        $sort: { soldQty: -1 }
      },
      {
        $limit: 5
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'productInfo'
        }
      },
      {
        $unwind: '$productInfo'
      },
      {
        $project: {
          productId: '$_id',
          name: '$productInfo.name',
          stock: '$productInfo.stock',
          soldQty: 1,
          _id: 0
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        prescriptionRatio,
        topProducts
      }
    });
  } catch (error) {
    console.error('Lỗi lấy báo cáo sản phẩm:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy báo cáo kinh doanh kính mắt!' });
  }
};

/**
 * 4. Báo cáo Hành vi Khách hàng (/api/dashboard/customers)
 * - Gom nhóm và đếm các lý do hủy đơn (cancelReason)
 */
exports.getCustomersReport = async (req, res) => {
  try {
    const cancelReasons = await Order.aggregate([
      {
        $match: {
          status: 'cancelled'
        }
      },
      {
        $group: {
          _id: {
            $cond: [
              {
                $or: [
                  { $eq: ['$cancelReason', null] },
                  { $eq: [{ $trim: { input: '$cancelReason' } }, ''] }
                ]
              },
              'Không rõ lý do',
              { $trim: { input: '$cancelReason' } }
            ]
          },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          name: '$_id',
          value: '$count',
          _id: 0
        }
      },
      {
        $sort: { value: -1 }
      }
    ]);

    res.json({
      success: true,
      data: {
        cancelReasons
      }
    });
  } catch (error) {
    console.error('Lỗi lấy báo cáo lý do hủy đơn:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy báo cáo hành vi khách hàng!' });
  }
};

/**
 * 5. Báo cáo Đối soát Tài chính: Dự kiến vs Thực tế (/api/dashboard/finance/comparison)
 */
exports.getFinancialComparison = async (req, res) => {
  try {
    const comparison = await Order.aggregate([
      {
        $match: {
          status: { $ne: 'cancelled' }
        }
      },
      {
        $group: {
          _id: null,
          expectedRevenue: { $sum: '$total' },
          expectedCost: {
            $sum: {
              $reduce: {
                input: '$items',
                initialValue: 0,
                in: {
                  $add: [
                    '$$value',
                    { $multiply: [{ $ifNull: ['$$this.importPriceAtPurchase', 0] }, '$$this.quantity'] }
                  ]
                }
              }
            }
          },
          actualRevenue: {
            $sum: {
              $cond: [
                { $in: ['$status', ['completed', 'shipped']] },
                '$total',
                0
              ]
            }
          },
          actualCost: {
            $sum: {
              $cond: [
                { $in: ['$status', ['completed', 'shipped']] },
                {
                  $reduce: {
                    input: '$items',
                    initialValue: 0,
                    in: {
                      $add: [
                        '$$value',
                        { $multiply: [{ $ifNull: ['$$this.importPriceAtPurchase', 0] }, '$$this.quantity'] }
                      ]
                    }
                  }
                },
                0
              ]
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          expectedRevenue: 1,
          expectedCost: 1,
          expectedProfit: { $subtract: ['$expectedRevenue', '$expectedCost'] },
          actualRevenue: 1,
          actualCost: 1,
          actualProfit: { $subtract: ['$actualRevenue', '$actualCost'] },
          revenueShortfall: { $subtract: ['$expectedRevenue', '$actualRevenue'] },
          revenueShortfallPercent: {
            $cond: [
              { $gt: ['$expectedRevenue', 0] },
              {
                $multiply: [
                  { $divide: [{ $subtract: ['$expectedRevenue', '$actualRevenue'] }, '$expectedRevenue'] },
                  100
                ]
              },
              0
            ]
          },
          profitShortfall: {
            $subtract: [
              { $subtract: ['$expectedRevenue', '$expectedCost'] },
              { $subtract: ['$actualRevenue', '$actualCost'] }
            ]
          },
          profitShortfallPercent: {
            $cond: [
              { $gt: [{ $subtract: ['$expectedRevenue', '$expectedCost'] }, 0] },
              {
                $multiply: [
                  {
                    $divide: [
                      {
                        $subtract: [
                          { $subtract: ['$expectedRevenue', '$expectedCost'] },
                          { $subtract: ['$actualRevenue', '$actualCost'] }
                        ]
                      },
                      { $subtract: ['$expectedRevenue', '$expectedCost'] }
                    ]
                  },
                  100
                ]
              },
              0
            ]
          }
        }
      }
    ]);

    // Trả về kết quả đầu tiên (do id: null gom nhóm 1 bản ghi duy nhất)
    const result = comparison.length > 0 ? comparison[0] : {
      expectedRevenue: 0,
      expectedCost: 0,
      expectedProfit: 0,
      actualRevenue: 0,
      actualCost: 0,
      actualProfit: 0,
      revenueShortfall: 0,
      revenueShortfallPercent: 0,
      profitShortfall: 0,
      profitShortfallPercent: 0
    };

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Lỗi lấy báo cáo đối soát tài chính:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy báo cáo đối soát tài chính!' });
  }
};

/**
 * 6. Báo cáo Hiệu suất Sản phẩm: Top 10 Bán chạy & Top 10 Bán chậm (/api/dashboard/products/performance)
 */
exports.getProductsPerformance = async (req, res) => {
  try {
    // 1. Top 10 bán chạy nhất (Đơn khác cancelled)
    const topSelling = await Order.aggregate([
      { $match: { status: { $ne: 'cancelled' } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          soldQty: { $sum: '$items.quantity' }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'productInfo'
        }
      },
      { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          productId: '$_id',
          name: { $ifNull: ['$productInfo.name', 'Sản phẩm đã bị xóa'] },
          stock: { $ifNull: ['$productInfo.stock', 0] },
          images: { $ifNull: ['$productInfo.images', []] },
          value: '$soldQty' // format của Tremor BarList cần trường 'value'
        }
      },
      { $sort: { value: -1 } },
      { $limit: 10 }
    ]);

    // 2. Top 10 bán chậm nhất (chỉ xét sản phẩm tạo trên 30 ngày)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const topSlowest = await Product.aggregate([
      {
        $match: {
          createdAt: { $lt: thirtyDaysAgo }
        }
      },
      {
        $lookup: {
          from: 'orders',
          let: { prodId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $ne: ['$status', 'cancelled'] },
                    { $in: ['$$prodId', '$items.productId'] }
                  ]
                }
              }
            },
            { $unwind: '$items' },
            {
              $match: {
                $expr: { $eq: ['$items.productId', '$$prodId'] }
              }
            },
            {
              $group: {
                _id: null,
                totalQty: { $sum: '$items.quantity' }
              }
            }
          ],
          as: 'sales'
        }
      },
      {
        $project: {
          _id: 0,
          productId: '$_id',
          name: '$name',
          stock: '$stock',
          images: '$images',
          value: {
            $ifNull: [{ $arrayElemAt: ['$sales.totalQty', 0] }, 0]
          }
        }
      },
      { $sort: { value: 1, stock: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      success: true,
      data: {
        topSelling,
        topSlowest
      }
    });
  } catch (error) {
    console.error('Lỗi lấy báo cáo sản phẩm:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy báo cáo hiệu suất sản phẩm!' });
  }
};

/**
 * 7. Báo cáo Doanh thu theo Thương hiệu (/api/dashboard/brands/top)
 */
exports.getTopBrandsReport = async (req, res) => {
  try {
    const brandPerformance = await Order.aggregate([
      { $match: { status: { $ne: 'cancelled' } } },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'brands',
          localField: 'product.brand',
          foreignField: '_id',
          as: 'brandInfo'
        }
      },
      { $unwind: { path: '$brandInfo', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$product.brand',
          brandName: { $first: { $ifNull: ['$brandInfo.name', 'Không rõ nhãn hàng'] } },
          revenue: {
            $sum: { $multiply: ['$items.quantity', '$items.priceAtPurchase'] }
          }
        }
      },
      {
        $project: {
          _id: 0,
          brandId: '$_id',
          name: '$brandName', // format Tremor BarChart cần trường name
          'Doanh thu': '$revenue' // Thể hiện rõ ràng doanh thu trên cột BarChart
        }
      },
      { $sort: { 'Doanh thu': -1 } }
    ]);

    res.json({
      success: true,
      data: brandPerformance
    });
  } catch (error) {
    console.error('Lỗi lấy báo cáo thương hiệu:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy báo cáo doanh số thương hiệu!' });
  }
};

/**
 * 8. Báo cáo Tỉ lệ trạng thái Đơn hàng (/api/dashboard/orders/ratio)
 */
exports.getOrderRatio = async (req, res) => {
  try {
    const stats = await Order.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: {
            $sum: {
              $cond: [{ $in: ['$status', ['completed', 'shipped']] }, 1, 0]
            }
          },
          cancelled: {
            $sum: {
              $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0]
            }
          },
          others: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$status', 'completed'] },
                    { $ne: ['$status', 'shipped'] },
                    { $ne: ['$status', 'cancelled'] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const data = stats.length > 0 ? stats[0] : { total: 0, completed: 0, cancelled: 0, others: 0 };
    const total = data.total || 0;

    // Tính toán số lượng đơn khác
    const completedVal = data.completed || 0;
    const cancelledVal = data.cancelled || 0;
    const othersVal = Math.max(0, total - (completedVal + cancelledVal));

    const result = [
      {
        name: 'Thành công',
        value: completedVal,
        percentage: total > 0 ? parseFloat(((completedVal / total) * 100).toFixed(2)) : 0
      },
      {
        name: 'Đã hủy',
        value: cancelledVal,
        percentage: total > 0 ? parseFloat(((cancelledVal / total) * 100).toFixed(2)) : 0
      },
      {
        name: 'Trạng thái khác',
        value: othersVal,
        percentage: total > 0 ? parseFloat(((othersVal / total) * 100).toFixed(2)) : 0
      }
    ];

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Lỗi lấy báo cáo tỉ lệ đơn hàng:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy báo cáo tỷ lệ đơn hàng!' });
  }
};

/**
 * 9. Báo cáo Chi tiết Đơn hàng phục vụ Drill-down (/api/dashboard/details/orders)
 */
exports.getOrderDetailReport = async (req, res) => {
  try {
    const { filter } = req.query;
    const query = {};
    
    const now = new Date();
    // Shift current server time to GMT+7 equivalent timezone representation
    const localNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const startOfToday = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()) - 7 * 60 * 60 * 1000);
    const startOfMonth = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), 1) - 7 * 60 * 60 * 1000);
    const startOfYear = new Date(Date.UTC(localNow.getUTCFullYear(), 0, 1) - 7 * 60 * 60 * 1000);

    if (filter === 'today') {
      query.createdAt = { $gte: startOfToday };
    } else if (filter === 'thisMonth' || filter === 'profitMonth') {
      query.createdAt = { $gte: startOfMonth };
    } else if (filter === 'thisYear' || filter === 'profitYear') {
      query.createdAt = { $gte: startOfYear };
    }

    // Quy tắc Trạng thái: Chỉ lấy các đơn hàng có trạng thái tạo ra dòng tiền thật đối với profitMonth/profitYear
    if (filter === 'profitMonth' || filter === 'profitYear') {
      query.status = { $in: ['completed', 'shipped', 'shipping'] };
    }

    // Fetch orders (sort by newest)
    let ordersQuery = Order.find(query);
    if (filter === 'profitMonth' || filter === 'profitYear') {
      ordersQuery = ordersQuery.populate('items.productId');
    }
    const orders = await ordersQuery.sort({ createdAt: -1 });

    const data = orders.map(o => {
      let statusText = 'Chờ xử lý';
      if (o.status === 'completed') statusText = 'Đã hoàn thành';
      else if (o.status === 'processing') statusText = 'Đang xử lý';
      else if (o.status === 'shipping') statusText = 'Đang giao';
      else if (o.status === 'shipped') statusText = 'Đã giao (Chờ thu tiền)';
      else if (o.status === 'cancel_requested') statusText = 'Yêu cầu hủy đơn';
      else if (o.status === 'cancelled') statusText = 'Đã hủy';

      const formattedDate = new Date(o.createdAt).toLocaleDateString('vi-VN');

      let orderTotal = o.total || 0;
      if (filter === 'profitMonth' || filter === 'profitYear') {
        let totalCost = 0;
        o.items.forEach(item => {
          const qty = item.quantity || 0;
          let importPrice = item.importPriceAtPurchase || 0;
          // Fallback to product's current importPrice if importPriceAtPurchase is not saved or is 0
          if (!importPrice && item.productId && item.productId.importPrice) {
            importPrice = item.productId.importPrice;
          }
          totalCost += importPrice * qty;
        });
        orderTotal = (o.total || 0) - totalCost;
      }

      return {
        code: o.orderCode || o._id.toString().substring(18).toUpperCase(),
        date: formattedDate,
        customer: o.customerInfo?.name || o.username || 'Khách vãng lai',
        status: statusText,
        total: orderTotal
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('Lỗi lấy chi tiết đơn hàng:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy chi tiết đơn hàng!' });
  }
};

/**
 * 10. Báo cáo Chi tiết Tồn kho phục vụ Drill-down (/api/dashboard/details/inventory)
 */
exports.getInventoryDetailReport = async (req, res) => {
  try {
    // CHỈ truy vấn các sản phẩm thỏa mãn điều kiện có số lượng tồn kho lớn hơn 0
    const products = await Product.find({ stock: { $gt: 0 } })
      .select('name stock importPrice')
      .sort({ stock: 1 });

    const data = products.map(p => ({
      name: p.name,
      sku: 'SP-' + p._id.toString().substring(18).toUpperCase(),
      stock: p.stock || 0,
      importPrice: p.importPrice || 0,
      value: (p.importPrice || 0) * (p.stock || 0)
    }));

    res.json({ success: true, data });
  } catch (error) {
    console.error('Lỗi lấy chi tiết tồn kho:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy chi tiết tồn kho!' });
  }
};

/**
 * 11. Báo cáo Chi tiết Tài chính & Lợi nhuận sản phẩm (/api/reports/finance-details)
 */
exports.getFinanceReportDetails = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const matchStage = {
      status: { $in: ['completed', 'shipped', 'shipping'] }
    };

    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        matchStage.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        matchStage.createdAt.$lte = end;
      }
    }

    const reportData = await Order.aggregate([
      // $match: Chỉ thống kê các đơn hàng tạo ra dòng tiền thực tế và nằm trong khoảng ngày
      {
        $match: matchStage
      },
      // $unwind: Tách các mảng items trong mỗi đơn hàng
      {
        $unwind: '$items'
      },
      // $group: Nhóm theo items.productId để tính toán các chỉ số
      {
        $group: {
          _id: '$items.productId',
          value: { $sum: '$items.quantity' },
          totalSale: { $sum: { $multiply: ['$items.priceAtPurchase', '$items.quantity'] } },
          totalImport: {
            $sum: {
              $multiply: [
                { $ifNull: ['$items.importPriceAtPurchase', 0] },
                '$items.quantity'
              ]
            }
          }
        }
      },
      // $lookup: Nối với collection products để lấy tên và ảnh sản phẩm
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'productDoc'
        }
      },
      // $unwind: Làm phẳng mảng kết quả từ bước lookup
      {
        $unwind: {
          path: '$productDoc',
          preserveNullAndEmptyArrays: true
        }
      },
      // $project: Định dạng dữ liệu đầu ra khớp hoàn hảo với Frontend
      {
        $project: {
          productId: '$_id',
          name: { $ifNull: ['$productDoc.name', 'Sản phẩm đã xóa'] },
          images: { $ifNull: ['$productDoc.images', []] },
          value: 1,
          importPrice: {
            $cond: [
              { $gt: ['$value', 0] },
              { $divide: ['$totalImport', '$value'] },
              0
            ]
          },
          salePrice: {
            $cond: [
              { $gt: ['$value', 0] },
              { $divide: ['$totalSale', '$value'] },
              0
            ]
          },
          totalSale: 1,
          totalImport: 1,
          profit: { $subtract: ['$totalSale', '$totalImport'] },
          _id: 0
        }
      },
      // $sort: Sắp xếp theo Lợi nhuận giảm dần
      {
        $sort: {
          profit: -1
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: reportData
    });
  } catch (error) {
    console.error('Lỗi lấy báo cáo chi tiết tài chính:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi kết xuất báo cáo tài chính!'
    });
  }
};



