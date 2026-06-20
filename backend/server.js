require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { PayOS } = require('@payos/node'); 
const { isValidPaymentCancelToken } = require('./utils/paymentCancelToken');
const { verifyToken } = require('./middleware/authMiddleware');
const mongoose = require('mongoose'); // SỬA 1: Import thư viện mongoose

try {
  const ffmpegStaticPath = require('ffmpeg-static');
  if (ffmpegStaticPath) {
    ffmpeg.setFfmpegPath(ffmpegStaticPath);
  }
} catch (error) {
  console.warn('[AR Video] ffmpeg-static is not installed; falling back to system ffmpeg.');
}

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
app.post('/api/create-payment-link', async (req, res, next) => {
  try {
    const { orderCode, orderAccessToken, paymentCancelToken } = req.body;
    if (!orderCode) {
      return res.status(400).json({ success: false, message: 'Thiếu mã đơn hàng!' });
    }

    const cleanNumberString = String(orderCode).replace('DH', '');
    const finalOrderCode = Number(cleanNumberString);
    if (!Number.isFinite(finalOrderCode)) {
      return res.status(400).json({ success: false, message: 'Mã đơn hàng không hợp lệ!' });
    }

    const Order = require('./models/Order');
    const targetCode = `DH${finalOrderCode}`;
    const order = await Order.findOne({ orderCode: targetCode });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng để tạo thanh toán!' });
    }

    if (['paid', 'completed', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ success: false, message: 'Đơn hàng không còn khả dụng để tạo thanh toán!' });
    }

    req.paymentOrder = order;
    req.paymentOrderCode = finalOrderCode;

    if (order.username) {
      return verifyToken(req, res, next);
    }

    const guestAccessToken = orderAccessToken || paymentCancelToken || req.header('X-Order-Access-Token') || req.header('X-Payment-Cancel-Token');
    if (!isValidPaymentCancelToken(order.orderCode, guestAccessToken)) {
      return res.status(403).json({ success: false, message: 'Không có quyền tạo thanh toán cho đơn hàng này!' });
    }

    return next();
  } catch (error) {
    console.error('❌ Lỗi kiểm tra quyền tạo link PayOS:', error);
    return res.status(500).json({ success: false, message: 'Không thể kiểm tra đơn hàng thanh toán' });
  }
}, async (req, res) => {
  try {
    const order = req.paymentOrder;
    const finalOrderCode = req.paymentOrderCode;

    if (order.username && req.user?.username !== order.username) {
      return res.status(403).json({ success: false, message: 'Bạn không sở hữu đơn hàng này!' });
    }

    const amount = Number(order.total ?? order.totalAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Tổng tiền đơn hàng không hợp lệ!' });
    }

    console.log(`🔌 [Backend-PayOS] Tạo link từ đơn thật ${order.orderCode}, số tiền DB: ${amount}`);

    const requestData = {
      orderCode: finalOrderCode,
      amount,
      description: `KinhMat ${finalOrderCode}`.substring(0, 25),
      cancelUrl: 'http://localhost:5173/checkout',
      returnUrl: 'http://localhost:5173/success',
    };

    const paymentLinkRes = await payos.paymentRequests.create(requestData);
    console.log(`✅ [Backend-PayOS] Tạo link PayOS thành công cho đơn: ${order.orderCode}`);
    
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
    const cleanNumberString = orderCodeStr.replace('DH', '');
    const orderCode = Number(cleanNumberString);
    const cancelRequested = req.query.cancel === 'true';
    const targetCode = `DH${orderCode}`;

    if (cancelRequested) {
      const cancelToken = req.query.cancelToken || req.header('X-Payment-Cancel-Token');
      if (!isValidPaymentCancelToken(targetCode, cancelToken)) {
        console.warn(`Tu choi yeu cau huy thanh toan khong hop le cho don ${targetCode}`);
        return res.status(403).json({ status: 'FORBIDDEN', message: 'Yeu cau huy thanh toan khong hop le.' });
      }
    }
    
    console.log(`\n⏳ Lính canh đang kiểm tra trạng thái đơn: ${orderCode} (Tìm trong MongoDB dạng: DH${orderCode})`); 
    
    // Gọi PayOS
    let paymentInfo = null;
    let status = null;
    try {
      paymentInfo = await payos.get(`/v2/payment-requests/${orderCode}`);
      console.log(`📦 TOÀN BỘ DỮ LIỆU PAYOS:`, JSON.stringify(paymentInfo, null, 2));
      status = paymentInfo?.status || paymentInfo?.data?.status || paymentInfo?.data?.data?.status;
    } catch (payosError) {
      console.error(`⚠️ Không tìm thấy link thanh toán trên PayOS hoặc lỗi PayOS:`, payosError.message);
    }
    
    console.log(`🎯 Trạng thái chốt lại:`, status, `Cancel requested:`, cancelRequested); 

    const Order = require('./models/Order');
    const Product = require('./models/Product');
    const Sale = require('./models/Sale');

    if (status === 'PAID') {
      console.log(`✍️ Tiến hành cập nhật MongoDB đơn ${targetCode} sang 'paid'...`);
      const updateResult = await Order.findOneAndUpdate({ orderCode: targetCode }, { status: 'paid' }, { new: true });
      console.log(`🔎 Kết quả cập nhật MongoDB:`, updateResult ? `Thành công (Trạng thái mới: ${updateResult.status})` : 'Thất bại (Không tìm thấy đơn)');
      
      return res.json({ status: 'PAID' });
    } else if (status === 'CANCELLED' || status === 'EXPIRED' || cancelRequested) {
      console.log(`✍️ Tiến hành hủy đơn hàng ${targetCode} do thanh toán thất bại/hủy...`);
      
      // Nếu cancelRequested là true và PayOS đang pending, hãy thử cancel trên PayOS
      if (cancelRequested && status === 'PENDING') {
        try {
          await payos.post(`/v2/payment-requests/${orderCode}/cancel`, { cancellationReason: 'Khách hàng chủ động hủy thanh toán' });
          console.log(`✅ Đã hủy link thanh toán thành công trên PayOS cho đơn ${orderCode}`);
        } catch (cancelError) {
          console.error(`⚠️ Không thể hủy link trên PayOS (có thể đã bị hủy trước đó):`, cancelError.message);
        }
      }

      // Cập nhật trạng thái đơn hàng sang cancelled và hoàn trả kho + quota
      const order = await Order.findOne({ orderCode: targetCode });
      if (order && order.status === 'pending') {
        order.status = 'cancelled';
        order.cancelReason = cancelRequested ? 'Khách hàng chủ động hủy thanh toán' : 'Thanh toán thất bại/hết hạn trên PayOS';
        
        // 1. Hoàn trả tồn kho (stock)
        if (!order.stockRestored) {
          for (const item of order.items) {
            const product = await Product.findById(item.productId);
            if (product) {
              console.log(`[STOCK_RESTORED] Hoàn lại tồn kho cho sản phẩm ${product.name} (ID: ${product._id}) từ đơn hàng thanh toán online thất bại/hủy, số lượng: ${item.quantity}`);
              product.stock = (product.stock || 0) + item.quantity;
              product.soldQuantity = Math.max(0, (product.soldQuantity || 0) - item.quantity);
              await product.save();
              
              // Phát socket báo cập nhật stock
              const { getIO } = require('./socket');
              const io = getIO();
              if (io) {
                io.emit('product:stockUpdated', {
                  productId: product._id.toString(),
                  stock: product.stock,
                  reason: 'order_cancelled'
                });
              }
            }
          }
          order.stockRestored = true;
        }

        // 2. Hoàn trả quota khuyến mãi
        if (!order.quotaRestored) {
          for (const item of order.items) {
            if (item.saleIdAtPurchase) {
              await Sale.findOneAndUpdate(
                { _id: item.saleIdAtPurchase, usageLimitType: 'limited' },
                { $inc: { usedCount: -item.quantity } }
              );
            }
          }
          order.quotaRestored = true;
        }

        await order.save();
        console.log(`✅ Đã cập nhật trạng thái đơn ${targetCode} thành 'cancelled' và hoàn trả tồn kho + quota.`);

        // Phát Socket thông báo trạng thái thay đổi
        const { emitToStaff, emitToAdmin } = require('./socket');
        emitToStaff('order:statusChanged', { id: order._id, orderCode: order.orderCode, status: 'cancelled' });
        emitToAdmin('order:statusChanged', { id: order._id, orderCode: order.orderCode, status: 'cancelled' });
      }

      return res.json({ status: 'CANCELLED' });
    } else {
      return res.json({ status: 'PENDING' });
    }
  } catch (error) {
    console.error(`❌ Lính canh vấp ngã khi kiểm tra đơn ${req.params.orderCode}:`, error.message);
    res.status(500).json({ status: 'ERROR' });
  }
});

// ==============================================
// 3. API CHUYEN DOI VIDEO AR
// ==============================================
const arVideoTempDir = path.join(__dirname, 'tmp', 'ar-video');
fs.mkdirSync(arVideoTempDir, { recursive: true });

const cleanupTempFiles = (...filePaths) => {
  filePaths.forEach((filePath) => {
    if (!filePath) return;
    fs.promises.unlink(filePath).catch((error) => {
      if (error.code !== 'ENOENT') {
        console.warn('[AR Video] Could not remove temp file:', filePath, error.message);
      }
    });
  });
};

const arVideoUpload = multer({
  dest: arVideoTempDir,
  limits: {
    files: 1,
    fileSize: 100 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const isAllowedVideo =
      file.mimetype === 'application/octet-stream' ||
      file.mimetype === 'video/webm' ||
      file.mimetype.startsWith('video/webm;');
    if (isAllowedVideo) {
      cb(null, true);
      return;
    }
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'video'));
  }
});

const convertArVideoHandler = (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No video file uploaded' });
  }

  const inputPath = req.file.path;
  const outputPath = path.join(arVideoTempDir, `${req.file.filename}.mp4`);

  console.log('[AR Video] Received WebM upload. Converting to MP4...');

  ffmpeg.ffprobe(inputPath, (probeError, metadata) => {
    const hasAudio = !probeError && Array.isArray(metadata?.streams)
      ? metadata.streams.some((stream) => stream.codec_type === 'audio')
      : false;

    const outputOptions = [
      '-c:v libx264',
      '-preset veryfast',
      '-pix_fmt yuv420p',
      '-movflags +faststart'
    ];

    if (hasAudio) {
      outputOptions.push('-c:a aac', '-b:a 128k');
    } else {
      outputOptions.push('-an');
    }

    ffmpeg(inputPath)
      .outputOptions(outputOptions)
      .save(outputPath)
      .on('end', () => {
        console.log('[AR Video] MP4 conversion complete. Sending file to client...');
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', 'attachment; filename="ar-video.mp4"');
        res.download(outputPath, 'ar-video.mp4', (error) => {
          if (error && !res.headersSent) {
            res.status(500).json({ success: false, message: 'Video conversion failed' });
          }
          cleanupTempFiles(inputPath, outputPath);
        });
      })
      .on('error', (error) => {
        console.error('[AR Video] Video conversion failed:', error.message || error);
        cleanupTempFiles(inputPath, outputPath);
        if (!res.headersSent) {
          res.status(500).json({ success: false, message: 'Video conversion failed' });
        }
      });
  });
};

app.post('/api/ar/convert-video', arVideoUpload.single('video'), convertArVideoHandler);
app.post('/api/convert', arVideoUpload.single('video'), convertArVideoHandler);

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
const bannerRoutes = require('./routes/bannerRoutes');
app.use('/api/banners', bannerRoutes);
const wishlistRoutes = require('./routes/wishlistRoutes');
app.use('/api/wishlist', wishlistRoutes);
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

// Đăng ký định tuyến chat (Realtime Chat System)
const chatRoutes = require('./routes/chatRoutes');
app.use('/api/chat', chatRoutes);

// Đăng ký định tuyến khuyến mãi (Sale Promotion System)
const saleRoutes = require('./routes/saleRoutes');
app.use('/api/sales', saleRoutes);

// Đăng ký định tuyến hồ sơ độ cận (Prescription Profile)
const prescriptionRoutes = require('./routes/prescriptionRoutes');
app.use('/api/prescription', prescriptionRoutes);

// Đăng ký định tuyến đánh giá sản phẩm (Product Review System)
const reviewRoutes = require('./routes/reviewRoutes');
app.use('/api/reviews', reviewRoutes);

// Error middleware phải được đăng ký sau toàn bộ routes.
app.use((error, req, res, next) => {
  console.error('Lỗi middleware:', error);

  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message: error.code === 'LIMIT_FILE_SIZE'
        ? 'File tải lên vượt quá dung lượng cho phép.'
        : error.message || 'File tải lên không hợp lệ.'
    });
  }

  return res.status(error.statusCode || error.http_code || 500).json({
    success: false,
    message: error.message || 'Lỗi máy chủ.'
  });
});


// Khởi tạo máy chủ HTTP tích hợp Socket.IO Realtime
const http = require('http');
const { initSocket } = require('./socket');

const server = http.createServer(app);
initSocket(server);

const PORT = 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server Backend HTTP & Socket.IO đã sẵn sàng tại: http://localhost:${PORT}`);
});
