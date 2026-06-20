const Product = require('../models/Product');
const { checkAndEmitLowStockNotification } = require('../utils/notificationHelper');
const { getIO } = require('../socket');
const { getActiveSales, calculateBestSaleForProduct, attachSaleInfoToProduct } = require('../utils/saleHelper');
const supabase = require('../config/supabase');
const path = require('path');

const AR_BUCKET = 'ar-models';
const AR_UPLOAD_ERROR_MESSAGE = 'Upload AR model thất bại';

const getArContentType = (file) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (extension === '.gltf') return 'model/gltf+json';
  if (extension === '.glb') return 'model/gltf-binary';

  return file.mimetype || 'application/octet-stream';
};

const createSupabaseUploadError = (error) => {
  const uploadError = new Error(error?.message || AR_UPLOAD_ERROR_MESSAGE);
  uploadError.isSupabaseUploadError = true;
  uploadError.cause = error;
  return uploadError;
};

const uploadArModelToSupabase = async (file) => {
  if (!file?.buffer) {
    throw createSupabaseUploadError(new Error('AR model buffer is missing'));
  }

  const originalName = path.basename(file.originalname).replace(/[\\/]/g, '-');
  const filePath = `models/${Date.now()}-${originalName}`;

  const { error } = await supabase.storage
    .from(AR_BUCKET)
    .upload(filePath, file.buffer, {
      contentType: getArContentType(file),
      upsert: false
    });

  if (error) {
    throw createSupabaseUploadError(error);
  }

  const { data } = supabase.storage
    .from(AR_BUCKET)
    .getPublicUrl(filePath);

  return data.publicUrl;
};

const handleSupabaseUploadError = (res, error) => {
  console.error('========== SUPABASE ERROR ==========');
  console.error(error);
  console.error(error.cause);
  console.error('====================================');

  return res.status(500).json({
    success: false,
    message: error.cause?.message || error.message
  });
};

// Giữ tương thích ngược hoàn hảo cho orderController.js (hỗ trợ cache activeSales)
const resolveProductSalePrice = async (product, activeSales) => {
  const sales = activeSales || await getActiveSales();
  const res = calculateBestSaleForProduct(product, sales);
  return {
    originalPrice: product.price || 0,
    salePrice: res.salePrice,
    discountPercent: res.discountPercent,
    activeSale: res.activeSale,
    remainingSaleQuantity: res.remainingSaleQuantity,
    saleQuotaStatus: res.saleQuotaStatus
  };
};

exports.resolveProductSalePrice = resolveProductSalePrice;

const sanitizeProductForRole = (product, userRole) => {
  const productObj = typeof product.toObject === 'function' ? product.toObject() : { ...product };
  if (userRole !== 1) {
    delete productObj.importPrice;
  }
  return productObj;
};

// [POST] Thêm Sản phẩm
exports.createProduct = async (req, res) => {
  try {
    // Lấy các trường text từ req.body (Lưu ý: arUrl không lấy ở đây nữa vì nó đã thành File)
    const { name, price, description, stock, importPrice, brand, category, gender } = req.body;
    const imageFiles = req.files?.images || [];
    const arModelFile = req.files?.arModel?.[0] || null;
    let images = [];
    let arUrl = '';

    // Xử lý mảng ảnh: Nếu có mảng 'images' được up lên, lặp qua để lấy toàn bộ đường link path
    if (imageFiles.length > 0) {
      images = imageFiles.map(file => file.path);
    }

    // Xử lý file 3D: upload arModel lên Supabase Storage và lưu public URL.
    if (arModelFile) {
      arUrl = await uploadArModelToSupabase(arModelFile);
    }

    const newProduct = new Product({
      name, price, description, images, arUrl, stock, importPrice: Number(importPrice) || 0, brand, category, gender
    });

    await newProduct.save();
    res.status(201).json({ success: true, message: 'Thêm Kính mắt thành công!', product: newProduct });
  } catch (error) {
    if (error.isSupabaseUploadError) {
      return handleSupabaseUploadError(res, error);
    }

    console.error('Lỗi thêm Product:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi máy chủ khi thêm sản phẩm!'
    });
  }
};

// [GET] Lấy danh sách sản phẩm phục vụ trang mua sắm (Search, Filter, Sort, Pagination)
exports.getProductsShop = async (req, res) => {
  try {
    const { 
      search, 
      category, 
      brand, 
      minPrice, 
      maxPrice, 
      isAR, 
      isSale, 
      sort, 
      page, 
      limit,
      gender
    } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 12;
    const skip = (pageNum - 1) * limitNum;

    // Xây dựng bộ lọc tĩnh cho MongoDB
    const query = { isActive: { $ne: false } };

    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    if (category) {
      query.category = category;
    }

    if (brand) {
      query.brand = brand;
    }

    if (gender) {
      if (gender === 'unisex') {
        query.$or = [
          { gender: 'unisex' },
          { gender: { $exists: false } }
        ];
      } else {
        query.gender = gender;
      }
    }

    if (isAR === 'true') {
      query.arUrl = { $exists: true, $ne: '' };
    }

    // Thực hiện song song truy vấn DB và lấy danh sách chương trình khuyến mãi hoạt động
    const [products, activeSales] = await Promise.all([
      Product.find(query)
        .populate('brand', 'name')
        .populate('category', 'name'),
      getActiveSales()
    ]);

    // Áp dụng khuyến mãi động cho toàn bộ sản phẩm trên memory để có salePrice/discountPercent chính xác
    let resolvedProducts = products.map(product => {
      const productForRole = sanitizeProductForRole(product, req.user?.role);
      return attachSaleInfoToProduct(productForRole, activeSales);
    });

    // Lọc động theo isSale
    if (isSale === 'true') {
      resolvedProducts = resolvedProducts.filter(p => p.discountPercent > 0);
    }

    // Lọc động theo khoảng giá bán thực tế (salePrice)
    if (minPrice) {
      resolvedProducts = resolvedProducts.filter(p => p.salePrice >= Number(minPrice));
    }
    if (maxPrice) {
      resolvedProducts = resolvedProducts.filter(p => p.salePrice <= Number(maxPrice));
    }

    // Sắp xếp sản phẩm trên memory theo tiêu chí lựa chọn
    if (sort === 'priceAsc') {
      resolvedProducts.sort((a, b) => a.salePrice - b.salePrice);
    } else if (sort === 'priceDesc') {
      resolvedProducts.sort((a, b) => b.salePrice - a.salePrice);
    } else if (sort === 'bestSeller') {
      resolvedProducts.sort((a, b) => (b.soldQuantity || 0) - (a.soldQuantity || 0));
    } else {
      // Mặc định: newest (mới nhất)
      resolvedProducts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    // Thực hiện phân trang trên memory
    const totalProducts = resolvedProducts.length;
    const totalPages = Math.ceil(totalProducts / limitNum);
    const paginatedProducts = resolvedProducts.slice(skip, skip + limitNum);

    res.json({
      success: true,
      data: {
        products: paginatedProducts,
        pagination: {
          totalProducts,
          totalPages,
          currentPage: pageNum,
          limit: limitNum
        }
      }
    });
  } catch (error) {
    console.error('Lỗi lấy danh sách sản phẩm trang Shop:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tải danh sách sản phẩm!' });
  }
};

// [GET] Lấy danh sách Sản phẩm
exports.getProducts = async (req, res) => {
  try {
    // Nếu truyền query all=true thì trả về tất cả (bao gồm cả sản phẩm bị ẩn/xóa mềm - dùng cho Admin)
    // Ngược lại chỉ trả về các sản phẩm đang bán (isActive !== false - dùng cho Customer)
    const isAdmin = req.user?.role === 1;
    if (req.query.all === 'true' && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Chỉ Admin được xem toàn bộ sản phẩm.' });
    }
    const filter = isAdmin && req.query.all === 'true' ? {} : { isActive: { $ne: false } };

    const products = await Product.find(filter)
      .populate('brand', 'name')
      .populate('category', 'name')
      .sort({ createdAt: -1 });

    // Tính toán giá khuyến mãi động cho từng sản phẩm trả về sử dụng saleHelper
    const activeSales = await getActiveSales();
    const resolvedProducts = products.map(product => {
      const productForRole = sanitizeProductForRole(product, req.user?.role);
      return attachSaleInfoToProduct(productForRole, activeSales);
    });

    res.json({ success: true, products: resolvedProducts });
  } catch (error) {
    console.error('Lỗi lấy Product:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ!' });
  }
};

// [GET] Lấy chi tiết một Sản phẩm
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id)
      .populate('brand', 'name')
      .populate('category', 'name');

    if (!product) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm kính mắt!' });
    }

    if (product.isActive === false && req.user?.role !== 1) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm kính mắt!' });
    }

    // Tính toán khuyến mãi động cho sản phẩm
    const activeSales = await getActiveSales();
    const productForRole = sanitizeProductForRole(product, req.user?.role);
    const resolvedProduct = attachSaleInfoToProduct(productForRole, activeSales);

    res.json({ success: true, product: resolvedProduct });
  } catch (error) {
    console.error('Lỗi lấy chi tiết Product:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ!' });
  }
};

// [PUT] Cập nhật Sản phẩm
exports.updateProduct = async (req, res) => {
  try {
    const { name, price, description, stock, importPrice, brand, category, isActive, gender } = req.body;
    const imageFiles = req.files?.images || [];
    const arModelFile = req.files?.arModel?.[0] || null;

    // Tạo object chứa dữ liệu mới cơ bản
    let updateData = { name, price, description, stock, importPrice: Number(importPrice) || 0, brand, category, gender };

    if (isActive !== undefined) {
      updateData.isActive = isActive === 'true' || isActive === true;
    }

    // Nếu Admin có quét chọn tải album ảnh mới lên (sẽ ghi đè ảnh cũ)
    if (imageFiles.length > 0) {
      updateData.images = imageFiles.map(file => file.path);
    }

    // Nếu Admin có tải file 3D (.glb/.gltf) mới lên thì upload Supabase.
    if (arModelFile) {
      updateData.arUrl = await uploadArModelToSupabase(arModelFile);
    }

    // Tìm theo ID và cập nhật (thêm { new: true } để nó trả về data sau khi sửa)
    const updatedProduct = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });

    if (!updatedProduct) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm!' });
    }

    // ================= REALTIME STOCK INTEGRATION =================
    // Phát tín hiệu cập nhật tồn kho sỉ/lẻ từ chỉnh sửa của Admin
    getIO().emit('product:stockUpdated', {
      productId: updatedProduct._id.toString(),
      stock: updatedProduct.stock,
      reason: 'admin_edit'
    });
    // Kiểm tra và gửi cảnh báo tồn kho thấp (stock <= 5)
    await checkAndEmitLowStockNotification(updatedProduct);
    // ===============================================================

    res.json({ success: true, message: 'Cập nhật thành công!', product: updatedProduct });
  } catch (error) {
    if (error.isSupabaseUploadError) {
      return handleSupabaseUploadError(res, error);
    }

    console.error('Lỗi cập nhật Product:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi máy chủ khi cập nhật sản phẩm!'
    });
  }
};

// [DELETE] Xóa Sản phẩm (Xóa Mềm - Soft Delete)
exports.deleteProduct = async (req, res) => {
  try {
    // Không xóa cứng để tránh mồ côi khóa ngoại trong Đơn hàng (Order) và Lịch sử nhập (ImportReceipt)
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm!' });
    }

    res.json({ success: true, message: 'Đã ẩn (xóa mềm) sản phẩm thành công!', product: updatedProduct });
  } catch (error) {
    console.error('Lỗi xóa Product:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ!' });
  }
};

// [PUT] Khôi phục Sản phẩm đã bị xóa mềm (Dành cho Admin)
exports.restoreProduct = async (req, res) => {
  try {
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      { isActive: true },
      { new: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm!' });
    }

    res.json({ success: true, message: 'Khôi phục sản phẩm thành công!', product: updatedProduct });
  } catch (error) {
    console.error('Lỗi khôi phục Product:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ!' });
  }
};
