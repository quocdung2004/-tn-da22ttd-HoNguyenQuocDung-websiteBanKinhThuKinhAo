import React, { createContext, useState, useContext } from 'react';

// 1. Khởi tạo Trạm phát sóng
const AuthContext = createContext();

// 2. Tạo một cái vỏ bọc (Provider) để bọc toàn bộ App lại
export const AuthProvider = ({ children }) => {
  // Đồng bộ nạp thông tin user ngay lập tức khi khởi chạy để tránh lỗi F5 ở các trang được bảo vệ
  const [user, setUser] = useState(() => {
    const storedUser = localStorage.getItem('glassesUser');
    try {
      return storedUser ? JSON.parse(storedUser) : null;
    } catch (error) {
      console.error('Lỗi phân giải glassesUser:', error);
      localStorage.removeItem('glassesUser');
      return null;
    }
  });

  // Hàm xử lý Đăng nhập
  const login = (userData, token) => {
    setUser(userData); // Cập nhật ngay lập tức lên RAM của React
    localStorage.setItem('glassesUser', JSON.stringify(userData)); // Lưu vào ổ cứng trình duyệt
    localStorage.setItem('glassesToken', token);
  };

  // Hàm xử lý Đăng xuất
  const logout = () => {
    setUser(null); // Xóa khỏi RAM
    localStorage.removeItem('glassesUser'); // Xóa khỏi ổ cứng
    localStorage.removeItem('glassesToken');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// 3. Tạo một cái "ăng-ten" (Hook) để các file khác dễ dàng bắt sóng
export const useAuth = () => useContext(AuthContext);