import React, { useState, useEffect } from 'react';
import { 
  XCircle, CheckCircle, Clock, AlertTriangle, User, 
  CreditCard, Calendar, FileText, ArrowRight, Loader2 
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';

export default function CancelRequests() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Trạng thái modal từ chối
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(null); // id of the currently active order being processed

  const fetchCancelRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('glassesToken');
      if (!token) {
        setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại!');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/orders/admin/cancel-requests', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();

      if (data.success) {
        setRequests(data.orders || []);
      } else {
        setError(data.message || 'Không thể tải danh sách yêu cầu hủy đơn!');
      }
    } catch (err) {
      console.error('Lỗi fetch cancel requests:', err);
      setError('Lỗi kết nối máy chủ. Vui lòng thử lại sau!');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCancelRequests();
  }, []);

  // Đăng ký lắng nghe các yêu cầu hủy đơn hàng realtime
  useEffect(() => {
    if (!socket) return;

    const handleCancelRequestUpdate = () => {
      console.log('⚡ [Socket.IO Client] Nhận sự kiện yêu cầu hủy đơn. Đang làm mới danh sách yêu cầu hủy...');
      fetchCancelRequests();
    };

    socket.on('order:cancelRequested', handleCancelRequestUpdate);
    socket.on('order:cancelHandled', handleCancelRequestUpdate);

    return () => {
      socket.off('order:cancelRequested', handleCancelRequestUpdate);
      socket.off('order:cancelHandled', handleCancelRequestUpdate);
    };
  }, [socket]);

  // Xử lý phê duyệt hủy đơn
  const handleApprove = async (id, orderCode) => {
    const confirmApprove = window.confirm(`Bạn có chắc chắn muốn CHẤP NHẬN yêu cầu hủy đơn ${orderCode}? Hành động này sẽ tự động hoàn tồn kho và hoàn trả tiền vào ví khách hàng nếu đã thanh toán.`);
    if (!confirmApprove) return;

    setActionLoading(id);
    try {
      const token = localStorage.getItem('glassesToken');
      const response = await fetch(`/api/orders/${id}/handle-cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'approve' })
      });
      const data = await response.json();

      if (data.success) {
        alert('Đã chấp nhận hủy đơn hàng và hoàn tiền (nếu có) thành công!');
        fetchCancelRequests(); // Refetch list
      } else {
        alert(data.message || 'Có lỗi xảy ra khi duyệt hủy đơn hàng!');
      }
    } catch (err) {
      console.error('Lỗi duyệt hủy đơn:', err);
      alert('Lỗi kết nối máy chủ khi xử lý duyệt đơn!');
    } finally {
      setActionLoading(null);
    }
  };

  // Xử lý từ chối hủy đơn
  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!rejectReason.trim()) {
      alert('Vui lòng nhập lý do từ chối hủy đơn!');
      return;
    }

    setActionLoading(rejectingId);
    try {
      const token = localStorage.getItem('glassesToken');
      const response = await fetch(`/api/orders/${rejectingId}/handle-cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          action: 'reject', 
          rejectReason: rejectReason.trim() 
        })
      });
      const data = await response.json();

      if (data.success) {
        alert('Đã từ chối yêu cầu hủy đơn hàng thành công!');
        setRejectingId(null);
        setRejectReason('');
        fetchCancelRequests(); // Refetch list
      } else {
        alert(data.message || 'Có lỗi xảy ra khi từ chối yêu cầu hủy đơn!');
      }
    } catch (err) {
      console.error('Lỗi từ chối hủy đơn:', err);
      alert('Lỗi kết nối máy chủ khi xử lý từ chối đơn!');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="p-6 sm:p-8 bg-gray-50 min-h-screen font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            <XCircle className="w-8 h-8 text-red-500" /> Yêu Cầu Hủy Đơn Hàng
          </h1>
          <p className="text-gray-500 text-sm mt-1">Xem xét, duyệt hoặc từ chối các yêu cầu hoàn trả & hủy bỏ đơn từ khách hàng</p>
        </div>
        <div className="bg-red-50 text-red-700 text-xs font-bold px-3 py-1.5 rounded-full border border-red-100 shadow-sm flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" /> Chờ xử lý: {requests.length} đơn
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
          <p className="text-gray-500 text-sm font-medium">Đang tải danh sách yêu cầu hủy...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-3xl p-6 text-center max-w-lg mx-auto shadow-sm">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">Đã xảy ra sự cố</h3>
          <p className="text-gray-600 text-sm mb-6">{error}</p>
          <button 
            onClick={fetchCancelRequests}
            className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-2.5 rounded-xl transition shadow-md shadow-red-200 text-sm"
          >
            Thử tải lại dữ liệu
          </button>
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-3xl border border-gray-100 p-12 text-center max-w-md mx-auto shadow-sm flex flex-col items-center">
          <div className="w-20 h-20 bg-green-50 text-green-500 rounded-full flex items-center justify-center mb-6">
            <CheckCircle className="w-10 h-10" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Không có yêu cầu nào</h3>
          <p className="text-gray-500 text-sm">
            Hiện tại hệ thống không ghi nhận yêu cầu hủy đơn hàng nào cần phê duyệt. Chúc bạn một ngày làm việc tốt lành!
          </p>
        </div>
      ) : (
        /* Danh sách yêu cầu dạng lưới Table */
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-gray-400 text-xs font-extrabold uppercase tracking-wider">
                  <th className="px-6 py-4">Mã đơn</th>
                  <th className="px-6 py-4">Khách hàng</th>
                  <th className="px-6 py-4">Thanh toán</th>
                  <th className="px-6 py-4">Tổng tiền</th>
                  <th className="px-6 py-4">Lý do hủy</th>
                  <th className="px-6 py-4">Yêu cầu lúc</th>
                  <th className="px-6 py-4 text-center">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-sm">
                {requests.map((order) => (
                  <tr key={order._id} className="hover:bg-gray-55/30 transition-colors">
                    {/* Mã đơn */}
                    <td className="px-6 py-5 font-black text-gray-900 select-all">
                      {order.orderCode}
                    </td>

                    {/* Khách hàng */}
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center font-bold text-xs">
                          <User className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-bold text-gray-800 leading-tight">
                            {order.customerInfo?.name || order.username}
                          </p>
                          <p className="text-gray-400 text-xs mt-0.5">
                            SĐT: {order.customerInfo?.phone}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Thanh toán */}
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-1.5 text-xs font-bold uppercase text-gray-600">
                        <CreditCard className="w-3.5 h-3.5 text-gray-400" />
                        {order.paymentMethod === 'cod' ? (
                          <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-700">COD</span>
                        ) : (
                          <span className="bg-blue-50 px-2 py-0.5 rounded text-blue-700">BANKING</span>
                        )}
                      </div>
                    </td>

                    {/* Tổng tiền */}
                    <td className="px-6 py-5 font-extrabold text-blue-600 text-base">
                      {order.total.toLocaleString('vi-VN')} đ
                    </td>

                    {/* Lý do hủy */}
                    <td className="px-6 py-5 max-w-xs">
                      <div className="bg-red-50/50 border border-red-100 rounded-xl px-3 py-2 text-red-800 text-xs font-medium leading-relaxed">
                        {order.cancelReason}
                      </div>
                    </td>

                    {/* Thời gian yêu cầu */}
                    <td className="px-6 py-5 text-gray-400 text-xs flex items-center gap-1.5 mt-2">
                      <Calendar className="w-3.5 h-3.5" />
                      {order.cancelRequestedAt ? new Date(order.cancelRequestedAt).toLocaleString('vi-VN', {
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      }) : 'N/A'}
                    </td>

                    {/* Hành động */}
                    <td className="px-6 py-5 text-center">
                      {actionLoading === order._id ? (
                        <div className="flex justify-center items-center">
                          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                        </div>
                      ) : (
                        <div className="flex justify-center items-center gap-2">
                          <button
                            onClick={() => handleApprove(order._id, order.orderCode)}
                            disabled={user?.role === 2 && !['pending', 'paid'].includes(order.previousStatusBeforeCancelRequest)}
                            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-600 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition shadow-md shadow-emerald-100 flex items-center gap-1"
                            title={user?.role === 2 && !['pending', 'paid'].includes(order.previousStatusBeforeCancelRequest) ? "Nhân viên không có quyền duyệt hủy đơn đã xuất kho" : ""}
                          >
                            Đồng ý
                          </button>
                          <button
                            onClick={() => setRejectingId(order._id)}
                            disabled={user?.role === 2 && !['pending', 'paid'].includes(order.previousStatusBeforeCancelRequest)}
                            className="bg-red-50 text-red-600 hover:bg-red-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-red-50 disabled:hover:text-red-600 font-bold text-xs px-3.5 py-2 rounded-xl transition border border-red-200"
                            title={user?.role === 2 && !['pending', 'paid'].includes(order.previousStatusBeforeCancelRequest) ? "Nhân viên không có quyền từ chối hủy đơn đã xuất kho" : ""}
                          >
                            Từ chối
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal từ chối yêu cầu hủy đơn */}
      {rejectingId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-gray-100 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <XCircle className="w-7 h-7" />
              <h3 className="text-xl font-bold text-gray-900">Từ Chối Hủy Đơn</h3>
            </div>
            
            <p className="text-gray-500 text-sm mb-6 leading-relaxed">
              Bạn đang từ chối yêu cầu hủy đơn hàng. Vui lòng cung cấp lý do từ chối cụ thể để gửi thông báo chi tiết cho khách hàng.
            </p>

            <form onSubmit={handleRejectSubmit} className="space-y-6">
              <div>
                <label className="block text-gray-700 text-xs font-bold uppercase mb-2">Lý do từ chối *</label>
                <textarea
                  required
                  rows={4}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Nhập lý do từ chối (ví dụ: Đơn hàng đã được bàn giao cho đối tác vận chuyển)..."
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setRejectingId(null);
                    setRejectReason('');
                  }}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-5 py-3 rounded-2xl text-sm transition"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === rejectingId}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-3 rounded-2xl text-sm transition shadow-md shadow-red-200 flex items-center gap-1.5"
                >
                  {actionLoading === rejectingId && <Loader2 className="w-4 h-4 animate-spin" />}
                  Xác nhận từ chối
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
