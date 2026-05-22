import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute'; // Import ProtectedRoute mới tạo

// Import Layouts
import Navbar from './components/Navbar';
import AdminLayout from '../src/pages/admin/AdminLayout';
import StaffLayout from './pages/staff/StaffLayout'; // Layout mới cho Staff
import Login from '../src/pages/Login';
import Register from '../src/pages/Register';

// Import Pages (Khách hàng)
import Home from '../src/pages/customer/Home';
import ProductDetail from '../src/pages/customer/ProductDetail';
import Cart from '../src/pages/customer/Cart';
import Checkout from '../src/pages/customer/Checkout';
import MyPrescription from '../src/pages/customer/Prescription';
import Success from '../src/pages/customer/Success';
import Profile from './pages/customer/Profile';

// Import Pages (Admin)
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminProducts from '../src/pages/admin/ProductManager';
import BrandManager from '../src/pages/admin/BrandManager';
import CategoryManager from '../src/pages/admin/CategoryManager';
import ImportManager from './pages/admin/ImportManager';
import UserManager from './pages/admin/UserManager';

// Import Pages (Staff)
import OrderManagement from './pages/staff/OrderManagement';

// --- TẠO LAYOUT KHÁCH HÀNG (Có Navbar) ---
const CustomerLayout = () => {
  return (
    <>
      <Navbar />
      <Outlet />
    </>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          {/* ================= KHU VỰC 1: KHÁCH HÀNG (Có Navbar) ================= */}
          <Route element={<CustomerLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/product/:id" element={<ProductDetail />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/my-prescription" element={<MyPrescription />} />
            <Route path="/success" element={<Success />} />

            {/* Các Route cần yêu cầu Đăng nhập mới được sử dụng */}
            <Route path="/checkout" element={
              <ProtectedRoute allowedRoles={[0, 1, 2]}>
                <Checkout />
              </ProtectedRoute>
            } />
            <Route path="/profile" element={
              <ProtectedRoute allowedRoles={[0, 1, 2]}>
                <Profile />
              </ProtectedRoute>
            } />
          </Route>

          {/* ================= KHU VỰC 2: ADMIN (Quyền cao nhất - role 1) ================= */}
          <Route path="/admin" element={
            <ProtectedRoute allowedRoles={[1]}>
              <AdminLayout />
            </ProtectedRoute>
          }>
            <Route index element={<AdminDashboard />} />
            <Route path="products" element={<AdminProducts />} />
            <Route path="orders" element={<OrderManagement />} />
            <Route path="brand" element={<BrandManager />} />
            <Route path="categories" element={<CategoryManager />} />
            <Route path="imports" element={<ImportManager />} />
            <Route path="users" element={<UserManager />} />
          </Route>

          {/* ================= KHU VỰC 3: STAFF (Giới hạn quyền - role 1 & 2) ================= */}
          <Route path="/staff" element={
            <ProtectedRoute allowedRoles={[1, 2]}>
              <StaffLayout />
            </ProtectedRoute>
          }>
            <Route index element={<OrderManagement />} />
          </Route>

        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}