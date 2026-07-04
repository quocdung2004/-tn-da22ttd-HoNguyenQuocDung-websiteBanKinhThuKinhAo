import React, { useState, useEffect } from 'react';
import {
  Package,
  Truck,
  DollarSign,
  CheckCircle2,
  XCircle,
  RotateCcw,
  MapPin,
  Phone,
  User,
  AlertTriangle,
  Lock,
  Send,
  RefreshCw,
  Clock,
  ArrowRight,
  ShieldCheck,
  Camera
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Footer from '../../components/Footer';
import { Html5QrcodeScanner } from 'html5-qrcode';

export default function ShipperDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'reconciliation' | 'returns' | 'scan'
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const [reconciling, setReconciling] = useState(false);

  // States cho quét mã QR
  const [scanResult, setScanResult] = useState('');
  const [qrOrderDetail, setQrOrderDetail] = useState(null);
  const [qrError, setQrError] = useState('');
  const [qrMessage, setQrMessage] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [scanning, setScanning] = useState(true);

  // Lấy token từ localStorage
  const token = localStorage.getItem('glassesToken');

  // 1. Tải danh sách đơn hàng được phân công cho Shipper
  const fetchShipperOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/orders/shipper/assigned', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setOrders(data.orders || []);
      } else {
        throw new Error(data.message || 'Không thể lấy danh sách đơn hàng!');
      }
    } catch (err) {
      console.error('Lỗi tải đơn hàng shipper:', err);
      setError('Lỗi kết nối. Không thể lấy dữ liệu đơn hàng phân công.');

      // Mock data để demo/test nếu API chưa được triển khai hoàn chỉnh hoặc lỗi kết nối
      const mockOrders = [
        {
          _id: 'mock1',
          orderCode: 'ORD-100234',
          customerInfo: { name: 'Nguyễn Văn A', phone: '0987654321', address: '123 Đường Lê Lợi, Quận 1, TP. HCM' },
          paymentMethod: 'cod',
          total: 850000,
          status: 'shipping',
          codStatus: 'pending',
          createdAt: new Date().toISOString()
        },
        {
          _id: 'mock2',
          orderCode: 'ORD-100235',
          customerInfo: { name: 'Trần Thị B', phone: '0912345678', address: '456 Đường Nguyễn Huệ, Quận 1, TP. HCM' },
          paymentMethod: 'banking', // online
          total: 1200000,
          status: 'shipping',
          codStatus: 'no_cod',
          createdAt: new Date().toISOString()
        },
        {
          _id: 'mock3',
          orderCode: 'ORD-100236',
          customerInfo: { name: 'Lê Hoàng C', phone: '0909090909', address: '789 Đường Điện Biên Phủ, Bình Thạnh, TP. HCM' },
          paymentMethod: 'cod',
          total: 450000,
          status: 'shipped', // giao thành công
          codStatus: 'pending_submission', // chưa nộp tiền COD
          createdAt: new Date().toISOString()
        },
        {
          _id: 'mock4',
          orderCode: 'ORD-100237',
          customerInfo: { name: 'Phạm Minh D', phone: '0933333333', address: '101 Đường Cộng Hòa, Tân Bình, TP. HCM' },
          paymentMethod: 'cod',
          total: 620000,
          status: 'cancelled', // giao thất bại
          codStatus: 'pending_return', // cần trả lại kho
          createdAt: new Date().toISOString()
        },
        {
          _id: 'mock5',
          orderCode: 'ORD-100238',
          customerInfo: { name: 'Hoàng Văn E', phone: '0944444444', address: '202 Đường Cách Mạng Tháng 8, Quận 3, TP. HCM' },
          items: [
            { productId: { name: 'Kính Mắt Mèo Gentle Monster', code: 'GM-CAT01' }, quantity: 1 },
            { productId: { name: 'Kính Cận Chống Ánh Sáng Xanh RayBan', code: 'RB-BLUE02' }, quantity: 2 }
          ],
          paymentMethod: 'banking',
          total: 3500000, // Sẽ không hiển thị giá tiền ở Tab 3 để bảo mật
          status: 'completed',
          returnPhysicalStatus: 'pending', // Đang chờ thu hồi hàng vật lý
          createdAt: new Date().toISOString()
        }
      ];
      setOrders(mockOrders);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShipperOrders();
  }, []);

  // 1.5. Khởi tạo Scanner cho Tab Quét QR
  useEffect(() => {
    let scanner = null;
    if (activeTab === 'scan' && scanning && !scanResult) {
      const timer = setTimeout(() => {
        const element = document.getElementById('shipper-reader');
        if (element) {
          scanner = new Html5QrcodeScanner('shipper-reader', {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
          }, false);

          scanner.render(
            async (decodedText) => {
              setScanResult(decodedText);
              setScanning(false);
              if (scanner) {
                scanner.clear().catch(err => console.error('Error clearing scanner:', err));
              }
              await handleFetchQrOrder(decodedText);
            },
            (error) => {
              // Bỏ qua lỗi quét
            }
          );
        }
      }, 300);

      return () => {
        clearTimeout(timer);
        if (scanner) {
          scanner.clear().catch(err => console.error('Error clearing scanner in cleanup:', err));
        }
      };
    }
  }, [activeTab, scanning, scanResult]);

  // Các hàm API phục vụ quét QR
  const handleFetchQrOrder = async (qrToken) => {
    setActionLoading(true);
    setQrError('');
    setQrMessage('');
    try {
      const res = await fetch(`/api/orders/shipper/scan-order/${encodeURIComponent(qrToken)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setQrOrderDetail(data.order);
      } else {
        setQrError(data.message || 'Mã QR không hợp lệ hoặc bạn không có quyền!');
      }
    } catch (err) {
      setQrError('Lỗi kết nối máy chủ khi lấy thông tin đơn.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcceptQrOrder = async () => {
    setActionLoading(true);
    setQrError('');
    setQrMessage('');
    try {
      const res = await fetch('/api/orders/shipper/accept-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ orderId: qrOrderDetail._id })
      });
      const data = await res.json();
      if (data.success) {
        setQrMessage('Nhận nhiệm vụ giao hàng thành công!');
        setQrOrderDetail(data.order);
        fetchShipperOrders();
      } else {
        setQrError(data.message || 'Không thể nhận đơn hàng.');
      }
    } catch (err) {
      setQrError('Lỗi kết nối khi nhận nhiệm vụ.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateQrOrderStatus = async (statusType) => {
    if (!window.confirm(`Xác nhận chốt đơn giao: ${statusType === 'success' ? 'Thành công' : 'Thất bại'}?`)) return;

    setActionLoading(true);
    setQrError('');
    setQrMessage('');
    try {
      const res = await fetch('/api/orders/shipper/update-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          orderId: qrOrderDetail._id,
          deliveryStatus: statusType
        })
      });
      const data = await res.json();
      if (data.success) {
        setQrMessage(statusType === 'success' ? 'Giao hàng thành công! Đã ghi nhận dòng tiền.' : 'Đã chốt giao thất bại. Chờ hoàn kho.');
        setQrOrderDetail(data.order);
        fetchShipperOrders();
      } else {
        setQrError(data.message || 'Cập nhật giao hàng thất bại.');
      }
    } catch (err) {
      setQrError('Lỗi kết nối khi cập nhật.');
    } finally {
      setActionLoading(false);
    }
  };

  const resetQrScanner = () => {
    setScanResult('');
    setQrOrderDetail(null);
    setQrError('');
    setQrMessage('');
    setScanning(true);
  };

  // 2. Thao tác giao hàng (Thành công / Thất bại)
  const handleDeliveryStatus = async (orderId, isSuccess) => {
    setProcessingId(orderId);
    try {
      const res = await fetch(`/api/orders/shipper/${orderId}/delivery`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          deliveryStatus: isSuccess ? 'success' : 'failed'
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(isSuccess ? 'Cập nhật giao hàng thành công!' : 'Đã ghi nhận giao hàng thất bại.');
        fetchShipperOrders();
      } else {
        alert(data.message || 'Cập nhật trạng thái thất bại.');
      }
    } catch (err) {
      console.error('Lỗi API cập nhật giao hàng:', err);
      // Fallback local update để demo khi không có API backend thật chạy
      setOrders(prev => prev.map(order => {
        if (order._id === orderId) {
          if (isSuccess) {
            return {
              ...order,
              status: 'shipped',
              codStatus: order.paymentMethod === 'cod' ? 'pending_submission' : 'no_cod'
            };
          } else {
            return {
              ...order,
              status: 'cancelled',
              codStatus: order.paymentMethod === 'cod' ? 'pending_return' : 'no_cod'
            };
          }
        }
        return order;
      }));
      alert('Đã cập nhật trạng thái (Chế độ mô phỏng offline).');
    } finally {
      setProcessingId(null);
    }
  };

  // 3. Gửi yêu cầu đối soát nộp tiền COD về công ty
  const handleReconciliationRequest = async () => {
    // Tìm các đơn hàng COD đã giao thành công và đang giữ tiền
    const pendingCodOrders = orders.filter(
      o => o.status === 'shipped' && o.codStatus === 'pending_submission' && o.paymentMethod === 'cod'
    );

    if (pendingCodOrders.length === 0) {
      alert('Không có tiền mặt COD nào đang giữ cần nộp!');
      return;
    }

    const confirmReconcile = window.confirm(
      `Xác nhận gửi yêu cầu nộp tiền về công ty cho ${pendingCodOrders.length} đơn hàng đã giao thành công?`
    );
    if (!confirmReconcile) return;

    setReconciling(true);
    try {
      const res = await fetch('/api/orders/shipper/reconcile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        alert('Gửi yêu cầu đối soát thành công! Chờ Admin phê duyệt.');
        fetchShipperOrders();
      } else {
        alert(data.message || 'Gửi yêu cầu đối soát thất bại.');
      }
    } catch (err) {
      console.error('Lỗi API đối soát:', err);
      // Fallback reset số tiền trên màn hình về 0 bằng cách đổi trạng thái đơn
      setOrders(prev => prev.map(o => {
        if (o.status === 'shipped' && o.codStatus === 'pending_submission') {
          return { ...o, codStatus: 'PENDING_RECONCILIATION' };
        }
        return o;
      }));
      alert('Gửi yêu cầu đối soát thành công (Chế độ mô phỏng offline).');
    } finally {
      setReconciling(false);
    }
  };

  // 4. Xác nhận đã thu hồi hàng vật lý (Tab 3)
  const handlePhysicalReturn = async (orderId) => {
    const confirmReturn = window.confirm('Bạn xác nhận đã nhận đủ hàng vật lý thu hồi từ khách hàng này?');
    if (!confirmReturn) return;

    setProcessingId(orderId);
    try {
      const res = await fetch(`/api/orders/shipper/${orderId}/physical-return`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        alert('Đã cập nhật thu hồi hàng vật lý thành công!');
        fetchShipperOrders();
      } else {
        alert(data.message || 'Cập nhật thất bại.');
      }
    } catch (err) {
      console.error('Lỗi cập nhật thu hồi hàng vật lý:', err);
      // Fallback local update
      setOrders(prev => prev.map(o => {
        if (o._id === orderId) {
          return { ...o, returnPhysicalStatus: 'returned' };
        }
        return o;
      }));
      alert('Đã cập nhật thu hồi hàng vật lý thành công (Chế độ mô phỏng offline).');
    } finally {
      setProcessingId(null);
    }
  };

  // --- TÍNH TOÁN DỮ LIỆU HIỂN THỊ ---

  // Lọc đơn đi giao (Tab 1) -> Trạng thái: 'shipping' hoặc 'processing'
  const pendingDeliveries = orders.filter(o => o.status === 'shipping' || o.status === 'processing');

  // Lọc đơn đối soát (Tab 2) -> Giao thành công (chưa nộp COD) hoặc Giao thất bại (cần trả kho)
  const reconciliationDeliveries = orders.filter(
    o => (o.status === 'shipped' && o.codStatus === 'pending_submission') ||
      (o.status === 'cancelled' && o.codStatus === 'pending_return')
  );

  // Lọc đơn thu hồi đổi trả (Tab 3) -> returnPhysicalStatus === 'pending'
  const returnDeliveries = orders.filter(o => o.returnPhysicalStatus === 'pending');

  // Tính thống kê:
  // 1. Tổng tiền mặt COD cần thu (Đơn đang đi giao và phương thức COD)
  const totalCodToCollect = pendingDeliveries
    .filter(o => o.status === 'shipping' && o.paymentMethod === 'cod')
    .reduce((sum, o) => sum + (o.total || 0), 0);

  // 2. Tổng tiền mặt đang giữ (Đã giao thành công nhưng chưa nộp tiền)
  const totalCashHeld = reconciliationDeliveries
    .filter(o => o.status === 'shipped' && o.codStatus === 'pending_submission' && o.paymentMethod === 'cod')
    .reduce((sum, o) => sum + (o.total || 0), 0);

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 font-sans flex flex-col justify-between">
      <div className="pb-12">
      {/* HEADER DASHBOARD */}
      <div className="bg-[#1e293b] border-b border-slate-800 sticky top-0 z-40 px-4 py-4 shadow-lg">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Truck className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-1.5">
                Shipper Pro <span className="text-xs bg-indigo-500/20 text-indigo-400 font-bold px-2 py-0.5 rounded-full">DASHBOARD</span>
              </h1>
              <p className="text-[11px] text-slate-400 font-medium">
                Shipper: <span className="text-slate-200 font-bold">{user?.name || user?.username || 'Nhân viên giao hàng'}</span>
              </p>
            </div>
          </div>
          <button
            onClick={fetchShipperOrders}
            className="p-2 bg-slate-800 hover:bg-slate-700 active:scale-95 transition text-slate-300 rounded-xl border border-slate-700/50"
            title="Làm mới dữ liệu"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 mt-6">

        {/* TABS SELECTOR (Mobile-Optimized) */}
        <div className="bg-[#1e293b] p-1.5 rounded-2xl border border-slate-800/80 flex flex-wrap justify-between gap-1 shadow-inner mb-6">
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex-1 min-w-[70px] py-2 text-[10px] font-bold rounded-xl transition-all duration-200 flex flex-col items-center gap-1 ${activeTab === 'pending'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>Đi Giao ({pendingDeliveries.length})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('scan');
              setScanning(true);
              setScanResult('');
              setQrOrderDetail(null);
              setQrError('');
              setQrMessage('');
            }}
            className={`flex-1 min-w-[70px] py-2 text-[10px] font-bold rounded-xl transition-all duration-200 flex flex-col items-center gap-1 ${activeTab === 'scan'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Quét QR</span>
          </button>

          <button
            onClick={() => setActiveTab('reconciliation')}
            className={`flex-1 min-w-[70px] py-2 text-[10px] font-bold rounded-xl transition-all duration-200 flex flex-col items-center gap-1 ${activeTab === 'reconciliation'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Đối Soát ({reconciliationDeliveries.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('returns')}
            className={`flex-1 min-w-[70px] py-2 text-[10px] font-bold rounded-xl transition-all duration-200 flex flex-col items-center gap-1 ${activeTab === 'returns'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Thu Hồi ({returnDeliveries.length})</span>
          </button>
        </div>

        {/* LOADING & ERROR STATES */}
        {loading && (
          <div className="py-16 text-center space-y-4">
            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-slate-400 text-sm font-semibold">Đang cập nhật danh sách đơn hàng...</p>
          </div>
        )}

        {error && !loading && (
          <div className="bg-red-950/30 border border-red-900/50 p-4 rounded-2xl flex items-start gap-3 text-red-200 text-xs mb-4">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
            <div>
              <p className="font-bold">Lỗi tải dữ liệu!</p>
              <p className="text-red-400/80 mt-1">{error}</p>
              <p className="text-slate-400 mt-2">Đang hiển thị dữ liệu mô phỏng để bảo đảm vận hành.</p>
            </div>
          </div>
        )}

        {/* TAB 1: ĐƠN ĐI GIAO */}
        {!loading && activeTab === 'pending' && (
          <div className="space-y-4">
            {/* Thống kê tiền COD cần thu */}
            <div className="bg-gradient-to-br from-[#1e293b] to-[#0f172a] p-5 rounded-3xl border border-slate-800 shadow-md relative overflow-hidden">
              <div className="absolute right-4 top-4 w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-400">
                <DollarSign className="w-6 h-6" />
              </div>
              <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">
                Tổng tiền mặt (COD) cần thu
              </span>
              <span className="text-2xl font-black text-emerald-400 block mt-1.5">
                {totalCodToCollect.toLocaleString('vi-VN')}đ
              </span>
              <p className="text-[10px] text-slate-500 mt-2 italic">
                * Tuyệt đối không cộng gộp số tiền của các đơn thanh toán trực tuyến (PayOS).
              </p>
            </div>

            {/* Danh sách đơn hàng đi giao */}
            {pendingDeliveries.length === 0 ? (
              <div className="bg-[#1e293b] p-8 rounded-3xl border border-slate-800/60 text-center text-slate-400">
                <Package className="w-12 h-12 text-slate-600 mx-auto mb-2" />
                <p className="font-bold text-sm">Không có đơn hàng nào đang đi giao</p>
                <p className="text-xs text-slate-500 mt-1">Các đơn hàng được phân phối sẽ hiển thị tại đây.</p>
              </div>
            ) : (
              pendingDeliveries.map(order => {
                const isOnlinePay = order.paymentMethod === 'banking';

                return (
                  <div
                    key={order._id}
                    className="bg-[#1e293b] rounded-3xl border border-slate-800 shadow-lg hover:border-slate-700/50 transition duration-200 overflow-hidden"
                  >
                    {/* Mã đơn & Phương thức thanh toán */}
                    <div className="p-4 bg-slate-800/40 border-b border-slate-800 flex justify-between items-center">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-bold">MÃ ĐƠN HÀNG</span>
                        <span className="text-sm font-black text-indigo-400">{order.orderCode}</span>
                        {order.status === 'processing' && (
                          <span className="text-[9px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded font-black uppercase tracking-wider block mt-1 w-fit">
                            Chờ Quét Nhận Đơn
                          </span>
                        )}
                      </div>

                      {isOnlinePay ? (
                        <div className="border border-red-500/50 bg-red-500/10 text-red-500 text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider flex items-center gap-1 shadow-sm">
                          <Lock className="w-3 h-3" /> ĐÃ THANH TOÁN - KHÔNG THU TIỀN
                        </div>
                      ) : (
                        <div className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-black px-2.5 py-1 rounded-lg uppercase">
                          Thu COD
                        </div>
                      )}
                    </div>

                    {/* Chi tiết khách hàng */}
                    <div className="p-4 space-y-3 text-xs text-slate-300">
                      <div className="flex items-start gap-2.5">
                        <User className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-slate-400 font-medium block">Người nhận</span>
                          <span className="font-bold text-slate-200">{order.customerInfo.name}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                        <div>
                          <span className="text-slate-400 font-medium block">Số điện thoại</span>
                          <a href={`tel:${order.customerInfo.phone}`} className="font-bold text-indigo-400 underline decoration-indigo-400/30">
                            {order.customerInfo.phone}
                          </a>
                        </div>
                      </div>

                      <div className="flex items-start gap-2.5">
                        <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-slate-400 font-medium block">Địa chỉ giao</span>
                          <span className="font-semibold text-slate-200">{order.customerInfo.address}</span>
                        </div>
                      </div>

                      {/* Tiền cần thu */}
                      <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
                        <span className="text-slate-400 font-bold">Số tiền cần thu:</span>
                        <span className={`text-base font-black ${isOnlinePay ? 'text-red-400 line-through' : 'text-emerald-400'}`}>
                          {isOnlinePay ? '0đ' : `${(order.total || 0).toLocaleString('vi-VN')}đ`}
                        </span>
                      </div>
                    </div>

                    {/* Nút thao tác dưới Card */}
                    {order.status === 'processing' ? (
                      <div className="p-3 bg-slate-800/20 border-t border-slate-800/80">
                        <button
                          onClick={() => {
                            setActiveTab('scan');
                            setScanning(true);
                            setScanResult('');
                            setQrOrderDetail(null);
                            setQrError('');
                            setQrMessage('');
                          }}
                          className="w-full py-2.5 bg-yellow-600 hover:bg-yellow-500 active:scale-98 transition text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-yellow-500/10"
                        >
                          <Camera className="w-3.5 h-3.5" /> Quét QR nhận đơn giao
                        </button>
                      </div>
                    ) : (
                      <div className="p-3 bg-slate-800/20 border-t border-slate-800/80 grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleDeliveryStatus(order._id, false)}
                          disabled={processingId === order._id}
                          className="py-2.5 bg-red-650 hover:bg-red-600 active:scale-98 transition text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 border border-red-700/30 disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Giao thất bại
                        </button>

                        <button
                          onClick={() => handleDeliveryStatus(order._id, true)}
                          disabled={processingId === order._id}
                          className="py-2.5 bg-emerald-600 hover:bg-emerald-505 active:scale-98 transition text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/10 disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Giao thành công
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB QUÉT QR */}
        {!loading && activeTab === 'scan' && (
          <div className="space-y-6">
            {/* Khung quét QR */}
            {scanning && (
              <div className="bg-[#1e293b] p-6 rounded-3xl border border-slate-800 shadow-lg flex flex-col items-center">
                <h2 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
                  <Camera className="w-4 h-4 text-indigo-400 animate-pulse" /> Đưa camera vào mã QR đơn hàng
                </h2>
                <div id="shipper-reader" className="w-full overflow-hidden rounded-2xl border-2 border-dashed border-slate-700 bg-slate-900/50"></div>
              </div>
            )}

            {/* Trạng thái xử lý */}
            {actionLoading && (
              <div className="bg-[#1e293b] p-12 rounded-3xl border border-slate-800 shadow-lg flex flex-col items-center justify-center">
                <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                <p className="text-sm font-bold text-slate-400">Đang xử lý đơn hàng...</p>
              </div>
            )}

            {qrError && (
              <div className="bg-red-950/30 border border-red-900/50 text-red-200 p-5 rounded-3xl flex flex-col items-center text-center">
                <p className="font-bold mb-3">{qrError}</p>
                <button onClick={resetQrScanner} className="px-5 py-2.5 bg-red-650 hover:bg-red-600 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-2">
                  <RefreshCw className="w-4 h-4" /> Quét lại đơn khác
                </button>
              </div>
            )}

            {qrMessage && (
              <div className="bg-emerald-950/30 border border-emerald-900/50 text-emerald-300 p-5 rounded-3xl text-center font-bold text-sm">
                <p className="mb-3">{qrMessage}</p>
                <button onClick={resetQrScanner} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-505 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-2 mx-auto">
                  Quét tiếp đơn khác
                </button>
              </div>
            )}

            {/* Thông tin chi tiết đơn hàng quét được */}
            {qrOrderDetail && !actionLoading && (
              <div className="bg-[#1e293b] p-6 rounded-3xl border border-slate-800 shadow-lg space-y-6">
                <div className="flex justify-between items-start border-b border-slate-800 pb-4">
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold">MÃ VẬN ĐƠN</p>
                    <p className="text-base font-black text-indigo-400">{qrOrderDetail.orderCode}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    qrOrderDetail.status === 'processing' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                    qrOrderDetail.status === 'shipping' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                    qrOrderDetail.status === 'shipped' || qrOrderDetail.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                    'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}>
                    {qrOrderDetail.status === 'processing' ? 'Chờ shipper nhận' :
                     qrOrderDetail.status === 'shipping' ? 'Đang giao hàng' :
                     qrOrderDetail.status === 'shipped' ? 'Giao thành công (Chờ nộp COD)' :
                     qrOrderDetail.status === 'completed' ? 'Hoàn tất đơn' : 'Đã hủy'}
                  </span>
                </div>

                {/* Khách hàng */}
                <div className="space-y-2.5 text-xs text-slate-300">
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Giao nhận</h3>
                  <div className="flex items-start gap-2.5">
                    <User className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-slate-200">{qrOrderDetail.customerInfo.name}</p>
                      <p className="text-slate-400">{qrOrderDetail.customerInfo.phone}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <p className="text-slate-300 font-medium">{qrOrderDetail.customerInfo.address}</p>
                  </div>
                </div>

                {/* Thanh toán */}
                <div className="border-t border-slate-800 pt-4 space-y-2.5 text-xs text-slate-300">
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Thanh toán</h3>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Hình thức:</span>
                    <span className="font-bold uppercase text-slate-200">{qrOrderDetail.paymentMethod}</span>
                  </div>
                  <div className="flex items-end justify-between border-b border-slate-800 pb-3">
                    <span className="text-slate-400 font-bold">Số tiền cần thu hộ:</span>
                    <span className="text-lg font-black text-emerald-400">
                      {qrOrderDetail.paymentMethod === 'cod' 
                        ? `${qrOrderDetail.total.toLocaleString('vi-VN')} đ` 
                        : 'Đã thanh toán Online (0đ)'}
                    </span>
                  </div>
                </div>

                {/* Hành động cập nhật trạng thái */}
                <div className="pt-2 space-y-3">
                  {qrOrderDetail.status === 'processing' && (
                    <button
                      onClick={handleAcceptQrOrder}
                      disabled={actionLoading}
                      className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white rounded-2xl font-black text-xs tracking-wider shadow-lg flex items-center justify-center gap-2 active:scale-95 transition"
                    >
                      <Package className="w-4 h-4" /> NHẬN NHIỆM VỤ GIAO
                    </button>
                  )}

                  {qrOrderDetail.status === 'shipping' && (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => handleUpdateQrOrderStatus('success')}
                        disabled={actionLoading}
                        className="py-3.5 bg-emerald-650 hover:bg-emerald-600 disabled:bg-slate-700 text-white rounded-2xl font-black text-xs tracking-wider shadow-lg flex items-center justify-center gap-1.5 active:scale-95 transition"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Giao thành công
                      </button>
                      <button
                        onClick={() => handleUpdateQrOrderStatus('failed')}
                        disabled={actionLoading}
                        className="py-3.5 bg-red-650 hover:bg-red-600 disabled:bg-slate-700 text-white rounded-2xl font-black text-xs tracking-wider shadow-lg flex items-center justify-center gap-1.5 active:scale-95 transition"
                      >
                        <XCircle className="w-4 h-4" /> Giao thất bại
                      </button>
                    </div>
                  )}

                  <button
                    onClick={resetQrScanner}
                    className="w-full py-3 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-2xl font-bold text-xs tracking-wider flex items-center justify-center gap-2 transition"
                  >
                    QUÉT ĐƠN HÀNG KHÁC
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ĐỐI SOÁT */}
        {!loading && activeTab === 'reconciliation' && (
          <div className="space-y-4">
            {/* Thống kê tiền mặt đang giữ & Nút nộp tiền */}
            <div className="bg-[#1e293b] p-5 rounded-3xl border border-slate-800 shadow-md relative overflow-hidden">
              <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">
                Tổng tiền mặt đang giữ (COD)
              </span>
              <span className="text-3xl font-black text-amber-400 block mt-1.5">
                {totalCashHeld.toLocaleString('vi-VN')}đ
              </span>
              <p className="text-[10px] text-slate-500 mt-2">
                Bao gồm tiền mặt thu từ các đơn đã giao thành công và chờ nộp về công ty.
              </p>

              <button
                onClick={handleReconciliationRequest}
                disabled={reconciling || totalCashHeld === 0}
                className="mt-4 w-full py-3 bg-indigo-600 hover:bg-indigo-505 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed transition text-white font-bold text-xs rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
              >
                <Send className="w-4 h-4" /> Yêu cầu nộp tiền về công ty
              </button>
            </div>

            {/* Danh sách các đơn đối soát */}
            {reconciliationDeliveries.length === 0 ? (
              <div className="bg-[#1e293b] p-8 rounded-3xl border border-slate-800/60 text-center text-slate-400">
                <ShieldCheck className="w-12 h-12 text-slate-600 mx-auto mb-2" />
                <p className="font-bold text-sm">Không có đơn hàng nào cần đối soát</p>
                <p className="text-xs text-slate-500 mt-1">Toàn bộ tiền mặt và hàng trả kho đã được xử lý xong.</p>
              </div>
            ) : (
              reconciliationDeliveries.map(order => {
                const isSuccess = order.status === 'shipped';

                return (
                  <div
                    key={order._id}
                    className={`bg-[#1e293b] rounded-3xl border shadow-lg overflow-hidden transition ${isSuccess ? 'border-slate-800' : 'border-red-950/40 bg-gradient-to-b from-[#1e293b] to-[#1a1215]'
                      }`}
                  >
                    <div className="p-4 bg-slate-800/40 border-b border-slate-800 flex justify-between items-center">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-bold">MÃ ĐƠN HÀNG</span>
                        <span className="text-sm font-black text-indigo-400">{order.orderCode}</span>
                      </div>

                      {isSuccess ? (
                        <span className="bg-emerald-500/10 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-md border border-emerald-500/20">
                          Đã giao thành công
                        </span>
                      ) : (
                        <span className="bg-red-500/10 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-md border border-red-500/20 animate-pulse">
                          Giao thất bại - Cần trả kho
                        </span>
                      )}
                    </div>

                    <div className="p-4 space-y-2.5 text-xs text-slate-300">
                      <div>
                        <span className="text-slate-400 block">Khách hàng</span>
                        <span className="font-bold text-slate-200">{order.customerInfo.name}</span>
                      </div>

                      {/* Phân biệt COD dòng tiền và Trả kho */}
                      {isSuccess ? (
                        <div className="flex justify-between items-center pt-2 border-t border-slate-800/60">
                          <span className="text-slate-400 font-medium">Tiền mặt đang giữ:</span>
                          <span className="text-base font-black text-emerald-400">
                            {order.paymentMethod === 'cod' ? `${(order.total || 0).toLocaleString('vi-VN')}đ` : '0đ (Online)'}
                          </span>
                        </div>
                      ) : (
                        <div className="bg-red-950/20 border border-red-900/30 p-2.5 rounded-xl text-red-200/90 mt-1 flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                          <div>
                            <p className="font-bold">Yêu cầu hoàn trả vật lý</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">Vui lòng nộp trả gói hàng này về kho của công ty.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 3: THU HỒI ĐỔI TRẢ */}
        {!loading && activeTab === 'returns' && (
          <div className="space-y-4">
            <div className="bg-indigo-950/20 border border-indigo-900/30 p-4 rounded-3xl text-indigo-200 text-xs">
              <div className="flex gap-2.5 items-start">
                <Lock className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-indigo-300 uppercase tracking-wider text-[10px]">Chính sách Bảo mật Hàng hóa</p>
                  <p className="text-indigo-400/90 mt-1 leading-relaxed">
                    Theo quy định, giá tiền sản phẩm được ẩn hoàn toàn để đảm bảo an toàn tuyệt đối, tránh rủi ro thất thoát hàng hóa thu hồi. Shipper chỉ kiểm tra tên sản phẩm, mã vạch và số lượng thực tế.
                  </p>
                </div>
              </div>
            </div>

            {/* Danh sách các đơn cần thu hồi */}
            {returnDeliveries.length === 0 ? (
              <div className="bg-[#1e293b] p-8 rounded-3xl border border-slate-800/60 text-center text-slate-400">
                <Package className="w-12 h-12 text-slate-600 mx-auto mb-2" />
                <p className="font-bold text-sm">Không có yêu cầu thu hồi hàng</p>
                <p className="text-xs text-slate-500 mt-1">Các đơn hàng khách đổi trả sẽ xuất hiện tại đây.</p>
              </div>
            ) : (
              returnDeliveries.map(order => (
                <div
                  key={order._id}
                  className="bg-[#1e293b] rounded-3xl border border-slate-800 shadow-lg overflow-hidden"
                >
                  {/* Mã đơn gốc */}
                  <div className="p-4 bg-slate-800/40 border-b border-slate-800 flex justify-between items-center">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold">MÃ ĐƠN GỐC</span>
                      <span className="text-sm font-black text-indigo-400">{order.orderCode}</span>
                    </div>
                    <span className="bg-amber-500/10 text-amber-400 text-[10px] font-bold px-2.5 py-1 rounded-lg border border-amber-500/20">
                      Chờ thu hồi
                    </span>
                  </div>

                  {/* Thông tin khách hàng & Danh sách hàng vật lý cần thu hồi */}
                  <div className="p-4 space-y-4">
                    <div className="text-xs space-y-1.5 text-slate-300">
                      <div>
                        <span className="text-slate-400 block">Người trả hàng</span>
                        <span className="font-bold text-slate-200">{order.customerInfo.name}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Số điện thoại</span>
                        <a href={`tel:${order.customerInfo.phone}`} className="font-bold text-indigo-400 underline">
                          {order.customerInfo.phone}
                        </a>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Địa chỉ thu hồi</span>
                        <span className="font-medium text-slate-200">{order.customerInfo.address}</span>
                      </div>
                    </div>

                    {/* Danh sách sản phẩm thu hồi (CHỈ TÊN, MÃ, SỐ LƯỢNG) */}
                    <div className="bg-slate-900/40 rounded-2xl p-3.5 border border-slate-800/80 space-y-3">
                      <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                        Danh sách sản phẩm vật lý cần lấy
                      </span>

                      <div className="divide-y divide-slate-800 space-y-2">
                        {order.items && order.items.map((item, idx) => (
                          <div key={idx} className="pt-2 first:pt-0 flex justify-between items-center text-xs">
                            <div className="min-w-0 pr-2">
                              <p className="font-bold text-slate-200 truncate">{item.productId?.name || 'Sản phẩm kính mắt'}</p>
                              <p className="text-[10px] text-slate-500 mt-0.5">Mã SP: {item.productId?.code || 'GM-UNKNOWN'}</p>
                            </div>
                            <div className="bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 px-3 py-1 rounded-lg text-xs font-black shrink-0">
                              SL: {item.quantity}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Nút hành động */}
                    <button
                      onClick={() => handlePhysicalReturn(order._id)}
                      disabled={processingId === order._id}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-505 active:scale-98 transition text-white font-bold text-xs rounded-2xl flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Đã thu hồi hàng vật lý
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

      </div>
      </div>
      <Footer />
    </div>
  );
}
