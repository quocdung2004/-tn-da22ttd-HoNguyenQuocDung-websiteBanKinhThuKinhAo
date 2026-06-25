import React, { useState, useEffect } from 'react';
import { MessageSquare, Star, Trash2, Search, Loader2, AlertCircle, Eye, CornerDownRight, Send, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function ReviewManager() {
  const { user } = useAuth();
  const isAdmin = user?.role === 1;

  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [ratingFilter, setRatingFilter] = useState('all');

  // State Modal xem chi tiết các đánh giá của 1 sản phẩm
  const [selectedProductGroup, setSelectedProductGroup] = useState(null);
  
  // State phản hồi
  const [replyTexts, setReplyTexts] = useState({});
  const [replyingId, setReplyingId] = useState(null);
  const [replySubmitting, setReplySubmitting] = useState(false);

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
        // Cập nhật state reviews
        setReviews(prev => prev.filter(r => r._id !== reviewId));
        // Cập nhật selectedProductGroup
        if (selectedProductGroup) {
          const updatedList = selectedProductGroup.reviews.filter(r => r._id !== reviewId);
          if (updatedList.length === 0) {
            setSelectedProductGroup(null);
          } else {
            const totalStars = updatedList.reduce((sum, r) => sum + r.rating, 0);
            setSelectedProductGroup({
              ...selectedProductGroup,
              reviews: updatedList,
              reviewsCount: updatedList.length,
              averageRating: (totalStars / updatedList.length).toFixed(1)
            });
          }
        }
      } else {
        alert(data.message || 'Xóa đánh giá thất bại.');
      }
    } catch (err) {
      console.error('Lỗi xóa đánh giá:', err);
      alert('Không thể kết nối đến máy chủ để xóa đánh giá.');
    }
  };

  const handleSendReply = async (reviewId) => {
    const replyText = replyTexts[reviewId] || '';
    if (!replyText.trim()) return alert('Vui lòng nhập nội dung phản hồi!');

    setReplySubmitting(true);
    try {
      const token = localStorage.getItem('glassesToken');
      const res = await fetch(`/api/reviews/${reviewId}/reply`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ reply: replyText })
      });
      const data = await res.json();
      if (data.success) {
        alert('Gửi phản hồi thành công!');
        setReviews(prev => prev.map(r => r._id === reviewId ? {
          ...r,
          reply: data.review.reply,
          replyBy: data.review.replyBy,
          replyAt: data.review.replyAt
        } : r));

        if (selectedProductGroup) {
          setSelectedProductGroup(prev => ({
            ...prev,
            reviews: prev.reviews.map(r => r._id === reviewId ? {
              ...r,
              reply: data.review.reply,
              replyBy: data.review.replyBy,
              replyAt: data.review.replyAt
            } : r)
          }));
        }

        setReplyingId(null);
      } else {
        alert(data.message || 'Gửi phản hồi thất bại.');
      }
    } catch (err) {
      console.error('Lỗi phản hồi:', err);
      alert('Không thể kết nối đến máy chủ.');
    } finally {
      setReplySubmitting(false);
    }
  };

  const handleDeleteReply = async (reviewId) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa phản hồi này không?')) {
      return;
    }

    try {
      const token = localStorage.getItem('glassesToken');
      const res = await fetch(`/api/reviews/${reviewId}/reply`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ reply: '' })
      });
      const data = await res.json();
      if (data.success) {
        alert('Đã xóa phản hồi!');
        setReviews(prev => prev.map(r => r._id === reviewId ? {
          ...r,
          reply: undefined,
          replyBy: undefined,
          replyAt: undefined
        } : r));

        if (selectedProductGroup) {
          setSelectedProductGroup(prev => ({
            ...prev,
            reviews: prev.reviews.map(r => r._id === reviewId ? {
              ...r,
              reply: undefined,
              replyBy: undefined,
              replyAt: undefined
            } : r)
          }));
        }
      } else {
        alert(data.message || 'Xóa phản hồi thất bại.');
      }
    } catch (err) {
      console.error('Lỗi xóa phản hồi:', err);
      alert('Không thể kết nối đến máy chủ.');
    }
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  // Gom nhóm & Lọc
  const getGroupedProducts = () => {
    const reviewsByProduct = {};
    
    // Lọc trước khi gom nhóm
    reviews.forEach(review => {
      const prodId = review.productId?._id;
      if (!prodId) return;

      // Check search term
      const matchesSearch = 
        (review.productId?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (review.userDisplayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (review.comment || '').toLowerCase().includes(searchTerm.toLowerCase());

      // Check rating filter
      const matchesRating = ratingFilter === 'all' || review.rating.toString() === ratingFilter;

      if (!matchesSearch || !matchesRating) return;

      if (!reviewsByProduct[prodId]) {
        reviewsByProduct[prodId] = {
          product: review.productId,
          reviewsList: [],
          totalStars: 0
        };
      }
      reviewsByProduct[prodId].reviewsList.push(review);
      reviewsByProduct[prodId].totalStars += review.rating;
    });

    return Object.values(reviewsByProduct).map(group => ({
      product: group.product,
      reviewsCount: group.reviewsList.length,
      averageRating: (group.totalStars / group.reviewsList.length).toFixed(1),
      reviews: group.reviewsList
    }));
  };

  const groupedProducts = getGroupedProducts();

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
              ? 'Giao diện quản lý đánh giá của khách hàng dành cho Admin (Xem, Xóa & Phản hồi)' 
              : 'Giao diện xem và phản hồi đánh giá của khách hàng dành cho Nhân viên (Staff)'}
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

        {/* Danh sách các sản phẩm đã nhận đánh giá */}
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
        ) : groupedProducts.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-[32px] p-12 text-center text-gray-400 font-medium shadow-sm">
            Không tìm thấy sản phẩm nào được đánh giá phù hợp.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {groupedProducts.map((group) => (
              <div 
                key={group.product._id} 
                className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  {/* Ảnh và tên sản phẩm */}
                  <div className="flex gap-4 items-center mb-6">
                    {group.product.images?.[0] ? (
                      <img 
                        src={group.product.images[0]} 
                        className="w-16 h-16 object-cover rounded-2xl border p-0.5 shrink-0" 
                        alt={group.product.name} 
                      />
                    ) : (
                      <div className="w-16 h-16 bg-gray-50 rounded-2xl border flex items-center justify-center text-gray-300 shrink-0">
                        <Star className="w-8 h-8" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <span className="text-xs text-gray-400 font-bold block uppercase tracking-wider">Sản phẩm</span>
                      <h3 className="font-extrabold text-gray-900 block truncate text-base" translate="no">
                        {group.product.name}
                      </h3>
                      <p className="text-xs text-blue-600 font-bold">{group.product.price?.toLocaleString('vi-VN')}đ</p>
                    </div>
                  </div>

                  {/* Thống kê sao trung bình */}
                  <div className="bg-gray-50 rounded-2xl p-4 flex justify-between items-center mb-4">
                    <div>
                      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Đánh giá TB</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-lg font-black text-gray-800">{group.averageRating}</span>
                        <div className="flex text-amber-400">
                          <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Số lượt nhận xét</span>
                      <span className="text-sm font-extrabold text-blue-600 mt-0.5 block">{group.reviewsCount} đánh giá</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedProductGroup(group)}
                  className="w-full mt-2 py-3 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-2xl font-bold transition flex items-center justify-center gap-2"
                >
                  <Eye className="w-4 h-4" /> Xem chi tiết & Phản hồi
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ===================== MODAL XEM CHI TIẾT & PHẢN HỒI ĐÁNH GIÁ SẢN PHẨM ===================== */}
        {selectedProductGroup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto relative animate-in zoom-in-95 duration-200 flex flex-col">
              
              {/* Header Modal */}
              <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {selectedProductGroup.product.images?.[0] && (
                    <img 
                      src={selectedProductGroup.product.images[0]} 
                      className="w-12 h-12 object-cover rounded-xl border" 
                      alt="" 
                    />
                  )}
                  <div>
                    <h2 className="text-base font-black text-gray-900 truncate max-w-md" translate="no">
                      Đánh giá cho: {selectedProductGroup.product.name}
                    </h2>
                    <p className="text-xs text-gray-500 font-medium flex items-center gap-1.5 mt-0.5">
                      <span>Điểm trung bình: {selectedProductGroup.averageRating} ⭐</span>
                      <span>•</span>
                      <span>Có {selectedProductGroup.reviewsCount} nhận xét</span>
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setSelectedProductGroup(null);
                    setReplyingId(null);
                  }} 
                  className="p-2 bg-gray-100 text-gray-600 rounded-full hover:bg-red-100 hover:text-red-600 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body Modal (Danh sách nhận xét của sản phẩm này) */}
              <div className="p-6 overflow-y-auto flex-1 space-y-6">
                {selectedProductGroup.reviews.map((review) => (
                  <div key={review._id} className="border-b border-gray-100 pb-6 last:border-0 last:pb-0">
                    
                    {/* Người dùng & Số sao */}
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-bold text-gray-800 text-sm" translate="no">
                          {review.userDisplayName} ({review.username})
                        </h4>
                        <span className="text-[10px] text-gray-400 font-bold block mt-0.5">
                          Đăng lúc: {new Date(review.createdAt).toLocaleString('vi-VN')}
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

                    {/* Nội dung nhận xét */}
                    <p className="text-gray-600 text-sm font-medium bg-gray-50 p-3 rounded-2xl border border-gray-100/50 mb-3" translate="no">
                      “{review.comment}”
                    </p>

                    {/* Phản hồi hiện có (nếu có) */}
                    {review.reply ? (
                      <div className="ml-6 mt-3 bg-blue-50/50 border border-blue-100 p-4 rounded-2xl">
                        <div className="flex justify-between items-start mb-1">
                          <div className="flex items-center gap-1.5">
                            <CornerDownRight className="w-4 h-4 text-blue-500" />
                            <span className="text-xs font-black text-blue-700 uppercase tracking-wider">
                              Phản hồi từ {review.replyBy}
                            </span>
                            {review.replyAt && (
                              <span className="text-[9px] text-gray-400 font-bold">
                                ({new Date(review.replyAt).toLocaleString('vi-VN')})
                              </span>
                            )}
                          </div>
                          
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setReplyTexts({ ...replyTexts, [review._id]: review.reply });
                                setReplyingId(review._id);
                              }}
                              className="text-[10px] text-blue-600 hover:text-blue-800 font-bold"
                            >
                              Sửa
                            </button>
                            <button
                              onClick={() => handleDeleteReply(review._id)}
                              className="text-[10px] text-red-500 hover:text-red-700 font-bold"
                            >
                              Xóa
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-gray-700 font-medium leading-relaxed" translate="no">
                          {review.reply}
                        </p>
                      </div>
                    ) : (
                      // Nếu chưa có phản hồi và đang không trong chế độ gõ
                      replyingId !== review._id && (
                        <div className="flex justify-end mt-2">
                          <button
                            onClick={() => setReplyingId(review._id)}
                            className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold px-3 py-1.5 rounded-xl transition"
                          >
                            Viết phản hồi
                          </button>
                        </div>
                      )
                    )}

                    {/* Form gõ phản hồi */}
                    {replyingId === review._id && (
                      <div className="ml-6 mt-3 bg-gray-50 border border-gray-200 p-4 rounded-2xl space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                          Nội dung phản hồi của cửa hàng
                        </label>
                        <textarea
                          placeholder="Nhập câu trả lời phản hồi khách hàng (VD: Cảm ơn bạn đã ủng hộ shop nhé...)"
                          rows="2"
                          value={replyTexts[review._id] || ''}
                          onChange={(e) => setReplyTexts({ ...replyTexts, [review._id]: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            disabled={replySubmitting}
                            onClick={() => setReplyingId(null)}
                            className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl text-xs font-bold transition"
                          >
                            Hủy
                          </button>
                          <button
                            disabled={replySubmitting}
                            onClick={() => handleSendReply(review._id)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1"
                          >
                            {replySubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3 h-3" />}
                            Gửi phản hồi
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Button xóa đánh giá gốc (chỉ Admin mới được xóa) */}
                    {isAdmin && (
                      <div className="flex justify-end mt-4 pt-3 border-t border-gray-50">
                        <button
                          onClick={() => handleDelete(review._id)}
                          className="flex items-center gap-1 text-[11px] text-red-500 hover:text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg transition font-extrabold"
                        >
                          <Trash2 className="w-3 h-3" /> Xóa nhận xét này
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
