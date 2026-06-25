const mongoose = require('mongoose');
const Conversation = require('./models/Conversation');
const User = require('./models/User');
require('dotenv').config();

async function check() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');
    const convs = await Conversation.find().populate('customer', 'username name email role');
    console.log('--- DANH SÁCH HỘI THOẠI ---');
    convs.forEach(c => {
      console.log(`ID: ${c._id}, Customer: ${c.customer?.username} (Name: ${c.customer?.name}, Role: ${c.customer?.role}), Status: ${c.status}, Unread Staff: ${c.unreadCountByStaff}, Unread Cust: ${c.unreadCountByCustomer}`);
    });
    console.log('---------------------------');
    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
}
check();
