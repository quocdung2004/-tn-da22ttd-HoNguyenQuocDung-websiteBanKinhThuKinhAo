const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// API Đăng ký
exports.register = async (req, res) => {
  try {
    const { username, password, name, phone } = req.body;

    // 1. Kiểm tra tài khoản đã tồn tại chưa
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Tên đăng nhập đã tồn tại!' });
    }

    // 2. Băm mật khẩu (Mã hóa)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 3. Tạo User mới
    const newUser = new User({
      username,
      password: hashedPassword,
      name,
      phone,
      authProvider: 'local'
    });

    await newUser.save();
    res.status(201).json({ success: true, message: 'Đăng ký thành công!' });

  } catch (error) {
    console.error('Lỗi đăng ký:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};

// API Đăng nhập
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // 1. Tìm user trong Database
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Sai tên đăng nhập hoặc mật khẩu!' });
    }

    // 2. Kiểm tra có phải tài khoản Google/Facebook không (Chặn nhập pass)
    if (user.authProvider !== 'local') {
      return res.status(400).json({ success: false, message: 'Tài khoản này được đăng ký bằng Google/Facebook.' });
    }

    // 3. So sánh mật khẩu
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Sai tên đăng nhập hoặc mật khẩu!' });
    }

    // 4. Cấp thẻ Token (JWT)
    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' } // Thẻ có hạn 1 ngày
    );

    res.json({
      success: true,
      message: 'Đăng nhập thành công!',
      token,
      user: { id: user._id, username: user.username, role: user.role, name: user.name }
    });

  } catch (error) {
    console.error('Lỗi đăng nhập:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};