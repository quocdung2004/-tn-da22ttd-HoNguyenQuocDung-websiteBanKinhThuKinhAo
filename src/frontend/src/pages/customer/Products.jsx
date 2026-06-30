import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ProductCard from '../../components/ProductCard';
import { 
  Search, 
  SlidersHorizontal, 
  RotateCcw, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  Box, 
  DollarSign, 
  Loader2, 
  Tag, 
  Check 
} from 'lucide-react';

export default function Products() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // STATE LƯU DỮ LIỆU SẢN PHẨM & META FILTERS
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [wishlistIds, setWishlistIds] = useState(new Set());
  
  // STATE ĐIỀU KHIỂN UI
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ totalProducts: 0, totalPages: 1, currentPage: 1, limit: 12 });
  const showWishlistActions = !user || user.role === 0;

  // STATE PHỤ TRỢ CHO NHẬP GIÁ THỦ CÔNG
  const [inputMinPrice, setInputMinPrice] = useState(searchParams.get('minPrice') || '');
  const [inputMaxPrice, setInputMaxPrice] = useState(searchParams.get('maxPrice') || '');

  // ĐỒNG BỘ SEARCH INPUT NỘI BỘ
  const [localSearch, setLocalSearch] = useState(searchParams.get('search') || '');

  // 1. TẢI DỮ LIỆU DANH MỤC VÀ THƯƠNG HIỆU (GỌI 1 LẦN KHI MOUNT)
  useEffect(() => {
    const fetchFilterMeta = async () => {
      try {
        const [catRes, brandRes] = await Promise.all([
          fetch('/api/categories'),
          fetch('/api/brands')
        ]);
        const catData = await catRes.json();
        const brandData = await brandRes.json();
        if (catData.success) setCategories(catData.categories || []);
        if (brandData.success) setBrands(brandData.brands || []);
      } catch (err) {
        console.error("Lỗi tải thông tin bộ lọc:", err);
      }
    };
    fetchFilterMeta();
  }, []);

  // 2. TẢI DANH SÁCH WISHLIST (NẾU ĐÃ ĐĂNG NHẬP)
  const fetchWishlist = useCallback(async () => {
    const token = localStorage.getItem('glassesToken');
    if (!token || !user || user.role !== 0) {
      setWishlistIds(new Set());
      return;
    }
    try {
      const res = await fetch('/api/wishlist', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        const nextIds = new Set((data.items || []).map((item) => item.product?._id).filter(Boolean));
        setWishlistIds(nextIds);
      }
    } catch (error) {
      console.error('Lỗi tải danh sách yêu thích:', error);
    }
  }, [user]);

  useEffect(() => {
    fetchWishlist();
  }, [fetchWishlist]);

  // 3. TẢI SẢN PHẨM THEO SEARCH PARAMS TRÊN URL
  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      try {
        const query = new URLSearchParams();
        const search = searchParams.get('search');
        const category = searchParams.get('category');
        const brand = searchParams.get('brand');
        const minPrice = searchParams.get('minPrice');
        const maxPrice = searchParams.get('maxPrice');
        const isAR = searchParams.get('isAR');
        const isSale = searchParams.get('isSale');
        const sort = searchParams.get('sort');
        const page = searchParams.get('page') || '1';
        const gender = searchParams.get('gender');

        if (search) query.append('search', search);
        if (category) query.append('category', category);
        if (brand) query.append('brand', brand);
        if (minPrice) query.append('minPrice', minPrice);
        if (maxPrice) query.append('maxPrice', maxPrice);
        if (isAR) query.append('isAR', isAR);
        if (isSale) query.append('isSale', isSale);
        if (sort) query.append('sort', sort);
        if (gender) query.append('gender', gender);
        query.append('page', page);
        query.append('limit', '12');

        const res = await fetch(`/api/products/shop?${query.toString()}`);
        const data = await res.json();
        if (data.success) {
          setProducts(data.data.products || []);
          setPagination(data.data.pagination || { totalProducts: 0, totalPages: 1, currentPage: 1, limit: 12 });
        }
      } catch (err) {
        console.error("Lỗi gọi API Shop:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();

    // Đồng bộ lại input search local khi URL thay đổi bên ngoài
    setLocalSearch(searchParams.get('search') || '');
    setInputMinPrice(searchParams.get('minPrice') || '');
    setInputMaxPrice(searchParams.get('maxPrice') || '');
  }, [searchParams]);

  // 4. LOGIC TOGGLE WISHLIST SỬ DỤNG USECALLBACK
  const handleWishlistToggle = useCallback(async (event, productId) => {
    event.preventDefault();
    event.stopPropagation();

    if (!user) {
      alert('Vui lòng đăng nhập để sử dụng danh sách yêu thích!');
      navigate('/login');
      return;
    }
    if (user.role !== 0) return;

    const token = localStorage.getItem('glassesToken');
    const isWishlisted = wishlistIds.has(productId);

    try {
      const res = await fetch(`/api/wishlist/${productId}`, {
        method: isWishlisted ? 'DELETE' : 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (!data.success) {
        alert(data.message || 'Không thể cập nhật yêu thích!');
        return;
      }

      setWishlistIds((currentIds) => {
        const nextIds = new Set(currentIds);
        if (isWishlisted) nextIds.delete(productId);
        else nextIds.add(productId);
        return nextIds;
      });
    } catch (error) {
      console.error('Lỗi toggle wishlist:', error);
    }
  }, [user, navigate, wishlistIds]);

  // 5. CẬP NHẬT PARAM LÊN URL (SINGLE SOURCE OF TRUTH)
  const updateSearchParam = (key, value) => {
    const newParams = new URLSearchParams(searchParams);
    if (value === null || value === undefined || value === '') {
      newParams.delete(key);
    } else {
      newParams.set(key, value);
    }
    // Khi thay đổi bất cứ bộ lọc nào (trừ phân trang), reset trang về 1
    if (key !== 'page') {
      newParams.set('page', '1');
    }
    setSearchParams(newParams);
  };

  const handleClearFilters = () => {
    setSearchParams({});
    setInputMinPrice('');
    setInputMaxPrice('');
    setLocalSearch('');
  };

  const handlePriceApply = (e) => {
    e.preventDefault();
    const newParams = new URLSearchParams(searchParams);
    if (inputMinPrice) newParams.set('minPrice', inputMinPrice);
    else newParams.delete('minPrice');

    if (inputMaxPrice) newParams.set('maxPrice', inputMaxPrice);
    else newParams.delete('maxPrice');

    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const handleLocalSearchSubmit = (e) => {
    e.preventDefault();
    updateSearchParam('search', localSearch.trim());
  };

  // KHOẢNG GIÁ ĐỊNH SẴN GỢI Ý
  const pricePresets = [
    { label: 'Dưới 100K', min: '', max: '100000' },
    { label: '100K - 500K', min: '100000', max: '500000' },
    { label: 'Trên 500K', min: '500000', max: '' }
  ];

  const handlePricePresetClick = (preset) => {
    const newParams = new URLSearchParams(searchParams);
    if (preset.min) newParams.set('minPrice', preset.min);
    else newParams.delete('minPrice');

    if (preset.max) newParams.set('maxPrice', preset.max);
    else newParams.delete('maxPrice');

    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  return (
    <div className="bg-gray-50 min-h-screen py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* TIÊU ĐỀ TRANG MUA SẮM */}
        <div className="mb-10 text-center md:text-left">
          <h1 className="text-4xl font-black text-gray-900 tracking-tight">Cửa hàng Kính Mắt</h1>
          <p className="text-gray-500 mt-2 text-base">Khám phá hàng trăm mẫu kính thời thượng được trang bị công nghệ AR 3D</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* ================= 1. SIDEBAR BỘ LỌC (CHIẾM 1/4) ================= */}
          <aside className="w-full lg:w-1/4 flex flex-col gap-6">
            
            {/* HỘP BỘ LỌC CHÍNH */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col gap-6 sticky top-24">
              <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                <div className="flex items-center gap-2 font-black text-gray-900 text-lg">
                  <SlidersHorizontal className="w-5 h-5 text-blue-600" />
                  Bộ lọc tìm kiếm
                </div>
                <button 
                  onClick={handleClearFilters}
                  className="text-xs font-bold text-gray-400 hover:text-red-500 transition flex items-center gap-1 bg-gray-50 hover:bg-red-50 px-3 py-1.5 rounded-full"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Xóa lọc
                </button>
              </div>

              {/* SEARCH BOX TRONG SIDEBAR */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-black uppercase tracking-wider text-gray-400">Từ khóa</label>
                <form onSubmit={handleLocalSearchSubmit} className="relative">
                  <input 
                    type="text" 
                    placeholder="Tìm tên kính, thương hiệu..." 
                    value={localSearch}
                    onChange={(e) => setLocalSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 rounded-2xl border border-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-semibold text-gray-800"
                  />
                  <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                </form>
              </div>

              {/* LỌC DANH MỤC */}
              <div className="flex flex-col gap-3">
                <label className="text-xs font-black uppercase tracking-wider text-gray-400">Danh mục</label>
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => updateSearchParam('category', '')}
                    className={`flex items-center justify-between px-4 py-2.5 rounded-2xl text-sm font-bold text-left transition ${!searchParams.get('category') ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
                  >
                    Tất cả danh mục
                    {!searchParams.get('category') && <Check className="w-4 h-4" />}
                  </button>
                  {categories.map((cat) => {
                    const isActive = searchParams.get('category') === cat._id;
                    return (
                      <button
                        key={cat._id}
                        onClick={() => updateSearchParam('category', cat._id)}
                        className={`flex items-center justify-between px-4 py-2.5 rounded-2xl text-sm font-bold text-left transition ${isActive ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
                      >
                        {cat.name}
                        {isActive && <Check className="w-4 h-4" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* LỌC THƯƠNG HIỆU */}
              <div className="flex flex-col gap-3">
                <label className="text-xs font-black uppercase tracking-wider text-gray-400">Thương hiệu</label>
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => updateSearchParam('brand', '')}
                    className={`flex items-center justify-between px-4 py-2.5 rounded-2xl text-sm font-bold text-left transition ${!searchParams.get('brand') ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
                  >
                    Tất cả thương hiệu
                    {!searchParams.get('brand') && <Check className="w-4 h-4" />}
                  </button>
                  {brands.map((br) => {
                    const isActive = searchParams.get('brand') === br._id;
                    return (
                      <button
                        key={br._id}
                        onClick={() => updateSearchParam('brand', br._id)}
                        className={`flex items-center justify-between px-4 py-2.5 rounded-2xl text-sm font-bold text-left transition ${isActive ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
                      >
                        {br.name}
                        {isActive && <Check className="w-4 h-4" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* LỌC GIỚI TÍNH */}
              <div className="flex flex-col gap-3">
                <label className="text-xs font-black uppercase tracking-wider text-gray-400">Đối tượng</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'Tất cả', value: '' },
                    { label: 'Nam', value: 'nam' },
                    { label: 'Nữ', value: 'nu' },
                    { label: 'Unisex', value: 'unisex' }
                  ].map((item) => {
                    const isActive = (searchParams.get('gender') || '') === item.value;
                    return (
                      <button
                        key={item.value}
                        onClick={() => updateSearchParam('gender', item.value)}
                        className={`text-xs px-3.5 py-2 rounded-2xl font-bold transition border ${isActive ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20' : 'bg-gray-50 text-gray-600 border-gray-100 hover:bg-gray-100'}`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* LỌC GIÁ */}
              <div className="flex flex-col gap-3">
                <label className="text-xs font-black uppercase tracking-wider text-gray-400">Khoảng giá (VNĐ)</label>
                
                {/* GỢI Ý KHOẢNG GIÁ */}
                <div className="flex flex-wrap gap-2 mb-1">
                  {pricePresets.map((preset, idx) => {
                    const isPresetSelected = searchParams.get('minPrice') === preset.min && searchParams.get('maxPrice') === preset.max;
                    return (
                      <button
                        key={idx}
                        onClick={() => handlePricePresetClick(preset)}
                        className={`text-xs px-3 py-1.5 rounded-xl font-bold transition border ${isPresetSelected ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20' : 'bg-gray-50 text-gray-600 border-gray-100 hover:bg-gray-100'}`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                <form onSubmit={handlePriceApply} className="flex items-center gap-2">
                  <div className="relative w-1/2">
                    <input 
                      type="number" 
                      placeholder="Tối thiểu"
                      value={inputMinPrice}
                      onChange={(e) => setInputMinPrice(e.target.value)}
                      className="w-full pl-8 pr-2 py-2.5 bg-gray-50 border border-gray-100 text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold text-gray-800"
                    />
                    <DollarSign className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  </div>
                  <span className="text-gray-300 text-xs">—</span>
                  <div className="relative w-1/2">
                    <input 
                      type="number" 
                      placeholder="Tối đa"
                      value={inputMaxPrice}
                      onChange={(e) => setInputMaxPrice(e.target.value)}
                      className="w-full pl-8 pr-2 py-2.5 bg-gray-50 border border-gray-100 text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold text-gray-800"
                    />
                    <DollarSign className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  </div>
                  <button 
                    type="submit"
                    className="bg-gray-900 text-white px-3 py-2.5 rounded-xl text-xs font-bold hover:bg-blue-600 transition"
                  >
                    Lọc
                  </button>
                </form>
              </div>

              {/* LỌC NHANH (AR / SALE) */}
              <div className="flex flex-col gap-3 pt-4 border-t border-gray-100">
                <label className="text-xs font-black uppercase tracking-wider text-gray-400">Lọc nhanh</label>
                <div className="flex flex-col gap-2">
                  <button 
                    onClick={() => updateSearchParam('isAR', searchParams.get('isAR') === 'true' ? '' : 'true')}
                    className={`flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold border transition ${searchParams.get('isAR') === 'true' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-gray-50 border-gray-50 text-gray-600 hover:bg-gray-100/70'}`}
                  >
                    <Box className="w-4 h-4 text-indigo-500" />
                    Chỉ hiển thị kính 3D AR
                  </button>
                  <button 
                    onClick={() => updateSearchParam('isSale', searchParams.get('isSale') === 'true' ? '' : 'true')}
                    className={`flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold border transition ${searchParams.get('isSale') === 'true' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-gray-50 border-gray-50 text-gray-600 hover:bg-gray-100/70'}`}
                  >
                    <Tag className="w-4 h-4 text-red-500" />
                    Kính đang giảm giá
                  </button>
                </div>
              </div>

            </div>
          </aside>

          {/* ================= 2. KHỐI NỘI DUNG SẢN PHẨM (CHIẾM 3/4) ================= */}
          <main className="w-full lg:w-3/4 flex flex-col gap-6">
            
            {/* THANH ĐIỀU KHIỂN SẮP XẾP */}
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="text-sm text-gray-500 font-bold">
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" /> Đang tìm kiếm sản phẩm...
                  </span>
                ) : (
                  `Tìm thấy ${pagination.totalProducts} sản phẩm kính mắt`
                )}
              </div>
              
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <label className="text-xs font-black uppercase text-gray-400 whitespace-nowrap">Sắp xếp:</label>
                <select 
                  value={searchParams.get('sort') || 'newest'}
                  onChange={(e) => updateSearchParam('sort', e.target.value)}
                  className="w-full sm:w-auto bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-800"
                >
                  <option value="newest">Mới nhất</option>
                  <option value="priceAsc">Giá tăng dần</option>
                  <option value="priceDesc">Giá giảm dần</option>
                  <option value="bestSeller">Bán chạy nhất</option>
                </select>
              </div>
            </div>

            {/* HIỂN THỊ DANH SÁCH HOẶC SKELETON */}
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {[...Array(8)].map((_, index) => (
                  <div key={index} className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm flex flex-col animate-pulse">
                    <div className="aspect-square bg-gray-100 rounded-2xl mb-5"></div>
                    <div className="h-3 bg-gray-100 rounded w-1/3 mb-3"></div>
                    <div className="h-5 bg-gray-100 rounded w-3/4 mb-3"></div>
                    <div className="mt-auto pt-4 border-t border-gray-50 flex items-center justify-between">
                      <div className="h-6 bg-gray-100 rounded w-1/2"></div>
                      <div className="w-10 h-10 bg-gray-100 rounded-full"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="bg-white rounded-3xl p-16 text-center shadow-sm border border-gray-100 flex flex-col items-center justify-center">
                <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4">
                  <SlidersHorizontal className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">Không tìm thấy kính phù hợp</h3>
                <p className="text-gray-400 text-sm max-w-sm mb-6">Vui lòng điều chỉnh hoặc xóa bớt các bộ lọc để tìm thấy sản phẩm kính mắt.</p>
                <button 
                  onClick={handleClearFilters}
                  className="bg-gray-900 hover:bg-blue-600 text-white font-bold px-6 py-3 rounded-2xl transition"
                >
                  Xóa bộ lọc
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {products.map((product) => (
                  <ProductCard 
                    key={product._id} 
                    product={product} 
                    showWishlistActions={showWishlistActions} 
                    wishlistIds={wishlistIds} 
                    onWishlistToggle={handleWishlistToggle} 
                  />
                ))}
              </div>
            )}

            {/* BỘ PHÂN TRANG (PAGINATION) */}
            {!loading && pagination.totalPages > 1 && (
              <nav className="flex justify-center items-center gap-1.5 mt-10">
                <button
                  onClick={() => updateSearchParam('page', Math.max(1, pagination.currentPage - 1).toString())}
                  disabled={pagination.currentPage === 1}
                  className="w-10 h-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-gray-500 cursor-pointer disabled:cursor-not-allowed"
                  aria-label="Trang trước"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                {[...Array(pagination.totalPages)].map((_, idx) => {
                  const pNum = idx + 1;
                  const isCurrent = pagination.currentPage === pNum;
                  return (
                    <button
                      key={pNum}
                      onClick={() => updateSearchParam('page', pNum.toString())}
                      className={`w-10 h-10 rounded-xl font-bold text-sm transition flex items-center justify-center cursor-pointer ${isCurrent ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25 border border-blue-600' : 'bg-white border border-gray-100 text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
                    >
                      {pNum}
                    </button>
                  );
                })}

                <button
                  onClick={() => updateSearchParam('page', Math.min(pagination.totalPages, pagination.currentPage + 1).toString())}
                  disabled={pagination.currentPage === pagination.totalPages}
                  className="w-10 h-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-gray-500 cursor-pointer disabled:cursor-not-allowed"
                  aria-label="Trang tiếp theo"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </nav>
            )}

          </main>

        </div>
      </div>
    </div>
  );
}
