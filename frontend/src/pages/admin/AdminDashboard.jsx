import React, { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, ShoppingBag, Award, BarChart3, Package } from 'lucide-react';

export default function AdminDashboard() {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // 1. Tải danh sách Kính từ MongoDB (lấy all=true để tính toán tồn kho chính xác)
        const prodRes = await fetch('/api/products?all=true');
        const prodData = await prodRes.json();
        if (prodData.success) {
          setProducts(prodData.products);
        }

        // 2. Tải danh sách Đơn hàng từ API MongoDB (sử dụng Token bảo mật)
        const token = localStorage.getItem('glassesToken');
        const orderRes = await fetch('/api/orders', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const orderData = await orderRes.json();
        if (orderData.success) {
          setOrders(orderData.orders);
        } else {
          // Fallback về localStorage nếu không tải được qua API
          const savedOrders = JSON.parse(localStorage.getItem('glassesOrders')) || [];
          setOrders(savedOrders);
        }
      } catch (err) {
        console.error('Lỗi tải dữ liệu Dashboard:', err);
        // Fallback an toàn về localStorage
        const savedOrders = JSON.parse(localStorage.getItem('glassesOrders')) || [];
        setOrders(savedOrders);
      }
    };

    fetchDashboardData();
  }, []);

  // --- 1. TÍNH TOÁN KPI TỔNG QUAN ---
  // Lọc các đơn hàng hợp lệ đã thanh toán/xử lý/giao/hoàn tất (loại trừ cancelled và pending)
  const validOrders = orders.filter(o => o.status !== 'cancelled' && o.status !== 'pending');
  
  const totalRevenue = validOrders.reduce((sum, o) => sum + o.total, 0);
  
  // Tính lợi nhuận thực tế dựa trên importPriceAtPurchase của từng mặt hàng bán được
  const totalProfit = validOrders.reduce((profitSum, order) => {
    const orderCost = order.items.reduce((itemCostSum, item) => {
      // importPriceAtPurchase đã được đóng băng tại thời điểm bán hàng
      const itemCost = (item.importPriceAtPurchase || 0) * item.quantity;
      return itemCostSum + itemCost;
    }, 0);
    const orderProfit = order.total - orderCost;
    return profitSum + orderProfit;
  }, 0);
  
  const totalItemsSold = validOrders.reduce((sum, o) => sum + o.items.reduce((s, item) => s + item.quantity, 0), 0);

  // --- 2. TÍNH TOÁN TOP 5 SẢN PHẨM BÁN CHẠY NHẤT ---
  const getTopProducts = () => {
    const productSales = {};
    
    // Đếm số lượng bán của từng ID sản phẩm
    validOrders.forEach(order => {
      order.items.forEach(item => {
        productSales[item.productId] = (productSales[item.productId] || 0) + item.quantity;
      });
    });

    // Chuyển object thành mảng, kết hợp data từ danh sách Kính, rồi sắp xếp giảm dần
    return Object.entries(productSales)
      .map(([id, quantity]) => {
        const productInfo = products.find(p => p._id === id) || { name: 'Sản phẩm đã xóa', images: [], price: 0 };
        const image = productInfo.images && productInfo.images[0] ? productInfo.images[0] : '';
        return { 
          ...productInfo, 
          name: productInfo.name || 'Sản phẩm đã xóa', 
          image, 
          price: productInfo.price || 0,
          sold: quantity, 
          revenue: quantity * (productInfo.price || 0) 
        };
      })
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 5); // Lấy Top 5
  };

  // --- 3. TÍNH TOÁN THỊ PHẦN THƯƠNG HIỆU (BRAND REVENUE) ---
  const getBrandStats = () => {
    const brandRevenue = {};
    
    validOrders.forEach(order => {
      order.items.forEach(item => {
        const productInfo = products.find(p => p._id === item.productId);
        // Trích xuất brand name từ object được populate bởi backend
        const brandName = productInfo?.brand?.name || productInfo?.brand || 'Khác';
        brandRevenue[brandName] = (brandRevenue[brandName] || 0) + (item.price * item.quantity);
      });
    });

    // Chuyển thành mảng và tính phần trăm
    const sortedBrands = Object.entries(brandRevenue)
      .map(([brand, revenue]) => ({ brand, revenue, percent: (revenue / totalRevenue) * 100 || 0 }))
      .sort((a, b) => b.revenue - a.revenue);
      
    return sortedBrands;
  };

  const topProducts = getTopProducts();
  const brandStats = getBrandStats();

  return (
    <div className="p-4 sm:p-8 bg-gray-50 min-h-screen pb-24">
      <div className="max-w-7xl mx-auto">
        
        {/* HEADER */}
        <div className="mb-8">
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Thống kê kinh doanh</h1>
          <p className="text-gray-500 mt-1">Báo cáo doanh thu và hiệu suất bán hàng của hệ thống</p>
        </div>

        {/* ================= DÒNG 1: THẺ KPI (CARDS) ================= */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          
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

          {/* Lợi nhuận (Giả lập 40%) */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-green-50 rounded-full group-hover:scale-150 transition-transform duration-500 ease-out z-0"></div>
            <div className="relative z-10 flex justify-between items-start">
              <div>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-2">Lợi nhuận ước tính</p>
                <p className="text-2xl font-black text-green-600">+{totalProfit.toLocaleString('vi-VN')}đ</p>
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
                <p className="text-2xl font-black text-gray-900">{validOrders.length}</p>
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
                topProducts.map((product, index) => (
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
                      {product.image ? <img src={product.image} className="w-full h-full object-contain" alt="" /> : <Package className="w-6 h-6 text-gray-300" />}
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
                ))
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
          
          {products.filter(p => p.stock <= 5).length === 0 ? (
            <p className="text-gray-400 text-center py-8 font-bold">🎉 Tuyệt vời! Tất cả sản phẩm đều đủ số lượng trong kho.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.filter(p => p.stock <= 5).map((product, idx) => (
                <div key={idx} className="flex items-center gap-4 p-4 bg-red-50/20 border border-red-100/50 rounded-2xl hover:bg-red-50/50 transition">
                  {product.images && product.images[0] ? (
                    <img src={product.images[0]} className="w-12 h-12 object-cover rounded-xl border border-red-100 bg-white" alt="" />
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
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      product.stock === 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {product.stock === 0 ? 'Hết hàng' : 'Cần nhập gấp'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}