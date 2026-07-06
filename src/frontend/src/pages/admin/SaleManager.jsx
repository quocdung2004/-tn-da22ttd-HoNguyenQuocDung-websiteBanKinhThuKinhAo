import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Percent, Calendar, FileText, Check, Search, Sparkles, 
  Edit3, Trash2, Tag, ListTree, ChevronDown, X 
} from 'lucide-react';

export default function SaleManager() {
  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    discountType: 'percent',
    discountValue: '',
    startDate: '',
    endDate: '',
    isActive: true,
    applicableProducts: [],
    applicableCategories: [],
    usageLimitType: 'unlimited',
    usageLimit: ''
  });

  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  
  // Search Filters for Dropdowns
  const [productSearch, setProductSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [saleSearch, setSaleSearch] = useState('');

  // Bộ lọc danh sách Khuyến mãi (PHASE 3 FILTER INTEGRATION)
  const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'today', 'upcoming', 'ended', 'customDate'
  const [customFilterDate, setCustomFilterDate] = useState('');

  // Dropdown Open States
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Refs for closing dropdowns when clicking outside
  const productDropdownRef = useRef(null);
  const categoryDropdownRef = useRef(null);

  // Lấy chuỗi định dạng ngày hôm nay (YYYY-MM-DD) theo múi giờ địa phương để gán min attribute
  const getTodayDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const todayStr = getTodayDateString();

  const fetchSales = async () => {
    try {
      const res = await fetch('/api/sales');
      const data = await res.json();
      if (data.success) setSales(data.sales);
    } catch (err) {
      console.error('Lỗi tải danh sách khuyến mãi:', err);
    }
  };

  const fetchProducts = async () => {
    try {
      const token = localStorage.getItem('glassesToken');
      const res = await fetch('/api/products?all=true', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) setProducts(data.products);
    } catch (err) {
      console.error('Lỗi tải sản phẩm:', err);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories');
      const data = await res.json();
      if (data.success) setCategories(data.categories);
    } catch (err) {
      console.error('Lỗi tải danh mục:', err);
    }
  };

  useEffect(() => {
    fetchSales();
    fetchProducts();
    fetchCategories();
    setCustomFilterDate(todayStr); // Gán mặc định ngày xem là hôm nay

    // Click outside listener
    function handleClickOutside(event) {
      if (productDropdownRef.current && !productDropdownRef.current.contains(event.target)) {
        setIsProductDropdownOpen(false);
      }
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target)) {
        setIsCategoryDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelectProduct = (productId) => {
    setFormData(prev => {
      const exist = prev.applicableProducts.includes(productId);
      return {
        ...prev,
        applicableProducts: exist
          ? prev.applicableProducts.filter(id => id !== productId)
          : [...prev.applicableProducts, productId]
      };
    });
  };

  const handleSelectCategory = (categoryId) => {
    setFormData(prev => {
      const exist = prev.applicableCategories.includes(categoryId);
      return {
        ...prev,
        applicableCategories: exist
          ? prev.applicableCategories.filter(id => id !== categoryId)
          : [...prev.applicableCategories, categoryId]
      };
    });
  };

  const handleClearAllProducts = () => {
    setFormData(prev => ({ ...prev, applicableProducts: [] }));
  };

  const handleClearAllCategories = () => {
    setFormData(prev => ({ ...prev, applicableCategories: [] }));
  };

  const handleResetForm = () => {
    setFormData({
      name: '',
      description: '',
      discountType: 'percent',
      discountValue: '',
      startDate: '',
      endDate: '',
      isActive: true,
      applicableProducts: [],
      applicableCategories: [],
      usageLimitType: 'unlimited',
      usageLimit: ''
    });
    setEditingId(null);
    setMessage({ text: '', type: '' });
    setProductSearch('');
    setCategorySearch('');
    setIsProductDropdownOpen(false);
    setIsCategoryDropdownOpen(false);
    setIsFormOpen(false);
  };

  const handleEditClick = (sale) => {
    setEditingId(sale._id);
    setFormData({
      name: sale.name,
      description: sale.description || '',
      discountType: sale.discountType,
      discountValue: sale.discountValue,
      startDate: new Date(sale.startDate).toISOString().split('T')[0],
      endDate: new Date(sale.endDate).toISOString().split('T')[0],
      isActive: sale.isActive,
      applicableProducts: sale.applicableProducts ? sale.applicableProducts.map(p => p._id || p) : [],
      applicableCategories: sale.applicableCategories ? sale.applicableCategories.map(c => c._id || c) : [],
      usageLimitType: sale.usageLimitType || 'unlimited',
      usageLimit: sale.usageLimit || ''
    });
    setMessage({ text: '', type: '' });
    setIsProductDropdownOpen(false);
    setIsCategoryDropdownOpen(false);
    setIsFormOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ text: '', type: '' });

    // 1. Kiểm tra mức giảm giá > 0
    const val = Number(formData.discountValue);
    if (isNaN(val) || val <= 0) {
      setMessage({ text: 'Mức giảm giá phải lớn hơn 0!', type: 'error' });
      setLoading(false);
      return;
    }

    // 2. Kiểm tra loại phần trăm không quá 100%
    if (formData.discountType === 'percent' && val > 100) {
      setMessage({ text: 'Phần trăm giảm giá không được vượt quá 100%!', type: 'error' });
      setLoading(false);
      return;
    }

    // 2.5. Kiểm tra quota giới hạn số lượng
    if (formData.usageLimitType === 'limited') {
      const limitVal = Number(formData.usageLimit);
      if (isNaN(limitVal) || limitVal <= 0) {
        setMessage({ text: 'Số lượng giới hạn sử dụng phải lớn hơn 0!', type: 'error' });
        setLoading(false);
        return;
      }
    }

    // 3. KIỂM TRA NGÀY TRONG QUÁ KHỨ (Bắt buộc không được ở quá khứ so với hôm nay)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(formData.startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(formData.endDate);
    end.setHours(0, 0, 0, 0);

    if (start < today) {
      setMessage({ text: 'Ngày bắt đầu không được nhỏ hơn ngày hôm nay!', type: 'error' });
      setLoading(false);
      return;
    }

    if (end < today) {
      setMessage({ text: 'Ngày kết thúc không được nhỏ hơn ngày hôm nay!', type: 'error' });
      setLoading(false);
      return;
    }

    if (end < start) {
      setMessage({ text: 'Ngày kết thúc phải lớn hơn hoặc bằng Ngày bắt đầu!', type: 'error' });
      setLoading(false);
      return;
    }

    // 4. Nếu áp dụng toàn shop -> cần xác nhận từ người dùng
    const isGlobal = formData.applicableProducts.length === 0 && formData.applicableCategories.length === 0;
    if (isGlobal) {
      const confirmGlobal = window.confirm(
        '⚠️ BẠN CHƯA CHỌN SẢN PHẨM HOẶC DANH MỤC CỤ THỂ NÀO.\n\nChiến dịch này sẽ được áp dụng cho TOÀN BỘ SẢN PHẨM hiện có trong cửa hàng!\nBạn có chắc chắn muốn phát động chương trình khuyến mãi toàn shop này không?'
      );
      if (!confirmGlobal) {
        setLoading(false);
        return;
      }
    }

    try {
      const token = localStorage.getItem('glassesToken');
      const url = editingId ? `/api/sales/${editingId}` : '/api/sales';
      const method = editingId ? 'PUT' : 'POST';

      const payload = {
        ...formData,
        usageLimit: formData.usageLimitType === 'limited' ? Number(formData.usageLimit) : null
      };

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (data.success) {
        setMessage({ text: data.message, type: 'success' });
        handleResetForm();
        fetchSales();
      } else {
        setMessage({ text: data.message, type: 'error' });
      }
    } catch (error) {
      setMessage({ text: 'Lỗi kết nối máy chủ!', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = async (saleId) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa vĩnh viễn chiến dịch khuyến mãi này?')) return;

    try {
      const token = localStorage.getItem('glassesToken');
      const res = await fetch(`/api/sales/${saleId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchSales();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert('Lỗi kết nối máy chủ!');
    }
  };

  const getCampaignStatusBadge = (sale) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(sale.startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(sale.endDate);
    end.setHours(0, 0, 0, 0);

    if (!sale.isActive) {
      return <span className="bg-gray-150 text-gray-500 border border-gray-300 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Đã Tắt</span>;
    }
    if (today < start) {
      return <span className="bg-amber-50 text-amber-600 border border-amber-200 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Sắp diễn ra</span>;
    }
    if (today > end) {
      return <span className="bg-red-50 text-red-500 border border-red-200 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Đã kết thúc</span>;
    }
    return <span className="bg-green-50 text-green-600 border border-green-200 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider animate-pulse flex items-center gap-1">🟢 Đang chạy</span>;
  };

  // Filters for Searchable Dropdowns
  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  const filteredCategories = categories.filter(c =>
    c.name.toLowerCase().includes(categorySearch.toLowerCase())
  );

  // Bộ lọc danh sách Sale nâng cao theo Ngày (Today / Upcoming / Ended / Custom Date)
  const filteredSales = sales.filter(sale => {
    // 1. Tìm kiếm theo Từ Khóa
    const matchesSearch = sale.name.toLowerCase().includes(saleSearch.toLowerCase()) ||
      (sale.description && sale.description.toLowerCase().includes(saleSearch.toLowerCase()));

    if (!matchesSearch) return false;

    // Chuẩn hóa ngày về đầu ngày để so sánh công bằng
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(sale.startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(sale.endDate);
    end.setHours(0, 0, 0, 0);

    // 2. Lọc theo Phân Loại Trạng Thái/Ngày
    if (activeFilter === 'all') {
      return true;
    }

    if (activeFilter === 'today') {
      return sale.isActive && start <= today && today <= end;
    }

    if (activeFilter === 'upcoming') {
      return sale.isActive && start > today;
    }

    if (activeFilter === 'ended') {
      return !sale.isActive || end < today;
    }

    if (activeFilter === 'customDate') {
      if (!customFilterDate) return true;
      const selected = new Date(customFilterDate);
      selected.setHours(0, 0, 0, 0);
      return sale.isActive && start <= selected && selected <= end;
    }

    return true;
  });

  return (
    <div className="min-h-screen bg-gray-55 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* HEADER AREA */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-2">
              <Percent className="w-8 h-8 text-blue-600 animate-pulse" /> Thiết lập Khuyến mãi
            </h1>
            <p className="text-gray-500 mt-1">Tạo các chiến dịch giảm giá, ưu đãi cho sản phẩm và danh mục kính.</p>
          </div>
          <button 
            type="button" 
            onClick={() => {
              handleResetForm();
              setIsFormOpen(true);
            }} 
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold px-6 py-3 rounded-2xl transition shadow-lg shadow-blue-600/20 active:scale-95 cursor-pointer text-sm"
          >
            <Plus className="w-5 h-5" /> Tạo khuyến mãi mới
          </button>
        </div>

        {/* CAMPAIGN LIST CONTAINER */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-gray-50">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Chiến dịch Khuyến mãi ({sales.length})</h2>
              <p className="text-xs text-gray-400 mt-1">Danh sách các chương trình giảm giá được phát động.</p>
            </div>
            <div className="relative">
              <input
                type="text"
                placeholder="Tìm theo tên chương trình..."
                className="pl-9 pr-8 py-2 bg-gray-50 border border-gray-150 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition text-xs w-full sm:w-60 font-medium text-gray-700"
                value={saleSearch}
                onChange={(e) => setSaleSearch(e.target.value)}
              />
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {/* TABS BỘ LỌC CHIẾN DỊCH KHUYẾN MÃI THEO NGÀY */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 bg-gray-55 p-2.5 rounded-2xl border border-gray-150/40">
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'all', label: 'Tất cả' },
                { id: 'today', label: 'Hôm nay' },
                { id: 'upcoming', label: 'Sắp diễn ra' },
                { id: 'ended', label: 'Đã kết thúc' },
                { id: 'customDate', label: 'Chọn ngày' }
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFilter(tab.id)}
                  className={`px-3.5 py-2 text-xs font-black rounded-xl transition-all cursor-pointer ${activeFilter === tab.id ? 'bg-blue-600 text-white shadow-md shadow-blue-600/10' : 'bg-white text-gray-600 border border-gray-200/50 hover:bg-gray-100'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeFilter === 'customDate' && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Xem theo ngày:</span>
                <input
                  type="date"
                  value={customFilterDate}
                  onChange={e => setCustomFilterDate(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-gray-250 rounded-xl outline-none text-xs font-bold text-gray-700 focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          {filteredSales.length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center justify-center gap-2 text-gray-400">
              <Percent className="w-12 h-12 text-gray-300 animate-bounce" />
              <p className="font-bold text-sm">Chưa có chiến dịch khuyến mãi nào được tạo hoặc khớp bộ lọc</p>
              <p className="text-xs text-gray-400">Hãy điều chỉnh bộ lọc hoặc tạo thêm chiến dịch nhé!</p>
            </div>
          ) : (
            <div className="overflow-x-auto mt-6 border border-gray-200 rounded-2xl">
              <table className="min-w-full divide-y divide-gray-200 text-left">
                <thead className="bg-gray-50/75">
                  <tr>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Tên chiến dịch / Mô tả</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Mức giảm</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Hiệu lực / Trạng thái</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Đối tượng áp dụng</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Lượt sử dụng / Còn lại</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-150">
                  {filteredSales.map((sale) => {
                    const startStr = new Date(sale.startDate).toLocaleDateString('vi-VN');
                    const endStr = new Date(sale.endDate).toLocaleDateString('vi-VN');

                    return (
                      <tr key={sale._id} className="hover:bg-gray-50/50 transition">
                        {/* Tên chiến dịch / Mô tả */}
                        <td className="px-6 py-4 max-w-[280px]">
                          <div className="font-black text-gray-900 text-sm truncate">{sale.name}</div>
                          <div className="text-gray-505 text-xs mt-1 leading-relaxed line-clamp-2" title={sale.description}>
                            {sale.description || 'Không có mô tả chi tiết.'}
                          </div>
                        </td>

                        {/* Mức giảm */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-black border ${
                            sale.discountType === 'percent' 
                              ? 'text-red-700 bg-red-50 border-red-150' 
                              : 'text-emerald-700 bg-emerald-50 border-emerald-150'
                          }`}>
                            {sale.discountType === 'percent' 
                              ? `Giảm ${sale.discountValue}%` 
                              : `Đồng giá ${sale.discountValue.toLocaleString('vi-VN')} đ`
                            }
                          </span>
                        </td>

                        {/* Hiệu lực / Trạng thái */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <div className="scale-95 origin-left">{getCampaignStatusBadge(sale)}</div>
                            <div className="text-[10px] text-gray-400 font-medium">
                              {startStr} - {endStr}
                            </div>
                          </div>
                        </td>

                        {/* Đối tượng áp dụng */}
                        <td className="px-6 py-4 max-w-[240px]">
                          <div className="space-y-1">
                            {sale.applicableProducts && sale.applicableProducts.length > 0 ? (
                              <div className="text-xs text-gray-800 font-medium truncate">
                                <span className="font-bold text-blue-600">Kính ({sale.applicableProducts.length}): </span>
                                {sale.applicableProducts.map(p => p.name).join(', ')}
                              </div>
                            ) : null}
                            {sale.applicableCategories && sale.applicableCategories.length > 0 ? (
                              <div className="text-xs text-gray-800 font-medium truncate">
                                <span className="font-bold text-indigo-600">Danh mục ({sale.applicableCategories.length}): </span>
                                {sale.applicableCategories.map(c => c.name).join(', ')}
                              </div>
                            ) : null}
                            {(!sale.applicableProducts || sale.applicableProducts.length === 0) && 
                             (!sale.applicableCategories || sale.applicableCategories.length === 0) ? (
                              <span className="text-xs text-gray-450 italic font-medium">Áp dụng toàn bộ shop</span>
                            ) : null}
                          </div>
                        </td>

                        {/* Lượt sử dụng / Còn lại */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-xs text-gray-700 font-medium">
                            {sale.usageLimitType === 'limited' ? (
                              <div className="space-y-0.5">
                                <div>Đã dùng: <strong className="text-gray-900">{sale.usedCount || 0}/{sale.usageLimit}</strong></div>
                                <div className="text-[10px]">
                                  Còn lại: {' '}
                                  <strong className={`${
                                    sale.usedCount >= sale.usageLimit 
                                      ? 'text-red-600' 
                                      : (sale.usedCount / sale.usageLimit) >= 0.8 
                                        ? 'text-orange-500' 
                                        : 'text-green-600'
                                  }`}>
                                    {Math.max(0, sale.usageLimit - (sale.usedCount || 0))}
                                  </strong>
                                </div>
                              </div>
                            ) : (
                              <span className="text-gray-450 italic text-[11px]">Vô hạn</span>
                            )}
                          </div>
                        </td>

                        {/* Thao tác */}
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end gap-2.5">
                            <button 
                              type="button"
                              onClick={() => handleEditClick(sale)} 
                              className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 border border-gray-150 rounded-xl transition cursor-pointer"
                              title="Chỉnh sửa"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button 
                              type="button"
                              onClick={() => handleDeleteClick(sale._id)} 
                              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 border border-gray-150 rounded-xl transition cursor-pointer"
                              title="Xóa chiến dịch"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* POPUP FORM MODAL: THÊM / SỬA CHIẾN DỊCH KHUYẾN MÃI */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          {/* Backdrop Overlay */}
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300"
            onClick={handleResetForm}
          ></div>

          {/* Modal Content Container */}
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <div className="relative transform overflow-hidden rounded-[32px] bg-white p-8 text-left shadow-2xl transition-all w-full max-w-lg border border-gray-150 flex flex-col max-h-[90vh]">
              
              {/* Close Button */}
              <button 
                type="button" 
                onClick={handleResetForm} 
                className="absolute top-6 right-6 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex-shrink-0 mb-6">
                <h2 className="text-2xl font-black text-gray-955 mb-1 flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-blue-600" />
                  {editingId ? 'Cập Nhật Khuyến Mãi' : 'Tạo Chiến Dịch Mới'}
                </h2>
                <p className="text-xs text-gray-500">Điền đầy đủ thông tin bên dưới để thiết lập chiến dịch giảm giá.</p>
              </div>

              {message.text && (
                <div className={`flex-shrink-0 p-3.5 rounded-2xl text-xs font-bold mb-4 text-center border ${
                  message.type === 'success' 
                    ? 'bg-green-50 text-green-700 border-green-150' 
                    : 'bg-red-50 text-red-700 border-red-150'
                }`}>
                  {message.text}
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex-grow flex flex-col min-h-0">
                <div className="flex-grow overflow-y-auto space-y-4 pr-1.5 pb-4">
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-gray-400" /> Tên Chiến dịch *
                    </label>
                    <input 
                      required 
                      type="text" 
                      placeholder="VD: Mừng hè rực rỡ 2026, Giảm giá cuối tuần..." 
                      value={formData.name} 
                      onChange={e => setFormData({ ...formData, name: e.target.value })} 
                      className="w-full px-4 py-3 rounded-xl border border-gray-250 focus:ring-2 focus:ring-blue-500 outline-none text-xs font-medium" 
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5">
                      Mô tả chi tiết
                    </label>
                    <textarea 
                      placeholder="VD: Áp dụng cho các mẫu kính thời trang hot nhất hè này..." 
                      rows="2" 
                      value={formData.description} 
                      onChange={e => setFormData({ ...formData, description: e.target.value })} 
                      className="w-full px-4 py-3 rounded-xl border border-gray-250 focus:ring-2 focus:ring-blue-500 outline-none text-xs font-medium resize-none"
                    ></textarea>
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5">
                        Loại Giảm Giá
                      </label>
                      <select 
                        value={formData.discountType} 
                        onChange={e => setFormData({ ...formData, discountType: e.target.value })} 
                        className="w-full px-3 py-3 rounded-xl border border-gray-255 focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold bg-white"
                      >
                        <option value="percent">Phần trăm (%)</option>
                        <option value="fixed">Tiền mặt (đ)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5">
                        {formData.discountType === 'percent' ? 'Mức Giảm (%) *' : 'Giá sau khi giảm (đ) *'}
                      </label>
                      <input 
                        required 
                        type="number" 
                        min="1" 
                        placeholder={formData.discountType === 'percent' ? 'VD: 15' : 'VD: 500000'} 
                        value={formData.discountValue} 
                        onChange={e => setFormData({ ...formData, discountValue: e.target.value })} 
                        className="w-full px-4 py-3 rounded-xl border border-gray-250 focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold" 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" /> Ngày bắt đầu *
                      </label>
                      <input 
                        required 
                        type="date" 
                        min={todayStr} 
                        value={formData.startDate} 
                        onChange={e => setFormData({ ...formData, startDate: e.target.value })} 
                        className="w-full px-3 py-3 rounded-xl border border-gray-255 focus:ring-2 focus:ring-blue-500 outline-none text-xs font-medium" 
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" /> Ngày kết thúc *
                      </label>
                      <input 
                        required 
                        type="date" 
                        min={todayStr} 
                        value={formData.endDate} 
                        onChange={e => setFormData({ ...formData, endDate: e.target.value })} 
                        className="w-full px-3 py-3 rounded-xl border border-gray-255 focus:ring-2 focus:ring-blue-500 outline-none text-xs font-medium" 
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3.5 bg-gray-55 rounded-2xl border border-gray-150/40">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Trạng thái kích hoạt</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={formData.isActive} 
                        onChange={e => setFormData({ ...formData, isActive: e.target.checked })} 
                        className="sr-only peer" 
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3.5 bg-gray-55 p-3.5 rounded-2xl border border-gray-150/40">
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5">
                        Giới hạn sử dụng
                      </label>
                      <select
                        value={formData.usageLimitType}
                        onChange={e => setFormData({ ...formData, usageLimitType: e.target.value })}
                        className="w-full px-3 py-3 rounded-xl border border-gray-250 focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold bg-white"
                      >
                        <option value="unlimited">Không giới hạn</option>
                        <option value="limited">Giới hạn số lượng</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5">
                        Số lượng tối đa
                      </label>
                      <input
                        type="number"
                        min="1"
                        disabled={formData.usageLimitType === 'unlimited'}
                        placeholder={formData.usageLimitType === 'unlimited' ? 'Vô hạn' : 'VD: 20'}
                        value={formData.usageLimit}
                        onChange={e => setFormData({ ...formData, usageLimit: e.target.value })}
                        className={`w-full px-4 py-3 rounded-xl border border-gray-255 focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold bg-white ${
                          formData.usageLimitType === 'unlimited' 
                            ? 'opacity-50 cursor-not-allowed bg-gray-100' 
                            : ''
                        }`}
                      />
                    </div>
                  </div>

                  {/* SEARCHABLE MULTI-SELECT DROPDOWN: CHỌN SẢN PHẨM KÍNH */}
                  <div className="space-y-1.5 relative" ref={productDropdownRef}>
                    <div className="flex justify-between items-center">
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-gray-400" /> Kính mắt áp dụng ({formData.applicableProducts.length})
                      </label>
                      {formData.applicableProducts.length > 0 && (
                        <button type="button" onClick={handleClearAllProducts} className="text-[9px] font-bold text-red-500 hover:text-red-700 transition">
                          Xóa tất cả
                        </button>
                      )}
                    </div>
                    <div
                      className="relative flex items-center bg-white border border-gray-255 rounded-xl cursor-pointer"
                      onClick={() => setIsProductDropdownOpen(true)}
                    >
                      <input
                        type="text"
                        placeholder="Gõ để tìm kiếm & chọn kính..."
                        value={productSearch}
                        onChange={e => {
                          setProductSearch(e.target.value);
                          setIsProductDropdownOpen(true);
                        }}
                        className="w-full pl-9 pr-8 py-3 text-xs outline-none rounded-xl font-medium"
                      />
                      <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 transition-transform duration-200" style={{ transform: isProductDropdownOpen ? 'rotate(180deg)' : 'none' }} />
                    </div>

                    {isProductDropdownOpen && (
                      <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto border border-gray-250 rounded-2xl p-2 bg-white shadow-2xl z-50 space-y-1">
                        {filteredProducts.map(prod => {
                          const isSelected = formData.applicableProducts.includes(prod._id);
                          return (
                            <button
                              type="button"
                              key={prod._id}
                              onClick={() => handleSelectProduct(prod._id)}
                              className={`w-full flex items-center justify-between p-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                                isSelected 
                                  ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200/30' 
                                  : 'hover:bg-gray-55 text-gray-700 bg-white border border-transparent'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}} // Handle inside parent button click
                                  className="rounded text-blue-600 focus:ring-blue-500" 
                                />
                                <span className="truncate">{prod.name} ({prod.price.toLocaleString('vi-VN')} đ)</span>
                              </div>
                              {isSelected && <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                            </button>
                          );
                        })}
                        {filteredProducts.length === 0 && <p className="text-center text-[10px] text-gray-400 py-6">Không tìm thấy kính nào</p>}
                      </div>
                    )}

                    {/* Tags/Chips Area for Products */}
                    {formData.applicableProducts.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1.5 max-h-24 overflow-y-auto">
                        {formData.applicableProducts.map(pId => {
                          const prodObj = products.find(p => p._id === pId);
                          if (!prodObj) return null;
                          return (
                            <span key={pId} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-750 text-[10px] font-black rounded-lg border border-blue-150/40">
                              <span className="max-w-[100px] truncate">{prodObj.name}</span>
                              <button type="button" onClick={() => handleSelectProduct(pId)} className="hover:bg-blue-200 rounded p-0.5 transition cursor-pointer">
                                <X className="w-3 h-3 text-blue-655" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* SEARCHABLE MULTI-SELECT DROPDOWN: CHỌN DANH MỤC KÍNH */}
                  <div className="space-y-1.5 relative" ref={categoryDropdownRef}>
                    <div className="flex justify-between items-center">
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                        <ListTree className="w-3.5 h-3.5 text-gray-400" /> Danh mục áp dụng ({formData.applicableCategories.length})
                      </label>
                      {formData.applicableCategories.length > 0 && (
                        <button type="button" onClick={handleClearAllCategories} className="text-[9px] font-bold text-red-500 hover:text-red-700 transition">
                          Xóa tất cả
                        </button>
                      )}
                    </div>
                    <div
                      className="relative flex items-center bg-white border border-gray-255 rounded-xl cursor-pointer"
                      onClick={() => setIsCategoryDropdownOpen(true)}
                    >
                      <input
                        type="text"
                        placeholder="Gõ để tìm kiếm & chọn danh mục..."
                        value={categorySearch}
                        onChange={e => {
                          setCategorySearch(e.target.value);
                          setIsCategoryDropdownOpen(true);
                        }}
                        className="w-full pl-9 pr-8 py-3 text-xs outline-none rounded-xl font-medium"
                      />
                      <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 transition-transform duration-200" style={{ transform: isCategoryDropdownOpen ? 'rotate(180deg)' : 'none' }} />
                    </div>

                    {isCategoryDropdownOpen && (
                      <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto border border-gray-250 rounded-2xl p-2 bg-white shadow-2xl z-50 space-y-1">
                        {filteredCategories.map(cat => {
                          const isSelected = formData.applicableCategories.includes(cat._id);
                          return (
                            <button
                              type="button"
                              key={cat._id}
                              onClick={() => handleSelectCategory(cat._id)}
                              className={`w-full flex items-center justify-between p-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                                isSelected 
                                  ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-200/30' 
                                  : 'hover:bg-gray-55 text-gray-700 bg-white border border-transparent'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}} // Handle inside parent button click
                                  className="rounded text-indigo-650 focus:ring-indigo-550" 
                                />
                                <span>{cat.name}</span>
                              </div>
                              {isSelected && <Check className="w-4 h-4 text-indigo-600 flex-shrink-0" />}
                            </button>
                          );
                        })}
                        {filteredCategories.length === 0 && <p className="text-center text-[10px] text-gray-400 py-6">Không tìm thấy danh mục</p>}
                      </div>
                    )}

                    {/* Tags/Chips Area for Categories */}
                    {formData.applicableCategories.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1.5 max-h-24 overflow-y-auto">
                        {formData.applicableCategories.map(cId => {
                          const catObj = categories.find(c => c._id === cId);
                          if (!catObj) return null;
                          return (
                            <span key={cId} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-705 text-[10px] font-black rounded-lg border border-indigo-150/40">
                              <span>{catObj.name}</span>
                              <button type="button" onClick={() => handleSelectCategory(cId)} className="hover:bg-indigo-200 rounded p-0.5 transition cursor-pointer">
                                <X className="w-3 h-3 text-indigo-700" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Sticky Action Footer */}
                <div className="flex-shrink-0 flex gap-3 pt-4 border-t border-gray-100 bg-white">
                  <button type="button" onClick={handleResetForm} className="flex-1 py-3 text-sm font-bold text-gray-750 bg-gray-100 hover:bg-gray-200 rounded-xl transition cursor-pointer">
                    Hủy
                  </button>
                  <button type="submit" disabled={loading} className="flex-1 py-3 text-sm text-white font-bold bg-blue-600 hover:bg-blue-700 rounded-xl transition shadow-lg shadow-blue-600/10 cursor-pointer">
                    {loading ? 'Đang gửi...' : editingId ? 'Lưu thay đổi' : 'Tạo Chiến Dịch'}
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
