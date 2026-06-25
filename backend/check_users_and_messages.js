const mongoose = require('mongoose');
const Conversation = require('./models/Conversation');
const Message = require('./models/Message');
const User = require('./models/User');
require('dotenv').config();

async function check() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');
    
    const users = await User.find();
    console.log('--- ALL USERS ---');
    users.forEach(u => console.log(`ID: ${u._id}, Username: ${u.username}, Name: ${u.name}, Role: ${u.role}`));

    const convs = await Conversation.find().populate('customer', 'username name');
    console.log('\n--- ALL CONVERSATIONS ---');
    convs.forEach(c => console.log(`ID: ${c._id}, Customer: ${c.customer?.username || 'N/A'}, Status: ${c.status}`));

    const msgs = await Message.find();
    console.log('\n--- ALL MESSAGES ---');
    msgs.forEach(m => console.log(`ID: ${m._id}, ConvID: ${m.conversationId}, Sender: ${m.sender}, Content: "${m.content}", Role: ${m.senderRole}`));

    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
}
check();
