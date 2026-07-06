const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();
const { getCustomersReport } = require('./controllers/dashboardController');

const req = {};
const res = {
  json: function(data) {
    console.log('Response JSON:', JSON.stringify(data, null, 2));
    process.exit(0);
  },
  status: function(code) {
    console.log('Response Status:', code);
    return this;
  }
};

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');
  await getCustomersReport(req, res);
}

test();
