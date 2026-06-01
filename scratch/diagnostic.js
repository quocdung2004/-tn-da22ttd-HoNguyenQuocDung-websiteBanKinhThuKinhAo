const mongoose = require('mongoose');
const path = require('path');

// Setup Mongoose connection
const mongoURI = 'mongodb://localhost:27017/thucTapTotNghiep' || 'mongodb://127.0.0.1:27017/thucTapTotNghiep'; // standard default path for local dev

const Order = require('../backend/models/Order');
const Product = require('../backend/models/Product');

async function run() {
  try {
    await mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('⚡ Connected to MongoDB for diagnosis...');

    const validOrders = await Order.find({ 
      status: { $in: ['paid', 'processing', 'shipping', 'shipped', 'completed'] } 
    }).populate('items.productId');

    console.log(`\nFound ${validOrders.length} valid orders. Printing item details:\n`);

    let calculatedRevenue = 0;
    let calculatedProfit = 0;

    validOrders.forEach((order, idx) => {
      console.log(`--- Order #${idx + 1} (${order.orderCode}) - Status: ${order.status} ---`);
      order.items.forEach((item, itemIdx) => {
        const product = item.productId;
        const productName = product ? product.name : 'Unknown Product';
        const qty = item.quantity || 0;
        const price = item.priceAtPurchase || item.price || 0;
        const importPriceAtPurchase = item.importPriceAtPurchase || 0;
        const currentImportPrice = product ? (product.importPrice || 0) : 0;

        let resolvedCost = importPriceAtPurchase;
        let isFallbackUsed = false;
        if (resolvedCost <= 0) {
          resolvedCost = currentImportPrice;
          isFallbackUsed = true;
        }

        const profitPerUnit = price - resolvedCost;
        const totalItemProfit = profitPerUnit * qty;

        calculatedRevenue += price * qty;
        calculatedProfit += totalItemProfit;

        console.log(`  Item #${itemIdx + 1}: ${productName}`);
        console.log(`    Qty: ${qty}`);
        console.log(`    Price at purchase: ${price.toLocaleString('vi-VN')}đ`);
        console.log(`    Import price at purchase: ${importPriceAtPurchase.toLocaleString('vi-VN')}đ`);
        console.log(`    Current product importPrice (fallback): ${currentImportPrice.toLocaleString('vi-VN')}đ`);
        console.log(`    Resolved Cost: ${resolvedCost.toLocaleString('vi-VN')}đ (Fallback used: ${isFallbackUsed})`);
        console.log(`    Profit per unit: ${profitPerUnit.toLocaleString('vi-VN')}đ`);
        console.log(`    Total item profit: ${totalItemProfit.toLocaleString('vi-VN')}đ`);
      });
      console.log(`  Order Net Total: ${order.total.toLocaleString('vi-VN')}đ`);
      console.log('');
    });

    console.log('==================================================');
    console.log(`Calculated Total Revenue: ${calculatedRevenue.toLocaleString('vi-VN')}đ`);
    console.log(`Calculated Total Profit: ${calculatedProfit.toLocaleString('vi-VN')}đ`);
    console.log('==================================================');

    await mongoose.disconnect();
    console.log('⚡ Diagnosed successfully and disconnected.');
  } catch (error) {
    console.error('Diagnostic error:', error);
  }
}

run();
