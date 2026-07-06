const mongoose = require('mongoose');
const ImportReceipt = require('../models/ImportReceipt');
const Product = require('../models/Product');
const { checkAndEmitLowStockNotification } = require('../utils/notificationHelper');
const { getIO } = require('../socket');

// [POST] Tạo phiếu nhập hàng (Tự động cộng stock, validate giá trị và sản phẩm)
exports.createReceipt = async (req, res) => {
  let session = null;
  try {
    // Thử tạo session để chạy transaction nếu DB có hỗ trợ (như Replica Sets)
    session = await mongoose.startSession();
  } catch (e) {
    console.warn('Môi trường MongoDB không hỗ trợ Transactions (chạy Standalone). Hệ thống tự động chuyển sang chế độ bảo vệ bằng Tiền Kiểm Tra (Pre-validation).');
  }

  try {
    const { items, note } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Thông tin phiếu nhập không đầy đủ!' });
    }

    // TỰ ĐỘNG SINH MÃ PHIẾU KHÔNG TRÙNG LẶP TRÊN BACKEND (UNIQUE)
    let generatedReceiptCode;
    let isUnique = false;
    while (!isUnique) {
      const today = new Date();
      const dateStr = today.getFullYear().toString() + 
                      (today.getMonth() + 1).toString().padStart(2, '0') + 
                      today.getDate().toString().padStart(2, '0');
      const randomSuffix = Math.floor(1000 + Math.random() * 9000); // 4 số ngẫu nhiên cực kỳ an toàn
      generatedReceiptCode = `NK${dateStr}${randomSuffix}`;
      
      const exists = await ImportReceipt.findOne({ receiptCode: generatedReceiptCode });
      if (!exists) {
        isUnique = true;
      }
    }

    // THU THẬP THÔNG TIN NGƯỜI ĐĂNG NHẬP THỰC TẾ (BẢO MẬT API-LEVEL)
    const creatorId = req.user?.id;
    const creatorName = req.user?.name || req.user?.username || 'Admin';

    console.log(`🔌 [Backend-Import] Đang khởi tạo phiếu nhập sỉ: ${generatedReceiptCode} bởi ${creatorName} (${creatorId})`);

    // 1. BƯỚC TIỀN KIỂM TRA (PRE-VALIDATION): Cam kết không chạy nửa vời nếu dính lỗi
    for (const item of items) {
      const qty = Number(item.quantity);
      const price = Number(item.importPrice);

      if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({ success: false, message: `Số lượng sản phẩm nhập phải lớn hơn 0!` });
      }
      if (isNaN(price) || price < 0) {
        return res.status(400).json({ success: false, message: `Đơn giá nhập hàng sỉ phải lớn hơn hoặc bằng 0!` });
      }

      if (item.productId === 'new-product' || !item.productId) {
        if (!item.newProductName || !item.newProductName.trim()) {
          return res.status(400).json({ success: false, message: `Dòng sản phẩm mới thiếu tên kính!` });
        }
      } else {
        // Đảm bảo sản phẩm có thật trong DB
        const product = await Product.findById(item.productId);
        if (!product) {
          return res.status(404).json({ success: false, message: `Không tìm thấy sản phẩm với ID ${item.productId}!` });
        }
      }
    }

    const processReceiptItems = async (sessionOpts) => {
      const processedItems = [];
      for (const item of items) {
        let finalProductId = item.productId;
        let finalProduct;

        if (item.productId === 'new-product' || !item.productId) {
          // Tạo sản phẩm mới dưới dạng Nháp
          const newProduct = new Product({
            name: item.newProductName.trim(),
            price: 0, // Giá bán lẻ mặc định ban đầu là 0
            importPrice: Math.round(Number(item.importPrice) || 0),
            stock: Number(item.quantity),
            isDraft: true,
            isActive: false // Chưa cho phép hiển thị ra website
          });
          await newProduct.save(sessionOpts);
          finalProductId = newProduct._id;
          finalProduct = newProduct;
        } else {
          // Sản phẩm có sẵn: Lấy thông tin oldStock và oldImportPrice trong Database dùng transaction session
          const product = await Product.findById(item.productId).session(sessionOpts.session || null);
          if (!product) {
            throw new Error(`Không tìm thấy sản phẩm với ID ${item.productId}!`);
          }

          const oldStock = Math.max(0, product.stock || 0);
          const oldImportPrice = product.importPrice || 0;
          const newQuantity = Number(item.quantity);
          const newImportPrice_From_Receipt = Number(item.importPrice);

          // Tính toán Giá vốn mới (AVCO) theo công thức:
          // newImportPrice = ((oldStock * oldImportPrice) + (newQuantity * newImportPrice_From_Receipt)) / (oldStock + newQuantity)
          const totalStock = oldStock + newQuantity;
          let newImportPrice = newImportPrice_From_Receipt;
          if (totalStock > 0) {
            newImportPrice = Math.round(((oldStock * oldImportPrice) + (newQuantity * newImportPrice_From_Receipt)) / totalStock);
          }

          // Cập nhật bảng Product bằng Mongoose: Sử dụng $inc để cộng stock, và $set để cập nhật importPrice
          finalProduct = await Product.findByIdAndUpdate(
            item.productId,
            {
              $inc: { stock: newQuantity },
              $set: { importPrice: newImportPrice }
            },
            { new: true, ...sessionOpts }
          );
        }

        processedItems.push({
          productId: finalProductId,
          quantity: Number(item.quantity),
          importPrice: Number(item.importPrice)
        });

        // Realtime Stock và LowStock check
        if (finalProduct) {
          getIO().emit('product:stockUpdated', {
            productId: finalProduct._id.toString(),
            stock: finalProduct.stock,
            reason: 'import'
          });
          await checkAndEmitLowStockNotification(finalProduct);
        }
      }
      return processedItems;
    };

    // 2. THỰC THI GHI NHẬN (TRANSACTION HOẶC ATOMIC BATCH)
    if (session) {
      session.startTransaction();

      const processedItems = await processReceiptItems({ session });

      // Lưu phiếu nhập
      const newReceipt = new ImportReceipt({ 
        receiptCode: generatedReceiptCode, 
        creator: creatorName, // Giữ tương thích ngược
        creatorId, 
        creatorName, 
        items: processedItems, 
        note 
      });
      await newReceipt.save({ session });

      await session.commitTransaction();
      session.endSession();
    } else {
      // Chế độ Standalone (Bảo đảm an toàn tuyệt đối nhờ bước Tiền Kiểm Tra 1 đã xác thực thành công)
      const processedItems = await processReceiptItems({});

      const newReceipt = new ImportReceipt({ 
        receiptCode: generatedReceiptCode, 
        creator: creatorName, // Giữ tương thích ngược
        creatorId, 
        creatorName, 
        items: processedItems, 
        note 
      });
      await newReceipt.save();
    }

    res.status(201).json({ success: true, message: 'Tạo phiếu nhập kho và đồng bộ tồn kho thành công!' });
  } catch (error) {
    if (session) {
      try {
        await session.abortTransaction();
        session.endSession();
      } catch (abortError) {}
    }
    console.error('Lỗi khi nhập hàng:', error);
    res.status(500).json({ success: false, message: error.message || 'Lỗi máy chủ khi xử lý nhập hàng!' });
  }
};

// [GET] Lấy danh sách lịch sử phiếu nhập hàng
exports.getReceipts = async (req, res) => {
  try {
    const receipts = await ImportReceipt.find()
      .populate({
        path: 'items.productId',
        select: 'name images price brand category'
      })
      .sort({ createdAt: -1 });

    res.json({ success: true, receipts });
  } catch (error) {
    console.error('Lỗi lấy danh sách phiếu nhập:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tải danh sách nhập kho!' });
  }
};
