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
  .then(() => {
    console.log('🟢 Đã kết nối thành công tới MongoDB Atlas!');
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
    const { amount, description } = req.body;
    
    // Lấy 9 số cuối của thời gian để tạo mã đơn hàng không trùng lặp
    const orderCode = Number(Date.now().toString().slice(-9));

    const requestData = {
      orderCode: orderCode,
      amount: amount, 
      description: description.substring(0, 25), 
      cancelUrl: 'http://localhost:5173/checkout', 
      returnUrl: 'http://localhost:5173/success', 
    };

    const paymentLinkRes = await payos.paymentRequests.create(requestData);
    
    res.json({
      success: true,
      orderCode: orderCode,
      paymentData: paymentLinkRes
    });

  } catch (error) {
    console.error('❌ Lỗi tạo link PayOS:', error);
    res.status(500).json({ success: false, message: 'Không thể tạo mã QR' });
  }
});

// API: Lính canh kiểm tra thanh toán (BẢN V2 CHUẨN)
app.get('/api/check-payment/:orderCode', async (req, res) => {
  try {
    const orderCode = Number(req.params.orderCode);
    console.log(`\n⏳ Lính canh đang kiểm tra đơn: ${orderCode}`); 
    
    // Gọi PayOS
    const paymentInfo = await payos.get(`/v2/payment-requests/${orderCode}`);
    
    // 1. IN RA TOÀN BỘ CỤC DỮ LIỆU ĐỂ BẮT MẠCH
    console.log(`📦 TOÀN BỘ DỮ LIỆU PAYOS:`, JSON.stringify(paymentInfo, null, 2));

    // 2. BẮT LƯỚI DIỆN RỘNG: Tìm chữ PAID ở mọi ngóc ngách có thể
    const status = paymentInfo?.status || paymentInfo?.data?.status || paymentInfo?.data?.data?.status;
    
    console.log(`🎯 Trạng thái chốt lại:`, status); 

    if (status === 'PAID') {
      res.json({ status: 'PAID' });
    } else {
      res.json({ status: 'PENDING' });
    }
  } catch (error) {
    console.error(`❌ Lính canh vấp ngã:`, error.message);
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
const PORT = 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server Backend đã sẵn sàng tại: http://localhost:${PORT}`);
});