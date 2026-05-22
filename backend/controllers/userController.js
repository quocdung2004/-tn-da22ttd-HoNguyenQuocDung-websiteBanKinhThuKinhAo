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

// ==============================================
// CÁC ENDPOINT DÀNH RIÊNG CHO ADMIN (ROLE 1)
// ==============================================

// [GET] Lấy danh sách toàn bộ tài khoản (Lọc mật khẩu, chỉ cho Admin)
exports.getAllUsers = async (req, res) => {
  try {
    // Luôn luôn SELECT loại bỏ Password ra khỏi JSON trả về
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (error) {
    console.error('Lỗi lấy danh sách User:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách tài khoản!' });
  }
};

// [POST] Admin tạo tài khoản Nhân viên (Staff) mới
exports.createStaff = async (req, res) => {
  try {
    const { username, password, name, phone, email } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Tên đăng nhập và mật khẩu là bắt buộc!' });
    }

    // 1. Kiểm tra username đã tồn tại chưa
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Tên đăng nhập đã tồn tại!' });
    }

    // 2. Kiểm tra email đã tồn tại chưa
    if (email && email.trim() !== '') {
      const existingEmail = await User.findOne({ email });
      if (existingEmail) {
        return res.status(400).json({ success: false, message: 'Email đã tồn tại trên hệ thống!' });
      }
    }

    // 3. Băm mật khẩu (Hash password trước khi lưu)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 4. Tạo tài khoản Staff (role 2)
    const newStaff = new User({
      username,
      password: hashedPassword,
      name,
      phone,
      email,
      role: 2 // Gán cứng vai trò Staff
    });

    await newStaff.save();
    
    // Trả về không kèm mật khẩu
    const staffObject = newStaff.toObject();
    delete staffObject.password;

    res.status(201).json({ success: true, message: 'Tạo tài khoản Nhân viên thành công!', user: staffObject });
  } catch (error) {
    console.error('Lỗi tạo tài khoản Staff:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tạo tài khoản nhân viên!' });
  }
};

// [PUT] Admin chỉnh sửa thông tin Nhân viên (Staff)
exports.updateStaff = async (req, res) => {
  try {
    const { name, phone, email, password } = req.body;
    const staffId = req.params.id;

    // 1. Tìm tài khoản
    const staff = await User.findById(staffId);
    if (!staff) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản nhân viên!' });
    }

    // Chặn thay đổi quyền nếu sửa chính mình
    if (staffId === req.user.id.toString()) {
      return res.status(400).json({ success: false, message: 'Bạn không thể sửa đổi quyền hạn/vai trò của chính mình tại đây!' });
    }

    // 2. Kiểm tra trùng lặp email nếu email được sửa đổi
    if (email && email !== staff.email) {
      const existingEmail = await User.findOne({ email });
      if (existingEmail) {
        return res.status(400).json({ success: false, message: 'Email đã được sử dụng bởi một tài khoản khác!' });
      }
    }

    // 3. Cập nhật thông tin cơ bản
    if (name !== undefined) staff.name = name;
    if (phone !== undefined) staff.phone = phone;
    if (email !== undefined) staff.email = email;

    // 4. Reset mật khẩu mới (Bắt buộc phải hash trước khi lưu)
    if (password && password.trim() !== '') {
      const salt = await bcrypt.genSalt(10);
      staff.password = await bcrypt.hash(password, salt);
    }

    await staff.save();

    const staffObject = staff.toObject();
    delete staffObject.password;

    res.json({ success: true, message: 'Cập nhật thông tin nhân viên thành công!', user: staffObject });
  } catch (error) {
    console.error('Lỗi cập nhật Staff:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật tài khoản nhân viên!' });
  }
};

// [PUT] Admin Khóa / Mở khóa tài khoản (toggle-block)
exports.toggleBlockUser = async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user.id.toString();

    // 1. Chống Admin tự khóa chính mình
    if (targetUserId === currentUserId) {
      return res.status(400).json({ success: false, message: 'Từ chối hành vi tự khóa tài khoản của chính mình!' });
    }

    // 2. Tìm tài khoản cần tác động
    const user = await User.findById(targetUserId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản!' });
    }

    // 3. Chống tự hạ quyền Admin hoặc đổi vai trò của chính mình
    // 4. Không được khóa tài khoản Admin khác nếu hệ thống chỉ có duy nhất 1 Admin hoạt động
    if (user.role === 1) {
      const adminCount = await User.countDocuments({ role: 1 });
      if (adminCount <= 1 && !user.isBlocked) {
        return res.status(400).json({ success: false, message: 'Không thể khóa tài khoản này vì đây là Admin duy nhất còn hoạt động!' });
      }
    }

    // 5. Đảo ngược trạng thái khóa
    user.isBlocked = !user.isBlocked;
    await user.save();

    res.json({ 
      success: true, 
      message: `${user.isBlocked ? 'Đã khóa' : 'Đã mở khóa'} tài khoản thành công!`,
      isBlocked: user.isBlocked 
    });
  } catch (error) {
    console.error('Lỗi Khóa/Mở khóa User:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi thay đổi trạng thái tài khoản!' });
  }
};