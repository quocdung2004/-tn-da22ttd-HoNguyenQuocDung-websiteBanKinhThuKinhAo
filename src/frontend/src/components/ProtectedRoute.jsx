import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user } = useAuth();

  // 1. Nếu chưa đăng nhập -> Chuyển về trang Đăng nhập
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 2. Nếu đã đăng nhập nhưng vai trò không hợp lệ -> Chuyển về Dashboard thích hợp của role đó
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    if (user.role === 1) {
      return <Navigate to="/admin" replace />;
    } else if (user.role === 2) {
      return <Navigate to="/staff" replace />;
    } else if (user.role === 3) {
      return <Navigate to="/shipper" replace />;
    } else {
      return <Navigate to="/" replace />;
    }
  }

  // 3. Hợp lệ -> Render bình thường
  return children;
}
