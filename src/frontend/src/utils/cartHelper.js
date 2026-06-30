/**
 * Tiện ích hỗ trợ xác định khóa giỏ hàng (Cart Key) động cho từng tài khoản đăng nhập
 * để tránh việc dùng chung giỏ hàng dẫn tới rò rỉ dữ liệu giữa các user trên cùng trình duyệt.
 */
export const getCartKey = () => {
  const storedUser = localStorage.getItem('glassesUser');
  if (storedUser) {
    try {
      const user = JSON.parse(storedUser);
      // Ưu tiên id, fallback _id hoặc username để đảm bảo tính độc bản của tài khoản
      const userId = user.id || user._id || user.username;
      if (userId) {
        return `glassesCart_${userId}`;
      }
    } catch (e) {
      console.error('Lỗi khi phân giải glassesUser để lấy Cart Key:', e);
    }
  }
  // Khách vãng lai chưa đăng nhập
  return 'glassesCart_guest';
};
