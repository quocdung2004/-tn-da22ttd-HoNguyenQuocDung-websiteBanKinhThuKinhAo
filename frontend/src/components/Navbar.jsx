import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, User, Menu, X, Glasses, ChevronRight, ChevronDown, LogOut, Package, Wallet, Eye, Heart } from 'lucide-react';
import { useAuth } from '../context/AuthContext'; // Import Trạm phát sóng (Đổi đường dẫn nếu cần)
import { getCartKey } from '../utils/cartHelper';
import NotificationBell from './NotificationBell';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false); // State cho Menu thả xuống (Desktop)
  const [cartCount, setCartCount] = useState(0);

  const navigate = useNavigate();
  // Lấy dữ liệu user và hàm logout từ Trạm phát sóng
  const { user, logout } = useAuth(); 

  const closeMenu = () => {
    setIsOpen(false);
    setIsProfileOpen(false);
  };

// Hàm xử lý khi khách bấm Đăng xuất
  const handleLogout = () => {
    // Hiện bảng hỏi xác nhận
    const confirmLogout = window.confirm("Bạn có chắc chắn muốn đăng xuất khỏi hệ thống không?");
    
    // Nếu khách bấm OK thì mới cho thoát
    if (confirmLogout) {
      logout();
      closeMenu();
      navigate('/'); // Đẩy về trang chủ
    }
  };

  const calculateTotalItems = () => {
    const cartKey = getCartKey();
    const cart = JSON.parse(localStorage.getItem(cartKey)) || [];
    const total = cart.reduce((sum, item) => sum + item.quantity, 0);
    setCartCount(total);
  };

  useEffect(() => {
    calculateTotalItems(); 
    window.addEventListener('cartUpdated', calculateTotalItems);
    return () => window.removeEventListener('cartUpdated', calculateTotalItems);
  }, [user]);

  return (
    <>
      <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-100 shadow-sm relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            
            {/* LOGO */}
            <Link to="/" className="flex items-center space-x-2" onClick={closeMenu} translate="no">
              <Glasses className="w-8 h-8 text-blue-600" />
              <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Dũng Glasses
              </span>
            </Link>

            {/* MENU CHÍNH (Desktop) */}
            <div className="hidden md:flex space-x-8 items-center">
              <Link to="/" className="text-gray-600 hover:text-blue-600 font-medium transition">Cửa hàng</Link>
              <Link to="/my-prescription" className="text-gray-600 hover:text-blue-600 font-medium transition">Đo thị lực</Link>
              
              {/* Chỉ hiện cho Staff hoặc Admin */}
              {user && (user.role === 1 || user.role === 2) && (
                <>
                  <div className="h-6 w-[1px] bg-gray-300 mx-2"></div>
                  {user.role === 2 && <Link to="/staff/orders" className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200">Staff</Link>}
                  {user.role === 1 && <Link to="/admin" className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200">Admin</Link>}
                </>
              )}
            </div>

            {/* NÚT CHỨC NĂNG */}
            <div className="flex items-center space-x-4">
              
              {/* CHUÔNG THÔNG BÁO */}
              <NotificationBell />

              {/* GIỎ HÀNG */}
              <Link to="/cart" className="relative p-2 text-gray-600 hover:text-blue-600 transition">
                <ShoppingCart className="w-6 h-6" />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full shadow-sm animate-in zoom-in">
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </Link>
              
              {/* ================= KHU VỰC TÀI KHOẢN (Desktop) ================= */}
              <div className="hidden md:block relative">
                {user ? (
                  // ĐÃ ĐĂNG NHẬP: Hiện Avatar
                  <div>
                    <button 
                      onClick={() => setIsProfileOpen(!isProfileOpen)} 
                      className="flex items-center space-x-2 p-1.5 pr-3 rounded-full border border-gray-200 hover:bg-gray-50 transition focus:outline-none"
                    >
                      <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                        {(user.name || user.username).charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-700 max-w-[100px] truncate">{user.name || user.username}</span>
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    </button>

                    {/* MENU THẢ XUỐNG */}
                    {isProfileOpen && (
                      <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 animate-in fade-in slide-in-from-top-2">
                        <div className="px-4 py-2 border-b border-gray-50 mb-2">
                          <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                          <p className="text-xs text-gray-500 truncate">{user.username}</p>
                        </div>
                        <Link to="/profile" className="flex items-center space-x-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition" onClick={() => setIsProfileOpen(false)}>
                          <User className="w-4 h-4" />
                          <span className="font-medium">Hồ sơ cá nhân</span>
                        </Link>
                        <Link to="/my-prescription" className="flex items-center space-x-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition" onClick={() => setIsProfileOpen(false)}>
                          <Eye className="w-4 h-4" />
                          <span className="font-medium">Hồ sơ độ cận</span>
                        </Link>
                        {user.role === 0 && (
                          <Link to="/my-wishlist" className="flex items-center space-x-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition" onClick={() => setIsProfileOpen(false)}>
                            <Heart className="w-4 h-4" />
                            <span className="font-medium">Yêu thích</span>
                          </Link>
                        )}
                        <Link to="/my-orders" className="flex items-center space-x-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition" onClick={() => setIsProfileOpen(false)}>
                          <Package className="w-4 h-4" />
                          <span className="font-medium">Đơn hàng của tôi</span>
                        </Link>
                        <Link to="/my-wallet" className="flex items-center space-x-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition" onClick={() => setIsProfileOpen(false)}>
                          <Wallet className="w-4 h-4" />
                          <span className="font-medium">Ví của tôi</span>
                        </Link>
                        <hr className="my-2 border-gray-100" />
                        <button onClick={handleLogout} className="w-full flex items-center space-x-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition">
                          <LogOut className="w-4 h-4" />
                          <span className="font-bold">Đăng xuất</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  // CHƯA ĐĂNG NHẬP: Hiện nút cũ
                  <Link to="/login" className="flex items-center space-x-2 bg-gray-900 text-white px-4 py-2 rounded-xl hover:bg-blue-600 transition">
                    <User className="w-4 h-4" />
                    <span className="text-sm font-bold">Đăng nhập</span>
                  </Link>
                )}
              </div>

              {/* Nút mở Menu Mobile */}
              <button className="md:hidden p-2 text-gray-700" onClick={() => setIsOpen(true)}>
                <Menu className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ================= MOBILE MENU ================= */}
      <div className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300 md:hidden ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`} onClick={closeMenu}></div>

      <div className={`fixed top-0 right-0 h-full w-4/5 max-w-sm bg-white z-50 shadow-2xl transform transition-transform duration-300 ease-in-out md:hidden flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <span className="text-lg font-bold text-gray-800">Menu</span>
          <button onClick={closeMenu} className="p-2 bg-gray-100 rounded-full text-gray-600 hover:bg-red-100 hover:text-red-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-6 space-y-6">
          <div className="space-y-4">
            <Link to="/" onClick={closeMenu} className="flex items-center justify-between text-gray-700 hover:text-blue-600 font-medium text-lg">
              Cửa hàng <ChevronRight className="w-5 h-5 opacity-50" />
            </Link>
            <Link to="/my-prescription" onClick={closeMenu} className="flex items-center justify-between text-gray-700 hover:text-blue-600 font-medium text-lg">
              Đo thị lực <ChevronRight className="w-5 h-5 opacity-50" />
            </Link>
          </div>
        </div>

        {/* KHU VỰC DƯỚI CÙNG MENU MOBILE (Login/Profile) */}
        <div className="p-6 border-t border-gray-100 bg-gray-50">
          {user ? (
            <div className="space-y-4">
              <div className="flex items-center space-x-3 mb-4 bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-xl">
                  {(user.name || user.username).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="font-bold text-gray-900 truncate">{user.name || user.username}</p>
                  <p className="text-xs text-blue-600 font-medium mt-0.5">Khách hàng thành viên</p>
                </div>
              </div>
              <Link to="/profile" onClick={closeMenu} className="flex items-center space-x-3 text-gray-700 hover:text-blue-600 font-medium py-2">
                <User className="w-5 h-5" />
                <span>Hồ sơ cá nhân</span>
              </Link>
              <Link to="/my-prescription" onClick={closeMenu} className="flex items-center space-x-3 text-gray-700 hover:text-blue-600 font-medium py-2">
                <Eye className="w-5 h-5" />
                <span>Hồ sơ độ cận</span>
              </Link>
              {user.role === 0 && (
                <Link to="/my-wishlist" onClick={closeMenu} className="flex items-center space-x-3 text-gray-700 hover:text-blue-600 font-medium py-2">
                  <Heart className="w-5 h-5" />
                  <span>Yêu thích</span>
                </Link>
              )}
              <Link to="/my-orders" onClick={closeMenu} className="flex items-center space-x-3 text-gray-700 hover:text-blue-600 font-medium py-2">
                <Package className="w-5 h-5" />
                <span>Đơn hàng của tôi</span>
              </Link>
              <Link to="/my-wallet" onClick={closeMenu} className="flex items-center space-x-3 text-gray-700 hover:text-blue-600 font-medium py-2">
                <Wallet className="w-5 h-5" />
                <span>Ví của tôi</span>
              </Link>
              <button onClick={handleLogout} className="w-full flex items-center justify-center space-x-2 bg-red-100 text-red-600 py-3.5 rounded-xl font-bold hover:bg-red-200 transition mt-4">
                <LogOut className="w-5 h-5" />
                <span>Đăng xuất</span>
              </button>
            </div>
          ) : (
            <Link to="/login" onClick={closeMenu} className="w-full flex items-center justify-center space-x-2 bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-200">
              <User className="w-5 h-5" />
              <span>Đăng nhập tài khoản</span>
            </Link>
          )}
        </div>
      </div>
    </>
  );
};

export default Navbar;
