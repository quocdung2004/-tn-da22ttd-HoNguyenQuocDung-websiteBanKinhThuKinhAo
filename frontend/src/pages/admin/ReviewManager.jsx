import React, { useState, useEffect } from 'react';
import { MessageSquare, Star, Trash2, Search, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function ReviewManager() {
  const { user } = useAuth();
  const isAdmin = user?.role === 1;

  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [ratingFilter, setRatingFilter] = useState('all');

  const fetchReviews = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('glassesToken');
      const res = await fetch('/api/reviews', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setReviews(data.reviews);
      } else {
        throw new Error(data.message || 'Không thể lấy dữ liệu đánh giá.');
      }
    } catch (err) {
      console.error('Lỗi tải danh sách đánh giá:', err);
      setError('Lỗi tải danh sách đánh giá từ server.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (reviewId) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa đánh giá này không? Hành động này sẽ cập nhật lại điểm đánh giá trung bình của sản phẩm.')) {
      return;
    }

    try {
      const token = localStorage.getItem('glassesToken');
      const res = await fetch(`/api/reviews/${reviewId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Xóa đánh giá thành công!');
        setReviews(prev => prev.filter(r => r._id !== reviewId));
      } else {
        alert(data.message || 'Xóa đánh giá thất bại.');
      }
    } catch (err) {
      console.error('Lỗi xóa đánh giá:', err);
      alert('Không thể kết nối đến máy chủ để xóa đánh giá.');
    }
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  const filteredReviews = reviews.filter(r => {
    const matchesSearch = 
      (r.productId?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.userDisplayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.comment || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRating = ratingFilter === 'all' || r.rating.toString() === ratingFilter;

    return matchesSearch && matchesRating;
  });

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Tiêu đề */}
        <div className="mb-8">
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <MessageSquare className="w-8 h-8 text-blue-600" /> Quản lý Đánh giá sản phẩm
          </h1>
          <p className="text-gray-500 mt-1">
            {isAdmin 
              ? 'Giao diện quản lý đánh giá của khách hàng dành cho Admin (Xem & Xóa)' 
              : 'Giao diện xem đánh giá của khách hàng dành cho Nhân viên (Staff - Chỉ Xem)'}
          </p>
        </div>

        {/* Tìm kiếm & Lọc */}
        <div className="bg-white p-4 rounded-3xl border border-gray-100 flex flex-col md:flex-row gap-4 justify-between items-center shadow-sm mb-6">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Tìm theo sản phẩm, người đánh giá, nhận xét..." 
              className="w-full pl-11 pr-4 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="w-full md:w-auto">
            <select
              value={ratingFilter}
              onChange={(e) => setRatingFilter(e.target.value)}
              className="px-4 py-3 bg-gray-50 text-gray-700 font-bold rounded-2xl outline-none border-none cursor-pointer w-full md:w-auto text-sm"
            >
              <option value="all">Tất cả số sao</option>
              <option value="5">★★★★★ 5 Sao</option>
              <option value="4">★★★★☆ 4 Sao</option>
              <option value="3">★★★☆☆ 3 Sao</option>
              <option value="2">★★☆☆☆ 2 Sao</option>
              <option value="1">★☆☆☆☆ 1 Sao</option>
            </select>
          </div>
        </div>

        {/* Nội dung danh sách */}
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-gray-100 shadow-sm">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-2" />
            <span className="text-gray-500 font-bold text-sm">Đang tải danh sách đánh giá...</span>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-3xl flex items-center gap-3">
            <AlertCircle className="w-6 h-6 shrink-0" />
            <span className="font-bold">{error}</span>
          </div>
        ) : filteredReviews.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-[32px] p-12 text-center text-gray-400 font-medium shadow-sm">
            Không tìm thấy đánh giá nào phù hợp.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredReviews.map((review) => (
              <div 
                key={review._id} 
                className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  {/* Sản phẩm */}
                  <div className="flex gap-3 items-center mb-4 border-b border-gray-50 pb-4">
                    {review.productId?.images?.[0] ? (
                      <img 
                        src={review.productId.images[0]} 
                        className="w-12 h-12 object-cover rounded-xl border p-0.5 shrink-0" 
                        alt={review.productId.name} 
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gray-50 rounded-xl border flex items-center justify-center text-gray-300 shrink-0">
                        <Star className="w-6 h-6" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <span className="text-xs text-gray-400 font-bold block uppercase tracking-wider">Sản phẩm</span>
                      <span className="font-extrabold text-gray-900 block truncate text-sm" translate="no">
                        {review.productId?.name || 'Sản phẩm đã xóa'}
                      </span>
                    </div>
                  </div>

                  {/* Chi tiết đánh giá */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs text-gray-400 font-bold block uppercase tracking-wider">Người đánh giá</span>
                        <span className="font-bold text-gray-800 text-sm" translate="no">
                          {review.userDisplayName} ({review.username})
                        </span>
                      </div>
                      <div className="flex items-center text-amber-400">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-3.5 h-3.5 ${
                              star <= review.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200'
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-xs text-gray-400 font-bold block uppercase tracking-wider mb-1">Nhận xét</span>
                      <p className="text-gray-600 text-sm leading-relaxed font-medium bg-gray-50 p-3 rounded-2xl border border-gray-100/50" translate="no">
                        “{review.comment}”
                      </p>
                    </div>
                  </div>
                </div>

                {/* Footer card */}
                <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-55">
                  <span className="text-[10px] text-gray-400 font-bold">
                    Ngày đăng: {new Date(review.createdAt).toLocaleString('vi-VN')}
                  </span>
                  
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(review._id)}
                      className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-xl transition font-black"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Xóa vi phạm
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
