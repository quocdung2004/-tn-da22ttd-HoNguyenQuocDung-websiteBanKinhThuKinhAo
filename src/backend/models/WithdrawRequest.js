const mongoose = require('mongoose');

const withdrawSchema = new mongoose.Schema({
  withdrawCode: { 
    type: String, 
    required: true, 
    unique: true 
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
  bankName: { 
    type: String, 
    required: true 
  },
  bankAccountNumber: { 
    type: String, 
    required: true 
  },
  accountHolderName: { 
    type: String, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['pending', 'completed', 'rejected', 'customer_cancelled', 'disputed', 'resolved'], 
    default: 'pending' 
  },
  rejectReason: { 
    type: String 
  },
  disputeReason: {
    type: String
  },
  disputedAt: {
    type: Date
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolvedAt: {
    type: Date
  },
  resolveNote: {
    type: String
  },
  handledBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  handledAt: { 
    type: Date 
  },
  transactionCode: { 
    type: String 
  },
  qrContent: { 
    type: String 
  },
  qrUrl: { 
    type: String 
  },
  note: { 
    type: String 
  }
}, { timestamps: true });

module.exports = mongoose.model('WithdrawRequest', withdrawSchema);
