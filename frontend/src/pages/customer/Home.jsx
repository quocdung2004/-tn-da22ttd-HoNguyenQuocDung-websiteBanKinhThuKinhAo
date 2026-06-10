import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { View, ArrowRight, Sparkles, ShoppingBag, ShieldCheck, Loader2, Box, ChevronLeft, ChevronRight, Heart } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';

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

  const handleWishlistToggle = async (event, productId) => {
    event.preventDefault();
    event.stopPropagation();

    if (!user) {
      alert('Vui long dang nhap de su dung danh sach yeu thich!');
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
        alert(data.message || 'Khong the cap nhat danh sach yeu thich!');
        return;
      }

      setWishlistIds((currentIds) => {
        const nextIds = new Set(currentIds);
        if (isWishlisted) nextIds.delete(productId);
        else nextIds.add(productId);
        return nextIds;
      });
    } catch (error) {
      console.error('Loi cap nhat wishlist:', error);
      alert('Loi ket noi may chu khi cap nhat yeu thich!');
    }
  };

  const activeBanner = banners[activeBannerIndex];

  return (
    <div className="bg-gray-50 min-h-screen pb-20">
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
                  Kham pha ngay <ArrowRight className="w-4 h-4" />
                </div>
              </div>

              {banners.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={goToPreviousBanner}
                    className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/85 text-gray-900 flex items-center justify-center shadow-lg hover:bg-white transition"
                    aria-label="Banner truoc"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={goToNextBanner}
                    className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/85 text-gray-900 flex items-center justify-center shadow-lg hover:bg-white transition"
                    aria-label="Banner tiep theo"
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
                        aria-label={`Chuyen den banner ${index + 1}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      )}
      
      {/* ================= HERO BANNER (CHIA 2 CỘT) ================= */}
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
                onClick={() => document.getElementById('product-section').scrollIntoView({ behavior: 'smooth' })}
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

      {/* ================= PRODUCT GRID (DANH SÁCH SẢN PHẨM THẬT TỪ DB) ================= */}
      <div id="product-section" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-20">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-4">
          <div>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight">Bộ sưu tập Kính</h2>
            <p className="text-gray-500 mt-2 text-lg">Đeo thử trực tiếp trên khuôn mặt qua Camera của bạn</p>
          </div>
          <button className="flex items-center text-blue-600 font-bold hover:text-blue-800 transition bg-blue-50 px-4 py-2 rounded-full">
            Xem tất cả {products.length} mẫu <ArrowRight className="ml-2 w-4 h-4" />
          </button>
        </div>

        {/* XỬ LÝ TRẠNG THÁI LOADING */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Loader2 className="w-12 h-12 animate-spin mb-4 text-blue-500" />
            <p className="font-bold tracking-widest uppercase">Đang tải kho hàng...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20 text-gray-400 font-bold">
            Chưa có sản phẩm nào trong kho. Hãy vào trang Admin để thêm kính nhé!
          </div>
        ) : (
          /* LƯỚI SẢN PHẨM */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
            {products.map((product) => {
              // Kiểm tra xem kính này có link 3D không
              const is3DReady = product.arUrl && product.arUrl.trim() !== '';

              return (
                <div 
                  key={product._id} // Dùng ID của MongoDB
                  onClick={() => navigate(`/product/${product._id}`)} // Chuyển hướng mang theo ID thật
                  className="group bg-white rounded-3xl p-5 shadow-sm hover:shadow-2xl hover:shadow-blue-900/10 transition-all duration-300 border border-gray-100 flex flex-col cursor-pointer relative"
                >
                  {showWishlistActions && (
                    <button
                      type="button"
                      onClick={(event) => handleWishlistToggle(event, product._id)}
                      className="absolute top-4 right-4 z-30 w-11 h-11 rounded-full bg-white/95 border border-gray-100 shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition"
                      aria-label={wishlistIds.has(product._id) ? 'Bo yeu thich' : 'Them yeu thich'}
                    >
                      <Heart className={`w-5 h-5 ${wishlistIds.has(product._id) ? 'fill-red-500 text-red-500' : 'text-gray-500'}`} />
                    </button>
                  )}
                  <div className="absolute inset-0 bg-gray-900/5 z-10 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
                    <button className="bg-white text-gray-900 font-bold px-6 py-3 rounded-xl shadow-xl transform translate-y-4 group-hover:translate-y-0 transition-transform flex items-center gap-2">
                      <View className="w-5 h-5"/> Xem chi tiết
                    </button>
                  </div>

                    <div className="relative aspect-square rounded-2xl overflow-hidden bg-gray-50 mb-5 p-4 flex items-center justify-center">
                      {/* Lấy ảnh đầu tiên trong mảng images */}
                      <img 
                        src={product.images && product.images.length > 0 ? product.images[0] : '/placeholder.png'} 
                        alt={product.name} 
                        className="w-full h-full object-cover rounded-xl group-hover:scale-110 transition-transform duration-500 relative z-0 mix-blend-multiply"
                      />
                      
                      {/* NẾU CÓ FILE 3D THÌ HIỆN BADGE NÀY */}
                      {is3DReady && (
                        <div className="absolute top-3 left-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-[10px] font-black px-3 py-1.5 rounded-full flex items-center shadow-lg uppercase tracking-wider z-10">
                          <span className="w-2 h-2 bg-white rounded-full mr-2 animate-ping absolute"></span>
                          <span className="w-2 h-2 bg-white rounded-full mr-2"></span>
                          Hỗ trợ 3D AR
                        </div>
                      )}

                      {/* BADGE BÁO GIẢM GIÁ */}
                      {product.discountPercent > 0 && (
                        <div className="absolute top-3 right-3 bg-gradient-to-r from-red-500 to-rose-600 text-white text-[10px] font-black px-3 py-1.5 rounded-full flex flex-col items-center shadow-lg uppercase tracking-wider z-10 animate-bounce">
                          <div>- {product.discountPercent}% OFF</div>
                          {product.remainingSaleQuantity !== null && product.remainingSaleQuantity > 0 && (
                            <div className="text-[8px] opacity-90 mt-0.5 lowercase font-medium">Còn {product.remainingSaleQuantity} suất</div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col flex-1 relative z-0">
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-2 line-clamp-1">
                        {/* Lấy tên Brand và Category từ dữ liệu populate */}
                        {product.brand?.name || "Kính Mắt"} • {product.category?.name || "Thời Trang"}
                      </p>
                      <h3 className="text-xl font-bold text-gray-900 mb-2 line-clamp-2 leading-snug group-hover:text-blue-600 transition-colors">
                        {product.name}
                      </h3>
                      
                      <div className="mt-auto pt-4 border-t border-gray-100 flex items-center justify-between">
                        <div className="flex flex-col">
                          {product.discountPercent > 0 ? (
                            <>
                              <span className="text-[10px] text-gray-400 line-through font-medium leading-none mb-1">
                                {product.originalPrice.toLocaleString('vi-VN')} đ
                              </span>
                              <span className="text-red-500 font-black text-xl leading-none">
                                {product.salePrice.toLocaleString('vi-VN')} đ
                              </span>
                            </>
                          ) : (
                            <span className="text-blue-600 font-black text-xl leading-none">
                              {product.price.toLocaleString('vi-VN')} đ
                            </span>
                          )}
                        </div>
                        
                        <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                          <ShoppingBag className="w-5 h-5" />
                        </div>
                      </div>
                    </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
