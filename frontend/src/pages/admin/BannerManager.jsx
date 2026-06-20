import React, { useEffect, useMemo, useState } from 'react';
import {
  Eye,
  EyeOff,
  Image as ImageIcon,
  Link as LinkIcon,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  X
} from 'lucide-react';

const emptyForm = {
  title: '',
  subtitle: '',
  imageUrl: '',
  targetUrl: '/',
  sortOrder: 0,
  isActive: true,
  startDate: '',
  endDate: ''
};

const toDateInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

export default function BannerManager() {
  const [banners, setBanners] = useState([]);
  const [formData, setFormData] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [searchTerm, setSearchTerm] = useState('');

  const token = localStorage.getItem('glassesToken');

  const fetchBanners = async () => {
    try {
      const response = await fetch('/api/banners/admin', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) setBanners(data.banners || []);
    } catch (error) {
      console.error('Loi tai banner:', error);
    }
  };

  useEffect(() => {
    fetchBanners();
  }, []);

  const filteredBanners = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return banners;
    return banners.filter((banner) => (
      (banner.title || '').toLowerCase().includes(query) ||
      (banner.subtitle || '').toLowerCase().includes(query) ||
      (banner.targetUrl || '').toLowerCase().includes(query)
    ));
  }, [banners, searchTerm]);

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingId(null);
    setMessage({ text: '', type: '' });
  };

  const validateForm = () => {
    if (!formData.title.trim()) return 'Vui long nhap tieu de banner.';
    if (!formData.imageUrl.trim()) return 'Vui long nhap URL hinh anh.';
    if (formData.startDate && formData.endDate && new Date(formData.startDate) > new Date(formData.endDate)) {
      return 'Ngay bat dau phai nho hon hoac bang ngay ket thuc.';
    }
    return null;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setMessage({ text: validationError, type: 'error' });
      return;
    }

    setLoading(true);
    setMessage({ text: '', type: '' });

    const payload = {
      ...formData,
      sortOrder: Number(formData.sortOrder || 0),
      startDate: formData.startDate || undefined,
      endDate: formData.endDate || null
    };

    try {
      const response = await fetch(editingId ? `/api/banners/${editingId}` : '/api/banners', {
        method: editingId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (data.success) {
        setMessage({ text: data.message, type: 'success' });
        resetForm();
        fetchBanners();
      } else {
        setMessage({ text: data.message || 'Khong the luu banner.', type: 'error' });
      }
    } catch (error) {
      setMessage({ text: 'Loi ket noi may chu.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (banner) => {
    setEditingId(banner._id);
    setFormData({
      title: banner.title || '',
      subtitle: banner.subtitle || '',
      imageUrl: banner.imageUrl || '',
      targetUrl: banner.targetUrl || '/',
      sortOrder: banner.sortOrder || 0,
      isActive: banner.isActive !== false,
      startDate: toDateInput(banner.startDate),
      endDate: toDateInput(banner.endDate)
    });
    setMessage({ text: '', type: '' });
  };

  const handleToggle = async (id) => {
    try {
      const response = await fetch(`/api/banners/${id}/toggle`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) fetchBanners();
      else setMessage({ text: data.message || 'Khong the cap nhat trang thai.', type: 'error' });
    } catch (error) {
      setMessage({ text: 'Loi ket noi may chu.', type: 'error' });
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Ban co chac muon xoa banner nay?')) return;

    try {
      const response = await fetch(`/api/banners/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) fetchBanners();
      else setMessage({ text: data.message || 'Khong the xoa banner.', type: 'error' });
    } catch (error) {
      setMessage({ text: 'Loi ket noi may chu.', type: 'error' });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-gray-900">Quản lý Banner</h1>
            <p className="text-gray-500 mt-2">Quan ly banner quang cao hien thi tren trang chu.</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Tim banner..."
              className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="xl:col-span-1 bg-white p-6 rounded-3xl shadow-sm border border-gray-100 h-fit">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                {editingId ? <Pencil className="w-5 h-5 text-blue-600" /> : <Plus className="w-5 h-5 text-blue-600" />}
                {editingId ? 'Sua banner' : 'Them banner'}
              </h2>
              {editingId && (
                <button type="button" onClick={resetForm} className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {message.text && (
              <div className={`p-3 rounded-xl text-sm font-medium mb-6 text-center ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {message.text}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Tieu de *</label>
                <input
                  required
                  value={formData.title}
                  onChange={(event) => setFormData({ ...formData, title: event.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none"
                  placeholder="Khuyen mai mua he"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Mo ta ngan</label>
                <textarea
                  rows="3"
                  value={formData.subtitle}
                  onChange={(event) => setFormData({ ...formData, subtitle: event.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none resize-none"
                  placeholder="Giam gia den 30% cho bo suu tap moi"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" /> Image URL *
                </label>
                <input
                  required
                  value={formData.imageUrl}
                  onChange={(event) => setFormData({ ...formData, imageUrl: event.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1 flex items-center gap-2">
                  <LinkIcon className="w-4 h-4" /> Link dich
                </label>
                <input
                  value={formData.targetUrl}
                  onChange={(event) => setFormData({ ...formData, targetUrl: event.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none"
                  placeholder="/"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Sort order</label>
                  <input
                    type="number"
                    value={formData.sortOrder}
                    onChange={(event) => setFormData({ ...formData, sortOrder: event.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>
                <label className="flex items-center gap-3 mt-7 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(event) => setFormData({ ...formData, isActive: event.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-bold text-gray-700">Hien thi</span>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Bat dau</label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(event) => setFormData({ ...formData, startDate: event.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Ket thuc</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(event) => setFormData({ ...formData, endDate: event.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>
              </div>

              {formData.imageUrl && (
                <div className="rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 aspect-[16/7]">
                  <img src={formData.imageUrl} alt="Banner preview" className="w-full h-full object-cover" />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className={`w-full py-3.5 text-white font-bold rounded-xl transition shadow-lg flex items-center justify-center gap-2 ${loading ? 'bg-gray-400' : 'bg-gray-900 hover:bg-blue-600'}`}
              >
                <Save className="w-5 h-5" />
                {loading ? 'Dang luu...' : editingId ? 'Luu thay doi' : 'Them banner'}
              </button>
            </form>
          </div>

          <div className="xl:col-span-2 bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Danh sach banner ({banners.length})</h2>
                <p className="text-xs text-gray-400 mt-1">Keo sortOrder nho hon se hien truoc.</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                    <th className="px-6 py-4 font-bold">Banner</th>
                    <th className="px-6 py-4 font-bold">Thoi gian</th>
                    <th className="px-6 py-4 font-bold">Thu tu</th>
                    <th className="px-6 py-4 font-bold">Trang thai</th>
                    <th className="px-6 py-4 font-bold text-right">Thao tac</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredBanners.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-6 py-16 text-center text-gray-400 font-bold">
                        Chua co banner phu hop.
                      </td>
                    </tr>
                  ) : (
                    filteredBanners.map((banner) => (
                      <tr key={banner._id} className="hover:bg-gray-50/50 transition">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4 min-w-[280px]">
                            <img src={banner.imageUrl} alt={banner.title} className="w-24 h-14 rounded-xl object-cover bg-gray-100" />
                            <div>
                              <p className="font-black text-gray-900 line-clamp-1">{banner.title}</p>
                              <p className="text-sm text-gray-500 line-clamp-1">{banner.subtitle || banner.targetUrl}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 min-w-[180px]">
                          <div>{toDateInput(banner.startDate) || '--'}</div>
                          <div className="text-gray-400">{toDateInput(banner.endDate) || 'Khong gioi han'}</div>
                        </td>
                        <td className="px-6 py-4 font-bold text-gray-900">{banner.sortOrder || 0}</td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-black ${banner.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {banner.isActive ? 'Dang hien' : 'Dang an'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => handleEdit(banner)} className="p-2 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleToggle(banner._id)} className="p-2 rounded-xl bg-gray-50 text-gray-600 hover:bg-gray-900 hover:text-white transition">
                              {banner.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                            <button onClick={() => handleDelete(banner._id)} className="p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition">
                              <Trash2 className="w-4 h-4" />
                            </button>
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
      </div>
    </div>
  );
}
