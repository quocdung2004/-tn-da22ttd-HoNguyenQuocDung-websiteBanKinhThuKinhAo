import React, { useState, useEffect } from 'react';
import { Search, Filter, RefreshCw, CheckCircle, XCircle, Clock, FileText, AlertCircle, QrCode } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';

export default function WithdrawRequests() {
  const { socket } = useSocket();
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal Action State
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [actionType, setActionType] = useState(''); // 'approve', 'reject', or 'resolve'
  const [modalInput, setModalInput] = useState('');
  const [modalError, setModalError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // QR Modal View State
  const [qrModalRequest, setQrModalRequest] = useState(null);

  const fetchWithdrawals = async () => {
    try {
      setLoading(true);
      setError('');
      const token = localStorage.getItem('glassesToken');
      if (!token) {
        setError('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
        setLoading(false);
        return;
      }

      const res = await fetch('/api/wallet/admin/withdrawals', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();

      if (data.success) {
        setWithdrawals(data.withdrawals || []);
      } else {
        setError(data.message || 'Không thể tải danh sách yêu cầu rút tiền.');
      }
    } catch (err) {
      console.error(err);
      setError('Lỗi kết nối máy chủ hệ thống.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWithdrawals();
  }, []);

  // Đăng ký lắng nghe sự kiện từ Socket.IO Realtime
  useEffect(() => {
    if (!socket) return;

    const handleWithdrawEvent = () => {
      console.log('⚡ [Socket.IO Client] Nhận sự kiện cập nhật giao dịch rút tiền. Đang cập nhật danh sách...');
      fetchWithdrawals();
    };

    socket.on('withdraw:requested', handleWithdrawEvent);
    socket.on('withdraw:updated', handleWithdrawEvent);
    socket.on('withdraw:disputed', handleWithdrawEvent);
    socket.on('withdraw:resolved', handleWithdrawEvent);

    return () => {
      socket.off('withdraw:requested', handleWithdrawEvent);
      socket.off('withdraw:updated', handleWithdrawEvent);
      socket.off('withdraw:disputed', handleWithdrawEvent);
      socket.off('withdraw:resolved', handleWithdrawEvent);
    };
  }, [socket]);

  // Format tiền VND
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

  // Mở modal xử lý
  const openModal = (request, type) => {
    setSelectedRequest(request);
    setActionType(type);
    setModalInput('');
    setModalError('');
  };

  // Đóng modal
  const closeModal = () => {
    setSelectedRequest(null);
    setActionType('');
    setModalInput('');
    setModalError('');
  };

  // Submit phê duyệt, từ chối hoặc xử lý khiếu nại rút tiền
  const handleActionSubmit = async (e) => {
    e.preventDefault();
    setModalError('');

    if (!selectedRequest) return;

    if (!modalInput.trim()) {
      setModalError(
        actionType === 'approve'
          ? 'Mã đối soát giao dịch ngân hàng là bắt buộc!'
          : actionType === 'reject'
            ? 'Vui lòng cung cấp lý do từ chối cụ thể!'
            : 'Vui lòng nhập ghi chú giải quyết khiếu nại!'
      );
      return;
    }

    try {
      setSubmitting(true);
      const token = localStorage.getItem('glassesToken');
      const endpoint = `/api/wallet/admin/withdrawals/${selectedRequest._id}/${actionType}`;
      
      const payload = actionType === 'approve'
        ? { transactionCode: modalInput.trim() }
        : actionType === 'reject'
          ? { rejectReason: modalInput.trim() }
          : { resolveNote: modalInput.trim() }; // 'resolve'

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (data.success) {
        alert(
          actionType === 'approve'
            ? 'Đã phê duyệt yêu cầu giải ngân thành công!'
            : actionType === 'reject'
              ? 'Đã từ chối và hoàn tiền về ví khách hàng thành công!'
              : 'Đã ghi nhận ghi chú và giải quyết khiếu nại thành công!'
        );
        closeModal();
        // Tắt cả modal QR nếu đang mở
        setQrModalRequest(null);
        // Refetch danh sách tươi sau khi thay đổi thành công
        await fetchWithdrawals();
      } else {
        setModalError(data.message || 'Thao tác thất bại. Vui lòng thử lại.');
      }
    } catch (err) {
      console.error(err);
      setModalError('Lỗi kết nối máy chủ khi thực hiện thao tác.');
    } finally {
      setSubmitting(false);
    }
  };

  // Lọc và Tìm kiếm dữ liệu
  const filteredWithdrawals = withdrawals.filter(item => {
    const matchesSearch = 
      item.withdrawCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.userId?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.userId?.username || '').toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  if (loading && withdrawals.length === 0) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[400px] gap-3">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-gray-500 font-medium">Đang tải danh sách yêu cầu rút tiền...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center max-w-md mx-auto">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-gray-900 mb-1">Đã xảy ra lỗi</h3>
        <p className="text-gray-500 text-sm mb-4">{error}</p>
        <button 
          onClick={fetchWithdrawals} 
          className="bg-blue-600 text-white font-bold py-2.5 px-5 rounded-xl hover:bg-blue-700 transition"
        >
          Tải lại danh sách
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 space-y-6 font-sans">
      
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <QrCode className="w-7 h-7 text-indigo-600" /> Quản lý giải ngân ví nội bộ
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Phê duyệt rút tiền, đối soát giao dịch ngân hàng và xử lý khiếu nại giải ngân.</p>
        </div>
        <button 
          onClick={fetchWithdrawals}
          className="flex items-center gap-2 text-xs font-bold bg-white hover:bg-gray-100 text-gray-700 px-3.5 py-2 rounded-lg border border-gray-200 transition shadow-sm"
        >
          <RefreshCw className="w-4 h-4" /> Làm mới dữ liệu
        </button>
      </div>

      {/* FILTER & SEARCH */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        
        {/* THANH TÌM KIẾM */}
        <div className="relative w-full md:max-w-xs">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo mã WD, tên khách..."
            className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
          />
        </div>

        {/* BỘ LỌC TRẠNG THÁI */}
        <div className="flex items-center gap-2 self-start md:self-auto overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
          <Filter className="w-4 h-4 text-gray-400 shrink-0" />
          <span className="text-xs font-bold text-gray-500 mr-2 shrink-0">Trạng thái:</span>
          
          {[
            { code: 'all', name: 'Tất cả' },
            { code: 'pending', name: 'Chờ duyệt' },
            { code: 'completed', name: 'Đã hoàn tất' },
            { code: 'disputed', name: 'Khiếu nại' },
            { code: 'resolved', name: 'Đã giải quyết' },
            { code: 'rejected', name: 'Bị từ chối' },
            { code: 'customer_cancelled', name: 'Khách hủy' }
          ].map(opt => (
            <button
              key={opt.code}
              onClick={() => setStatusFilter(opt.code)}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg transition shrink-0 ${
                statusFilter === opt.code 
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {opt.name}
            </button>
          ))}
        </div>
      </div>

      {/* DANH SÁCH YÊU CẦU */}
      {filteredWithdrawals.length === 0 ? (
        <div className="bg-white rounded-3xl py-12 text-center border border-dashed border-gray-200">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-400">Không tìm thấy yêu cầu rút tiền nào phù hợp!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {filteredWithdrawals.map((item) => (
            <div 
              key={item._id} 
              className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 hover:shadow-md transition"
            >
              {/* Cột 1: Thông tin khách hàng & Giao dịch */}
              <div className="space-y-3 flex-1 w-full">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded font-mono">{item.withdrawCode}</span>
                  <span className="text-xs font-semibold text-gray-400">{formatDate(item.createdAt)}</span>
                  
                  {/* Trạng thái tag */}
                  {item.status === 'pending' && (
                    <span className="text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Clock className="w-3 h-3 animate-spin" /> CHỜ DUYỆT
                    </span>
                  )}
                  {item.status === 'completed' && (
                    <span className="text-[10px] font-black text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> ĐÃ HOÀN TẤT
                    </span>
                  )}
                  {item.status === 'disputed' && (
                    <span className="text-[10px] font-black text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Clock className="w-3 h-3 text-red-500 animate-pulse" /> ĐANG KHIẾU NẠI
                    </span>
                  )}
                  {item.status === 'resolved' && (
                    <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> ĐÃ XỬ LÝ KHIẾU NẠI
                    </span>
                  )}
                  {item.status === 'rejected' && (
                    <span className="text-[10px] font-black text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> BỊ TỪ CHỐI
                    </span>
                  )}
                  {item.status === 'customer_cancelled' && (
                    <span className="text-[10px] font-black text-gray-600 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> KHÁCH ĐÃ HỦY
                    </span>
                  )}
                </div>

                {/* Số tiền rút khổng lồ */}
                <h3 className="text-xl font-black text-gray-900">{formatVND(item.amount)}</h3>

                {/* Chi tiết người yêu cầu */}
                <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100/50 space-y-1.5 text-xs text-gray-500">
                  <p>👤 Khách hàng: <span className="font-bold text-gray-800">{item.userId?.name || 'Chưa cập nhật'}</span> ({item.userId?.username || 'Guest'})</p>
                  <p>📞 Liên hệ: {item.userId?.phone || 'Chưa cung cấp'} | Email: {item.userId?.email || 'Chưa cung cấp'}</p>
                </div>

                {/* Thông tin ngân hàng thụ hưởng hiển thị rõ ràng */}
                <div className="p-3.5 bg-indigo-50/30 rounded-2xl border border-indigo-100/30 space-y-1 text-xs">
                  <p className="font-bold text-indigo-900 uppercase">🏦 Ngân hàng thụ hưởng</p>
                  <p className="text-gray-600">Ngân hàng: <span className="font-bold text-gray-800">{item.bankName}</span></p>
                  <p className="text-gray-600">Số tài khoản: <span className="font-bold text-gray-800 font-mono">{item.bankAccountNumber}</span></p>
                  <p className="text-gray-600">Chủ tài khoản: <span className="font-bold text-gray-800">{item.accountHolderName}</span></p>
                </div>

                {/* Các log đối soát bổ sung */}
                {item.status === 'completed' && item.transactionCode && (
                  <div className="p-3 bg-green-50 text-green-800 rounded-xl text-xs font-semibold border border-green-100">
                    ✅ Mã giao dịch đối soát ngân hàng: <span className="font-mono font-black">{item.transactionCode}</span>
                  </div>
                )}
                {item.status === 'rejected' && item.rejectReason && (
                  <div className="p-3 bg-red-50 text-red-800 rounded-xl text-xs font-semibold border border-red-100">
                    ❌ Lý do từ chối giải ngân: <span>{item.rejectReason}</span>
                  </div>
                )}

                {/* KHIẾU NẠI & GIẢI QUYẾT KHIẾU NẠI RENDERS */}
                {item.status === 'disputed' && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-2xl space-y-2 text-xs">
                    <p className="font-bold text-red-800">⚠️ Khách hàng báo chưa nhận được tiền giải ngân!</p>
                    <p className="text-red-700">Mã đối soát đã nạp: <span className="font-mono font-bold">{item.transactionCode || 'N/A'}</span></p>
                    <p className="text-red-700">Thời điểm báo: <span className="font-semibold">{formatDate(item.disputedAt)}</span></p>
                    <p className="bg-white p-2.5 rounded-lg border border-red-100 text-gray-700"><strong>Nội dung khách khiếu nại:</strong> {item.disputeReason}</p>
                  </div>
                )}

                {item.status === 'resolved' && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2 text-xs">
                    <p className="font-bold text-emerald-800">✅ Khiếu nại rút tiền đã được xử lý hoàn tất!</p>
                    <p className="text-emerald-700">Mã đối soát đã nạp: <span className="font-mono font-bold">{item.transactionCode || 'N/A'}</span></p>
                    <p className="text-emerald-700">Nội dung khiếu nại của khách: <span className="italic">"{item.disputeReason}"</span> (báo ngày {formatDate(item.disputedAt)})</p>
                    <div className="bg-white p-2.5 rounded-lg border border-emerald-100 text-gray-700 space-y-1">
                      <p><strong>Ghi chú giải quyết của Staff/Admin:</strong></p>
                      <p className="font-semibold text-emerald-700">"{item.resolveNote}"</p>
                      <p className="text-[10px] text-gray-400 mt-1">Xử lý lúc: {formatDate(item.resolvedAt)}</p>
                    </div>
                  </div>
                )}

              </div>

              {/* Cột 2: Action buttons & QR Modal triggers */}
              <div className="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-3xl border border-gray-100 self-stretch xl:self-auto xl:w-[220px] text-center gap-3">
                
                {/* pending: Chỉ hiện nút Tạo/Xem QR & từ chối */}
                {item.status === 'pending' && (
                  <>
                    <button
                      onClick={() => setQrModalRequest(item)}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition shadow-md shadow-indigo-100 flex items-center justify-center gap-1.5"
                    >
                      <QrCode className="w-4 h-4" /> Tạo / Xem QR
                    </button>
                    <button
                      onClick={() => openModal(item, 'reject')}
                      className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-bold py-2.5 px-4 rounded-xl text-xs transition border border-red-200"
                    >
                      Từ chối giải ngân
                    </button>
                  </>
                )}

                {/* disputed: Hiện nút Đánh dấu đã xử lý khiếu nại */}
                {item.status === 'disputed' && (
                  <button
                    onClick={() => openModal(item, 'resolve')}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition shadow-md shadow-emerald-100"
                  >
                    Đánh dấu đã xử lý
                  </button>
                )}

                {/* Các trạng thái đã kết thúc tĩnh */}
                {item.status === 'completed' && (
                  <>
                    <CheckCircle className="w-8 h-8 text-green-500" />
                    <span className="text-xs font-bold text-green-600">Đã giải ngân</span>
                  </>
                )}
                {item.status === 'resolved' && (
                  <>
                    <CheckCircle className="w-8 h-8 text-emerald-600 animate-pulse" />
                    <span className="text-xs font-bold text-emerald-600">Resolved khiếu nại</span>
                  </>
                )}
                {item.status === 'rejected' && (
                  <>
                    <XCircle className="w-8 h-8 text-red-500" />
                    <span className="text-xs font-bold text-red-600">Đã từ chối rút</span>
                  </>
                )}
                {item.status === 'customer_cancelled' && (
                  <>
                    <XCircle className="w-8 h-8 text-gray-400" />
                    <span className="text-xs font-bold text-gray-500">Khách đã hủy</span>
                  </>
                )}

              </div>
            </div>
          ))}
        </div>
      )}

      {/* ================= QR MODAL XEM CHI TIẾT & CHUYỂN KHOẢN (PREMIUM DIALOG) ================= */}
      {qrModalRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setQrModalRequest(null)}></div>
          
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 relative z-10 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-black text-gray-900">Chi tiết quét mã giải ngân VietQR</h3>
                <p className="text-xs text-gray-400">Vui lòng kiểm tra kỹ thông tin ngân hàng thụ hưởng thụ nhận trước khi phê duyệt.</p>
              </div>
              <button 
                onClick={() => setQrModalRequest(null)}
                className="text-gray-400 hover:text-gray-600 font-bold text-lg px-2 py-0.5 rounded-lg bg-gray-50"
              >
                ✕
              </button>
            </div>

            {/* Chi tiết thụ hưởng hiển thị to rõ ràng */}
            <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Mã rút tiền:</span>
                <span className="font-mono font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">{qrModalRequest.withdrawCode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Ngân hàng thụ hưởng:</span>
                <span className="font-bold text-gray-800">{qrModalRequest.bankName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Số tài khoản nhận:</span>
                <span className="font-mono font-bold text-gray-800 text-sm">{qrModalRequest.bankAccountNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Chủ tài khoản nhận:</span>
                <span className="font-bold text-gray-800 uppercase">{qrModalRequest.accountHolderName}</span>
              </div>
              <div className="flex justify-between border-t border-indigo-100 pt-2 mt-1">
                <span className="text-gray-600 font-bold">Số tiền giải ngân:</span>
                <span className="text-sm font-black text-indigo-900">{formatVND(qrModalRequest.amount)}</span>
              </div>
            </div>

            {/* Ảnh QR VietQR ở trung tâm */}
            <div className="my-6 flex flex-col items-center justify-center bg-gray-50 py-6 rounded-2xl border border-gray-100">
              {qrModalRequest.qrUrl ? (
                <>
                  <img 
                    src={qrModalRequest.qrUrl} 
                    alt={`QR Code VietQR ${qrModalRequest.withdrawCode}`} 
                    className="w-[180px] h-[180px] object-contain bg-white p-3 rounded-2xl border border-gray-200 shadow-sm"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = 'https://placehold.co/200x200?text=Scan+VietQR';
                    }}
                  />
                  <p className="text-[10px] font-bold text-gray-400 mt-3 uppercase tracking-widest">Dùng app ngân hàng để quét chuyển khoản tự động</p>
                </>
              ) : (
                <div className="w-[180px] h-[180px] flex items-center justify-center bg-white rounded-2xl border border-gray-200 text-xs text-gray-400 font-bold shadow-sm">
                  Không có QR
                </div>
              )}
            </div>

            {/* Nút hành động phê duyệt ngay trong QR Modal */}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setQrModalRequest(null)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 px-4 rounded-xl text-xs transition"
              >
                Đóng lại
              </button>
              <button
                type="button"
                onClick={() => openModal(qrModalRequest, 'approve')}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-5 rounded-xl text-xs transition shadow-md shadow-green-100"
              >
                Xác nhận đã chuyển khoản
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL DUYỆT / TỪ CHỐI / GIẢI QUYẾT KHIẾU NẠI ================= */}
      {selectedRequest && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          
          {/* Lớp phủ mờ nền */}
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal}></div>

          {/* Hộp Modal nội dung */}
          <div className="bg-white rounded-3xl max-w-md w-full p-6 relative z-10 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-black text-gray-900">
              {actionType === 'approve' 
                ? 'Phê duyệt giải ngân tiền' 
                : actionType === 'reject' 
                  ? 'Từ chối yêu cầu rút tiền' 
                  : 'Giải quyết khiếu nại rút tiền'}
            </h3>
            
            <p className="text-xs text-gray-400 mt-1">
              {actionType === 'approve' && `Vui lòng nhập mã đối soát ngân hàng sau khi bạn đã chuyển khoản thủ công số tiền ${formatVND(selectedRequest.amount)}.`}
              {actionType === 'reject' && `Vui lòng cung cấp lý do từ chối để giải thích và hoàn tiền về ví cho người dùng.`}
              {actionType === 'resolve' && `Vui lòng nhập ghi chú phản hồi cách thức xử lý khiếu nại (ví dụ: đã chuyển khoản bù thành công/đã đối soát đối tác bank,...).`}
            </p>

            {modalError && (
              <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold flex items-center gap-2 border border-red-100">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleActionSubmit} className="mt-4 space-y-4">
              
              {actionType === 'approve' && (
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Mã đối soát giao dịch ngân hàng (Bắt buộc)</label>
                  <input 
                    type="text"
                    value={modalInput}
                    onChange={(e) => setModalInput(e.target.value)}
                    placeholder="Ví dụ: FT2312384918239 hoặc số tham chiếu ngân hàng"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white font-mono"
                    required
                  />
                </div>
              )}

              {actionType === 'reject' && (
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Lý do từ chối giải ngân (Bắt buộc)</label>
                  <textarea 
                    value={modalInput}
                    onChange={(e) => setModalInput(e.target.value)}
                    placeholder="Ví dụ: Thông tin số tài khoản hoặc tên chủ thẻ ngân hàng không khớp..."
                    rows="3"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                    required
                  ></textarea>
                </div>
              )}

              {actionType === 'resolve' && (
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase">Ghi chú giải quyết khiếu nại (Bắt buộc)</label>
                  <textarea 
                    value={modalInput}
                    onChange={(e) => setModalInput(e.target.value)}
                    placeholder="Ví dụ: Đã đối soát giao dịch Techcombank thành công và thực hiện chuyển khoản lại cho khách hàng số tiền 500k vào lúc 08h30..."
                    rows="4"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                    required
                  ></textarea>
                </div>
              )}

              {/* Nút hành động */}
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 px-4 rounded-xl text-xs transition"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`font-bold py-2.5 px-5 rounded-xl text-xs text-white transition disabled:opacity-50 ${
                    actionType === 'approve' 
                      ? 'bg-green-600 hover:bg-green-700' 
                      : actionType === 'reject' 
                        ? 'bg-red-600 hover:bg-red-700' 
                        : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {submitting ? 'Đang gửi...' : 'Xác nhận xử lý'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
