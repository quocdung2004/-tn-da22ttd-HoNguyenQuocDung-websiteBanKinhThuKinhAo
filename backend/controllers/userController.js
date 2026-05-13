const User = require('../models/User');
const bcrypt = require('bcryptjs');

exports.updateProfile = async (req, res) => {
  try {
    const { name, phone, currentPassword, newPassword } = req.body;
    
    // Tìm user trong DB dựa vào ID lấy từ Token
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng!' });

    // 1. Cập nhật thông tin cơ bản
    if (name) user.name = name;
    if (phone) user.phone = phone;

    // 2. Cập nhật mật khẩu (Nếu có nhập)
    if (currentPassword && newPassword) {
      // Chặn tài khoản Google đổi mật khẩu
      if (user.authProvider !== 'local') {
        return res.status(400).json({ success: false, message: 'Tài khoản liên kết Google không thể đổi mật khẩu tại đây.' });
      }

      // Kiểm tra pass cũ
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Mật khẩu hiện tại không chính xác!' });
      }

      // Băm pass mới
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(newPassword, salt);
    }

    await user.save();

    res.json({
      success: true,
      message: 'Cập nhật hồ sơ thành công!',
      user: { id: user._id, username: user.username, role: user.role, name: user.name, phone: user.phone, authProvider: user.authProvider }
    });

  } catch (error) {
    console.error('Lỗi cập nhật profile:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};