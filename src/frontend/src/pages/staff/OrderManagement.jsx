import React, { useState, useEffect } from 'react';
import { Package, Clock, CheckCircle, Truck, XCircle, Search, Eye, Filter, Loader2, AlertCircle, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import OrderInvoiceQR from './OrderInvoiceQR';

export default function OrderManagement() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const isStaff = user?.role === 2;

  const [orders, setOrders] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // State quản lý chi tiết đơn hàng (Modal)
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [cancellingOrderId, setCancellingOrderId] = useState(null);
  const [adminCancelReason, setAdminCancelReason] = useState('');

  // Log thông tin User & Quyền hạn
  useEffect(() => {
    console.log('👤 [AuthContext] Current User info:', { 
      username: user?.username, 
      role: user?.role, 
      isStaff: isStaff 
    });
  }, [user, isStaff]);

  // 1. Tải danh sách đơn hàng thực tế từ MongoDB qua API
  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('glassesToken');
      const res = await fetch('/api/orders', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        // Ánh xạ cấu trúc dữ liệu trả về từ MongoDB
        const mappedOrders = data.orders.map(order => {
          // Log kiểm tra shipperId thô từ backend
          if (order.shipperId) {
            console.log(`📦 [API Order] Mã đơn: ${order.orderCode} - shipperId thô từ DB:`, order.shipperId);
          }
          return {
            _id: order._id,
            id: order.orderCode,
            customer: {
              name: order.customerInfo?.name || 'Khách vãng lai',
              phone: order.customerInfo?.phone || 'Không có',
              address: order.customerInfo?.address || 'Không có'
            },
            items: order.items.map(item => ({
              productId: item.productId?._id || '',
              name: item.productId?.name || 'Sản phẩm đã xóa',
              image: item.productId?.images?.[0] || '',
              quantity: item.quantity,
              price: item.priceAtPurchase,
              od: item.od || '',
              os: item.os || '',
              hasPrescription: item.hasPrescription || false,
              od_sph: item.od_sph,
              od_cyl: item.od_cyl,
              od_axis: item.od_axis,
              os_sph: item.os_sph,
              os_cyl: item.os_cyl,
              os_axis: item.os_axis,
              pd: item.pd,
              rxDate: item.rxDate,
              rxNote: item.rxNote,
              prescriptionMode: item.prescriptionMode || 'none'
            })),
            total: order.total,
            paymentMethod: order.paymentMethod,
            status: (order.status || '').trim(), // FIX BUG SHIPPED
            date: order.createdAt,
            shipperId: order.shipperId || null
          };
        });
        
        console.log('📋 [fetchOrders] Tổng số đơn hàng nạp được:', mappedOrders.length);
        setOrders(mappedOrders);
      } else {
        throw new Error(data.message || 'Không thể lấy dữ liệu đơn hàng');
      }
    } catch (err) {
      console.error('Lỗi tải đơn hàng từ MongoDB API:', err);
      setError('Không thể kết nối đến máy chủ hoặc tải danh sách đơn hàng.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // Đăng ký lắng nghe sự kiện đơn hàng realtime
  useEffect(() => {
    if (!socket) return;

    const handleOrderUpdate = () => {
      console.log('⚡ [Socket.IO Client] Nhận sự kiện cập nhật đơn hàng. Đang làm mới danh sách quản lý đơn hàng...');
      fetchOrders();
    };

    socket.on('order:new', handleOrderUpdate);
    socket.on('order:statusChanged', handleOrderUpdate);
    socket.on('order:cancelHandled', handleOrderUpdate);

    return () => {
      socket.off('order:new', handleOrderUpdate);
      socket.off('order:statusChanged', handleOrderUpdate);
      socket.off('order:cancelHandled', handleOrderUpdate);
    };
  }, [socket]);

  // 2. Hàm cập nhật trạng thái đơn hàng (Đồng bộ logic Backend + Kiểm soát luồng)
  const updateOrderStatus = async (orderId, newStatus, cancelReason = '') => {
    setIsUpdating(true);
    try {
      const token = localStorage.getItem('glassesToken');
      const bodyPayload = { status: newStatus };
      if (newStatus === 'cancelled' && cancelReason) {
        bodyPayload.cancelReason = cancelReason;
      }
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(bodyPayload)
      });
      const data = await res.json();
      if (data.success) {
        // Cập nhật trạng thái trên giao diện chính
        setOrders(prev => prev.map(o => o._id === orderId ? { ...o, status: newStatus } : o));
        
        // Nếu đang mở Modal chi tiết đơn hàng này, cập nhật trạng thái hiển thị trong Modal
        if (selectedOrder && selectedOrder._id === orderId) {
          setSelectedOrder(prev => ({ ...prev, status: newStatus }));
        }
      } else {
        alert('Cập nhật thất bại: ' + data.message);
      }
    } catch (err) {
      console.error('Lỗi kết nối cập nhật trạng thái:', err);
      alert('Không thể kết nối đến máy chủ để cập nhật trạng thái.');
    } finally {
      setIsUpdating(false);
    }
  };

  // 3. Hàm tính toán luồng chuyển đổi trạng thái hợp lệ trên Frontend (Staff vs Admin)
  const getAvailableStatuses = (currentStatus, shipperId) => {
    console.log('🔍 [getAvailableStatuses] Check input:', { currentStatus, shipperId, isStaff });

    if (currentStatus === 'pending' || currentStatus === 'paid') {
      return [currentStatus, 'processing', 'cancelled'];
    }

    if (currentStatus === 'processing') {
      return [currentStatus, 'cancelled'];
    }

    return [currentStatus];
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending': return 'Chờ xác nhận';
      case 'paid': return 'Đã thanh toán';
      case 'shipping': return 'Đang giao hàng';
      case 'shipped': return 'Đã giao (Chờ thu tiền)'; // FIX BUG SHIPPED
      case 'cancel_requested': return 'Yêu cầu hủy đơn'; // FIX BUG SHIPPED
      case 'completed': return 'Hoàn tất';
      case 'cancelled': return 'Đã hủy';
      default: return status;
    }
  };

  // 4. Render Badge Trạng Thái
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><Clock className="w-3 h-3"/> Chờ xác nhận</span>;
      case 'paid':
        return <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><CheckCircle className="w-3 h-3"/> Đã thanh toán</span>;
      case 'processing':
        return <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><Clock className="w-3 h-3"/> Đang xử lý</span>;
      case 'shipping':
        return <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><Truck className="w-3 h-3"/> Đang giao hàng</span>;
      case 'shipped': // FIX BUG SHIPPED
        return <span className="bg-teal-100 text-teal-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><CheckCircle className="w-3 h-3"/> Đã giao (Chờ thu tiền)</span>;
      case 'cancel_requested': // FIX BUG SHIPPED
        return <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><AlertCircle className="w-3 h-3"/> Yêu cầu hủy đơn</span>;
      case 'completed':
        return <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><CheckCircle className="w-3 h-3"/> Hoàn tất</span>;
      case 'cancelled':
        return <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 w-fit"><XCircle className="w-3 h-3"/> Đã hủy</span>;
      default:
        return <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs font-bold w-fit">{status}</span>;
    }
  };

  // Thống kê nhanh
  const pendingCount = orders.filter(o => o.status === 'pending').length;
  const completedCount = orders.filter(o => o.status === 'completed').length;
  const totalRevenue = orders.filter(o => o.status === 'completed').reduce((sum, o) => sum + o.total, 0);

  // Bộ lọc & Ô Tìm kiếm
  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      order.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
      order.customer.phone.includes(searchTerm) ||
      order.customer.name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* TIÊU ĐỀ HỆ THỐNG */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-2">
              <Package className="w-8 h-8 text-blue-600" /> Quản lý Đơn hàng
            </h1>
            <p className="text-gray-500 mt-1">Giao diện vận hành đơn hàng thực tế MongoDB dành cho Nhân viên</p>
          </div>
        </div>

        {/* THỐNG KÊ KPI CARDS (Bảo mật: Chỉ hiển thị tiền nếu là Admin) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-md transition">
            <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center"><Package className="w-7 h-7" /></div>
            <div>
              <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">Tổng Đơn Hàng</p>
              <p className="text-3xl font-black text-gray-900">{orders.length}</p>
            </div>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-md transition">
            <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center"><Clock className="w-7 h-7 animate-pulse" /></div>
            <div>
              <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">Chờ Xác Nhận</p>
              <p className="text-3xl font-black text-amber-600">{pendingCount}</p>
            </div>
          </div>
          
          {isStaff ? (
            // Nếu là Staff, ẩn doanh thu tài chính, thay vào đó hiển thị KPI năng suất đơn hoàn tất
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-md transition">
              <div className="w-14 h-14 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center"><CheckCircle className="w-7 h-7" /></div>
              <div>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">Đơn Đã Hoàn Tất</p>
                <p className="text-3xl font-black text-green-600">{completedCount}</p>
              </div>
            </div>
          ) : (
            // Chỉ Admin mới được xem doanh số
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-md transition">
              <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center"><CheckCircle className="w-7 h-7" /></div>
              <div>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">Doanh thu tạm tính</p>
                <p className="text-3xl font-black text-emerald-600">{totalRevenue.toLocaleString('vi-VN')}đ</p>
              </div>
            </div>
          )}
        </div>

        {/* BỘ LỌC TÌM KIẾM */}
        <div className="bg-white p-4 rounded-t-3xl border-b border-gray-100 flex flex-col md:flex-row gap-4 justify-between items-center shadow-sm">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Tìm theo Mã đơn, Tên hoặc SĐT..." 
              className="w-full pl-11 pr-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex gap-2 w-full md:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="flex items-center gap-2 px-4 py-3 bg-gray-55 text-gray-700 font-bold rounded-2xl outline-none border-none cursor-pointer w-full md:w-auto text-sm"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="pending">Chờ xác nhận</option>
              <option value="paid">Đã thanh toán</option>
              <option value="processing">Đang xử lý</option>
              <option value="shipping">Đang giao hàng</option>
              <option value="shipped">Đã giao (Chờ thu tiền)</option> {/* FIX BUG SHIPPED */}
              <option value="cancel_requested">Yêu cầu hủy đơn</option> {/* FIX BUG SHIPPED */}
              <option value="completed">Hoàn tất</option>
              <option value="cancelled">Đã hủy</option>
            </select>
            
            <button 
              onClick={fetchOrders}
              className="px-4 py-3 bg-gray-50 text-blue-600 hover:bg-blue-50 rounded-2xl font-bold transition text-sm flex items-center gap-1.5"
            >
              Làm mới
            </button>
          </div>
        </div>

        {/* BẢNG DỮ LIỆU ĐƠN HÀNG */}
        <div className="bg-white rounded-b-3xl shadow-sm border border-gray-100 overflow-hidden">
          
          {loading ? (
            // LOADING STATE
            <div className="p-20 flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
              <p className="text-gray-500 font-bold">Đang tải danh sách đơn hàng thực tế...</p>
            </div>
          ) : error ? (
            // ERROR STATE
            <div className="p-20 flex flex-col items-center justify-center gap-4">
              <AlertCircle className="w-16 h-16 text-red-500" />
              <p className="text-red-600 font-black text-center text-lg">{error}</p>
              <button 
                onClick={fetchOrders}
                className="mt-2 px-6 py-3 bg-gray-900 text-white font-bold rounded-2xl hover:bg-blue-600 transition shadow-lg"
              >
                Thử lại kết nối
              </button>
            </div>
          ) : filteredOrders.length === 0 ? (
            // EMPTY STATE
            <div className="p-20 flex flex-col items-center justify-center gap-4">
              <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center"><Package className="w-10 h-10 text-gray-300" /></div>
              <p className="text-gray-400 font-black text-lg">Không tìm thấy đơn hàng nào tương thích</p>
              <p className="text-gray-400 text-sm">Vui lòng điều chỉnh từ khóa tìm kiếm hoặc lọc trạng thái khác.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-400 text-xs font-bold uppercase tracking-wider border-b border-gray-100">
                    <th className="p-4">Mã Đơn / Ngày</th>
                    <th className="p-4">Khách Hàng</th>
                    <th className="p-4">Tổng Tiền / PTTT</th>
                    <th className="p-4">Trạng Thái</th>
                    <th className="p-4 text-center">Đổi Trạng Thái</th>
                    <th className="p-4 text-center">Chi Tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredOrders.map(order => (
                    <tr key={order._id} className="hover:bg-blue-50/20 transition-colors">
                      
                      {/* Mã & Ngày */}
                      <td className="p-4">
                        <span className="font-black text-blue-600 text-sm">{order.id}</span>
                        <div className="text-xs text-gray-400 mt-1">{new Date(order.date).toLocaleString('vi-VN')}</div>
                      </td>

                      {/* Khách hàng */}
                      <td className="p-4">
                        <div className="font-bold text-gray-900 text-sm">{order.customer.name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{order.customer.phone}</div>
                      </td>

                      {/* Tiền & Phương thức */}
                      <td className="p-4">
                        <div className="font-black text-gray-900 text-sm">{order.total.toLocaleString('vi-VN')}đ</div>
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-bold uppercase mt-1 inline-block">
                          {order.paymentMethod === 'cod' ? 'Tiền mặt (COD)' : 'Chuyển QR PayOS'}
                        </span>
                      </td>

                      {/* Trạng thái hiện tại */}
                      <td className="p-4">
                        {renderStatusBadge(order.status)}
                      </td>

                      {/* Trực tiếp đổi trạng thái với bộ lọc nghiêm ngặt */}
                      <td className="p-4 text-center max-w-[180px]">
                        <select 
                          value={order.status}
                          disabled={isUpdating || getAvailableStatuses(order.status, order.shipperId).length <= 1}
                          onChange={(e) => updateOrderStatus(order._id, e.target.value)}
                          className="bg-gray-55 border border-gray-200 text-gray-700 text-xs rounded-xl focus:ring-blue-500 focus:border-blue-500 w-full p-2.5 outline-none cursor-pointer font-bold disabled:opacity-50"
                        >
                          {getAvailableStatuses(order.status, order.shipperId).map(st => (
                            <option key={st} value={st}>
                              {getStatusLabel(st)}
                            </option>
                          ))}
                        </select>
                        {['processing', 'shipping', 'shipped'].includes(order.status) && (
                          <div className="text-[9px] text-gray-400 font-bold mt-1 leading-tight">
                            * Shipper sẽ cập nhật giao nhận qua App
                          </div>
                        )}
                      </td>

                      {/* Nút Xem Chi Tiết */}
                      <td className="p-4 text-center">
                        <button 
                          onClick={() => setSelectedOrder(order)}
                          className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl transition inline-flex items-center justify-center"
                          title="Xem chi tiết"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* ================= HỘP THOẠI CHI TIẾT ĐƠN HÀNG (MODAL) ================= */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl border border-gray-100 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            
            {/* Header Modal */}
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Chi tiết đơn hàng thực tế</span>
                <h2 className="text-xl font-black text-gray-900 mt-0.5">Mã đơn: <span className="text-blue-600">{selectedOrder.id}</span></h2>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-center">
                  <OrderInvoiceQR orderId={selectedOrder._id} orderCode={selectedOrder.id} />
                  <span className="text-[9px] text-gray-400 font-bold mt-1 max-w-[120px] text-center leading-tight">
                    Shipper quét mã này để nhận nhiệm vụ
                  </span>
                </div>
                
                <button 
                  onClick={() => setSelectedOrder(null)}
                  className="p-2 bg-white text-gray-400 hover:text-gray-900 rounded-full border shadow-sm hover:shadow-md transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content (Có scroll) */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
              
              {/* PHẦN 1: THÔNG TIN KHÁCH HÀNG & GIAO NHẬN */}
              <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
                <h3 className="font-black text-gray-900 mb-3 uppercase text-xs tracking-wider text-blue-600">Thông tin người nhận</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <span className="text-gray-400 text-xs">Họ và tên:</span>
                    <p className="font-bold text-gray-800 mt-0.5">{selectedOrder.customer.name}</p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs">Số điện thoại:</span>
                    <p className="font-bold text-gray-800 mt-0.5">{selectedOrder.customer.phone}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-gray-400 text-xs">Địa chỉ giao hàng:</span>
                    <p className="font-bold text-gray-800 mt-0.5">{selectedOrder.customer.address}</p>
                  </div>
                </div>
              </div>

              {/* PHẦN 2: THÔNG TIN PHƯƠNG THỨC & TRẠNG THÁI */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <span className="text-gray-400 text-xs font-bold uppercase block mb-1">Phương thức thanh toán</span>
                  <p className="font-bold text-gray-800">{selectedOrder.paymentMethod === 'cod' ? 'Thanh toán tiền mặt khi nhận hàng (COD)' : 'Chuyển khoản QR qua cổng PayOS'}</p>
                </div>
                
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex flex-col justify-between">
                  <div>
                    <span className="text-gray-400 text-xs font-bold uppercase block mb-1.5">Trạng thái vận đơn</span>
                    {renderStatusBadge(selectedOrder.status)}
                  </div>
                  
                  {/* Trình cập nhật ngay trong Modal */}
                  <div className="mt-3">
                    <span className="text-gray-400 text-xs block mb-1">Đổi trạng thái nhanh:</span>
                    <select
                      value={selectedOrder.status}
                      disabled={isUpdating || getAvailableStatuses(selectedOrder.status, selectedOrder.shipperId).length <= 1}
                      onChange={(e) => {
                        const newStatus = e.target.value;
                        if (newStatus === 'cancelled') {
                          setCancellingOrderId(selectedOrder._id);
                          setAdminCancelReason('');
                        } else {
                          updateOrderStatus(selectedOrder._id, newStatus);
                        }
                      }}
                      className="bg-white border border-gray-200 text-gray-800 text-xs rounded-xl p-2 font-bold outline-none cursor-pointer w-full disabled:opacity-50"
                    >
                      {getAvailableStatuses(selectedOrder.status, selectedOrder.shipperId).map(st => (
                        <option key={st} value={st}>
                          {getStatusLabel(st)}
                        </option>
                      ))}
                    </select>
                    {['processing', 'shipping', 'shipped'].includes(selectedOrder.status) && (
                      <div className="text-[10px] text-gray-400 font-bold mt-1 leading-tight">
                        * Trạng thái giao hàng sẽ do Shipper tự động cập nhật qua App
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* PHẦN 3: DANH SÁCH MẮT KÍNH & THÔNG SỐ ĐỘ CẬN */}
              <div className="space-y-4">
                <h3 className="font-black text-gray-900 uppercase text-xs tracking-wider text-blue-600">Sản phẩm & Thông số gia công</h3>
                <div className="space-y-3">
                  {selectedOrder.items.map((item, index) => (
                    <div key={index} className="flex gap-4 p-4 bg-white border border-gray-100 rounded-2xl hover:border-gray-200 transition">
                      {item.image ? (
                        <img src={item.image} className="w-16 h-16 object-cover rounded-xl border p-1 flex-shrink-0" alt={item.name} />
                      ) : (
                        <div className="w-16 h-16 bg-gray-55 rounded-xl border flex items-center justify-center text-gray-300 flex-shrink-0"><Package className="w-8 h-8" /></div>
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 truncate" title={item.name}>{item.name}</p>
                        <p className="text-xs text-gray-500 mt-1 font-medium">Giá: {item.price.toLocaleString('vi-VN')}đ | Số lượng: {item.quantity}</p>
                        
                        {/* Thông số độ cận (Prescription Specs) */}
                        {item.hasPrescription ? (
                          <div className="mt-3 bg-blue-50/50 p-3 rounded-xl border border-blue-100/30 text-xs space-y-2">
                            {/* Prescription Mode Indicator */}
                            {item.prescriptionMode && item.prescriptionMode !== 'none' && (
                              <div className="inline-block text-[10px] text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                                Kiểu toa: {item.prescriptionMode === 'saved' ? 'Hồ sơ đã lưu' : 'Tự nhập mới'}
                              </div>
                            )}

                            {/* Warning Banner */}
                            <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100/50 p-2 rounded-lg font-bold flex items-start gap-1">
                              <span>⚠️</span>
                              <span>Thông tin độ cận do khách hàng tự cung cấp. Vui lòng kiểm tra kỹ trước khi đặt kính.</span>
                            </div>

                            {/* Detailed Fields */}
                            {item.od_sph !== undefined && item.od_sph !== null ? (
                              <div className="space-y-1">
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="bg-white p-2 rounded-lg border border-gray-100">
                                    <span className="text-gray-400 font-bold block uppercase text-[9px]">Mắt Phải (OD):</span>
                                    <span className="text-blue-700 font-bold block">SPH: {item.od_sph} | CYL: {item.od_cyl ?? 0} | AXIS: {item.od_axis ?? 0}</span>
                                  </div>
                                  <div className="bg-white p-2 rounded-lg border border-gray-100">
                                    <span className="text-gray-400 font-bold block uppercase text-[9px]">Mắt Trái (OS):</span>
                                    <span className="text-blue-700 font-bold block">SPH: {item.os_sph} | CYL: {item.os_cyl ?? 0} | AXIS: {item.os_axis ?? 0}</span>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 mt-1">
                                  <div className="bg-white p-2 rounded-lg border border-gray-100">
                                    <span className="text-gray-400 font-bold block uppercase text-[9px]">PD (Khoảng cách đồng tử):</span>
                                    <span className="text-gray-700 font-bold">{item.pd ? `${item.pd} mm` : 'Không có'}</span>
                                  </div>
                                  <div className="bg-white p-2 rounded-lg border border-gray-100">
                                    <span className="text-gray-400 font-bold block uppercase text-[9px]">Ngày đo:</span>
                                    <span className="text-gray-700 font-bold">{item.rxDate ? new Date(item.rxDate).toLocaleDateString('vi-VN') : 'Không có'}</span>
                                  </div>
                                </div>
                                {item.rxNote && (
                                  <div className="bg-white p-2 rounded-lg border border-gray-100 mt-1">
                                    <span className="text-gray-400 font-bold block uppercase text-[9px]">Ghi chú:</span>
                                    <span className="text-gray-600 font-medium">{item.rxNote}</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              /* Old style string fallback */
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <span className="text-gray-400 font-bold block uppercase text-[10px]">Mắt Phải (OD):</span>
                                  <span className="text-blue-700 font-bold">{item.od || 'Không có'}</span>
                                </div>
                                <div>
                                  <span className="text-gray-400 font-bold block uppercase text-[10px]">Mắt Trái (OS):</span>
                                  <span className="text-blue-700 font-bold">{item.os || 'Không có'}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded mt-2 inline-block font-bold">Kính không độ / Thời trang</span>
                        )}
                      </div>
                      
                      <div className="text-right flex-shrink-0">
                        <span className="font-black text-gray-900 text-sm">{(item.price * item.quantity).toLocaleString('vi-VN')}đ</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Footer Modal */}
            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
              <div>
                <span className="text-xs text-gray-400 font-bold block uppercase">Tổng tiền thanh toán</span>
                <span className="text-2xl font-black text-blue-600">{selectedOrder.total.toLocaleString('vi-VN')}đ</span>
              </div>
              <button 
                onClick={() => setSelectedOrder(null)}
                className="px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-2xl transition"
              >
                Đóng
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal xác nhận hủy đơn dành cho Staff/Admin */}
      {cancellingOrderId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-gray-100 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3 mb-4 text-red-500">
              <XCircle className="w-7 h-7" />
              <h3 className="text-xl font-bold text-gray-900">Xác Nhận Hủy Đơn Hàng</h3>
            </div>
            
            <p className="text-gray-500 text-sm mb-6 leading-relaxed">
              Bạn đang thực hiện hủy đơn hàng này trực tiếp. Vui lòng cung cấp lý do hủy chi tiết để thông báo cho khách hàng và lưu trữ lịch sử hệ thống.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-gray-700 text-xs font-bold uppercase mb-2">Lý do hủy đơn *</label>
                <textarea
                  rows={3}
                  value={adminCancelReason}
                  onChange={(e) => setAdminCancelReason(e.target.value)}
                  placeholder="Nhập lý do chi tiết (không được bỏ trống)..."
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setCancellingOrderId(null);
                    setAdminCancelReason('');
                  }}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-5 py-3 rounded-2xl text-sm transition"
                >
                  Bỏ qua
                </button>
                <button
                  type="button"
                  disabled={!adminCancelReason.trim()}
                  onClick={() => {
                    updateOrderStatus(cancellingOrderId, 'cancelled', adminCancelReason.trim());
                    setCancellingOrderId(null);
                    setAdminCancelReason('');
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-3 rounded-2xl text-sm transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-red-100"
                >
                  Xác nhận hủy đơn
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}