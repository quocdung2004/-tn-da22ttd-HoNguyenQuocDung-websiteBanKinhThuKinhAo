import React, { useState, useEffect } from 'react';
import { Plus, ListTree, AlignLeft, Search } from 'lucide-react';

export default function CategoryManager() {
  const [categories, setCategories] = useState([]);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [searchTerm, setSearchTerm] = useState('');

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/categories');
      const data = await response.json();
      if (data.success) setCategories(data.categories);
    } catch (error) {
      console.error('Lỗi tải danh mục:', error);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ text: '', type: '' });

    try {
      const token = localStorage.getItem('glassesToken');
      
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (data.success) {
        setMessage({ text: data.message, type: 'success' });
        setFormData({ name: '', description: '' });
        fetchCategories();
      } else {
        setMessage({ text: data.message, type: 'error' });
      }
    } catch (error) {
      setMessage({ text: 'Lỗi kết nối máy chủ', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Lọc danh sách danh mục theo từ khóa tìm kiếm (không phân biệt hoa thường, chống crash)
  const filteredCategories = categories.filter((cat) => {
    const name = cat.name ? cat.name.toLowerCase() : '';
    const desc = cat.description ? cat.description.toLowerCase() : '';
    const query = searchTerm.toLowerCase();
    return name.includes(query) || desc.includes(query);
  });

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-black text-gray-900">Quản lý Danh mục</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* CỘT TRÁI: FORM */}
          <div className="lg:col-span-1 bg-white p-6 rounded-3xl shadow-sm border border-gray-100 h-fit sticky top-24">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" /> Thêm Danh mục mới
            </h2>

            {message.text && (
              <div className={`p-3 rounded-xl text-sm font-medium mb-6 text-center ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {message.text}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-2"><ListTree className="w-4 h-4"/> Tên Danh mục</label>
                <input required type="text" placeholder="VD: Kính râm, Kính cận..." value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none" />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-2"><AlignLeft className="w-4 h-4"/> Mô tả (Tùy chọn)</label>
                <textarea placeholder="Nhập mô tả ngắn..." rows="3" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none resize-none"></textarea>
              </div>

              <button type="submit" disabled={loading} className={`w-full py-3.5 text-white font-bold rounded-xl transition shadow-lg ${loading ? 'bg-gray-400' : 'bg-gray-900 hover:bg-blue-600'}`}>
                {loading ? 'Đang xử lý...' : 'Thêm Danh mục'}
              </button>
            </form>
          </div>

          {/* CỘT PHẢI: BẢNG */}
          <div className="lg:col-span-2 bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Danh sách hiện tại ({categories.length})</h2>
                {searchTerm && (
                  <p className="text-xs text-gray-400 mt-1">Tìm thấy {filteredCategories.length} kết quả phù hợp</p>
                )}
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Tìm kiếm danh mục..."
                  className="pl-10 pr-8 py-2.5 bg-gray-50 border border-gray-150 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition text-sm w-full sm:w-60 font-medium text-gray-700"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 font-bold text-sm"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-sm uppercase tracking-wider">
                    <th className="px-6 py-4 font-bold">Tên Danh mục</th>
                    <th className="px-6 py-4 font-bold">Đường dẫn (Slug)</th>
                    <th className="px-6 py-4 font-bold">Mô tả</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredCategories.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center justify-center gap-2 text-gray-400">
                          <Search className="w-10 h-10 text-gray-300" />
                          <p className="font-bold text-sm">Không tìm thấy danh mục phù hợp</p>
                          <p className="text-xs text-gray-400">Thử tìm kiếm với từ khóa khác xem sao nhé!</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredCategories.map((cat) => (
                      <tr key={cat._id} className="hover:bg-gray-50/50 transition">
                        <td className="px-6 py-4 font-bold text-gray-900">{cat.name}</td>
                        <td className="px-6 py-4">
                          <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded text-sm font-mono">{cat.slug}</span>
                        </td>
                        <td className="px-6 py-4 text-gray-600 text-sm">{cat.description || '--'}</td>
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