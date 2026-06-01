import React, { useState, useEffect } from 'react';
import { Wallet as WalletIcon, ArrowUpRight, ArrowDownLeft, Clock, CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';

const BANK_LIST = [
  { code: 'Techcombank', name: 'Techcombank (TCB)' },
  { code: 'Vietcombank', name: 'Vietcombank (VCB)' },
  { code: 'MBBank', name: 'MB Bank (MB)' },
  { code: 'BIDV', name: 'BIDV' },
  { code: 'VietinBank', name: 'VietinBank' },
  { code: 'Agribank', name: 'Agribank' },
  { code: 'VPBank', name: 'VPBank' },
  { code: 'ACB', name: 'ACB' },
  { code: 'TPBank', name: 'TPBank' },
  { code: 'Sacombank', name: 'Sacombank' },
  { code: 'VIB', name: 'VIB' },
];

export default function Wallet() {
  const { socket } = useSocket();
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form State
  const [amount, setAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState('');
  const [formError, setFormError] = useState('');

  // Dispute state
  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [disputeRequestId, setDisputeRequestId] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeError, setDisputeError] = useState('');
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);

  const openDisputeModal = (id) => {
    setDisputeRequestId(id);
    setDisputeReason('');
    setDisputeError('');
    setDisputeModalOpen(true);
  };

  const handleDisputeSubmit = async (e) => {
    e.preventDefault();
    if (!disputeReason.trim()) {
      setDisputeError('Vui lòng cung cấp lý do khiếu nại cụ thể!');
      return;
    }

    try {
      setDisputeSubmitting(true);
      setDisputeError('');
      const token = localStorage.getItem('glassesToken');
      const res = await fetch(`/api/wallet/withdraw/${disputeRequestId}/dispute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ disputeReason: disputeReason.trim() })
      });
      const data = await res.json();
      if (data.success) {
        alert('Gửi khiếu nại chưa nhận được tiền thành công!');
        setDisputeModalOpen(false);
        setDisputeReason('');
        await fetchWallet();
      } else {
        setDisputeError(data.message || 'Không thể gửi khiếu nại.');
      }
    } catch (err) {
      console.error(err);
      setDisputeError('Lỗi kết nối khi gửi khiếu nại.');
    } finally {
      setDisputeSubmitting(false);
    }
  };

  const fetchWallet = async () => {
    try {
      setLoading(true);
      setError('');
      const token = localStorage.getItem('glassesToken');
      if (!token) {
        setError('Bạn chưa đăng nhập. Vui lòng đăng nhập để xem thông tin ví.');
        setLoading(false);
        return;
      }

      const res = await fetch('/api/wallet', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();

      if (data.success) {
        setWallet(data.wallet);
        setTransactions(data.transactions || []);
        // Kiểm tra an toàn chống crash nếu API chưa trả về withdrawals
        setWithdrawals(data.withdrawals || []);
      } else {
        setError(data.message || 'Không thể tải thông tin ví.');
      }
    } catch (err) {
      console.error(err);
      setError('Lỗi kết nối máy chủ ví.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWallet();
  }, []);

  // Đăng ký lắng nghe các sự kiện cập nhật giao dịch ví realtime
  useEffect(() => {
    if (!socket) return;

    const handleWithdrawUpdate = () => {
      console.log('⚡ [Socket.IO Client] Nhận sự kiện cập nhật ví / rút tiền. Đang làm mới dữ liệu...');
      fetchWallet();
    };

    socket.on('withdraw:updated', handleWithdrawUpdate);
    socket.on('withdraw:resolved', handleWithdrawUpdate);

    return () => {
      socket.off('withdraw:updated', handleWithdrawUpdate);
      socket.off('withdraw:resolved', handleWithdrawUpdate);
    };
  }, [socket]);

  // Format tiền tệ VND
  const formatVND = (value) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(value || 0);
  };

  // Format ngày giờ Việt Nam
  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  // Gửi yêu cầu rút tiền
  const handleWithdrawSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    const parsedAmount = Number(amount);
    
    // 1. Chặn amount là NaN, 0, hoặc âm
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setFormError('Số tiền rút phải lớn hơn 0 VND!');
      return;
    }

    // 2. Chặn amount lớn hơn số dư khả dụng balance
    if (wallet && parsedAmount > wallet.balance) {
      setFormError('Số dư khả dụng hiện tại không đủ để thực hiện giao dịch này!');
      return;
    }

    if (!bankName) {
      setFormError('Vui lòng chọn ngân hàng nhận tiền!');
      return;
    }

    if (!bankAccountNumber.trim()) {
      setFormError('Vui lòng nhập số tài khoản ngân hàng nhận tiền!');
      return;
    }

    if (!accountHolderName.trim()) {
      setFormError('Vui lòng nhập họ và tên chủ tài khoản!');
      return;
    }

    try {
      setFormSubmitting(true);
      const token = localStorage.getItem('glassesToken');
      const res = await fetch('/api/wallet/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: parsedAmount,
          bankName: bankName.trim(),
          bankAccountNumber: bankAccountNumber.trim(),
          accountHolderName: accountHolderName.trim()
        })
      });

      const data = await res.json();
      if (data.success) {
        setFormSuccess('Gửi yêu cầu rút tiền thành công! Vui lòng đợi Staff xử lý.');
        setAmount('');
        // Refetch ví và các lệnh giao dịch sau khi rút thành công
        await fetchWallet();
      } else {
        setFormError(data.message || 'Không thể tạo yêu cầu rút tiền.');
      }
    } catch (err) {
      console.error(err);
      setFormError('Lỗi kết nối máy chủ khi gửi yêu cầu rút.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Khách hàng tự hủy yêu cầu rút pending
  const handleCancelWithdraw = async (id) => {
    const confirmCancel = window.confirm('Bạn có chắc chắn muốn hủy yêu cầu rút tiền này không? Tiền đóng băng sẽ được trả về ví khả dụng ngay lập tức.');
    if (!confirmCancel) return;

    try {
      const token = localStorage.getItem('glassesToken');
      const res = await fetch(`/api/wallet/withdraw/${id}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();

      if (data.success) {
        alert('Đã hủy yêu cầu rút tiền thành công!');
        // Refetch ví tươi sau khi cancel
        await fetchWallet();
      } else {
        alert(data.message || 'Không thể hủy yêu cầu rút tiền.');
      }
    } catch (err) {
      console.error(err);
      alert('Lỗi kết nối hệ thống khi hủy rút tiền.');
    }
  };

  if (loading && !wallet) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-gray-500 font-medium">Đang tải dữ liệu ví nội bộ...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-xl border border-gray-100 text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Đã xảy ra lỗi</h2>
          <p className="text-gray-500 mb-6">{error}</p>
          <button 
            onClick={fetchWallet} 
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl transition shadow-lg shadow-blue-100"
          >
            Thử tải lại ví
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 py-10 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* TIÊU ĐỀ PHÂN HỆ VÍ */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-black text-gray-900 flex items-center gap-2">
              <WalletIcon className="w-8 h-8 text-blue-600" /> Ví nội bộ của tôi
            </h1>
            <p className="text-gray-500 mt-1">Nơi quản lý hoàn tiền, tích lũy ví và rút tiền mặt nội bộ.</p>
          </div>
          <button 
            onClick={fetchWallet}
            className="flex items-center gap-2 text-sm font-semibold bg-white hover:bg-gray-100 text-gray-700 px-4 py-2.5 rounded-xl border border-gray-200 transition shadow-sm"
          >
            <RefreshCw className="w-4 h-4" /> Làm mới số dư
          </button>
        </div>

        {/* THẺ ĐẠI DIỆN SỐ DƯ (Virtual Premium Cards) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* SỐ DƯ KHẢ DỤNG */}
          <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-3xl p-8 shadow-xl shadow-blue-900/10">
            <div className="absolute right-0 bottom-0 translate-x-6 translate-y-6 opacity-10">
              <WalletIcon className="w-64 h-64" />
            </div>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-blue-100 text-xs font-bold uppercase tracking-wider">Số dư khả dụng</p>
                <h2 className="text-3xl sm:text-4xl font-black mt-2 font-mono">{formatVND(wallet?.balance)}</h2>
              </div>
              <div className="p-2.5 bg-white/10 rounded-xl">
                <ArrowUpRight className="w-6 h-6 text-white" />
              </div>
            </div>
            <div className="mt-8 pt-4 border-t border-white/10 flex justify-between items-center text-sm text-blue-100">
              <p>Trạng thái ví: <span className="font-bold text-green-300">Đang hoạt động</span></p>
              <p>Hệ thống: Dũng Glasses</p>
            </div>
          </div>

          {/* SỐ DƯ ĐÓNG BĂNG */}
          <div className="relative overflow-hidden bg-white text-gray-900 rounded-3xl p-8 shadow-xl border border-gray-100">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">Số dư đóng băng (Đang rút)</p>
                <h2 className="text-3xl sm:text-4xl font-black mt-2 text-gray-900 font-mono">{formatVND(wallet?.lockedBalance)}</h2>
              </div>
              <div className="p-2.5 bg-amber-50 rounded-xl">
                <Clock className="w-6 h-6 text-amber-500 animate-pulse" />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-4 leading-relaxed">
              Số tiền tạm khóa khi bạn gửi yêu cầu rút về ngân hàng. Sẽ được giải ngân hoặc hoàn trả sau khi Staff xử lý.
            </p>
          </div>
        </div>

        {/* NỘI DUNG CHÍNH CHIA 2 CỘT */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* CỘT TRÁI (1/3): Form rút tiền ví nội bộ */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-3xl p-6 shadow-xl border border-gray-100 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Rút tiền về ngân hàng</h3>
                <p className="text-xs text-gray-400 mt-1">Nhập thông tin ngân hàng nhận tiền mặt của bạn.</p>
              </div>

              {formError && (
                <div className="p-3.5 bg-red-50 text-red-700 rounded-xl text-xs flex items-center gap-2 border border-red-100">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="font-medium">{formError}</span>
                </div>
              )}

              {formSuccess && (
                <div className="p-3.5 bg-green-50 text-green-700 rounded-xl text-xs flex items-center gap-2 border border-green-100">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span className="font-medium">{formSuccess}</span>
                </div>
              )}

              <form onSubmit={handleWithdrawSubmit} className="space-y-4">
                
                {/* SỐ TIỀN RÚT */}
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Số tiền muốn rút (VND)</label>
                  <div className="relative">
                    <input 
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Ví dụ: 100000"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white font-mono"
                      required
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">VND</span>
                  </div>
                </div>

                {/* NGÂN HÀNG NHẬN */}
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Ngân hàng nhận</label>
                  <select
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                    required
                  >
                    <option value="">-- Chọn ngân hàng --</option>
                    {BANK_LIST.map(bank => (
                      <option key={bank.code} value={bank.code}>{bank.name}</option>
                    ))}
                  </select>
                </div>

                {/* SỐ TÀI KHOẢN */}
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Số tài khoản nhận</label>
                  <input 
                    type="text"
                    value={bankAccountNumber}
                    onChange={(e) => setBankAccountNumber(e.target.value)}
                    placeholder="Nhập số tài khoản"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white font-mono"
                    required
                  />
                </div>

                {/* HỌ VÀ TÊN CHỦ TK */}
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Tên chủ tài khoản (Viết hoa không dấu)</label>
                  <input 
                    type="text"
                    value={accountHolderName}
                    onChange={(e) => setAccountHolderName(e.target.value.toUpperCase())}
                    placeholder="Ví dụ: NGUYEN VAN A"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                    required
                  />
                </div>

                <button 
                  type="submit"
                  disabled={formSubmitting}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition shadow-lg shadow-blue-600/20 disabled:opacity-50"
                >
                  {formSubmitting ? 'Đang gửi yêu cầu...' : 'Gửi yêu cầu giải ngân'}
                </button>
              </form>
            </div>
          </div>

          {/* CỘT PHẢI (2/3): Danh sách giao dịch & danh sách rút tiền */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* TAB 1: Lịch sử rút tiền (Pending / Complete) */}
            <div className="bg-white rounded-3xl p-6 shadow-xl border border-gray-100">
              <div className="mb-4">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-indigo-600" /> Yêu cầu giải ngân của bạn
                </h3>
                <p className="text-xs text-gray-400 mt-1">Danh sách theo dõi các lệnh rút tiền mặt về tài khoản.</p>
              </div>

              {withdrawals.length === 0 ? (
                // EMPTY STATE
                <div className="text-center py-10 border border-dashed border-gray-200 rounded-2xl">
                  <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-400">Bạn chưa gửi yêu cầu rút tiền nào!</p>
                </div>
              ) : (
                <div className="space-y-4 overflow-y-auto max-h-[350px] pr-2">
                  {withdrawals.map((item) => (
                    <div key={item._id} className="p-4 bg-gray-50 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border border-gray-100 hover:bg-white hover:shadow-md transition">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-mono">{item.withdrawCode}</span>
                          <span className="text-xs font-semibold text-gray-400">{formatDate(item.createdAt)}</span>
                        </div>
                        <p className="text-sm font-bold text-gray-900">{formatVND(item.amount)}</p>
                        <p className="text-xs text-gray-500 font-medium">Ngân hàng: {item.bankName} | STK: {item.bankAccountNumber} | Tên: {item.accountHolderName}</p>
                        
                        {/* Chi tiết lý do nếu bị từ chối hoặc mã GD nếu xong */}
                        {item.status === 'rejected' && (
                          <p className="text-xs text-red-600 font-semibold bg-red-50 p-2 rounded-lg mt-2">Lý do từ chối: {item.rejectReason}</p>
                        )}
                        {item.status === 'completed' && item.transactionCode && (
                          <p className="text-xs text-green-700 font-semibold bg-green-50 p-2 rounded-lg mt-2">Mã GD đối soát: {item.transactionCode}</p>
                        )}
                        {item.status === 'disputed' && (
                          <p className="text-xs text-red-600 font-semibold bg-red-50 p-2 rounded-lg mt-2">Lý do khiếu nại: {item.disputeReason}</p>
                        )}
                        {item.status === 'resolved' && item.resolveNote && (
                          <div className="text-xs text-green-800 font-semibold bg-green-50/70 p-2.5 rounded-lg mt-2 border border-green-100 space-y-1">
                            <p>✅ Đã giải quyết khiếu nại:</p>
                            <p className="text-gray-600">Phản hồi: <span className="text-gray-800 font-bold">{item.resolveNote}</span></p>
                          </div>
                        )}
                      </div>

                      {/* Trạng thái / Nút hành động */}
                      <div className="flex items-center gap-3 shrink-0">
                        {item.status === 'pending' && (
                          <>
                            <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                              <RefreshCw className="w-3 h-3 animate-spin" /> Chờ duyệt
                            </span>
                            <button
                              onClick={() => handleCancelWithdraw(item._id)}
                              className="text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-red-200 transition"
                            >
                              Hủy yêu cầu
                            </button>
                          </>
                        )}

                        {item.status === 'completed' && (
                          <div className="flex flex-col items-end gap-2">
                            <span className="text-xs font-bold text-green-600 bg-green-50 border border-green-100 px-2.5 py-1 rounded-full flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" /> Đã hoàn tất
                            </span>
                            <button
                              onClick={() => openDisputeModal(item._id)}
                              className="text-[10px] font-black text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg border border-red-200 transition"
                            >
                              Tôi chưa nhận được tiền
                            </button>
                          </div>
                        )}

                        {item.status === 'disputed' && (
                          <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 px-2.5 py-1 rounded-full flex items-center gap-1">
                            <Clock className="w-3 h-3 text-red-500 animate-pulse" /> Đang khiếu nại
                          </span>
                        )}

                        {item.status === 'resolved' && (
                          <span className="text-xs font-bold text-green-700 bg-green-100 border border-green-200 px-2.5 py-1 rounded-full flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Đã giải quyết
                          </span>
                        )}

                        {item.status === 'rejected' && (
                          <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 px-2.5 py-1 rounded-full flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> Bị từ chối
                          </span>
                        )}

                        {item.status === 'customer_cancelled' && (
                          <span className="text-xs font-bold text-gray-500 bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-full flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> Đã hủy
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* TAB 2: Lịch sử biến động giao dịch ví (Refund/Payment) */}
            <div className="bg-white rounded-3xl p-6 shadow-xl border border-gray-100">
              <div className="mb-4">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-emerald-600" /> Biến động số dư
                </h3>
                <p className="text-xs text-gray-400 mt-1">Lịch sử nạp hoàn tiền mặt hoặc giao dịch liên quan tới ví.</p>
              </div>

              {transactions.length === 0 ? (
                // EMPTY STATE
                <div className="text-center py-10 border border-dashed border-gray-200 rounded-2xl">
                  <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-400">Chưa có giao dịch biến động số dư nào!</p>
                </div>
              ) : (
                <div className="space-y-4 overflow-y-auto max-h-[350px] pr-2">
                  {transactions.map((item) => (
                    <div key={item._id} className="p-4 bg-gray-50 rounded-2xl flex justify-between items-center gap-4 border border-gray-100">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-400">{formatDate(item.createdAt)}</span>
                        </div>
                        <p className="text-xs font-bold text-gray-800 leading-relaxed">{item.note}</p>
                        <p className="text-[10px] text-gray-400 font-medium">Số dư sau GD: {formatVND(item.balanceAfter)}</p>
                      </div>

                      {/* Số tiền biến động (Xanh tăng / Đỏ giảm) */}
                      <div className="shrink-0 text-right">
                        {item.type === 'refund' || item.type === 'revert' ? (
                          <span className="text-sm font-black text-green-600 flex items-center justify-end font-mono">
                            <ArrowDownLeft className="w-4 h-4" /> +{formatVND(item.amount)}
                          </span>
                        ) : (
                          <span className="text-sm font-black text-red-500 flex items-center justify-end font-mono">
                            <ArrowUpRight className="w-4 h-4" /> -{formatVND(item.amount)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>

      </div>

      {/* ================= DISPUTE MODAL (KHIẾU NẠI CHƯA NHẬN ĐƯỢC TIỀN) ================= */}
      {disputeModalOpen && disputeRequestId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDisputeModalOpen(false)}></div>
          <div className="bg-white rounded-3xl max-w-md w-full p-6 relative z-10 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-black text-gray-900">Khiếu nại chưa nhận được tiền</h3>
            <p className="text-xs text-gray-400 mt-1">
              Vui lòng nhập lý do cụ thể (ví dụ: đã quá 24h nhưng tài khoản ngân hàng chưa báo có số tiền rút,...). Ban quản trị sẽ ngay lập tức đối soát chuyển khoản.
            </p>

            {disputeError && (
              <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold flex items-center gap-2 border border-red-100">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{disputeError}</span>
              </div>
            )}

            <form onSubmit={handleDisputeSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Lý do khiếu nại chưa nhận tiền (Bắt buộc)</label>
                <textarea 
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder="Ví dụ: Tài khoản Techcombank số TK 1903... của tôi vẫn chưa nhận được số tiền, dù trên web báo đã giải ngân thành công."
                  rows="4"
                  className="w-full bg-gray-55 border border-gray-200 rounded-xl py-3 px-4 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  required
                ></textarea>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setDisputeModalOpen(false)}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 px-4 rounded-xl text-xs transition"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={disputeSubmitting}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 px-5 rounded-xl text-xs transition disabled:opacity-50"
                >
                  {disputeSubmitting ? 'Đang gửi...' : 'Gửi khiếu nại'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
