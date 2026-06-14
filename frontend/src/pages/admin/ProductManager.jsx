import React, { useState, useEffect, useRef } from 'react';
import { Plus, Image as ImageIcon, Edit, Trash2, X, Box, Search, RotateCcw } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';

export default function ProductManager() {
  const { socket } = useSocket();
  const [products, setProducts] = useState([]);
  const [brands, setBrands] = useState([]);
  const [categories, setCategories] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // STATE CỦA FORM
  const [formData, setFormData] = useState({ 
    name: '', price: '', description: '', stock: '', brand: '', category: '', isActive: true 
  });
  
  // STATE XỬ LÝ ẢNH & FILE 3D
  const [imageFiles, setImageFiles] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [arFile, setArFile] = useState(null);
  
  const [editingId, setEditingId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false); // State để ẩn/hiện Form Popup
  
  const fileInputRef = useRef(null); 
  const arFileInputRef = useRef(null);
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('glassesToken');
      const [prodRes, brandRes, catRes] = await Promise.all([
        fetch('/api/products?all=true', {
          headers: { Authorization: `Bearer ${token}` }
        }).then(res => res.json()), // Gọi all=true để Admin quản lý toàn bộ
        fetch('/api/brands').then(res => res.json()),
        fetch('/api/categories').then(res => res.json())
      ]);
      
      console.log("Danh sách Nhãn hàng từ DB:", brandRes.brands);
      console.log("Danh sách Danh mục từ DB:", catRes.categories);

      if (prodRes.success) setProducts(prodRes.products);
      if (brandRes.success) setBrands(brandRes.brands);
      if (catRes.success) setCategories(catRes.categories);
      
    } catch (error) {
      console.error('Lỗi tải dữ liệu:', error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Đăng ký lắng nghe sự kiện cập nhật tồn kho realtime
  useEffect(() => {
    if (!socket) return;

    const handleStockUpdate = (payload) => {
      console.log('⚡ [Socket.IO Client] Nhận tín hiệu cập nhật tồn kho sỉ/lẻ:', payload);
      fetchData();
    };

    socket.on('product:stockUpdated', handleStockUpdate);

    return () => {
      socket.off('product:stockUpdated', handleStockUpdate);
    };
  }, [socket]);

  // LỌC SẢN PHẨM Ở FRONTEND THEO TÊN, NHÃN HÀNG, DANH MỤC (REAL-TIME, KHÔNG PHÂN BIỆT HOA THƯỜNG, KHÔNG CRASH NẾU NULL)
  const filteredProducts = products.filter(prod => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    
    const nameMatch = prod.name ? prod.name.toLowerCase().includes(term) : false;
    const brandMatch = prod.brand?.name ? prod.brand.name.toLowerCase().includes(term) : false;
    const categoryMatch = prod.category?.name ? prod.category.name.toLowerCase().includes(term) : false;
    
    return nameMatch || brandMatch || categoryMatch;
  });

  // THỐNG KÊ SỐ LƯỢNG SẢN PHẨM THEO DANH MỤC (CHỈ ĐẾM SẢN PHẨM ĐANG HOẠT ĐỘNG isActive !== false, GOM CÁC SẢN PHẨM THIẾU DANH MỤC VÀO "Chưa phân loại")
  const getCategoryStats = () => {
    const stats = {};
    const activeProducts = products.filter(p => p.isActive !== false);
    
    activeProducts.forEach(prod => {
      const catName = prod.category?.name || "Chưa phân loại";
      stats[catName] = (stats[catName] || 0) + 1;
    });
    
    return Object.entries(stats).map(([name, count]) => ({ name, count }));
  };

  const categoryStats = getCategoryStats();

  // XỬ LÝ CHỌN ALBUM ẢNH
  const handleImageChange = (e) => {
    const files = Array.from(e.target.files).slice(0, 10); // Lấy tối đa 10 ảnh
    if (files.length > 0) {
      setImageFiles(files);
      setImagePreviews(files.map(file => URL.createObjectURL(file))); 
    }
  };

  // MỞ FORM ĐỂ SỬA
  const handleEdit = (prod) => {
    setEditingId(prod._id);
    setFormData({
      name: prod.name,
      price: prod.price,
      description: prod.description || '',
      stock: prod.stock,
      brand: prod.brand ? prod.brand._id : '',
      category: prod.category ? prod.category._id : '',
      isActive: prod.isActive !== false // nạp đúng trạng thái
    });
    setImagePreviews(prod.images || []); // Hiện mảng ảnh cũ từ DB
    setImageFiles([]); 
    setArFile(null);
    setIsModalOpen(true); // Bật Popup lên
  };

  // ĐÓNG FORM VÀ RESET DỮ LIỆU
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    // Reset form về trạng thái rỗng
    setFormData({ name: '', price: '', description: '', stock: '', brand: '', category: '', isActive: true });
    setImagePreviews([]);
    setImageFiles([]);
    setArFile(null);
    setMessage({ text: '', type: '' });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Bạn có chắc muốn ẩn (xóa mềm) gọng kính này khỏi trang bán hàng của khách không?')) return;
    try {
      const token = localStorage.getItem('glassesToken');
      const response = await fetch(`/api/products/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      
      if (data.success) {
        alert('Đã ẩn sản phẩm thành công!');
        fetchData();
      } else {
        alert(data.message);
      }
    } catch (error) {
      alert('Lỗi kết nối máy chủ!');
    }
  };

  const handleRestore = async (id) => {
    if (!window.confirm('Bạn có muốn khôi phục sản phẩm này hiển thị lại trên cửa hàng không?')) return;
    try {
      const token = localStorage.getItem('glassesToken');
      const response = await fetch(`/api/products/${id}/restore`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      
      if (data.success) {
        alert('Khôi phục sản phẩm thành công!');
        fetchData();
      } else {
        alert(data.message);
      }
    } catch (error) {
      alert('Lỗi kết nối máy chủ!');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ text: '', type: '' });

    const dataToSend = new FormData();
    dataToSend.append('name', formData.name);
    dataToSend.append('price', formData.price);
    dataToSend.append('description', formData.description);
    dataToSend.append('stock', formData.stock);
    dataToSend.append('brand', formData.brand);
    dataToSend.append('category', formData.category);
    
    // Gửi trạng thái isActive khi đang sửa sản phẩm
    if (editingId) {
      dataToSend.append('isActive', formData.isActive);
    }
    
    // Đính kèm Mảng ảnh
    if (imageFiles.length > 0) {
      imageFiles.forEach(file => dataToSend.append('images', file));
    }
    // Đính kèm File 3D
    if (arFile) {
      dataToSend.append('arModel', arFile);
    }

    try {
      const token = localStorage.getItem('glassesToken');
      const url = editingId ? `/api/products/${editingId}` : '/api/products';
      const method = editingId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method: method,
        headers: { 'Authorization': `Bearer ${token}` }, 
        body: dataToSend
      });

      const data = await response.json();
      if (data.success) {
        handleCloseModal(); // Lưu xong thì đóng Form ngay lập tức
        fetchData(); // Load lại dữ liệu bảng
        alert(data.message); // Thông báo nhanh nhẹn
      } else {
        setMessage({ text: data.message, type: 'error' });
      }
    } catch (error) {
      setMessage({ text: 'Lỗi kết nối máy chủ', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8 relative">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* HEADER GIAO DIỆN CHÍNH */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-3xl font-black text-gray-900">Kho Kính mắt</h1>
          
          <button 
            onClick={() => setIsModalOpen(true)} 
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-200"
          >
            <Plus className="w-5 h-5" /> Thêm Kính mới
          </button>
        </div>

        {/* THẺ THỐNG KÊ DANH MỤC KÍNH (CARDS/BADGES) */}
        {categoryStats.length > 0 && (
          <div className="p-6 bg-white rounded-3xl border border-gray-100 shadow-sm flex flex-col gap-4 animate-in fade-in duration-300">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse"></span>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Phân tích tồn kho hoạt động theo loại kính</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {categoryStats.map((stat, index) => (
                <div key={index} className="bg-gray-50/50 hover:bg-blue-50/20 px-4 py-3 rounded-2xl border border-gray-100 hover:border-blue-100 flex items-center gap-3 transition duration-300">
                  <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"></div>
                  <div className="min-w-0">
                    <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider truncate">{stat.name}</p>
                    <p className="text-sm font-black text-gray-900 mt-0.5">{stat.count} <span className="text-xs text-gray-400 font-normal">chiếc</span></p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* BẢNG DANH SÁCH */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-50 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <h2 className="text-xl font-bold text-gray-900">Danh sách hiện tại ({filteredProducts.length})</h2>
            
            {/* THANH TÌM KIẾM FRONTEND REALTIME */}
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Tìm kính, nhãn hàng, loại..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition text-sm font-medium"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 hover:text-gray-600"
                >
                  Xóa
                </button>
              )}
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-sm uppercase tracking-wider">
                  <th className="px-6 py-4 font-bold">Hình ảnh</th>
                  <th className="px-6 py-4 font-bold">Tên Kính</th>
                  <th className="px-6 py-4 font-bold">Giá bán</th>
                  <th className="px-6 py-4 font-bold">Phân loại</th>
                  <th className="px-6 py-4 font-bold">Tồn kho</th>
                  <th className="px-6 py-4 font-bold text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center justify-center gap-2 py-4">
                        <Search className="w-8 h-8 text-gray-300" />
                        <p className="font-bold text-gray-600">Không tìm thấy gọng kính nào</p>
                        <p className="text-sm text-gray-400">Hãy thử nhập từ khóa khác hoặc xóa bộ lọc.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((prod) => (
                    <tr key={prod._id} className={`hover:bg-gray-50 transition ${!prod.isActive ? 'bg-red-50/20' : ''}`}>
                      <td className="px-6 py-4">
                        <img src={prod.images && prod.images[0] ? prod.images[0] : '/placeholder.png'} alt={prod.name} className="h-14 w-14 object-cover rounded-xl border border-gray-200 bg-white" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900">{prod.name}</span>
                          {prod.isActive !== false ? (
                            <span className="bg-green-100 text-green-700 text-[10px] px-2.5 py-0.5 rounded-full font-extrabold uppercase tracking-wider">
                              Hoạt động
                            </span>
                          ) : (
                            <span className="bg-red-100 text-red-700 text-[10px] px-2.5 py-0.5 rounded-full font-extrabold uppercase tracking-wider">
                              Đã ẩn
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-blue-600 font-bold">{prod.price.toLocaleString('vi-VN')}đ</td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{prod.category?.name}</div>
                        <div className="text-xs text-gray-500">{prod.brand?.name}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1.5 rounded-lg text-sm font-bold ${prod.stock > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {prod.stock} cái
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-3">
                          <button onClick={() => handleEdit(prod)} className="p-2 bg-yellow-50 text-yellow-600 rounded-lg hover:bg-yellow-100 transition" title="Sửa">
                            <Edit className="w-4 h-4" />
                          </button>
                          {prod.isActive !== false ? (
                            <button onClick={() => handleDelete(prod._id)} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition" title="Ẩn kính (Xóa mềm)">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <button onClick={() => handleRestore(prod._id)} className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition" title="Khôi phục hiển thị">
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ===================== MODAL / POPUP FORM ===================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto relative animate-in zoom-in-95 duration-200">
            
            {/* Header của Modal */}
            <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                {editingId ? <Edit className="w-5 h-5 text-yellow-600" /> : <Plus className="w-5 h-5 text-blue-600" />} 
                {editingId ? 'Cập nhật Sản phẩm' : 'Thêm Kính mới'}
              </h2>
              <button onClick={handleCloseModal} className="p-2 bg-gray-100 text-gray-600 rounded-full hover:bg-red-100 hover:text-red-600 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {message.text && (
                <div className={`p-4 rounded-xl text-sm font-bold mb-6 text-center ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {message.text}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Tên Kính</label>
                  <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none" />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Giá bán (VNĐ)</label>
                    <input required type="number" min="0" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Tồn kho</label>
                    <input required type="number" min="0" value={formData.stock} onChange={e => setFormData({...formData, stock: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  {/* === ĐÃ FIX LỖI TÀNG HÌNH Ở ĐÂY: THÊM <option value=""> === */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Danh mục</label>
                    <select required value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none">
                      <option value="">-- Chọn Danh mục --</option>
                      {categories.map(cat => <option key={cat._id} value={cat._id}>{cat.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Nhãn hàng</label>
                    <select required value={formData.brand} onChange={e => setFormData({...formData, brand: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none">
                      <option value="">-- Chọn Nhãn hàng --</option>
                      {brands.map(brand => <option key={brand._id} value={brand._id}>{brand.name}</option>)}
                    </select>
                  </div>
                </div>

                {editingId && (
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Trạng thái hoạt động</label>
                    <select 
                      value={formData.isActive ? "true" : "false"} 
                      onChange={e => setFormData({...formData, isActive: e.target.value === "true"})} 
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none animate-in fade-in duration-200"
                    >
                      <option value="true">Hoạt động</option>
                      <option value="false">Đã ẩn</option>
                    </select>
                  </div>
                )}

                {/* VÙNG CHỌN FILE 3D (.GLB) */}
                <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
                  <label className="block text-sm font-bold text-indigo-900 mb-2 flex items-center gap-2">
                    <Box className="w-5 h-5"/> 
                    {editingId ? 'File Mô hình 3D AR (.glb) (Chỉ chọn nếu muốn đổi)' : 'File Mô hình 3D AR (.glb)'}
                  </label>
                  <input ref={arFileInputRef} type="file" accept=".glb,.gltf" onChange={(e) => setArFile(e.target.files[0])} className="block w-full text-sm text-indigo-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-white file:text-indigo-600 hover:file:bg-indigo-100 cursor-pointer" />
                  {arFile && <p className="text-xs text-green-600 mt-2 font-bold">✓ Đã chọn: {arFile.name}</p>}
                </div>

                {/* VÙNG CHỌN ALBUM ẢNH */}
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200">
                  <label className="block text-sm font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <ImageIcon className="w-5 h-5"/> 
                    {editingId ? 'Album Ảnh Kính (Để trống nếu giữ bộ ảnh cũ)' : 'Album Ảnh Kính (Chọn tối đa 10 ảnh)'}
                  </label>
                  <input ref={fileInputRef} required={!editingId} multiple type="file" accept="image/*" onChange={handleImageChange} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-white file:text-gray-700 hover:file:bg-gray-200 cursor-pointer" />
                  
                  {/* Hiển thị mảng ảnh preview */}
                  {imagePreviews.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-3">
                      {imagePreviews.map((src, index) => (
                        <div key={index} className="relative group">
                          <img src={src} alt="Preview" className="h-20 w-20 object-cover rounded-xl border border-gray-200 shadow-sm bg-white" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-4 flex justify-end gap-3">
                  <button type="button" onClick={handleCloseModal} className="px-6 py-3 rounded-xl font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 transition">
                    Hủy bỏ
                  </button>
                  <button type="submit" disabled={loading} className={`px-8 py-3 text-white font-bold rounded-xl transition shadow-lg ${loading ? 'bg-gray-400' : 'bg-gray-900 hover:bg-blue-600'}`}>
                    {loading ? 'Đang tải lên...' : (editingId ? 'Lưu Cập nhật' : 'Thêm Sản phẩm')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

