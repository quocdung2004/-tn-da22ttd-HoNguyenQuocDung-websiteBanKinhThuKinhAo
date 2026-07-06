const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();
const Order = require('./models/Order');

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');
  const count = await Order.countDocuments({});
  console.log('Total orders:', count);

  const cancelledOrders = await Order.find({ status: 'cancelled' }).limit(5);
  console.log('Cancelled orders cancelReason:', cancelledOrders.map(o => ({
    orderCode: o.orderCode,
    status: o.status,
    cancelReason: o.cancelReason,
    codStatus: o.codStatus
  })));

  const groupCancel = await Order.aggregate([
    { $match: { status: 'cancelled' } },
    { $group: { _id: '$cancelReason', count: { $sum: 1 } } }
  ]);
  console.log('Grouped cancel reasons:', groupCancel);

  const groupCod = await Order.aggregate([
    { $group: { _id: '$codStatus', count: { $sum: 1 } } }
  ]);
  console.log('Grouped COD statuses:', groupCod);

  process.exit(0);
}

test();
