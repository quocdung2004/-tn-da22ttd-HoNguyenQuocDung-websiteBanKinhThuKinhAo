const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const WithdrawRequest = require('../models/WithdrawRequest');
const User = require('../models/User');
const { createNotificationAndEmit } = require('../utils/notificationHelper');
const { emitToUser, emitToStaff, emitToAdmin } = require('../socket');

// Helper tự động khởi tạo ví nếu chưa có
const getOrCreateWallet = async (userId) => {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = new Wallet({ userId, balance: 0, lockedBalance: 0 });
    await wallet.save();
  }
  return wallet;
};

// 1. GET /api/wallet (Customer lấy thông tin ví & lịch sử giao dịch)
exports.getWallet = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const wallet = await getOrCreateWallet(userId);

    // Lấy toàn bộ giao dịch ví của user
    const transactions = await WalletTransaction.find({ userId })
      .sort({ createdAt: -1 });

    // Lấy danh sách yêu cầu rút tiền của user
    const withdrawals = await WithdrawRequest.find({ userId })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      wallet,
      transactions,
      withdrawals
    });
  } catch (error) {
    console.error('Lỗi khi lấy ví khách hàng:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống khi lấy thông tin ví!' });
  }
};

// 2. POST /api/wallet/withdraw (Customer tạo yêu cầu rút tiền ví nội bộ)
exports.withdrawRequest = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { amount, bankName, bankAccountNumber, accountHolderName } = req.body;

    // Validate số tiền rút phải hợp lệ
    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Số tiền rút phải lớn hơn 0!' });
    }

    // Validate các trường thông tin ngân hàng bắt buộc
    if (!bankName || !bankName.trim()) {
      return res.status(400).json({ success: false, message: 'Tên ngân hàng không được để trống!' });
    }
    if (!bankAccountNumber || !bankAccountNumber.trim()) {
      return res.status(400).json({ success: false, message: 'Số tài khoản ngân hàng không được để trống!' });
    }
    if (!accountHolderName || !accountHolderName.trim()) {
      return res.status(400).json({ success: false, message: 'Tên chủ tài khoản không được để trống!' });
    }

    // Tự động đảm bảo ví tồn tại trước
    const wallet = await getOrCreateWallet(userId);

    if (wallet.balance < parsedAmount) {
      return res.status(400).json({ success: false, message: 'Số dư khả dụng trong ví không đủ để rút tiền!' });
    }

    // Cập nhật số dư nguyên tử (Atomic Update) - Đóng băng tiền rút
    const updatedWallet = await Wallet.findOneAndUpdate(
      { userId, balance: { $gte: parsedAmount } },
      { $inc: { balance: -parsedAmount, lockedBalance: parsedAmount } },
      { new: true }
    );

    if (!updatedWallet) {
      return res.status(400).json({ success: false, message: 'Rút tiền thất bại! Số dư ví khả dụng thay đổi hoặc không đủ.' });
    }

    // Sinh mã withdrawCode unique
    const withdrawCode = `WD${Date.now().toString().slice(-6)}${Math.floor(1000 + Math.random() * 9000)}`;

    // Tạo qrUrl VietQR
    const addInfo = `RUT TIEN MA ${withdrawCode}`;
    const qrUrl = `https://img.vietqr.io/image/${encodeURIComponent(bankName.trim())}-${encodeURIComponent(bankAccountNumber.trim())}-compact.png?amount=${parsedAmount}&addInfo=${encodeURIComponent(addInfo)}&accountName=${encodeURIComponent(accountHolderName.trim())}`;

    // Tạo bản ghi yêu cầu rút
    const newRequest = new WithdrawRequest({
      withdrawCode,
      userId,
      amount: parsedAmount,
      bankName: bankName.trim(),
      bankAccountNumber: bankAccountNumber.trim(),
      accountHolderName: accountHolderName.trim(),
      status: 'pending',
      qrContent: addInfo,
      qrUrl
    });

    await newRequest.save();

    // ================= REALTIME INTEGRATION (PHASE 3) =================
    // 1. Tạo thông báo lưu DB + Phát Socket cho Staff và Admin
    const customerUser = await User.findById(userId);
    const customerName = customerUser ? (customerUser.name || customerUser.username) : 'Khách hàng';
    
    await createNotificationAndEmit({
      roleTarget: 'staff',
      type: 'withdraw',
      title: 'Có yêu cầu rút tiền mới',
      message: `${customerName} vừa gửi yêu cầu rút tiền số tiền ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(parsedAmount)}`,
      link: '/staff/withdraw-requests'
    });

    await createNotificationAndEmit({
      roleTarget: 'admin',
      type: 'withdraw',
      title: 'Có yêu cầu rút tiền mới',
      message: `${customerName} vừa gửi yêu cầu rút tiền số tiền ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(parsedAmount)}`,
      link: '/admin/withdraw-requests'
    });

    // 2. Phát Socket signal thông báo danh sách cần tải lại
    emitToStaff('withdraw:requested', { id: newRequest._id, withdrawCode });
    emitToAdmin('withdraw:requested', { id: newRequest._id, withdrawCode });
    // ==================================================================

    res.status(201).json({
      success: true,
      message: 'Tạo yêu cầu rút tiền thành công! Vui lòng đợi quản trị viên phê duyệt chuyển khoản.',
      withdrawRequest: newRequest,
      wallet: updatedWallet
    });
  } catch (error) {
    console.error('Lỗi tạo yêu cầu rút tiền:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tạo yêu cầu rút tiền!' });
  }
};

// 3. POST /api/wallet/withdraw/:id/cancel (Customer tự hủy yêu cầu rút tiền pending)
exports.cancelWithdrawRequest = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { id } = req.params;

    const request = await WithdrawRequest.findById(id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu rút tiền!' });
    }

    // Bảo vệ BOLA
    if (request.userId.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Quyền truy cập bị từ chối! Bạn không sở hữu yêu cầu rút tiền này.' });
    }

    // Chỉ xử lý nếu withdraw.status === 'pending'
    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Chỉ có thể hủy yêu cầu rút tiền khi ở trạng thái chờ duyệt!' });
    }

    // Đổi trạng thái yêu cầu
    request.status = 'customer_cancelled';
    await request.save();

    // Hoàn lockedBalance về balance đúng 1 lần
    const updatedWallet = await Wallet.findOneAndUpdate(
      { userId },
      { $inc: { balance: request.amount, lockedBalance: -request.amount } },
      { new: true }
    );

    // ================= REALTIME INTEGRATION (PHASE 3) =================
    // Phát Socket signal báo tải lại giao diện cho các bên liên quan
    emitToUser(userId.toString(), 'withdraw:updated', { id: request._id, status: 'customer_cancelled' });
    emitToStaff('withdraw:updated', { id: request._id, status: 'customer_cancelled' });
    emitToAdmin('withdraw:updated', { id: request._id, status: 'customer_cancelled' });
    // ==================================================================

    res.json({
      success: true,
      message: 'Hủy yêu cầu rút tiền thành công! Số dư đã được hoàn về ví.',
      withdrawRequest: request,
      wallet: updatedWallet
    });
  } catch (error) {
    console.error('Lỗi khi khách hàng tự hủy rút tiền:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống khi khách hàng tự hủy yêu cầu rút tiền!' });
  }
};

// 4. GET /api/wallet/admin/withdrawals (Staff/Admin xem danh sách yêu cầu rút tiền)
exports.getAdminWithdrawals = async (req, res) => {
  try {
    const withdrawals = await WithdrawRequest.find()
      .populate('userId', 'username name email phone')
      .populate('handledBy', 'username name')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      withdrawals
    });
  } catch (error) {
    console.error('Lỗi khi lấy danh sách rút tiền cho admin:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống khi tải danh sách yêu cầu rút tiền!' });
  }
};

// 5. POST /api/wallet/admin/withdrawals/:id/approve (Staff/Admin phê duyệt rút tiền)
exports.approveWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const { transactionCode } = req.body;
    const adminId = req.user.id || req.user._id;

    // transactionCode bắt buộc
    if (!transactionCode || !transactionCode.trim()) {
      return res.status(400).json({ success: false, message: 'Mã giao dịch đối soát ngân hàng là bắt buộc!' });
    }

    const request = await WithdrawRequest.findById(id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu rút tiền!' });
    }

    // Chỉ xử lý nếu withdraw.status === 'pending'
    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Yêu cầu rút tiền không còn ở trạng thái chờ duyệt!' });
    }

    // Trừ lockedBalance đúng 1 lần
    const wallet = await Wallet.findOneAndUpdate(
      { userId: request.userId, lockedBalance: { $gte: request.amount } },
      { $inc: { lockedBalance: -request.amount } },
      { new: true }
    );

    if (!wallet) {
      return res.status(400).json({ success: false, message: 'Lỗi đồng bộ số dư ví tạm giữ của người dùng!' });
    }

    // Đổi trạng thái yêu cầu rút
    request.status = 'completed';
    request.transactionCode = transactionCode.trim();
    request.handledBy = adminId;
    request.handledAt = new Date();
    await request.save();

    // Tạo WalletTransaction type withdraw_completed
    const transaction = new WalletTransaction({
      walletId: wallet._id,
      userId: request.userId,
      amount: request.amount,
      balanceAfter: wallet.balance,
      type: 'withdraw_completed',
      status: 'success',
      referenceId: request._id,
      referenceType: 'WithdrawRequest',
      note: `Rút tiền thành công về ngân hàng ${request.bankName} - Số TK: ${request.bankAccountNumber}. Mã giao dịch đối soát: ${transactionCode.trim()}`
    });
    await transaction.save();

    // ================= REALTIME INTEGRATION (PHASE 3) =================
    // 1. Tạo thông báo kiên định lưu DB + Phát Socket cho Customer sở hữu đơn
    await createNotificationAndEmit({
      userId: request.userId,
      type: 'withdraw',
      title: 'Yêu cầu rút tiền đã hoàn tất',
      message: `Yêu cầu rút tiền ${request.withdrawCode} đã được xác nhận chuyển khoản thành công.`,
      link: '/my-wallet'
    });

    // 2. Phát Socket signal báo tải lại giao diện cho các bên liên quan
    emitToUser(request.userId.toString(), 'withdraw:updated', { id: request._id, status: 'completed' });
    emitToStaff('withdraw:updated', { id: request._id, status: 'completed' });
    emitToAdmin('withdraw:updated', { id: request._id, status: 'completed' });
    // ==================================================================

    res.json({
      success: true,
      message: 'Phê duyệt yêu cầu rút tiền và hoàn tất giải ngân thành công!',
      withdrawRequest: request,
      wallet
    });
  } catch (error) {
    console.error('Lỗi khi admin duyệt rút tiền:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống khi phê duyệt yêu cầu rút tiền!' });
  }
};

// 6. POST /api/wallet/admin/withdrawals/:id/reject (Staff/Admin từ chối rút tiền)
exports.rejectWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectReason } = req.body;
    const adminId = req.user.id || req.user._id;

    // rejectReason bắt buộc
    if (!rejectReason || !rejectReason.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp lý do từ chối cụ thể!' });
    }

    const request = await WithdrawRequest.findById(id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu rút tiền!' });
    }

    // Chỉ xử lý nếu withdraw.status === 'pending'
    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Yêu cầu rút tiền không còn ở trạng thái chờ duyệt!' });
    }

    // Đổi trạng thái yêu cầu
    request.status = 'rejected';
    request.rejectReason = rejectReason.trim();
    request.handledBy = adminId;
    request.handledAt = new Date();
    await request.save();

    // Hoàn lockedBalance về balance đúng 1 lần
    const wallet = await Wallet.findOneAndUpdate(
      { userId: request.userId },
      { $inc: { balance: request.amount, lockedBalance: -request.amount } },
      { new: true }
    );

    // ================= REALTIME INTEGRATION (PHASE 3) =================
    // 1. Tạo thông báo kiên định lưu DB + Phát Socket cho Customer sở hữu đơn
    await createNotificationAndEmit({
      userId: request.userId,
      type: 'withdraw',
      title: 'Yêu cầu rút tiền bị từ chối',
      message: `Yêu cầu rút tiền ${request.withdrawCode} bị từ chối. Lý do: ${rejectReason.trim()}`,
      link: '/my-wallet'
    });

    // 2. Phát Socket signal báo tải lại giao diện cho các bên liên quan
    emitToUser(request.userId.toString(), 'withdraw:updated', { id: request._id, status: 'rejected' });
    emitToStaff('withdraw:updated', { id: request._id, status: 'rejected' });
    emitToAdmin('withdraw:updated', { id: request._id, status: 'rejected' });
    // ==================================================================

    res.json({
      success: true,
      message: 'Đã từ chối yêu cầu rút tiền! Tiền đã được hoàn về ví khách hàng.',
      withdrawRequest: request,
      wallet
    });
  } catch (error) {
    console.error('Lỗi khi admin từ chối rút tiền:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống khi từ chối yêu cầu rút tiền!' });
  }
};

// 7. POST /api/wallet/withdraw/:id/dispute (Customer báo chưa nhận được tiền)
exports.disputeWithdrawRequest = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { id } = req.params;
    const { disputeReason } = req.body;

    if (!disputeReason || !disputeReason.trim()) {
      return res.status(400).json({ success: false, message: 'Lý do khiếu nại không được để trống!' });
    }

    const request = await WithdrawRequest.findById(id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu rút tiền!' });
    }

    // Bảo vệ BOLA
    if (request.userId.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Quyền truy cập bị từ chối! Bạn không sở hữu yêu cầu rút tiền này.' });
    }

    // Customer chỉ được bấm khi status === 'completed'
    if (request.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Chỉ có thể khiếu nại yêu cầu rút tiền đã được xác nhận hoàn tất giải ngân!' });
    }

    request.status = 'disputed';
    request.disputeReason = disputeReason.trim();
    request.disputedAt = new Date();
    await request.save();

    // ================= REALTIME INTEGRATION (PHASE 3) =================
    // 1. Tạo thông báo kiên định lưu DB + Phát Socket cho Staff & Admin
    const customerUser = await User.findById(userId);
    const customerName = customerUser ? (customerUser.name || customerUser.username) : 'Khách hàng';

    await createNotificationAndEmit({
      roleTarget: 'staff',
      type: 'dispute',
      title: 'Khách báo chưa nhận được tiền',
      message: `${customerName} vừa khiếu nại đơn rút ${request.withdrawCode} chưa nhận được tiền`,
      link: '/staff/withdraw-requests'
    });

    await createNotificationAndEmit({
      roleTarget: 'admin',
      type: 'dispute',
      title: 'Khách báo chưa nhận được tiền',
      message: `${customerName} vừa khiếu nại đơn rút ${request.withdrawCode} chưa nhận được tiền`,
      link: '/admin/withdraw-requests'
    });

    // 2. Phát Socket signal báo tải lại giao diện cho các bên liên quan
    emitToStaff('withdraw:disputed', { id: request._id, withdrawCode: request.withdrawCode });
    emitToAdmin('withdraw:disputed', { id: request._id, withdrawCode: request.withdrawCode });
    // ==================================================================

    res.json({
      success: true,
      message: 'Gửi khiếu nại thành công! Ban quản trị sẽ sớm liên hệ để đối soát và xử lý cho bạn.',
      withdrawRequest: request
    });
  } catch (error) {
    console.error('Lỗi khi khiếu nại rút tiền:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống khi gửi khiếu nại rút tiền!' });
  }
};

// 8. POST /api/wallet/admin/withdrawals/:id/resolve (Staff/Admin xử lý khiếu nại)
exports.resolveWithdrawDispute = async (req, res) => {
  try {
    const { id } = req.params;
    const { resolveNote } = req.body;
    const adminId = req.user.id || req.user._id;

    if (!resolveNote || !resolveNote.trim()) {
      return res.status(400).json({ success: false, message: 'Ghi chú giải quyết khiếu nại là bắt buộc!' });
    }

    const request = await WithdrawRequest.findById(id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu rút tiền!' });
    }

    // Staff/Admin chỉ resolve nếu status === 'disputed'
    if (request.status !== 'disputed') {
      return res.status(400).json({ success: false, message: 'Yêu cầu rút tiền không ở trạng thái khiếu nại!' });
    }

    request.status = 'resolved';
    request.resolveNote = resolveNote.trim();
    request.resolvedBy = adminId;
    request.resolvedAt = new Date();
    await request.save();

    // ================= REALTIME INTEGRATION (PHASE 3) =================
    // 1. Tạo thông báo kiên định lưu DB + Phát Socket cho Customer sở hữu đơn khiếu nại
    await createNotificationAndEmit({
      userId: request.userId,
      type: 'dispute',
      title: 'Khiếu nại rút tiền đã được xử lý',
      message: `Khiếu nại yêu cầu rút tiền ${request.withdrawCode} của bạn đã được giải quyết. Ghi chú: ${resolveNote.trim()}`,
      link: '/my-wallet'
    });

    // 2. Phát Socket signal báo tải lại giao diện cho các bên liên quan
    emitToUser(request.userId.toString(), 'withdraw:resolved', { id: request._id });
    emitToStaff('withdraw:resolved', { id: request._id });
    emitToAdmin('withdraw:resolved', { id: request._id });
    // ==================================================================

    res.json({
      success: true,
      message: 'Đã đánh dấu xử lý và giải quyết khiếu nại giải ngân thành công!',
      withdrawRequest: request
    });
  } catch (error) {
    console.error('Lỗi khi xử lý khiếu nại rút tiền:', error);
    res.status(500).json({ success: false, message: 'Lỗi hệ thống khi giải quyết khiếu nại!' });
  }
};
