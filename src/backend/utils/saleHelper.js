const Sale = require('../models/Sale');

/**
 * Lấy danh sách toàn bộ các chiến dịch khuyến mãi đang hiệu lực
 * (isActive === true và thời gian hiện tại nằm giữa startDate và endDate)
 */
async function getActiveSales() {
  const now = new Date();
  return await Sale.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now }
  });
}

/**
 * Tính toán chiến dịch khuyến mãi tốt nhất áp dụng cho 1 sản phẩm cụ thể
 * (Chọn chiến dịch giảm được nhiều tiền nhất, có kiểm tra quota số lượng)
 */
function calculateBestSaleForProduct(product, activeSales) {
  const originalPrice = product.price || 0;
  let bestValidDiscountAmount = 0;
  let bestValidSale = null;

  let bestOverallDiscountAmount = 0;
  let bestOverallSale = null;

  if (!activeSales || activeSales.length === 0) {
    return {
      salePrice: originalPrice,
      discountPercent: 0,
      activeSale: null,
      remainingSaleQuantity: null,
      saleQuotaStatus: 'unlimited'
    };
  }

  for (const sale of activeSales) {
    // 1. Kiểm tra điều kiện khớp sản phẩm
    const hasProducts = sale.applicableProducts && sale.applicableProducts.length > 0;
    const hasCategories = sale.applicableCategories && sale.applicableCategories.length > 0;

    const isProductMatch = hasProducts && sale.applicableProducts.some(pId => pId.toString() === product._id.toString());
    
    // Hỗ trợ product.category dạng Object (được populate) hoặc dạng ObjectId/String
    const prodCatId = product.category?._id ? product.category._id.toString() : product.category?.toString();
    const isCategoryMatch = hasCategories && prodCatId && sale.applicableCategories.some(cId => cId.toString() === prodCatId);

    // Nếu cả hai mảng đều trống -> Áp dụng cho toàn bộ cửa hàng
    const isGlobalSale = !hasProducts && !hasCategories;

    if (isProductMatch || isCategoryMatch || isGlobalSale) {
      let discountAmount = 0;

      if (sale.discountType === 'percent') {
        discountAmount = originalPrice * (sale.discountValue / 100);
      } else if (sale.discountType === 'fixed') {
        discountAmount = Math.max(0, originalPrice - sale.discountValue);
      }

      // Giới hạn số tiền giảm tối đa không vượt quá giá gốc của sản phẩm
      discountAmount = Math.min(originalPrice, discountAmount);

      // Theo dõi overall sale tốt nhất (bất kể quota) để có thể xác định trạng thái sold_out sau này
      if (discountAmount > bestOverallDiscountAmount) {
        bestOverallDiscountAmount = discountAmount;
        bestOverallSale = sale;
      }

      // Kiểm tra quota còn hay không
      const isSoldOut = sale.usageLimitType === 'limited' && sale.usedCount >= sale.usageLimit;
      if (!isSoldOut) {
        if (discountAmount > bestValidDiscountAmount) {
          bestValidDiscountAmount = discountAmount;
          bestValidSale = sale;
        }
      }
    }
  }

  if (bestValidSale) {
    const bestSalePrice = Math.max(0, originalPrice - bestValidDiscountAmount);
    let bestDiscountPercent = originalPrice > 0 ? Math.round(((originalPrice - bestSalePrice) / originalPrice) * 100) : 0;
    bestDiscountPercent = Math.min(100, Math.max(0, bestDiscountPercent));

    return {
      salePrice: Math.round(bestSalePrice),
      discountPercent: bestDiscountPercent,
      activeSale: {
        _id: bestValidSale._id,
        name: bestValidSale.name,
        discountType: bestValidSale.discountType,
        discountValue: bestValidSale.discountValue,
        usageLimitType: bestValidSale.usageLimitType,
        usageLimit: bestValidSale.usageLimit,
        usedCount: bestValidSale.usedCount
      },
      remainingSaleQuantity: bestValidSale.usageLimitType === 'limited' ? Math.max(0, bestValidSale.usageLimit - bestValidSale.usedCount) : null,
      saleQuotaStatus: bestValidSale.usageLimitType === 'limited' ? 'available' : 'unlimited'
    };
  }

  // Nếu không có sale hợp lệ nào nhưng có sale khớp bị sold_out
  if (bestOverallSale) {
    return {
      salePrice: originalPrice,
      discountPercent: 0,
      activeSale: null,
      remainingSaleQuantity: 0,
      saleQuotaStatus: 'sold_out'
    };
  }

  // Không có sale nào khớp
  return {
    salePrice: originalPrice,
    discountPercent: 0,
    activeSale: null,
    remainingSaleQuantity: null,
    saleQuotaStatus: 'unlimited'
  };
}

/**
 * Gắn thêm thông tin khuyến mãi động trực tiếp vào đối tượng sản phẩm
 */
function attachSaleInfoToProduct(product, activeSales) {
  // Chuyển đối tượng Mongoose sang đối tượng JavaScript thuần để thêm các thuộc tính động
  const productObj = typeof product.toObject === 'function' ? product.toObject() : product;
  const saleInfo = calculateBestSaleForProduct(productObj, activeSales);

  return {
    ...productObj,
    originalPrice: productObj.price || 0,
    salePrice: saleInfo.salePrice,
    discountPercent: saleInfo.discountPercent,
    activeSale: saleInfo.activeSale,
    remainingSaleQuantity: saleInfo.remainingSaleQuantity,
    saleQuotaStatus: saleInfo.saleQuotaStatus
  };
}

module.exports = {
  getActiveSales,
  calculateBestSaleForProduct,
  attachSaleInfoToProduct
};
