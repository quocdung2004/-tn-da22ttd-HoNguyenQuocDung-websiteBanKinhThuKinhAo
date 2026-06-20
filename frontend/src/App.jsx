import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute'; // Import ProtectedRoute mới tạo

// Import Layouts
import Navbar from './components/Navbar';
import ChatWidget from './components/ChatWidget';
import Footer from './components/Footer';
import AdminLayout from './pages/admin/AdminLayout';
import StaffLayout from './pages/staff/StaffLayout'; // Layout mới cho Staff
import Login from './pages/Login';
import Register from './pages/Register';

// Import Pages (Khách hàng)
import Home from './pages/customer/Home';
import ProductDetail from './pages/customer/ProductDetail';
import Cart from './pages/customer/Cart';
import Checkout from './pages/customer/Checkout';
import MyPrescription from './pages/customer/Prescription';
import Success from './pages/customer/Success';
import Profile from './pages/customer/Profile';
import MyOrders from './pages/customer/MyOrders';
import Wallet from './pages/customer/Wallet';
import MyWishlist from './pages/customer/MyWishlist';
import Products from './pages/customer/Products';

// Import Pages (Admin)
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminProducts from './pages/admin/ProductManager';
import SaleManager from './pages/admin/SaleManager';
import BrandManager from './pages/admin/BrandManager';
import CategoryManager from './pages/admin/CategoryManager';
import ImportManager from './pages/admin/ImportManager';
import UserManager from './pages/admin/UserManager';
import BannerManager from './pages/admin/BannerManager';
import CancelRequests from './pages/admin/CancelRequests'; // Trang quản trị duyệt hủy đơn hàng (PHASE 2)

// Import Pages (Staff)
import OrderManagement from './pages/staff/OrderManagement';
import WithdrawRequests from './pages/staff/WithdrawRequests';
import ChatManagement from './pages/staff/ChatManagement';

// Import Pages (Review Manager)
import ReviewManager from './pages/admin/ReviewManager';


import { SocketProvider } from './context/SocketContext';

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <BrowserRouter>
          <Routes>
            
            {/* ================= KHU VỰC 1: CUSTOMER & GUEST ================= */}
            <Route path="/" element={
              <>
                <Navbar />
                <div className="pt-16 min-h-screen bg-gray-55 flex flex-col justify-between">
                  <Outlet />
                  <Footer />
                </div>
                <ChatWidget />
              </>
            }>
              <Route index element={<Home />} />
              <Route path="/products" element={<Products />} />
              <Route path="/product/:id" element={<ProductDetail />} />
              <Route path="/cart" element={<Cart />} />
              
              {/* Các route yêu cầu ĐĂNG NHẬP của Khách hàng/Nhân viên/Admin */}
              <Route path="/checkout" element={
                <ProtectedRoute allowedRoles={[0, 1, 2]}>
                  <Checkout />
                </ProtectedRoute>
              } />
              <Route path="/my-prescription" element={
                <ProtectedRoute allowedRoles={[0, 1, 2]}>
                  <MyPrescription />
                </ProtectedRoute>
              } />
              <Route path="/profile" element={
                <ProtectedRoute allowedRoles={[0, 1, 2]}>
                  <Profile />
                </ProtectedRoute>
              } />
              <Route path="/success" element={
                <ProtectedRoute allowedRoles={[0, 1, 2]}>
                  <Success />
                </ProtectedRoute>
              } />
              <Route path="/my-orders" element={
                <ProtectedRoute allowedRoles={[0, 1, 2]}>
                  <MyOrders />
                </ProtectedRoute>
              } />
              <Route path="/my-wallet" element={
                <ProtectedRoute allowedRoles={[0, 1, 2]}>
                  <Wallet />
                </ProtectedRoute>
              } />
              <Route path="/my-wishlist" element={
                <ProtectedRoute allowedRoles={[0]}>
                  <MyWishlist />
                </ProtectedRoute>
              } />
            </Route>

            {/* Đăng nhập / Đăng ký */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* ================= KHU VỰC 2: ADMIN (Quyền cao nhất - role 1) ================= */}
            <Route path="/admin" element={
              <ProtectedRoute allowedRoles={[1]}>
                <AdminLayout />
              </ProtectedRoute>
            }>
              <Route index element={<AdminDashboard />} />
              <Route path="products" element={<AdminProducts />} />
              <Route path="sales" element={<SaleManager />} />
              <Route path="orders" element={<OrderManagement />} />
              <Route path="brand" element={<BrandManager />} />
              <Route path="categories" element={<CategoryManager />} />
              <Route path="imports" element={<ImportManager />} />
              <Route path="users" element={<UserManager />} />
              <Route path="reviews" element={<ReviewManager />} />
              <Route path="banners" element={<BannerManager />} />
              <Route path="cancel-requests" element={<CancelRequests />} />
              <Route path="withdraw-requests" element={<WithdrawRequests />} />
            </Route>

            {/* ================= KHU VỰC 3: STAFF (Giới hạn quyền - role 1 & 2) ================= */}
            <Route path="/staff" element={
              <ProtectedRoute allowedRoles={[1, 2]}>
                <StaffLayout />
              </ProtectedRoute>
            }>
              <Route index element={<OrderManagement />} />
              <Route path="orders" element={<OrderManagement />} />
              <Route path="reviews" element={<ReviewManager />} />
              <Route path="cancel-requests" element={<CancelRequests />} />
              <Route path="withdraw-requests" element={<WithdrawRequests />} />
              <Route path="chat" element={<ChatManagement />} />
            </Route>

          </Routes>
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}
