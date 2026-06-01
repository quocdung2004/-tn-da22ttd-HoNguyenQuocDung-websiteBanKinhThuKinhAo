require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { PayOS } = require('@payos/node'); 
const mongoose = require('mongoose'); // SỬA 1: Import thư viện mongoose

const app = express();
app.use(cors());
app.use(express.json()); 

// ==============================================
// 0. KẾT NỐI MONGODB
// ==============================================
// Lệnh kết nối và báo cáo trạng thái ra Terminal
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('🟢 Đã kết nối thành công tới MongoDB Atlas!');
    
    // Thực thi migration 1 lần an toàn để đồng bộ hóa sản phẩm cũ
    try {
      const Product = require('./models/Product');
      const result = await Product.updateMany(
        { isActive: { $exists: false } },
        { $set: { isActive: true } }
      );
      if (result.modifiedCount > 0) {
        console.log(`🧹 Migration: Đã tự động cập nhật isActive = true cho ${result.modifiedCount} sản phẩm cũ.`);
      }
    } catch (migError) {
      console.error('⚠️ Lỗi chạy migration sản phẩm cũ:', migError);
    }
  })
  .catch((error) => {
    console.error('🔴 Lỗi kết nối MongoDB:', error.message);
  });

// ==============================================
// 1. CẤU HÌNH PAYOS (Bản V2)
// ==============================================
const payos = new PayOS({
  clientId: process.env.PAYOS_CLIENT_ID, 
  apiKey: process.env.PAYOS_API_KEY, 
  checksumKey: process.env.PAYOS_CHECKSUM_KEY
});

// ==============================================
// 2. API THANH TOÁN TỰ ĐỘNG
// ==============================================
// API: Tạo mã QR thanh toán
app.post('/api/create-payment-link', async (req, res) => {
  try {
    const { amount, description, orderCode } = req.body;
    
    // Sử dụng orderCode truyền lên từ frontend, luôn ép sang kiểu Number an toàn
    const finalOrderCode = orderCode ? Number(orderCode) : Number(Date.now().toString().slice(-9));

    console.log(`🔌 [Backend-PayOS] Nhận yêu cầu tạo link cho orderCode: ${finalOrderCode} (Type: ${typeof finalOrderCode}), số tiền: ${amount}`);

    const requestData = {
      orderCode: finalOrderCode,
      amount: Number(amount), 
      description: description ? description.substring(0, 25) : `KinhMat ${finalOrderCode}`, 
      cancelUrl: 'http://localhost:5173/checkout', 
      returnUrl: 'http://localhost:5173/success', 
    };

    const paymentLinkRes = await payos.paymentRequests.create(requestData);
    console.log(`✅ [Backend-PayOS] Tạo link PayOS thành công cho đơn: ${finalOrderCode}`);
    
    res.json({
      success: true,
      orderCode: finalOrderCode,
      paymentData: paymentLinkRes
    });

  } catch (error) {
    console.error('❌ Lỗi tạo link PayOS:', error);
    if (error.response) {
      console.error('📦 Cục dữ liệu lỗi thô từ PayOS (create):', JSON.stringify(error.response.data || error.response, null, 2));
    }
    res.status(500).json({ success: false, message: 'Không thể tạo mã QR' });
  }
});

// API: Lính canh kiểm tra thanh toán (BẢN V2 CHUẨN)
app.get('/api/check-payment/:orderCode', async (req, res) => {
  try {
    const orderCodeStr = req.params.orderCode;
    // Chắc chắn lọc bỏ chữ "DH" nếu lỡ frontend truyền lên có chữ DH, chỉ giữ lại số
    const cleanNumberString = orderCodeStr.replace('DH', '');
    const orderCode = Number(cleanNumberString);
    
    console.log(`\n⏳ Lính canh đang kiểm tra trạng thái đơn: ${orderCode} (Tìm trong MongoDB dạng: DH${orderCode})`); 
    
    // Gọi PayOS
    const paymentInfo = await payos.get(`/v2/payment-requests/${orderCode}`);
    
    // 1. IN RA TOÀN BỘ CỤC DỮ LIỆU ĐỂ BẮT MẠCH
    console.log(`📦 TOÀN BỘ DỮ LIỆU PAYOS:`, JSON.stringify(paymentInfo, null, 2));

    // 2. BẮT LƯỚI DIỆN RỘNG: Tìm chữ PAID ở mọi ngóc ngách có thể
    const status = paymentInfo?.status || paymentInfo?.data?.status || paymentInfo?.data?.data?.status;
    
    console.log(`🎯 Trạng thái chốt lại:`, status); 

    if (status === 'PAID') {
      const Order = require('./models/Order');
      // Tìm đúng orderCode MongoDB dạng DHxxxx (chỉ thêm 1 lần DH)
      const targetCode = `DH${orderCode}`;
      console.log(`✍️ Tiến hành cập nhật MongoDB đơn ${targetCode} sang 'paid'...`);
      const updateResult = await Order.findOneAndUpdate({ orderCode: targetCode }, { status: 'paid' }, { new: true });
      console.log(`🔎 Kết quả cập nhật MongoDB:`, updateResult ? `Thành công (Trạng thái mới: ${updateResult.status})` : 'Thất bại (Không tìm thấy đơn)');
      
      res.json({ status: 'PAID' });
    } else {
      res.json({ status: 'PENDING' });
    }
  } catch (error) {
    console.error(`❌ Lính canh vấp ngã khi kiểm tra đơn ${req.params.orderCode}:`, error.message);
    if (error.response) {
      console.error('📦 Cục dữ liệu lỗi thô từ PayOS (check):', JSON.stringify(error.response.data || error.response, null, 2));
    } else {
      console.error('📦 Chi tiết lỗi thô:', error);
    }
    res.status(500).json({ status: 'ERROR' });
  }
});

// ==============================================
// 3. API CHUYỂN ĐỔI VIDEO AR (Giữ nguyên)
// ==============================================
const upload = multer({ dest: 'uploads/' });
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

app.post('/api/convert', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).send('Không nhận được file');
  const inputPath = req.file.path;
  const outputPath = `${req.file.path}.mp4`;
  console.log('📥 Đang nhận file WebM. Bắt đầu chuyển đổi sang MP4...');

  ffmpeg(inputPath)
    .outputOptions(['-c:v libx264', '-preset ultrafast', '-crf 28', '-movflags +faststart'])
    .save(outputPath)
    .on('end', () => {
      console.log('✅ Chuyển đổi thành công! Đang gửi trả về Frontend...');
      res.download(outputPath, 'video-ar-tryon.mp4', () => {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      });
    })
    .on('error', (err) => {
      console.error('❌ Lỗi xử lý video:', err);
      res.status(500).send('Lỗi máy chủ khi xử lý video');
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    });
});

// ==============================================
// 4. ROUTES KHÁC
// ==============================================
const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);
const userRoutes = require('./routes/userRoutes'); 
app.use('/api/users', userRoutes); 
const brandRoutes = require('./routes/brandRoutes');
app.use('/api/brands', brandRoutes);
const categoryRoutes = require('./routes/categoryRoutes');
app.use('/api/categories', categoryRoutes);
const productRoutes = require('./routes/productRoutes');
app.use('/api/products', productRoutes);
const orderRoutes = require('./routes/orderRoutes');
app.use('/api/orders', orderRoutes);
const importReceiptRoutes = require('./routes/importReceiptRoutes');
app.use('/api/imports', importReceiptRoutes);
const adminRoutes = require('./routes/adminRoutes');
app.use('/api/admin', adminRoutes);
const walletRoutes = require('./routes/walletRoutes');
app.use('/api/wallet', walletRoutes);

// Đăng ký định tuyến thông báo (Notification System)
const notificationRoutes = require('./routes/notificationRoutes');
app.use('/api/notifications', notificationRoutes);

// Khởi tạo máy chủ HTTP tích hợp Socket.IO Realtime
const http = require('http');
const { initSocket } = require('./socket');

const server = http.createServer(app);
initSocket(server);

const PORT = 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server Backend HTTP & Socket.IO đã sẵn sàng tại: http://localhost:${PORT}`);
});