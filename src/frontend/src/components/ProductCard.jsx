import React from 'react';
import { useNavigate } from 'react-router-dom';
import { View, ShoppingBag, Heart } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getCartKey } from '../utils/cartHelper';

export default function ProductCard({ 
  product, 
  showWishlistActions, 
  wishlistIds = new Set(), 
  onWishlistToggle 
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const is3DReady = product.arUrl && product.arUrl.trim() !== '';
  const isWishlisted = wishlistIds.has(product._id);

  const handleCardClick = () => {
    navigate(`/product/${product._id}`);
  };

  const handleBuyNow = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      alert('Vui lòng đăng nhập để thực hiện mua ngay!');
      navigate('/login');
      return;
    }

    const cartItemId = `${product._id}_std`;

    const newItem = {
      cartId: cartItemId,
      productId: product._id,
      name: product.name,
      price: product.discountPercent > 0 ? product.salePrice : product.price,
      originalPrice: product.discountPercent > 0 ? product.originalPrice : product.price,
      discountPercent: product.discountPercent || 0,
      salePrice: product.discountPercent > 0 ? product.salePrice : product.price,
      image: product.images && product.images.length > 0 ? product.images[0] : '/placeholder.png',
      hasPrescription: false,
      od: '',
      os: '',
      od_sph: null,
      od_cyl: null,
      od_axis: null,
      os_sph: null,
      os_cyl: null,
      os_axis: null,
      pd: null,
      rxDate: null,
      rxNote: '',
      prescriptionMode: 'none',
      quantity: 1
    };

    const cartKey = getCartKey();
    const cart = JSON.parse(localStorage.getItem(cartKey)) || [];
    const existIdx = cart.findIndex(item => item.cartId === newItem.cartId);
    if (existIdx !== -1) {
      // Keep or increment
    } else {
      cart.push(newItem);
    }

    localStorage.setItem(cartKey, JSON.stringify(cart));
    window.dispatchEvent(new Event('cartUpdated'));

    navigate('/checkout', { state: { selectedItems: [newItem.cartId] } });
  };

  return (
    <div 
      onClick={handleCardClick}
      className="group bg-white rounded-3xl p-5 shadow-sm hover:shadow-2xl hover:shadow-blue-900/10 transition-all duration-300 border border-gray-100 flex flex-col cursor-pointer relative h-full"
    >
      {showWishlistActions && (
        <button
          type="button"
          onClick={(event) => onWishlistToggle(event, product._id)}
          className="absolute top-4 right-4 z-30 w-11 h-11 rounded-full bg-white/95 border border-gray-100 shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition"
          aria-label={isWishlisted ? 'Bỏ yêu thích' : 'Thêm yêu thích'}
        >
          <Heart className={`w-5 h-5 ${isWishlisted ? 'fill-red-500 text-red-500' : 'text-gray-500'}`} />
        </button>
      )}
      <div className="absolute inset-0 bg-gray-900/10 z-10 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3 backdrop-blur-[2px]">
        <button 
          onClick={(e) => { e.stopPropagation(); handleCardClick(); }}
          className="bg-white text-gray-900 font-bold px-5 py-2.5 rounded-xl shadow-xl transform translate-y-4 group-hover:translate-y-0 transition-all flex items-center gap-2 hover:bg-gray-50 active:scale-95 text-sm"
        >
          <View className="w-4 h-4"/> Xem chi tiết
        </button>
        <button 
          onClick={handleBuyNow}
          className="bg-blue-600 text-white font-bold px-5 py-2.5 rounded-xl shadow-xl transform translate-y-4 group-hover:translate-y-0 transition-all flex items-center gap-2 hover:bg-blue-700 active:scale-95 text-sm"
        >
          <ShoppingBag className="w-4 h-4"/> Mua ngay
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
        <h3 className="text-lg font-bold text-gray-900 h-14 mb-2 line-clamp-2 leading-snug group-hover:text-blue-600 transition-colors">
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
}
