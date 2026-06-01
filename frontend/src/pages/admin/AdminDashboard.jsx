import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, DollarSign, ShoppingBag, Award, BarChart3, Package, Loader2, AlertCircle, Clock } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';

export default function AdminDashboard() {
  const { socket } = useSocket();
  const debounceTimeoutRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dashboardData, setDashboardData] = useState({
    totalRevenue: 0,
    totalProfit: 0,
    totalOrders: 0,
    totalItemsSold: 0,
    totalProducts: 0,
    totalCustomers: 0,
    lowStockProducts: [],
    topProducts: [],
    brandStats: []
  });

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('glassesToken');
      const res = await fetch('/api/admin/dashboard', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setDashboardData(data);
      } else {
        setError(data.message || 'Không thể tải dữ liệu thống kê từ hệ thống.');
      }
    } catch (err) {
      console.error('Lỗi tải dữ liệu Dashboard:', err);
      setError('Không thể kết nối đến máy chủ hoặc tải dữ liệu thống kê.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Lắng nghe các đơn hàng mới & thay đổi trạng thái để cập nhật Dashboard realtime với Debounce chống spam
  useEffect(() => {
    if (!socket) return;

    const handleDashboardUpdate = () => {
      console.log('⚡ [Socket.IO Client] Nhận sự kiện đơn hàng. Chờ 2 giây để tránh dồn dập truy vấn Dashboard...');

      // Hủy bỏ timeout hiện tại nếu có để gộp các yêu cầu gần nhau
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      // Đăng ký timeout mới để trì hoãn truy vấn
      debounceTimeoutRef.current = setTimeout(() => {
        console.log('⚡ [Socket.IO Client] Bắt đầu gọi fetch dữ liệu Dashboard sau debounce 2 giây.');
        fetchDashboardData();
      }, 2000);
    };

    socket.on('order:new', handleDashboardUpdate);
    socket.on('order:statusChanged', handleDashboardUpdate);
    socket.on('product:stockUpdated', handleDashboardUpdate);

    return () => {
      socket.off('order:new', handleDashboardUpdate);
      socket.off('order:statusChanged', handleDashboardUpdate);
      socket.off('product:stockUpdated', handleDashboardUpdate);

      // Dọn dẹp bộ hẹn giờ khi component bị hủy bỏ hoặc unmount
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [socket]);

  if (loading) {
    return (
      <div className="p-20 flex flex-col items-center justify-center gap-4 bg-gray-50 min-h-screen">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
        <p className="text-gray-500 font-bold">Đang tải và tính toán số liệu kinh doanh thật...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-20 flex flex-col items-center justify-center gap-4 bg-gray-50 min-h-screen">
        <AlertCircle className="w-16 h-16 text-red-500" />
        <p className="text-red-600 font-black text-center text-lg">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-gray-900 text-white font-bold rounded-2xl hover:bg-blue-600 transition"
        >
          Thử lại
        </button>
      </div>
    );
  }

  const {
    totalRevenue,
    totalProfit,
    totalOrders,
    totalItemsSold,
    lowStockProducts,
    topProducts,
    brandStats,
    totalPendingOrders = 0,
    totalPendingItems = 0
  } = dashboardData;

  return (
    <div className="p-4 sm:p-8 bg-gray-50 min-h-screen pb-24">
      <div className="max-w-7xl mx-auto">

        {/* HEADER */}
        <div className="mb-8">
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Thống kê kinh doanh</h1>
          <p className="text-gray-500 mt-1">Báo cáo doanh thu và hiệu suất bán hàng của hệ thống</p>
        </div>

        {/* ================= DÒNG 1: THẺ KPI (CARDS) ================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">

          {/* Doanh thu */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-50 rounded-full group-hover:scale-150 transition-transform duration-500 ease-out z-0"></div>
            <div className="relative z-10 flex justify-between items-start">
              <div>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-2">Tổng Doanh Thu</p>
                <p className="text-2xl font-black text-gray-900">{totalRevenue.toLocaleString('vi-VN')}đ</p>
              </div>
              <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center"><DollarSign className="w-5 h-5" /></div>
            </div>
          </div>

          {/* Lợi nhuận thực tế */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-green-50 rounded-full group-hover:scale-150 transition-transform duration-500 ease-out z-0"></div>
            <div className="relative z-10 flex justify-between items-start">
              <div>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-2">Lợi nhuận thực tế</p>
                <p className="text-2xl font-black text-green-600">{totalProfit.toLocaleString('vi-VN')}đ</p>
              </div>
              <div className="w-10 h-10 bg-green-100 text-green-600 rounded-xl flex items-center justify-center"><TrendingUp className="w-5 h-5" /></div>
            </div>
          </div>

          {/* Tổng đơn hàng */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-yellow-50 rounded-full group-hover:scale-150 transition-transform duration-500 ease-out z-0"></div>
            <div className="relative z-10 flex justify-between items-start">
              <div>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-2">Tổng Đơn Hàng</p>
                <p className="text-2xl font-black text-gray-900">{totalOrders}</p>
              </div>
              <div className="w-10 h-10 bg-yellow-100 text-yellow-600 rounded-xl flex items-center justify-center"><ShoppingBag className="w-5 h-5" /></div>
            </div>
          </div>

          {/* Số Kính bán ra */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-purple-50 rounded-full group-hover:scale-150 transition-transform duration-500 ease-out z-0"></div>
            <div className="relative z-10 flex justify-between items-start">
              <div>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-2">Kính Đã Bán</p>
                <p className="text-2xl font-black text-gray-900">{totalItemsSold} chiếc</p>
              </div>
              <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center"><Package className="w-5 h-5" /></div>
            </div>
          </div>

          {/* Kính chờ xác nhận */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-amber-50 rounded-full group-hover:scale-150 transition-transform duration-500 ease-out z-0"></div>
            <div className="relative z-10 flex justify-between items-start">
              <div>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-2">Kính Chờ Duyệt</p>
                <p className="text-2xl font-black text-amber-600">{totalPendingItems} chiếc</p>
                <p className="text-[10px] text-gray-400 font-bold mt-1">({totalPendingOrders} đơn chờ duyệt)</p>
              </div>
              <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center"><Clock className="w-5 h-5" /></div>
            </div>
          </div>
        </div>

        {/* ================= DÒNG 2: TOP BÁN CHẠY & THƯƠNG HIỆU ================= */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* BOX 1: TOP 5 SẢN PHẨM */}
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-100 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Award className="w-6 h-6 text-yellow-500" /> Top 5 Kính Bán Chạy Nhất
            </h2>

            <div className="space-y-4">
              {topProducts.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Chưa có dữ liệu bán hàng.</p>
              ) : (
                topProducts.map((product, index) => {
                  const image = product.images && product.images[0] ? product.images[0] : '';
                  return (
                    <div key={index} className="flex items-center gap-4 p-3 rounded-2xl hover:bg-gray-50 transition border border-transparent hover:border-gray-100">

                      {/* Số thứ tự / Huy chương */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black flex-shrink-0
                        ${index === 0 ? 'bg-yellow-100 text-yellow-600' :
                          index === 1 ? 'bg-gray-200 text-gray-600' :
                            index === 2 ? 'bg-orange-100 text-orange-600' : 'bg-gray-50 text-gray-400'}
                      `}>
                        {index + 1}
                      </div>

                      {/* Ảnh SP */}
                      <div className="w-14 h-14 bg-gray-100 rounded-xl p-1 flex-shrink-0 flex items-center justify-center">
                        {image ? <img src={image} className="w-full h-full object-contain rounded-lg" alt="" /> : <Package className="w-6 h-6 text-gray-300" />}
                      </div>

                      {/* Thông tin */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-gray-900 truncate">{product.name}</h3>
                        <p className="text-xs text-gray-500">{product.revenue?.toLocaleString('vi-VN')}đ doanh thu</p>
                      </div>

                      {/* Số lượng */}
                      <div className="text-right flex-shrink-0">
                        <p className="font-black text-blue-600 text-lg">{product.sold}</p>
                        <p className="text-[10px] uppercase font-bold text-gray-400">Đã bán</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* BOX 2: DOANH THU THEO THƯƠNG HIỆU */}
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-100 shadow-sm flex flex-col">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-blue-500" /> Doanh Thu Theo Hãng
            </h2>

            <div className="space-y-6 flex-1 justify-center flex flex-col">
              {brandStats.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Chưa có dữ liệu bán hàng.</p>
              ) : (
                brandStats.map((brand, index) => (
                  <div key={index}>
                    <div className="flex justify-between items-end mb-2">
                      <span className="font-bold text-gray-900">{brand.brand}</span>
                      <span className="text-sm font-bold text-gray-500">{brand.revenue.toLocaleString('vi-VN')}đ</span>
                    </div>
                    {/* Thanh Progress Bar */}
                    <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${index === 0 ? 'bg-blue-600' : index === 1 ? 'bg-indigo-500' : index === 2 ? 'bg-purple-500' : 'bg-gray-400'}`}
                        style={{ width: `${brand.percent}%` }}
                      ></div>
                    </div>
                    <p className="text-right text-[10px] font-bold text-gray-400 mt-1">{brand.percent.toFixed(1)}% thị phần</p>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* ================= DÒNG 3: CẢNH BÁO SẮP HẾT HÀNG (TỒN KHO <= 5) ================= */}
        <div className="mt-8 bg-white p-6 sm:p-8 rounded-3xl border border-gray-100 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Package className="w-6 h-6 text-red-500 animate-pulse" /> Cảnh Báo Sản Phẩm Sắp Hết Hàng (Tồn kho ≤ 5)
          </h2>

          {lowStockProducts.length === 0 ? (
            <p className="text-gray-400 text-center py-8 font-bold">🎉 Tuyệt vời! Tất cả sản phẩm đều đủ số lượng trong kho.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {lowStockProducts.map((product, idx) => {
                const image = product.images && product.images[0] ? product.images[0] : '';
                return (
                  <div key={idx} className="flex items-center gap-4 p-4 bg-red-50/20 border border-red-100/50 rounded-2xl hover:bg-red-50/50 transition">
                    {image ? (
                      <img src={image} className="w-12 h-12 object-cover rounded-xl border border-red-100 bg-white" alt="" />
                    ) : (
                      <div className="w-12 h-12 bg-gray-50 rounded-xl border flex items-center justify-center text-gray-300">
                        <Package className="w-5 h-5" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-900 truncate text-sm">{product.name}</h3>
                      <p className="text-xs text-gray-500 mt-1">Hiện có: <span className="font-black text-red-600">{product.stock} cái</span></p>
                    </div>

                    <div>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${product.stock === 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                        {product.stock === 0 ? 'Hết hàng' : 'Cần nhập gấp'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}