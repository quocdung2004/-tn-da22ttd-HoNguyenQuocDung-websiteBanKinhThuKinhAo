import React, { useState, useEffect } from 'react';
import { 
  Truck, 
  DollarSign, 
  CheckCircle, 
  UserCheck, 
  RefreshCw, 
  Search, 
  AlertCircle, 
  TrendingUp, 
  Calendar, 
  Clock, 
  User, 
  ShieldCheck,
  ChevronRight,
  Package,
  Check
} from 'lucide-react';

export default function ShipperManagement() {
  const [activeTab, setActiveTab] = useState('assignment'); // 'assignment' | 'reconciliation'
  
  // States cho Tab 1: Phân công
  const [pendingOrders, setPendingOrders] = useState([]);
  const [shippers, setShippers] = useState([]);
  const [selectedShipper, setSelectedShipper] = useState({}); // Lưu { orderId: shipperUsername }
  
  // States cho Tab 2: Đối soát
  const [reconciliations, setReconciliations] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submittingId, setSubmittingId] = useState(null);

  const token = localStorage.getItem('glassesToken');

  // Tải toàn bộ dữ liệu (đơn hàng, shippers, yêu cầu đối soát)
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Lấy danh sách đơn hàng chờ phân công
      const ordersRes = await fetch('/api/orders/admin/shipper-pending', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const ordersData = await ordersRes.json();

      // 2. Lấy danh sách Shippers
      const shippersRes = await fetch('/api/orders/admin/shippers-list', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const shippersData = await shippersRes.json();

      // 3. Lấy danh sách yêu cầu đối soát
      const reconRes = await fetch('/api/orders/admin/reconciliation-requests', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const reconData = await reconRes.json();

      if (ordersData.success && shippersData.success && reconData.success) {
        setPendingOrders(ordersData.orders || []);
        setShippers(shippersData.shippers || []);
        setReconciliations(reconData.requests || []);
      } else {
        throw new Error('API trả về kết quả không thành công.');
      }
    } catch (err) {
      console.error('Lỗi API quản trị shipper:', err);
      setError('Đang sử dụng dữ liệu mô phỏng do lỗi kết nối API.');
      
      // MOCK DATA để Admin test trực tiếp giao diện
      const mockShippers = [
        { username: 'shipper_nam', name: 'Nguyễn Hoài Nam', phone: '0981112223' },
        { username: 'shipper_dung', name: 'Trần Quốc Dũng', phone: '0982223334' },
        { username: 'shipper_minh', name: 'Phạm Bình Minh', phone: '0983334445' }
      ];
      setShippers(mockShippers);

      const mockPendingOrders = [
        {
          _id: 'ord1',
          orderCode: 'ORD-2026A1',
          customerInfo: { name: 'Lê Thúy Hạnh', phone: '0912121212', address: '12 Đường Đồng Khởi, Quận 1, TP. HCM' },
          paymentMethod: 'cod',
          total: 680000,
          createdAt: '2026-06-30T10:15:00.000Z'
        },
        {
          _id: 'ord2',
          orderCode: 'ORD-2026A2',
          customerInfo: { name: 'Trịnh Thế Mỹ', phone: '0934343434', address: '345 Hùng Vương, Quận 5, TP. HCM' },
          paymentMethod: 'banking',
          total: 1350000,
          createdAt: '2026-06-30T11:30:00.000Z'
        },
        {
          _id: 'ord3',
          orderCode: 'ORD-2026A3',
          customerInfo: { name: 'Vũ Quốc Bảo', phone: '0978787878', address: '67 Nguyễn Bỉnh Khiêm, Bình Thạnh, TP. HCM' },
          paymentMethod: 'cod',
          total: 420000,
          createdAt: '2026-06-30T12:00:00.000Z'
        }
      ];
      setPendingOrders(mockPendingOrders);

      const mockReconciliationRequests = [
        {
          _id: 'shipper_nam',
          shipperName: 'Nguyễn Hoài Nam',
          shipperPhone: '0981112223',
          orderCount: 2,
          totalCod: 1100000,
          orders: [
            { orderCode: 'ORD-2026A01', total: 600000, customerName: 'Hoàng Lâm', createdAt: '2026-06-30T01:00:00.000Z' },
            { orderCode: 'ORD-2026A02', total: 500000, customerName: 'Mai Phương', createdAt: '2026-06-30T02:00:00.000Z' }
          ]
        },
        {
          _id: 'shipper_dung',
          shipperName: 'Trần Quốc Dũng',
          shipperPhone: '0982223334',
          orderCount: 1,
          totalCod: 450000,
          orders: [
            { orderCode: 'ORD-2026A05', total: 450000, customerName: 'Minh Tuấn', createdAt: '2026-06-30T04:00:00.000Z' }
          ]
        }
      ];
      setReconciliations(mockReconciliationRequests);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Xử lý phân công giao hàng (Tab 1)
  const handleAssignShipper = async (orderId, orderCode) => {
    const shipperUsername = selectedShipper[orderId];
    if (!shipperUsername) {
      alert('Vui lòng chọn 1 Shipper từ danh sách thả xuống!');
      return;
    }

    setSubmittingId(orderId);
    try {
      const res = await fetch('/api/orders/admin/assign-shipper', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ orderId, shipperUsername })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Đã giao đơn hàng ${orderCode} cho shipper ${shipperUsername} đi giao!`);
        // Làm mới dữ liệu
        fetchData();
      } else {
        alert(data.message || 'Phân công shipper thất bại.');
      }
    } catch (err) {
      console.error('Lỗi phân công shipper:', err);
      // Fallback offline demo
      setPendingOrders(prev => prev.filter(o => o._id !== orderId));
      alert(`Đã phân công thành công đơn ${orderCode} cho ${shipperUsername} (Chế độ mô phỏng).`);
    } finally {
      setSubmittingId(null);
    }
  };

  // Xử lý duyệt đối soát dòng tiền (Tab 2)
  const handleApproveReconciliation = async (shipperUsername, shipperName, totalCod) => {
    const confirmApprove = window.confirm(
      `Xác nhận Admin ĐÃ NHẬN ĐỦ số tiền ${totalCod.toLocaleString('vi-VN')}đ và duyệt đối soát giải ngân cho Shipper: ${shipperName}?`
    );
    if (!confirmApprove) return;

    setSubmittingId(shipperUsername);
    try {
      const res = await fetch('/api/orders/admin/approve-reconciliation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ shipperUsername })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Đã duyệt đối soát thành công dòng tiền cho shipper ${shipperName}!`);
        fetchData();
      } else {
        alert(data.message || 'Duyệt đối soát thất bại.');
      }
    } catch (err) {
      console.error('Lỗi duyệt đối soát:', err);
      // Fallback offline demo
      setReconciliations(prev => prev.filter(r => r._id !== shipperUsername));
      alert(`Đã duyệt đối soát thành công cho shipper ${shipperName} (Chế độ mô phỏng).`);
    } finally {
      setSubmittingId(null);
    }
  };

  // Xử lý cập nhật Dropdown
  const handleDropdownChange = (orderId, val) => {
    setSelectedShipper(prev => ({
      ...prev,
      [orderId]: val
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 sm:p-10 font-sans">
      <div className="max-w-7xl mx-auto">
        
        {/* HEADER & THỐNG KÊ KPI */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
              <Truck className="w-8 h-8 text-indigo-600" /> Quản trị Giao nhận & Đối soát
            </h1>
            <p className="text-gray-500 mt-1">Phân công shipper giao hàng và duyệt dòng tiền đối soát COD của hệ thống</p>
          </div>
          <button 
            onClick={fetchData}
            className="flex items-center gap-2 px-5 py-3 bg-white hover:bg-gray-50 text-slate-700 font-bold rounded-2xl border border-gray-200 shadow-sm active:scale-98 transition text-sm"
          >
            <RefreshCw className="w-4 h-4" /> Làm mới trang
          </button>
        </div>

        {/* THỐNG KÊ NHANH (CARDS) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-3xl border border-gray-150 shadow-sm flex items-center gap-4 hover:shadow-md transition">
            <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
              <Package className="w-7 h-7" />
            </div>
            <div>
              <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">Đơn hàng cần giao</p>
              <p className="text-3xl font-black text-slate-800">{pendingOrders.length}</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-gray-150 shadow-sm flex items-center gap-4 hover:shadow-md transition">
            <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center">
              <Clock className="w-7 h-7 animate-pulse" />
            </div>
            <div>
              <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">Shipper đang giữ tiền</p>
              <p className="text-3xl font-black text-amber-600">{reconciliations.length}</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-gray-150 shadow-sm flex items-center gap-4 hover:shadow-md transition">
            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
              <DollarSign className="w-7 h-7" />
            </div>
            <div>
              <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">Tổng tiền đối soát chờ thu</p>
              <p className="text-3xl font-black text-emerald-600">
                {reconciliations.reduce((sum, r) => sum + r.totalCod, 0).toLocaleString('vi-VN')}đ
              </p>
            </div>
          </div>
        </div>

        {/* WARNING CẢNH BÁO MOCK DATA NẾU CÓ */}
        {error && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl flex items-start gap-3 text-sm mb-6">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="font-bold">Lưu ý kết nối:</p>
              <p className="mt-0.5 text-amber-700/90">{error}</p>
            </div>
          </div>
        )}

        {/* TAB SELECTOR */}
        <div className="bg-white p-1 rounded-2xl border border-gray-200 flex mb-8 w-fit shadow-sm">
          <button
            onClick={() => setActiveTab('assignment')}
            className={`px-6 py-3 text-sm font-bold rounded-xl transition duration-150 flex items-center gap-2 ${
              activeTab === 'assignment'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Phân công vận chuyển ({pendingOrders.length})</span>
          </button>
          
          <button
            onClick={() => setActiveTab('reconciliation')}
            className={`px-6 py-3 text-sm font-bold rounded-xl transition duration-150 flex items-center gap-2 ${
              activeTab === 'reconciliation'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            <span>Duyệt đối soát dòng tiền ({reconciliations.length})</span>
          </button>
        </div>

        {/* LOADING ANIMAITON */}
        {loading && (
          <div className="bg-white p-20 rounded-3xl border border-gray-150 text-center space-y-4 shadow-sm">
            <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-gray-500 font-bold">Đang truy vấn cơ sở dữ liệu MongoDB...</p>
          </div>
        )}

        {/* TAB 1: PHÂN CÔNG VẬN CHUYỂN */}
        {!loading && activeTab === 'assignment' && (
          <div className="space-y-4">
            {pendingOrders.length === 0 ? (
              <div className="bg-white p-20 rounded-3xl border border-gray-150 text-center text-gray-400 shadow-sm">
                <ShieldCheck className="w-16 h-16 text-indigo-200 mx-auto mb-4" />
                <p className="font-black text-lg text-slate-800">Không có đơn hàng nào chờ phân công</p>
                <p className="text-sm text-slate-500 mt-1">Toàn bộ đơn hàng ở trạng thái 'processing' đã được gán shipper giao hàng.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {pendingOrders.map(order => {
                  const selectedVal = selectedShipper[order._id] || '';
                  
                  return (
                    <div 
                      key={order._id} 
                      className="bg-white rounded-3xl border border-gray-200/80 p-5 shadow-sm hover:shadow-md hover:border-indigo-100 transition duration-200 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4"
                    >
                      {/* Cột 1: Thông tin đơn hàng */}
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-black text-indigo-650">{order.orderCode}</span>
                          <span className="text-[10px] bg-slate-100 text-slate-600 font-extrabold px-2 py-0.5 rounded-md uppercase">
                            {order.paymentMethod === 'cod' ? 'Thu COD' : 'Online Banking'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 font-bold flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" /> 
                          Ngày đặt: {new Date(order.createdAt).toLocaleString('vi-VN')}
                        </p>
                        <div className="text-xs text-slate-600 space-y-1 bg-slate-50/50 p-3 rounded-2xl border border-slate-100 mt-2">
                          <p><span className="font-bold text-slate-700">Khách hàng:</span> {order.customerInfo?.name}</p>
                          <p><span className="font-bold text-slate-700">Điện thoại:</span> {order.customerInfo?.phone}</p>
                          <p className="truncate"><span className="font-bold text-slate-700">Địa chỉ:</span> {order.customerInfo?.address}</p>
                        </div>
                      </div>

                      {/* Cột 2: Tiền hàng & Thao tác phân shipper */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full lg:w-auto shrink-0 border-t lg:border-t-0 pt-4 lg:pt-0 border-gray-100">
                        {/* Tổng tiền */}
                        <div className="text-left sm:text-right px-2">
                          <span className="text-xs text-slate-400 block font-bold">Tổng tiền đơn</span>
                          <span className="text-lg font-black text-slate-800">
                            {order.total.toLocaleString('vi-VN')}đ
                          </span>
                        </div>

                        {/* Dropdown Shipper */}
                        <div className="w-full sm:w-60">
                          <select
                            value={selectedVal}
                            onChange={(e) => handleDropdownChange(order._id, e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 text-slate-700 font-bold rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm cursor-pointer"
                          >
                            <option value="">-- Chọn Shipper để giao --</option>
                            {shippers.map(sh => (
                              <option key={sh.username} value={sh.username}>
                                {sh.name || sh.username} ({sh.username})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Nút phân công */}
                        <button
                          onClick={() => handleAssignShipper(order._id, order.orderCode)}
                          disabled={submittingId === order._id || !selectedVal}
                          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-705 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed transition text-white font-bold text-sm rounded-2xl flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/10 shrink-0"
                        >
                          Giao cho Shipper
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: DUYỆT ĐỐI SOÁT DÒNG TIỀN */}
        {!loading && activeTab === 'reconciliation' && (
          <div className="space-y-4">
            {reconciliations.length === 0 ? (
              <div className="bg-white p-20 rounded-3xl border border-gray-150 text-center text-gray-400 shadow-sm">
                <ShieldCheck className="w-16 h-16 text-emerald-200 mx-auto mb-4" />
                <p className="font-black text-lg text-slate-800">Không có yêu cầu đối soát nào chờ duyệt</p>
                <p className="text-sm text-slate-500 mt-1">Toàn bộ dòng tiền mặt nộp bởi shipper đã được kiểm và duyệt hoàn tất.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {reconciliations.map(recon => (
                  <div 
                    key={recon._id} 
                    className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden"
                  >
                    {/* Header Nhóm Shipper */}
                    <div className="p-5 bg-slate-50 border-b border-gray-150 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                          <User className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                            {recon.shipperName} 
                            <span className="text-xs text-slate-400 font-medium">({recon._id})</span>
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">Số điện thoại: {recon.shipperPhone || 'Không có'}</p>
                        </div>
                      </div>

                      {/* Tiền mặt thu hộ & Nút Duyệt */}
                      <div className="flex items-center gap-5 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-3 sm:pt-0 border-gray-150">
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] text-slate-400 font-extrabold uppercase block tracking-wider">Số đơn: {recon.orderCount} đơn</span>
                          <span className="text-xl font-black text-emerald-600">
                            {recon.totalCod.toLocaleString('vi-VN')}đ
                          </span>
                        </div>

                        <button
                          onClick={() => handleApproveReconciliation(recon._id, recon.shipperName, recon.totalCod)}
                          disabled={submittingId === recon._id}
                          className="px-5 py-3 bg-emerald-600 hover:bg-emerald-705 active:scale-98 disabled:opacity-50 transition text-white font-bold text-xs rounded-2xl flex items-center gap-1.5 shadow-md shadow-emerald-600/10"
                        >
                          <Check className="w-4 h-4" /> Đã nhận tiền - Duyệt giải ngân
                        </button>
                      </div>
                    </div>

                    {/* Chi tiết danh sách đơn của Shipper này */}
                    <div className="p-4 bg-white divide-y divide-gray-100">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 pb-2.5">
                        Chi tiết danh sách đơn hàng đối soát
                      </div>
                      
                      <div className="space-y-1">
                        {recon.orders.map(order => (
                          <div 
                            key={order._id} 
                            className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 hover:bg-slate-50 rounded-2xl transition duration-150 gap-2"
                          >
                            <div className="flex items-center gap-3">
                              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                              <div>
                                <span className="font-bold text-slate-800 text-sm">{order.orderCode}</span>
                                <span className="text-slate-400 text-xs font-semibold ml-2">Khách hàng: {order.customerName}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-4 text-xs">
                              <span className="text-slate-400">{new Date(order.createdAt).toLocaleDateString('vi-VN')}</span>
                              <span className="font-bold text-slate-800 text-sm">
                                {order.total.toLocaleString('vi-VN')}đ
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
