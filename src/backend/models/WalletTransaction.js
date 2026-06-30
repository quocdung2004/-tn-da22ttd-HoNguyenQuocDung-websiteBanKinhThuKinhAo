const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  walletId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Wallet', 
    required: true 
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  amount: { 
    type: Number, 
    required: true 
  },
  balanceAfter: { 
    type: Number, 
    required: true 
  },
  type: { 
    type: String, 
    enum: ['refund', 'payment', 'withdraw_completed'], 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['success', 'pending', 'failed'], 
    required: true,
    default: 'success'
  },
  referenceId: { 
    type: mongoose.Schema.Types.ObjectId 
  },
  referenceType: { 
    type: String, 
    enum: ['Order', 'WithdrawRequest'] 
  },
  note: { 
    type: String 
  }
}, { timestamps: true });

module.exports = mongoose.model('WalletTransaction', transactionSchema);
