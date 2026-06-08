require('dotenv').config({ path: '../backend/.env' });
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    const User = require('../backend/models/User');
    const users = await User.find({}, 'username name role');
    console.log('--- ALL USERS ---');
    console.log(users);
    mongoose.connection.close();
  })
  .catch(err => {
    console.error(err);
  });
