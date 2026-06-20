import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { View, ArrowRight, Sparkles, ShoppingBag, ShieldCheck, Loader2, Box, ChevronLeft, ChevronRight, Heart, Search } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import ProductCard from '../../components/ProductCard';

export default function Home() {
  const navigate = useNavigate();
  const { socket } = useSocket();
  const { user } = useAuth();
  
  // STATE LƯU DỮ LIỆU TỪ BACKEND
  const [products, setProducts] = useState([]);
  const [banners, setBanners] = useState([]);
  const [activeBannerIndex, setActiveBannerIndex] = useState(0);
  const [wishlistIds, setWishlistIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const showWishlistActions = !user || user.role === 0;

  // STATE CHO THANH TÌM KIẾM
  const [searchQuery, setSearchQuery] = useState('');

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      if (data.success) {
        setProducts(data.products);
      }
    } catch (error) {
      console.error("Lỗi tải danh sách sản phẩm:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBanners = async () => {
    try {
      const res = await fetch('/api/banners');
      const data = await res.json();
      if (data.success) {
        setBanners(data.banners || []);
        setActiveBannerIndex(0);
      }
    } catch (error) {
      console.error('Loi tai banner trang chu:', error);
    }
  };

  const fetchWishlist = async () => {
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
      console.error('Loi tai danh sach yeu thich:', error);
    }
  };

  // GỌI API LẤY DANH SÁCH SẢN PHẨM KHI VỪA MỞ TRANG
  useEffect(() => {
    fetchProducts();
    fetchBanners();
  }, []);

  useEffect(() => {
    fetchWishlist();
  }, [user]);

  useEffect(() => {
    if (banners.length <= 1) return undefined;

    const timer = setInterval(() => {
      setActiveBannerIndex((currentIndex) => (currentIndex + 1) % banners.length);
    }, 5000);

    return () => clearInterval(timer);
  }, [banners.length]);

  // LẮNG NGHE SỰ KIỆN CẬP NHẬT TỒN KHO REALTIME
  useEffect(() => {
    if (!socket) return;

    const handleStockUpdate = (payload) => {
      console.log('⚡ [Socket.IO Client] Nhận tín hiệu cập nhật tồn kho sỉ/lẻ:', payload);
      fetchProducts();
    };

    socket.on('product:stockUpdated', handleStockUpdate);

    return () => {
      socket.off('product:stockUpdated', handleStockUpdate);
    };
  }, [socket]);

  const goToPreviousBanner = (event) => {
    event.stopPropagation();
    setActiveBannerIndex((currentIndex) => (
      currentIndex === 0 ? banners.length - 1 : currentIndex - 1
    ));
  };

  const goToNextBanner = (event) => {
    event.stopPropagation();
    setActiveBannerIndex((currentIndex) => (currentIndex + 1) % banners.length);
  };

  const handleBannerClick = (targetUrl) => {
    if (!targetUrl) return;
    if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
      window.location.href = targetUrl;
      return;
    }
    navigate(targetUrl);
  };

  // P2: DÙNG USECALLBACK CHO HANDLEWISHLISTTOGGLE
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
        alert(data.message || 'Không thể cập nhật danh sách yêu thích!');
        return;
      }

      setWishlistIds((currentIds) => {
        const nextIds = new Set(currentIds);
        if (isWishlisted) nextIds.delete(productId);
        else nextIds.add(productId);
        return nextIds;
      });
    } catch (error) {
      console.error('Lỗi cập nhật wishlist:', error);
      alert('Lỗi kết nối máy chủ khi cập nhật yêu thích!');
    }
  }, [user, navigate, wishlistIds]);

  // P0: DÙNG USEMEMO CHO TOÀN BỘ DỮ LIỆU KHÁM PHÁ SẢN PHẨM PHỤ THUỘC VÀO [PRODUCTS]
  const promoProducts = useMemo(() => {
    return products.filter(p => p.discountPercent > 0).slice(0, 8);
  }, [products]);

  const arProducts = useMemo(() => {
    return products.filter(p => p.arUrl && p.arUrl.trim() !== '').slice(0, 8);
  }, [products]);

  const newProducts = useMemo(() => {
    return [...products]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 8);
  }, [products]);

  // P1: HÀM XỬ LÝ SEARCH SUBMIT ĐIỀU HƯỚNG THỰC TẾ
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const activeBanner = banners[activeBannerIndex];

  return (
    <div className="bg-gray-50 min-h-screen pb-20">
      {/* ================= 1. BANNER SLIDER (GIỮ NGUYÊN) ================= */}
      {activeBanner && (
        <section className="bg-white border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleBannerClick(activeBanner.targetUrl)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleBannerClick(activeBanner.targetUrl);
              }}
              className="relative aspect-[16/8] sm:aspect-[16/6] lg:aspect-[16/5] rounded-3xl overflow-hidden bg-gray-900 shadow-xl cursor-pointer group"
            >
              <img
                src={activeBanner.imageUrl}
                alt={activeBanner.title}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-gray-950/75 via-gray-950/35 to-transparent" />
              <div className="absolute inset-y-0 left-0 flex flex-col justify-center px-6 sm:px-10 lg:px-14 max-w-2xl">
                <p className="text-xs sm:text-sm font-black uppercase tracking-widest text-blue-200 mb-3">
                  Banner
                </p>
                <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white leading-tight">
                  {activeBanner.title}
                </h2>
                {activeBanner.subtitle && (
                  <p className="mt-3 text-sm sm:text-lg text-white/85 line-clamp-2 max-w-xl">
                    {activeBanner.subtitle}
                  </p>
                )}
                <div className="mt-5 inline-flex w-fit items-center gap-2 bg-white text-gray-900 px-5 py-3 rounded-2xl font-black text-sm shadow-lg">
                  Khám phá ngay <ArrowRight className="w-4 h-4" />
                </div>
              </div>

              {banners.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={goToPreviousBanner}
                    className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/85 text-gray-900 flex items-center justify-center shadow-lg hover:bg-white transition"
                    aria-label="Banner trước"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={goToNextBanner}
                    className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/85 text-gray-900 flex items-center justify-center shadow-lg hover:bg-white transition"
                    aria-label="Banner tiếp theo"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
                    {banners.map((banner, index) => (
                      <button
                        key={banner._id}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setActiveBannerIndex(index);
                        }}
                        className={`h-2 rounded-full transition-all ${index === activeBannerIndex ? 'w-8 bg-white' : 'w-2 bg-white/50 hover:bg-white/80'}`}
                        aria-label={`Chuyển đến banner ${index + 1}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ================= 2. HERO AR SECTION (GIỮ NGUYÊN) ================= */}
      <div className="bg-white border-b border-gray-100 overflow-hidden relative">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-blue-50/50 blur-3xl -z-10"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[300px] h-[300px] rounded-full bg-indigo-50/50 blur-3xl -z-10"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 flex flex-col md:flex-row items-center gap-12 z-10 relative">
          
          {/* Cột trái: Chữ và Nút bấm */}
          <div className="md:w-1/2 flex flex-col items-center md:items-start text-center md:text-left">
            <div className="inline-flex items-center space-x-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-full mb-6 border border-blue-100">
              <Sparkles className="w-5 h-5 animate-pulse" />
              <span className="text-xs font-black tracking-widest uppercase">Công nghệ 3D AR 2026</span>
            </div>
            
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 tracking-tight leading-[1.1] mb-6">
              Tìm kiếm chiếc kính hoàn hảo <br className="hidden lg:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                ngay tại nhà của bạn
              </span>
            </h1>
            
            <p className="text-lg text-gray-600 mb-10 max-w-lg leading-relaxed">
              Trải nghiệm công nghệ thử kính 3D thực tế ảo (AR) độc quyền. 
              Mở camera, ướm thử hàng trăm mẫu kính và biết chính xác chiếc nào sinh ra là dành cho khuôn mặt bạn.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
              <button 
                onClick={() => {
                  const el = document.getElementById('promo-section') || document.getElementById('ar-section') || document.getElementById('new-arrivals-section');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                className="bg-gray-900 text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-blue-600 transition flex items-center justify-center gap-2 shadow-xl hover:-translate-y-1"
              >
                <View className="w-6 h-6" /> Thử kính ngay
              </button>
              
              <Link 
                to="/my-prescription"
                className="bg-white text-gray-900 border-2 border-gray-200 px-8 py-4 rounded-2xl font-bold text-lg hover:border-gray-900 transition flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-6 h-6 text-gray-400" /> Cập nhật độ cận
              </Link>
            </div>
          </div>

          {/* Cột phải: Hình ảnh minh họa */}
          <div className="md:w-1/2 w-full flex justify-center relative">
            <div className="relative w-full max-w-md aspect-square bg-gradient-to-br from-blue-100 to-indigo-50 rounded-[3rem] p-8 flex items-center justify-center shadow-inner border border-white">
              <img 
                src="https://images.unsplash.com/photo-1591076482161-42ce6da69f67?q=80&w=800&auto=format&fit=crop" 
                alt="Người mẫu đeo kính" 
                className="w-full h-full object-cover rounded-[2rem] shadow-2xl transform rotate-3 hover:rotate-0 transition duration-500"
              />
              <div className="absolute -bottom-6 -left-6 bg-white p-4 rounded-2xl shadow-xl border border-gray-100 flex items-center gap-4 animate-bounce">
                <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center">
                  <Box className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">Trải nghiệm</p>
                  <p className="font-black text-gray-900">AR 3D Đỉnh Cao</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ================= 3. THANH TÌM KIẾM LỚN NẰM GIỮA TRANG ================= */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mt-12">
        <form 
          onSubmit={handleSearchSubmit}
          className="relative bg-white/90 backdrop-blur-md rounded-3xl shadow-xl border border-gray-100 p-2.5 flex items-center gap-2 group focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all duration-300"
        >
          <div className="pl-4 text-gray-400 group-focus-within:text-blue-600 transition-colors">
            <Search className="w-6 h-6" />
          </div>
          <input 
            type="text" 
            placeholder="Tìm kiếm sản phẩm hoặc thương hiệu kính mắt..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full py-4 px-2 outline-none bg-transparent text-gray-800 font-bold placeholder-gray-400 text-lg"
          />
          <button 
            type="submit" 
            className="bg-gray-900 hover:bg-blue-600 active:scale-95 text-white px-8 py-4 rounded-2xl font-bold transition-all duration-300 shadow-md shadow-gray-900/10 hover:shadow-blue-500/20"
          >
            Tìm kiếm
          </button>
        </form>
      </div>

      {/* XỬ LÝ TRẠNG THÁI LOADING */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <Loader2 className="w-12 h-12 animate-spin mb-4 text-blue-500" />
          <p className="font-bold tracking-widest uppercase text-sm">Đang tải kho hàng...</p>
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-24 text-gray-400 font-bold max-w-7xl mx-auto px-4">
          Chưa có sản phẩm nào trong kho. Hãy vào trang Admin để thêm kính nhé!
        </div>
      ) : (
        /* LƯỚI KHÁM PHÁ SẢN PHẨM */
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-20 space-y-24">
          
          {/* ================= 4. SECTION "ĐANG KHUYẾN MÃI" ================= */}
          {promoProducts.length > 0 && (
            <section id="promo-section" className="relative">
              <div className="flex justify-between items-end mb-8 border-b border-gray-100 pb-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 bg-red-50 text-red-600 px-3.5 py-1.5 rounded-full font-black text-xs uppercase tracking-wider mb-2">
                    <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                    Hot Deals
                  </div>
                  <h2 className="text-3xl font-black text-gray-900 tracking-tight">Đang Khuyến Mãi</h2>
                  <p className="text-sm text-gray-500 mt-1">Các mẫu kính mắt cao cấp đang được áp dụng mức giá ưu đãi nhất</p>
                </div>
                <button 
                  onClick={() => navigate('/products?isSale=true')}
                  className="group flex items-center gap-1 text-blue-600 hover:text-blue-800 font-bold transition-all text-sm bg-blue-50 hover:bg-blue-100/80 px-4 py-2 rounded-full"
                >
                  Xem tất cả <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

              {/* P1: TỐI ƯU RESPONSIVE MOBILE SỬ DỤNG GRID-COLS-2 */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
                {promoProducts.map((product) => (
                  <ProductCard 
                    key={product._id} 
                    product={product} 
                    showWishlistActions={showWishlistActions} 
                    wishlistIds={wishlistIds} 
                    onWishlistToggle={handleWishlistToggle} 
                  />
                ))}
              </div>
            </section>
          )}

          {/* ================= 5. SECTION "HỖ TRỢ THỬ KÍNH AR" ================= */}
          {arProducts.length > 0 && (
            <section id="ar-section" className="relative">
              <div className="flex justify-between items-end mb-8 border-b border-gray-100 pb-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-600 px-3.5 py-1.5 rounded-full font-black text-xs uppercase tracking-wider mb-2">
                    <Box className="w-3.5 h-3.5" />
                    AR Try-On
                  </div>
                  <h2 className="text-3xl font-black text-gray-900 tracking-tight">Hỗ Trợ Thử Kính AR</h2>
                  <p className="text-sm text-gray-500 mt-1">Trải nghiệm đeo thử kính ảo trực quan bằng camera của bạn ngay tại chỗ</p>
                </div>
                <button 
                  onClick={() => navigate('/products?isAR=true')}
                  className="group flex items-center gap-1 text-blue-600 hover:text-blue-800 font-bold transition-all text-sm bg-blue-50 hover:bg-blue-100/80 px-4 py-2 rounded-full"
                >
                  Xem tất cả <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

              {/* P1: TỐI ƯU RESPONSIVE MOBILE SỬ DỤNG GRID-COLS-2 */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
                {arProducts.map((product) => (
                  <ProductCard 
                    key={product._id} 
                    product={product} 
                    showWishlistActions={showWishlistActions} 
                    wishlistIds={wishlistIds} 
                    onWishlistToggle={handleWishlistToggle} 
                  />
                ))}
              </div>
            </section>
          )}

          {/* ================= 6. SECTION "SẢN PHẨM MỚI" ================= */}
          {newProducts.length > 0 && (
            <section id="new-arrivals-section" className="relative">
              <div className="flex justify-between items-end mb-8 border-b border-gray-100 pb-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 bg-green-50 text-green-600 px-3.5 py-1.5 rounded-full font-black text-xs uppercase tracking-wider mb-2">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping"></span>
                    New Arrivals
                  </div>
                  <h2 className="text-3xl font-black text-gray-900 tracking-tight">Sản Phẩm Mới</h2>
                  <p className="text-sm text-gray-500 mt-1">Những mẫu kính mắt thời thượng vừa cập bến cửa hàng của chúng tôi</p>
                </div>
                <button 
                  onClick={() => navigate('/products?sort=newest')}
                  className="group flex items-center gap-1 text-blue-600 hover:text-blue-800 font-bold transition-all text-sm bg-blue-50 hover:bg-blue-100/80 px-4 py-2 rounded-full"
                >
                  Xem tất cả <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

              {/* P1: TỐI ƯU RESPONSIVE MOBILE SỬ DỤNG GRID-COLS-2 */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
                {newProducts.map((product) => (
                  <ProductCard 
                    key={product._id} 
                    product={product} 
                    showWishlistActions={showWishlistActions} 
                    wishlistIds={wishlistIds} 
                    onWishlistToggle={handleWishlistToggle} 
                  />
                ))}
              </div>
            </section>
          )}

          {/* ================= 7. NÚT "XEM TẤT CẢ SẢN PHẨM" ================= */}
          <div className="flex justify-center pt-8">
            <button 
              onClick={() => navigate('/products')}
              className="inline-flex items-center gap-2 bg-gray-950 hover:bg-blue-600 active:scale-95 text-white px-10 py-5 rounded-3xl font-extrabold text-lg transition-all duration-300 shadow-xl shadow-gray-900/10 hover:shadow-blue-500/20"
            >
              Xem tất cả sản phẩm <ArrowRight className="w-5 h-5" />
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
