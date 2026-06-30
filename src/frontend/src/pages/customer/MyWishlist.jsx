import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, Loader2, ShoppingBag, Trash2, Eye } from 'lucide-react';

export default function MyWishlist() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState(null);

  const formatPrice = (value) => Number(value || 0).toLocaleString('vi-VN');

  const fetchWishlist = async () => {
    const token = localStorage.getItem('glassesToken');
    if (!token) {
      navigate('/login');
      return;
    }

    try {
      const res = await fetch('/api/wishlist', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setItems(data.items || []);
      }
    } catch (error) {
      console.error('Lỗi tải wishlist:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWishlist();
  }, []);

  const handleRemove = async (productId) => {
    const token = localStorage.getItem('glassesToken');
    setRemovingId(productId);

    try {
      const res = await fetch(`/api/wishlist/${productId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setItems((currentItems) => currentItems.filter((item) => item.product?._id !== productId));
      } else {
        alert(data.message || 'Không thể xóa sản phẩm yêu thích!');
      }
    } catch (error) {
      console.error('Lỗi xóa wishlist:', error);
      alert('Lỗi kết nối máy chủ khi xóa yêu thích!');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 bg-red-50 text-red-600 px-4 py-2 rounded-full font-black text-xs uppercase tracking-widest mb-4">
              <Heart className="w-4 h-4 fill-red-500" />
              Yêu thích
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-gray-900">Danh sách yêu thích</h1>
            <p className="text-gray-500 mt-2">Những mẫu kính bạn đã lưu để xem lại sau.</p>
          </div>
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 bg-gray-900 text-white px-5 py-3 rounded-2xl font-bold hover:bg-blue-600 transition"
          >
            <ShoppingBag className="w-5 h-5" />
            Tiếp tục mua sắm
          </Link>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <Loader2 className="w-12 h-12 animate-spin text-blue-500 mb-4" />
            <p className="font-bold uppercase tracking-widest">Đang tải danh sách...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm py-20 px-6 text-center">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-5">
              <Heart className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black text-gray-900 mb-2">Chưa có sản phẩm yêu thích</h2>
            <p className="text-gray-500 mb-6">Hãy bấm trái tim trên sản phẩm bạn quan tâm.</p>
            <Link to="/" className="inline-flex bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-blue-700 transition">
              Xem sản phẩm
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {items.map((item) => {
              const product = item.product;
              if (!product) {
                return (
                  <div key={item._id} className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm">
                    <div className="aspect-square rounded-2xl bg-gray-100 mb-4 flex items-center justify-center text-gray-400 font-bold text-sm">
                      Sản phẩm không tồn tại
                    </div>
                    <button
                      type="button"
                      disabled
                      className="w-full bg-gray-100 text-gray-400 py-3 rounded-2xl font-bold cursor-not-allowed"
                    >
                      Không khả dụng
                    </button>
                  </div>
                );
              }

              const hasSale = product.discountPercent > 0;
              const productImage = product.images && product.images.length > 0 ? product.images[0] : '/placeholder.png';
              const inactive = product.isActive === false;

              return (
                <div key={item._id} className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm hover:shadow-xl transition flex flex-col">
                  <div className="relative aspect-square rounded-2xl overflow-hidden bg-gray-50 mb-5 p-4">
                    <img src={productImage} alt={product.name} className="w-full h-full object-cover rounded-xl mix-blend-multiply" />
                    {hasSale && (
                      <div className="absolute top-3 left-3 bg-red-500 text-white text-[10px] font-black px-3 py-1.5 rounded-full">
                        -{product.discountPercent}%
                      </div>
                    )}
                    {inactive && (
                      <div className="absolute bottom-3 left-3 right-3 bg-gray-900/90 text-white text-[10px] font-black px-3 py-2 rounded-xl text-center">
                        Không còn kinh doanh
                      </div>
                    )}
                  </div>

                  <div className="flex-1">
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-2 line-clamp-1">
                      {product.brand?.name || 'Dung Glasses'}
                    </p>
                    <h2 className="text-lg font-black text-gray-900 line-clamp-2 min-h-[56px]">{product.name}</h2>
                    <div className="mt-4">
                      {hasSale ? (
                        <>
                          <div className="text-xs text-gray-400 line-through font-medium">{formatPrice(product.originalPrice)} đ</div>
                          <div className="text-xl font-black text-red-500">{formatPrice(product.salePrice)} đ</div>
                        </>
                      ) : (
                        <div className="text-xl font-black text-blue-600">{formatPrice(product.price)} đ</div>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-[1fr_auto] gap-2">
                    <Link
                      to={`/product/${product._id}`}
                      className="inline-flex items-center justify-center gap-2 bg-gray-900 text-white py-3 rounded-2xl font-bold hover:bg-blue-600 transition"
                    >
                      <Eye className="w-4 h-4" />
                      Chi tiết
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleRemove(product._id)}
                      disabled={removingId === product._id}
                      className="w-12 h-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition disabled:opacity-60"
                      aria-label="Bỏ yêu thích"
                    >
                      {removingId === product._id ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                    </button>
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
