import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { ShoppingBag, LogOut, XOctagon, Wallet, MessageSquare, Star, Home } from 'lucide-react';
import NotificationBell from '../../components/NotificationBell';
import { useAuth } from '../../context/AuthContext';
import Footer from '../../components/Footer';

export default function StaffLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = () => {
    const confirmLogout = window.confirm("Bạn có chắc chắn muốn đăng xuất khỏi hệ thống không?");
    if (confirmLogout) {
      logout();
      navigate('/');
    }
  };

  const menuItems = [
    { path: '/staff', icon: <ShoppingBag className="w-5 h-5" />, label: 'Quản lý Đơn hàng' },
    { path: '/staff/reviews', icon: <Star className="w-5 h-5" />, label: 'Quản lý Đánh giá' },
    { path: '/staff/cancel-requests', icon: <XOctagon className="w-5 h-5" />, label: 'Yêu cầu hủy đơn' },
    { path: '/staff/withdraw-requests', icon: <Wallet className="w-5 h-5" />, label: 'Yêu cầu rút tiền' },
    { path: '/staff/chat', icon: <MessageSquare className="w-5 h-5" />, label: 'Quản lý Chat' },
  ];

  return (
    <div className="min-h-screen bg-gray-55 font-sans flex flex-col justify-between">
      <div className="flex flex-1">
        {/* SIDEBAR BÊN TRÁI DÀNH RIÊNG CHO STAFF */}
        <aside className="w-64 bg-gray-900 text-white flex flex-col shrink-0">
          <div className="p-6 border-b border-gray-800">
            <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400">
              Hệ thống Nội bộ
            </h2>
            <p className="text-xs text-gray-400 mt-1">Khu vực Nhân viên (Staff)</p>
          </div>

          <nav className="flex-1 p-4 space-y-2">
            {menuItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  location.pathname === item.path 
                    ? 'bg-green-600 text-white font-bold shadow-lg shadow-green-900/50' 
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
              >
                {item.icon} {item.label}
              </Link>
            ))}
          </nav>

          <div className="p-4 border-t border-gray-800 space-y-2">
            <Link to="/" className="flex items-center gap-3 px-4 py-3 text-gray-400 hover:bg-gray-800 hover:text-white rounded-xl transition-all">
              <Home className="w-5 h-5" /> Về trang Khách hàng
            </Link>
            <button 
              onClick={handleLogout} 
              className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500 hover:text-white rounded-xl transition-all text-left outline-none"
            >
              <LogOut className="w-5 h-5" /> Đăng xuất
            </button>
          </div>
        </aside>

        {/* NỘI DUNG CHÍNH */}
        <main className="flex-1 flex flex-col">
          {/* Header trên cùng chứa chuông thông báo */}
          <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-end px-8 shrink-0">
            <NotificationBell />
          </header>

          {/* Màn hình nội dung */}
          <div className="flex-1">
            <Outlet /> 
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
}