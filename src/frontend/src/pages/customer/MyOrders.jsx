import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  ShoppingBag, Calendar, ArrowLeft, AlertTriangle, Loader2, 
  CreditCard, CheckCircle2, Truck, ShieldCheck, 
  HelpCircle, CheckCircle, Clock, Package, XCircle
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext';

export default function MyOrders() {
  const { socket } = useSocket();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Trạng thái cho modal hủy đơn của khách
  const [cancellingOrder, setCancellingOrder] = useState(null);
  const [isDirectCancel, setIsDirectCancel] = useState(false);
  const [cancelReasonInput, setCancelReasonInput] = useState('');
  const [cancelSubmitLoading, setCancelSubmitLoading] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  const fetchMyOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('glassesToken');
      if (!token) {
        setError('Bạn chưa đăng nhập. Vui lòng đăng nhập để xem lịch sử đơn hàng!');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/orders/my-orders', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();

      if (data.success) {
        setOrders(data.orders || []);
      } else {
        setError(data.message || 'Không thể tải danh sách đơn hàng!');
      }
    } catch (err) {
      console.error('Lỗi fetch đơn hàng:', err);
      setError('Lỗi kết nối máy chủ. Vui lòng thử lại sau!');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyOrders();
  }, []);

  // Đăng ký lắng nghe sự kiện cập nhật trạng thái đơn hàng realtime
  useEffect(() => {
    if (!socket) return;

    const handleOrderStatusUpdate = () => {
      console.log('⚡ [Socket.IO Client] Nhận sự kiện cập nhật đơn hàng. Đang làm mới danh sách đơn cá nhân...');
      fetchMyOrders();
    };

    socket.on('order:statusChanged', handleOrderStatusUpdate);
    socket.on('order:cancelHandled', handleOrderStatusUpdate);

    return () => {
      socket.off('order:statusChanged', handleOrderStatusUpdate);
      socket.off('order:cancelHandled', handleOrderStatusUpdate);
    };
  }, [socket]);

  // Hàm trả về Style và Icon tương ứng với từng trạng thái
  const getStatusBadge = (order) => {
    const status = order.status;
    const refundStatus = order.refundStatus;

    if (status === 'cancelled') {
      if (refundStatus === 'wallet_refunded') {
        return {
          label: 'Đã hủy & Hoàn ví',
          className: 'bg-cyan-50 text-cyan-700 border-cyan-200',
          icon: <CheckCircle2 className="w-4 h-4 text-cyan-600" />
        };
      }
      return {
        label: 'Đã hủy đơn',
        className: 'bg-red-50 text-red-700 border-red-200',
        icon: <XCircle className="w-4 h-4 text-red-600" />
      };
    }

    switch (status) {
      case 'pending':
        return {
          label: 'Chờ thanh toán',
          className: 'bg-amber-50 text-amber-700 border-amber-200',
          icon: <Clock className="w-4 h-4 text-amber-600" />
        };
      case 'paid':
        return {
          label: 'Đã thanh toán',
          className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          icon: <CheckCircle className="w-4 h-4 text-emerald-600" />
        };
      case 'processing':
        return {
          label: 'Đang xử lý',
          className: 'bg-blue-50 text-blue-700 border-blue-200',
          icon: <Package className="w-4 h-4 text-blue-600" />
        };
      case 'shipping':
        return {
          label: 'Đang giao hàng',
          className: 'bg-indigo-50 text-indigo-700 border-indigo-200',
          icon: <Truck className="w-4 h-4 text-indigo-600" />
        };
      case 'shipped':
        return {
          label: 'Đã giao hàng',
          className: 'bg-purple-50 text-purple-700 border-purple-200',
          icon: <Truck className="w-4 h-4 text-purple-600" />
        };
      case 'completed':
        return {
          label: 'Đã hoàn thành',
          className: 'bg-green-50 text-green-700 border-green-200',
          icon: <CheckCircle2 className="w-4 h-4 text-green-600" />
        };
      case 'cancel_requested':
        return {
          label: 'Chờ duyệt hủy',
          className: 'bg-amber-100 text-amber-800 border-amber-300',
          icon: <Clock className="w-4 h-4 text-amber-700" />
        };
      default:
        return {
          label: status || 'Không rõ',
          className: 'bg-gray-50 text-gray-700 border-gray-200',
          icon: <HelpCircle className="w-4 h-4 text-gray-600" />
        };
    }
  };

  // Mở modal chuẩn bị hủy đơn
  const handleCancelClick = (order, direct) => {
    setCancellingOrder(order);
    setIsDirectCancel(direct);
    setCancelReasonInput('');
    setCancelError(null);
  };

  // Xử lý gửi yêu cầu hủy đơn lên Backend
  const handleCancelSubmit = async (e) => {
    e.preventDefault();
    setCancelError(null);

    // Ràng buộc lý do với trường hợp gửi yêu cầu (> 5 phút hoặc Banking)
    if (!isDirectCancel && !cancelReasonInput.trim()) {
      setCancelError('Vui lòng cung cấp lý do cụ thể để gửi yêu cầu hủy!');
      return;
    }

    const finalReason = isDirectCancel 
      ? (cancelReasonInput.trim() || 'Khách tự hủy trong thời gian cho phép')
      : cancelReasonInput.trim();

    setCancelSubmitLoading(true);
    try {
      const token = localStorage.getItem('glassesToken');
      const response = await fetch(`/api/orders/${cancellingOrder._id}/cancel-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ reason: finalReason })
      });
      const data = await response.json();

      if (data.success) {
        alert(isDirectCancel ? 'Hủy đơn hàng thành công!' : 'Đã gửi yêu cầu hủy đơn hàng, vui lòng chờ duyệt!');
        setCancellingOrder(null);
        fetchMyOrders(); // Refetch danh sách đơn hàng
      } else {
        setCancelError(data.message || 'Không thể xử lý yêu cầu hủy đơn hàng!');
      }
    } catch (err) {
      console.error('Lỗi khi gửi yêu cầu hủy đơn:', err);
      setCancelError('Lỗi kết nối máy chủ. Vui lòng kiểm tra lại đường truyền!');
    } finally {
      setCancelSubmitLoading(false);
    }
  };

  // Trạng thái Đang loading
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center space-x-3 mb-8">
            <div className="w-10 h-10 bg-gray-200 rounded-full animate-pulse" />
            <div className="h-8 bg-gray-200 rounded w-48 animate-pulse" />
          </div>
          <div className="space-y-6">
            {[1, 2, 3].map((n) => (
              <div key={n} className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-4">
                <div className="flex justify-between items-center border-b border-gray-50 pb-4">
                  <div className="h-5 bg-gray-200 rounded w-32 animate-pulse" />
                  <div className="h-6 bg-gray-200 rounded w-24 animate-pulse" />
                </div>
                <div className="flex items-center space-x-4">
                  <div className="w-20 h-20 bg-gray-200 rounded-xl animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 bg-gray-200 rounded w-2/3 animate-pulse" />
                    <div className="h-4 bg-gray-200 rounded w-1/4 animate-pulse" />
                  </div>
                </div>
                <div className="flex justify-between items-center pt-4 border-t border-gray-50">
                  <div className="h-4 bg-gray-200 rounded w-40 animate-pulse" />
                  <div className="h-7 bg-gray-200 rounded w-36 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Trạng thái Lỗi tải dữ liệu
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 sm:p-10 rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center max-w-md w-full text-center">
          <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6">
            <AlertTriangle className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Đã xảy ra sự cố</h2>
          <p className="text-gray-500 mb-8 text-sm">{error}</p>
          <div className="w-full space-y-3">
            <button 
              onClick={fetchMyOrders} 
              className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2"
            >
              Thử tải lại dữ liệu
            </button>
            <Link 
              to="/" 
              className="w-full bg-gray-100 text-gray-700 py-3.5 rounded-xl font-bold hover:bg-gray-200 transition flex items-center justify-center gap-2"
            >
              Quay về Trang chủ
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Trạng thái Lịch sử rỗng
  if (orders.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-10 rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center max-w-md w-full text-center">
          <div className="w-24 h-24 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-6 animate-bounce">
            <ShoppingBag className="w-12 h-12" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Chưa có đơn hàng nào</h2>
          <p className="text-gray-500 mb-8 text-sm">
            Bạn chưa thực hiện giao dịch mua kính mắt nào trên hệ thống. Hãy mua sắm chiếc kính đầu tiên ngay nào!
          </p>
          <Link 
            to="/" 
            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-blue-700 transition flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
          >
            <ArrowLeft className="w-5 h-5" /> Khám phá Cửa hàng
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-4xl mx-auto px-4">
        
        {/* Quay lại cửa hàng */}
        <Link to="/" className="inline-flex items-center text-gray-500 hover:text-blue-600 mb-6 font-medium transition">
          <ArrowLeft className="w-5 h-5 mr-2" /> Tiếp tục mua sắm
        </Link>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Đơn hàng của tôi</h1>
            <p className="text-gray-500 text-sm mt-1">Quản lý và theo dõi tiến trình xử lý đơn hàng của bạn</p>
          </div>
          <div className="bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1.5 rounded-full border border-blue-100 shadow-sm flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> {orders.length} Đơn hàng
          </div>
        </div>

        {/* Danh sách các đơn hàng dạng Cards */}
        <div className="space-y-6">
          {orders.map((order) => {
            const badge = getStatusBadge(order);

            // Kiểm tra khả năng hủy đơn
            const isCod = order.paymentMethod === 'cod';
            const isPending = order.status === 'pending';
            const timeDiff = Date.now() - new Date(order.createdAt).getTime();
            const canDirectCancel = isCod && isPending && (timeDiff <= 5 * 60 * 1000); // Tự hủy COD trong 5 phút

            const showCancelBtn = !['cancelled', 'completed', 'shipping', 'shipped', 'cancel_requested'].includes(order.status);
            
            return (
              <div 
                key={order._id} 
                className="bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all overflow-hidden"
              >
                {/* Header đơn hàng */}
                <div className="bg-gray-50/50 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-100 gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-extrabold text-gray-900 text-base tracking-wide select-all">
                      {order.orderCode}
                    </span>
                    <span className="hidden sm:block text-gray-300">|</span>
                    <span className="text-gray-500 text-sm flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      {new Date(order.createdAt).toLocaleDateString('vi-VN', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  
                  {/* Trạng thái đơn */}
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${badge.className}`}>
                    {badge.icon}
                    {badge.label}
                  </span>
                </div>

                {/* Danh sách sản phẩm mua sắm */}
                <div className="divide-y divide-gray-50 px-6">
                  {order.items.map((item, idx) => {
                    const product = item.productId;
                    const fallbackName = "Sản phẩm không còn kinh doanh";
                    const hasDetail = !!product;

                    return (
                      <div key={idx} className="py-4 flex items-start gap-4">
                        {/* Ảnh sản phẩm */}
                        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gray-50 rounded-xl border border-gray-100 flex-shrink-0 p-1 flex items-center justify-center">
                          {hasDetail && product.images && product.images[0] ? (
                            <img 
                              src={product.images[0]} 
                              alt={product.name} 
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <ShoppingBag className="w-8 h-8 text-gray-300" />
                          )}
                        </div>

                        {/* Thông tin chi tiết */}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-gray-900 text-sm sm:text-base truncate leading-snug">
                            {hasDetail ? product.name : fallbackName}
                          </h3>
                          
                          {/* Trình bày Toa kính thuốc nếu có */}
                          {item.hasPrescription ? (
                            <div className="mt-1 space-y-1">
                              {item.prescriptionMode && item.prescriptionMode !== 'none' && (
                                <div className="text-[10px] text-blue-600 font-bold mb-1">
                                  Kiểu toa: {item.prescriptionMode === 'saved' ? 'Hồ sơ đã lưu' : 'Tự nhập mới'}
                                </div>
                              )}
                              {item.od_sph !== undefined && item.od_sph !== null ? (
                                <>
                                  <div className="flex flex-wrap gap-1.5">
                                    <span className="bg-blue-50 text-blue-700 text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded border border-blue-100" translate="no">
                                      Phải (OD): SPH {item.od_sph} | CYL {item.od_cyl ?? 0} | AXIS {item.od_axis ?? 0}
                                    </span>
                                    <span className="bg-blue-50 text-blue-700 text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded border border-blue-100" translate="no">
                                      Trái (OS): SPH {item.os_sph} | CYL {item.os_cyl ?? 0} | AXIS {item.os_axis ?? 0}
                                    </span>
                                  </div>
                                  <div className="flex gap-2 text-[10px] text-gray-500 font-bold">
                                    <span>PD: {item.pd ? `${item.pd} mm` : 'N/A'}</span>
                                    {item.rxDate && <span>• Ngày đo: {new Date(item.rxDate).toLocaleDateString('vi-VN')}</span>}
                                  </div>
                                </>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  <span className="bg-blue-50 text-blue-700 text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded border border-blue-100" translate="no">
                                    OD (Phải): {item.od || '0.00'}
                                  </span>
                                  <span className="bg-blue-50 text-blue-700 text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded border border-blue-100" translate="no">
                                    OS (Trái): {item.os || '0.00'}
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-[11px] sm:text-xs text-gray-400 mt-1">Mắt thường (Không độ)</p>
                          )}

                          <div className="flex justify-between items-center mt-2.5">
                            <span className="text-gray-500 text-xs sm:text-sm">
                              Số lượng: <span className="font-bold text-gray-800">{item.quantity}</span>
                            </span>
                            <span className="font-extrabold text-gray-900 text-xs sm:text-sm">
                              {(item.priceAtPurchase || 0).toLocaleString('vi-VN')} đ
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer đơn hàng */}
                <div className="px-6 py-4 bg-gray-50/20 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex flex-col gap-1 text-xs sm:text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-gray-400" />
                      <span>Phương thức: </span>
                      <span className="font-bold text-gray-800 uppercase">
                        {order.paymentMethod === 'cod' ? 'COD (Nhận hàng trả tiền)' : 'Chuyển khoản Banking / PayOS'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto">
                    {['shipping', 'shipped'].includes(order.status) ? (
                      <div className="relative group">
                        <button
                          disabled
                          className="text-xs font-bold px-4 py-2 rounded-xl bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed shadow-none"
                        >
                          Yêu cầu hủy đơn
                        </button>
                        <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-[10px] p-2 rounded-lg w-48 text-center shadow-lg font-medium left-1/2 -translate-x-1/2 z-10 leading-tight">
                          Đơn hàng đang được giao đến bạn. Vui lòng từ chối nhận hàng khi shipper liên hệ.
                          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-t-4 border-t-gray-900 border-x-4 border-x-transparent"></div>
                        </div>
                      </div>
                    ) : showCancelBtn && (
                      <button
                        onClick={() => handleCancelClick(order, canDirectCancel)}
                        className={`text-xs font-bold px-4 py-2 rounded-xl transition border shadow-sm ${
                          canDirectCancel 
                            ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-600 hover:text-white shadow-red-100' 
                            : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-600 hover:text-white shadow-amber-100'
                        }`}
                      >
                        {canDirectCancel ? 'Hủy đơn hàng' : 'Yêu cầu hủy đơn'}
                      </button>
                    )}
                    <div className="flex items-end gap-2">
                      <span className="text-gray-500 text-sm">Tổng cộng:</span>
                      <span className="font-black text-blue-600 text-xl sm:text-2xl leading-none">
                        {order.total.toLocaleString('vi-VN')} đ
                      </span>
                    </div>
                  </div>
                </div>

                {/* Banner từ chối hủy đơn nếu có (UX cao cấp) */}
                {order.refundStatus === 'rejected' && (
                  <div className="px-6 py-3.5 bg-red-50/80 border-t border-red-100 flex items-start gap-2.5 text-red-900 text-xs sm:text-sm">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Yêu cầu hủy đơn bị từ chối:</span>{' '}
                      <span className="italic">{order.cancelRejectReason || 'Không có lý do cụ thể.'}</span>
                    </div>
                  </div>
                )}

                {/* Banner lý do hủy đơn nếu đơn đã bị hủy */}
                {order.status === 'cancelled' && (
                  <div className="px-6 py-3.5 bg-red-50/50 border-t border-red-100/60 flex items-start gap-2.5 text-red-950 text-xs sm:text-sm">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Đơn hàng đã bị hủy.</span>{' '}
                      <span>Lý do: </span>
                      <span className="italic font-medium">{order.cancelReason || 'Không có lý do cụ thể.'}</span>
                    </div>
                  </div>
                )}

              </div>
            );
          })}
        </div>

      </div>

      {/* Modal yêu cầu hủy đơn / Hủy trực tiếp */}
      {cancellingOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-gray-100 animate-in fade-in zoom-in duration-200">
            <div className={`flex items-center gap-3 mb-4 ${isDirectCancel ? 'text-red-500' : 'text-amber-600'}`}>
              {isDirectCancel ? <XCircle className="w-7 h-7" /> : <AlertTriangle className="w-7 h-7" />}
              <h3 className="text-xl font-bold text-gray-900">
                {isDirectCancel ? 'Xác Nhận Hủy Đơn' : 'Yêu Cầu Hủy Đơn Hàng'}
              </h3>
            </div>
            
            <p className="text-gray-500 text-sm mb-6 leading-relaxed">
              {isDirectCancel 
                ? 'Đơn hàng COD này của bạn được tạo trong vòng 5 phút đầu nên được phép hủy trực tiếp trên hệ thống.' 
                : 'Đơn hàng của bạn đã thanh toán hoặc đã quá 5 phút. Bạn vui lòng cung cấp lý do hủy để nhân viên quản trị phê duyệt hoàn tiền ví.'}
            </p>

            <form onSubmit={handleCancelSubmit} className="space-y-6">
              <div>
                <label className="block text-gray-700 text-xs font-bold uppercase mb-2">
                  Lý do hủy đơn {!isDirectCancel && '*'}
                </label>
                <textarea
                  required={!isDirectCancel}
                  rows={3}
                  value={cancelReasonInput}
                  onChange={(e) => setCancelReasonInput(e.target.value)}
                  placeholder={
                    isDirectCancel 
                      ? 'Nhập lý do tự hủy (không bắt buộc)...' 
                      : 'Bắt buộc nhập lý do chi tiết để nhân viên xử lý hoàn tiền ví...'
                  }
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>

              {cancelError && (
                <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-2.5 text-red-800 text-xs flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{cancelError}</span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setCancellingOrder(null);
                    setCancelReasonInput('');
                    setCancelError(null);
                  }}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-5 py-3 rounded-2xl text-sm transition"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={cancelSubmitLoading}
                  className={`font-bold px-5 py-3 rounded-2xl text-sm transition flex items-center gap-1.5 ${
                    isDirectCancel 
                      ? 'bg-red-650 hover:bg-red-600 text-white bg-red-550 shadow-md shadow-red-200' 
                      : 'bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-200'
                  }`}
                >
                  {cancelSubmitLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Xác nhận {isDirectCancel ? 'hủy ngay' : 'gửi yêu cầu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
