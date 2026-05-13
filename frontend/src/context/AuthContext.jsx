import React, { createContext, useState, useContext, useEffect } from 'react';

// 1. Khởi tạo Trạm phát sóng
const AuthContext = createContext();

// 2. Tạo một cái vỏ bọc (Provider) để bọc toàn bộ App lại
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // Trạng thái lưu thông tin khách hàng

  // Khi web vừa tải, kiểm tra xem trước đó khách đã đăng nhập chưa
  useEffect(() => {
    const storedUser = localStorage.getItem('glassesUser');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

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