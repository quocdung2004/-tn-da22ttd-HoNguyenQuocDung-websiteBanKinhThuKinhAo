import React, { useState, useEffect } from 'react';
import { Plus, Image as ImageIcon, Tag, Globe, Trash2 } from 'lucide-react';

export default function BrandManager() {
  const [brands, setBrands] = useState([]);
  const [formData, setFormData] = useState({ name: '', origin: '' });
  const [imageFile, setImageFile] = useState(null); // State riêng để lưu file ảnh
  const [imagePreview, setImagePreview] = useState(null); // Để hiển thị ảnh xem trước
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // 1. Gọi API lấy danh sách nhãn hàng khi vừa vào trang
  const fetchBrands = async () => {
    try {
      const response = await fetch('/api/brands');
      const data = await response.json();
      if (data.success) setBrands(data.brands);
    } catch (error) {
      console.error('Lỗi tải danh sách Brand:', error);
    }
  };

  useEffect(() => {
    fetchBrands();
  }, []);

  // 2. Xử lý khi Admin chọn ảnh
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      // Tạo link ảo để hiện ảnh xem trước cho đẹp
      setImagePreview(URL.createObjectURL(file)); 
    }
  };

  // 3. Gửi dữ liệu (Bao gồm file ảnh) lên Server
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ text: '', type: '' });

    // DÙNG FORM DATA ĐỂ GỬI FILE (Không dùng JSON)
    const dataToSend = new FormData();
    dataToSend.append('name', formData.name);
    dataToSend.append('origin', formData.origin);
    if (imageFile) {
      dataToSend.append('logo', imageFile); // Tên 'logo' phải khớp với uploadCloud.single('logo') ở Backend
    }

    try {
      const token = localStorage.getItem('glassesToken'); // Lấy thẻ Admin
      
      const response = await fetch('/api/brands', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
          // LƯU Ý KỸ: Khi gửi FormData, tuyệt đối KHÔNG set Content-Type. Trình duyệt sẽ tự động set thành 'multipart/form-data'
        },
        body: dataToSend
      });

      const data = await response.json();

      if (data.success) {
        setMessage({ text: data.message, type: 'success' });
        setFormData({ name: '', origin: '' });
        setImageFile(null);
        setImagePreview(null);
        fetchBrands(); // Tải lại danh sách ngay lập tức
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
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* TIÊU ĐỀ */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-black text-gray-900">Quản lý Nhãn hàng</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* CỘT TRÁI: FORM THÊM MỚI */}
          <div className="lg:col-span-1 bg-white p-6 rounded-3xl shadow-sm border border-gray-100 h-fit sticky top-24">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" /> Thêm Nhãn hàng mới
            </h2>

            {message.text && (
              <div className={`p-3 rounded-xl text-sm font-medium mb-6 text-center ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {message.text}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-2"><Tag className="w-4 h-4"/> Tên Nhãn hàng</label>
                <input required type="text" placeholder="VD: RayBan, Gucci..." value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none" />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-2"><Globe className="w-4 h-4"/> Xuất xứ</label>
                <input type="text" placeholder="VD: Italy, Mỹ, Hàn Quốc..." value={formData.origin} onChange={e => setFormData({...formData, origin: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none" />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-2"><ImageIcon className="w-4 h-4"/> Ảnh Logo</label>
                <input required type="file" accept="image/*" onChange={handleImageChange} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" />
                {imagePreview && (
                  <div className="mt-4 p-2 border border-gray-100 rounded-xl bg-gray-50 inline-block">
                    <img src={imagePreview} alt="Preview" className="h-16 object-contain mix-blend-multiply" />
                  </div>
                )}
              </div>

              <button type="submit" disabled={loading} className={`w-full py-3.5 text-white font-bold rounded-xl transition shadow-lg ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-gray-900 hover:bg-blue-600'}`}>
                {loading ? 'Đang tải ảnh lên...' : 'Thêm Nhãn hàng'}
              </button>
            </form>
          </div>

          {/* CỘT PHẢI: DANH SÁCH NHÃN HÀNG */}
          <div className="lg:col-span-2 bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-50">
              <h2 className="text-xl font-bold text-gray-900">Danh sách hiện tại ({brands.length})</h2>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-sm uppercase tracking-wider">
                    <th className="px-6 py-4 font-bold">Logo</th>
                    <th className="px-6 py-4 font-bold">Tên Nhãn hàng</th>
                    <th className="px-6 py-4 font-bold">Xuất xứ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {brands.length === 0 ? (
                    <tr><td colSpan="3" className="px-6 py-8 text-center text-gray-500">Chưa có dữ liệu. Hãy thêm nhãn hàng đầu tiên!</td></tr>
                  ) : (
                    brands.map((brand) => (
                      <tr key={brand._id} className="hover:bg-gray-50 transition">
                        <td className="px-6 py-4">
                          <img src={brand.logoUrl} alt={brand.name} className="h-10 object-contain rounded" />
                        </td>
                        <td className="px-6 py-4 font-bold text-gray-900">{brand.name}</td>
                        <td className="px-6 py-4 text-gray-600">{brand.origin}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}