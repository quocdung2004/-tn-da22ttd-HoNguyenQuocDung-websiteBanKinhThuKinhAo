import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getCartKey } from '../../utils/cartHelper';
import {
  Camera, ShoppingCart, ShieldCheck, ChevronLeft, Edit3, X, Loader2, Box, CheckCircle2, Sparkles, Star, Heart
} from 'lucide-react';
import VirtualTryOn from './VirtualTryOn';
import { useAuth } from '../../context/AuthContext';
import ProductCard from '../../components/ProductCard';

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // ==========================================
  // 1. QUẢN LÝ TRẠNG THÁI (STATE)
  // ==========================================
  const [product, setProduct] = useState(null);
  const [allArProducts, setAllArProducts] = useState([]);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const [prescriptionOption, setPrescriptionOption] = useState('none'); // 'none' | 'saved' | 'custom'
  const [savedPrescription, setSavedPrescription] = useState(null);
  const [prescriptionForm, setPrescriptionForm] = useState({
    rightEye: { sphere: '', cylinder: '', axis: '' },
    leftEye: { sphere: '', cylinder: '', axis: '' },
    pd: '',
    issuedDate: '',
    note: ''
  });
  const [isAdded, setIsAdded] = useState(false);

  const [isAROpen, setIsAROpen] = useState(false);
  const [activeARProduct, setActiveARProduct] = useState(null);
  const [showPrescriptionSheet, setShowPrescriptionSheet] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [wishlistIds, setWishlistIds] = useState(new Set());
  const [wishlistUpdating, setWishlistUpdating] = useState(false);

  // Reviews System states
  const [reviews, setReviews] = useState([]);
  const [isEligible, setIsEligible] = useState(false);
  const [userReview, setUserReview] = useState(null);
  const [ratingInput, setRatingInput] = useState(5);
  const [commentInput, setCommentInput] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // ==========================================
  // 2. GỌI API LẤY DỮ LIỆU SẢN PHẨM & HỒ SƠ ĐỘ CẬN
  // ==========================================
  const fetchProductData = async () => {
    try {
      const res = await fetch(`/api/products`);
      const data = await res.json();
      if (data.success) {
        const currentProd = data.products.find(p => p._id === id);
        setProduct(currentProd);
        setActiveARProduct(currentProd);
        
        fetchSavedPrescription(currentProd);

        const arAvailable = data.products.filter(p => p.arUrl && p.arUrl.trim() !== '');
        setAllArProducts(arAvailable);

        if (currentProd) {
          const related = data.products.filter(p => 
            p._id !== currentProd._id && 
            ((p.category && p.category._id === currentProd.category?._id) || 
             (p.brand && p.brand._id === currentProd.brand?._id))
          ).slice(0, 4);
          setRelatedProducts(related);
        }
      }
    } catch (error) {
      console.error("❌ Lỗi tải dữ liệu sản phẩm:", error);
    }
  };
  
  const fetchSavedPrescription = async (prodObj) => {
    const token = localStorage.getItem('glassesToken');
    if (!token) return;
    try {
      const res = await fetch('/api/prescription', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.prescription) {
        setSavedPrescription(data.prescription);
        
        const currentProduct = prodObj || product;
        const isPrescription = currentProduct?.category?.name?.toLowerCase().includes('cận') || false;
        if (isPrescription) {
          setPrescriptionOption('saved');
        } else {
          setPrescriptionOption('none');
        }

        const rx = data.prescription;
        setPrescriptionForm({
          rightEye: {
            sphere: rx.rightEye?.sphere ?? '',
            cylinder: rx.rightEye?.cylinder ?? '',
            axis: rx.rightEye?.axis ?? ''
          },
          leftEye: {
            sphere: rx.leftEye?.sphere ?? '',
            cylinder: rx.leftEye?.cylinder ?? '',
            axis: rx.leftEye?.axis ?? ''
          },
          pd: rx.pd ?? '',
          issuedDate: rx.issuedDate ? new Date(rx.issuedDate).toISOString().split('T')[0] : '',
          note: rx.note ?? ''
        });
      }
    } catch (err) {
      console.error('Error fetching prescription:', err);
    }
  };

  const fetchReviews = async () => {
    try {
      const res = await fetch(`/api/reviews/product/${id}`);
      const data = await res.json();
      if (data.success) {
        setReviews(data.reviews);
      }
    } catch (err) {
      console.error('Lỗi tải đánh giá sản phẩm:', err);
    }
  };

  const checkReviewEligibility = async () => {
    const token = localStorage.getItem('glassesToken');
    if (!token) {
      setIsEligible(false);
      setUserReview(null);
      return;
    }
    try {
      const res = await fetch(`/api/reviews/eligible/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setIsEligible(data.eligible);
        if (data.existingReview) {
          setUserReview(data.existingReview);
          setRatingInput(data.existingReview.rating);
          setCommentInput(data.existingReview.comment || '');
        } else {
          setUserReview(null);
          setRatingInput(5);
          setCommentInput('');
        }
      }
    } catch (err) {
      console.error('Lỗi kiểm tra quyền đánh giá:', err);
    }
  };

  const fetchWishlist = async () => {
    const token = localStorage.getItem('glassesToken');
    if (!token || !user || user.role !== 0) {
      setWishlistIds(new Set());
      setIsWishlisted(false);
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
        setIsWishlisted(nextIds.has(id));
      }
    } catch (error) {
      console.error('Lỗi tải danh sách yêu thích:', error);
    }
  };

  const handleSaveReview = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('glassesToken');
    if (!token) {
      showToast('Vui lòng đăng nhập để thực hiện đánh giá!', 'error');
      return;
    }
    setIsSubmittingReview(true);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          productId: id,
          rating: ratingInput,
          comment: commentInput
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        await fetchProductData();
        await fetchReviews();
        await checkReviewEligibility();
      } else {
        showToast(data.message, 'error');
      }
    } catch (err) {
      console.error('Lỗi lưu đánh giá:', err);
      showToast('Lỗi kết nối máy chủ.', 'error');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  useEffect(() => {
    fetchProductData();
    fetchSavedPrescription();
    fetchReviews();
    checkReviewEligibility();
    setActiveImageIndex(0);
  }, [id]);

  useEffect(() => {
    fetchWishlist();
  }, [id, user]);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const hasPrescription = prescriptionOption !== 'none';
  
  const getActivePrescription = () => {
    if (prescriptionOption === 'saved' && savedPrescription) {
      return {
        rightEye: {
          sphere: savedPrescription.rightEye?.sphere ?? '',
          cylinder: savedPrescription.rightEye?.cylinder ?? '',
          axis: savedPrescription.rightEye?.axis ?? ''
        },
        leftEye: {
          sphere: savedPrescription.leftEye?.sphere ?? '',
          cylinder: savedPrescription.leftEye?.cylinder ?? '',
          axis: savedPrescription.leftEye?.axis ?? ''
        },
        pd: savedPrescription.pd ?? '',
        issuedDate: savedPrescription.issuedDate ? new Date(savedPrescription.issuedDate).toISOString().split('T')[0] : '',
        note: savedPrescription.note ?? ''
      };
    }
    return prescriptionForm;
  };

  const getPrescriptionSummary = () => {
    if (prescriptionOption === 'none') return "Không cần độ cận (Kính thời trang)";
    const rx = getActivePrescription();
    return `Phải (OD): SPH ${rx.rightEye.sphere || '0.00'}/CYL ${rx.rightEye.cylinder || '0.00'} | Trái (OS): SPH ${rx.leftEye.sphere || '0.00'}/CYL ${rx.leftEye.cylinder || '0.00'}`;
  };

  // ==========================================
  // 3. THÊM VÀO GIỎ HÀNG
  // ==========================================
  const handleWishlistToggle = async (event, targetId) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (!user) {
      showToast('Vui lòng đăng nhập để sử dụng danh sách yêu thích!', 'error');
      navigate('/login');
      return;
    }

    if (user.role !== 0) return;

    const productId = targetId || id;
    const token = localStorage.getItem('glassesToken');
    const isTargetWishlisted = wishlistIds.has(productId);
    setWishlistUpdating(true);

    try {
      const res = await fetch(`/api/wishlist/${productId}`, {
        method: isTargetWishlisted ? 'DELETE' : 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (!data.success) {
        showToast(data.message || 'Không thể cập nhật danh sách yêu thích!', 'error');
        return;
      }

      setWishlistIds((currentIds) => {
        const nextIds = new Set(currentIds);
        if (isTargetWishlisted) {
          nextIds.delete(productId);
          if (productId === id) setIsWishlisted(false);
        } else {
          nextIds.add(productId);
          if (productId === id) setIsWishlisted(true);
        }
        return nextIds;
      });
      showToast(isTargetWishlisted ? 'Đã bỏ khỏi danh sách yêu thích' : 'Đã thêm vào danh sách yêu thích', 'success');
    } catch (err) {
      console.error('Lỗi cập nhật wishlist:', err);
      showToast('Lỗi kết nối máy chủ khi cập nhật yêu thích!', 'error');
    } finally {
      setWishlistUpdating(false);
    }
  };

  const handleAddToCart = () => {
    if (!user) {
      showToast('Vui lòng đăng nhập để thêm sản phẩm vào giỏ hàng!', 'error');
      setTimeout(() => {
        navigate('/login', { state: { from: window.location.pathname } });
      }, 1500);
      return;
    }

    const isPrescription = product.category?.name?.toLowerCase().includes('cận') || false;

    let rx = getActivePrescription();
    let currentPrescriptionOption = prescriptionOption;

    if (!isPrescription) {
      currentPrescriptionOption = 'none';
      rx = {
        rightEye: { sphere: '', cylinder: '', axis: '' },
        leftEye: { sphere: '', cylinder: '', axis: '' },
        pd: '',
        issuedDate: '',
        note: ''
      };
    }

    if (isPrescription) {
      if (currentPrescriptionOption === 'custom') {
        if (rx.rightEye.sphere === '' && rx.leftEye.sphere === '') {
          showToast('Vui lòng nhập thông số độ cận (SPH)!', 'error');
          return;
        }
      } else if (currentPrescriptionOption === 'saved' && !savedPrescription) {
        showToast('Bạn chưa lưu hồ sơ độ cận. Vui lòng chọn Nhập mới hoặc Không cần độ cận!', 'error');
        return;
      }
    }

    const isRx = isPrescription && currentPrescriptionOption !== 'none';
    const cartItemId = isRx 
      ? `${product._id}_rx_${rx.rightEye.sphere || 0}_${rx.leftEye.sphere || 0}_${rx.rightEye.cylinder || 0}_${rx.leftEye.cylinder || 0}`
      : `${product._id}_std`;

    const newItem = {
      cartId: cartItemId,
      productId: product._id,
      name: product.name,
      price: product.discountPercent > 0 ? product.salePrice : product.price,
      originalPrice: product.discountPercent > 0 ? product.originalPrice : product.price,
      discountPercent: product.discountPercent || 0,
      salePrice: product.discountPercent > 0 ? product.salePrice : product.price,
      image: product.images[0],
      hasPrescription: isRx,
      od: isRx ? `SPH: ${rx.rightEye.sphere || '0.00'} | CYL: ${rx.rightEye.cylinder || '0.00'} | AXIS: ${rx.rightEye.axis || '0'}` : '',
      os: isRx ? `SPH: ${rx.leftEye.sphere || '0.00'} | CYL: ${rx.leftEye.cylinder || '0.00'} | AXIS: ${rx.leftEye.axis || '0'}` : '',
      od_sph: isRx && rx.rightEye.sphere !== '' ? Number(rx.rightEye.sphere) : null,
      od_cyl: isRx && rx.rightEye.cylinder !== '' ? Number(rx.rightEye.cylinder) : null,
      od_axis: isRx && rx.rightEye.axis !== '' ? Number(rx.rightEye.axis) : null,
      os_sph: isRx && rx.leftEye.sphere !== '' ? Number(rx.leftEye.sphere) : null,
      os_cyl: isRx && rx.leftEye.cylinder !== '' ? Number(rx.leftEye.cylinder) : null,
      os_axis: isRx && rx.leftEye.axis !== '' ? Number(rx.leftEye.axis) : null,
      pd: isRx && rx.pd !== '' ? Number(rx.pd) : null,
      rxDate: isRx && rx.issuedDate ? rx.issuedDate : null,
      rxNote: isRx ? rx.note || '' : '',
      prescriptionMode: currentPrescriptionOption,
      quantity: 1
    };

    const cartKey = getCartKey();
    const cart = JSON.parse(localStorage.getItem(cartKey)) || [];
    const existIdx = cart.findIndex(item => item.cartId === newItem.cartId);
    if (existIdx !== -1) cart[existIdx].quantity += 1;
    else cart.push(newItem);

    localStorage.setItem(cartKey, JSON.stringify(cart));
    window.dispatchEvent(new Event('cartUpdated'));

    setIsAdded(true);
    showToast('Đã thêm vào giỏ hàng', 'success');
  };

  const handleBuyNow = () => {
    if (!user) {
      showToast('Vui lòng đăng nhập để thực hiện mua ngay!', 'error');
      setTimeout(() => {
        navigate('/login', { state: { from: window.location.pathname } });
      }, 1500);
      return;
    }

    const isPrescription = product.category?.name?.toLowerCase().includes('cận') || false;

    let rx = getActivePrescription();
    let currentPrescriptionOption = prescriptionOption;

    if (!isPrescription) {
      currentPrescriptionOption = 'none';
      rx = {
        rightEye: { sphere: '', cylinder: '', axis: '' },
        leftEye: { sphere: '', cylinder: '', axis: '' },
        pd: '',
        issuedDate: '',
        note: ''
      };
    }

    if (isPrescription) {
      if (currentPrescriptionOption === 'custom') {
        if (rx.rightEye.sphere === '' && rx.leftEye.sphere === '') {
          showToast('Vui lòng nhập thông số độ cận (SPH)!', 'error');
          return;
        }
      } else if (currentPrescriptionOption === 'saved' && !savedPrescription) {
        showToast('Bạn chưa lưu hồ sơ độ cận. Vui lòng chọn Nhập mới hoặc Không cần độ cận!', 'error');
        return;
      }
    }

    const isRx = isPrescription && currentPrescriptionOption !== 'none';
    const cartItemId = isRx 
      ? `${product._id}_rx_${rx.rightEye.sphere || 0}_${rx.leftEye.sphere || 0}_${rx.rightEye.cylinder || 0}_${rx.leftEye.cylinder || 0}`
      : `${product._id}_std`;

    const newItem = {
      cartId: cartItemId,
      productId: product._id,
      name: product.name,
      price: product.discountPercent > 0 ? product.salePrice : product.price,
      originalPrice: product.discountPercent > 0 ? product.originalPrice : product.price,
      discountPercent: product.discountPercent || 0,
      salePrice: product.discountPercent > 0 ? product.salePrice : product.price,
      image: product.images[0],
      hasPrescription: isRx,
      od: isRx ? `SPH: ${rx.rightEye.sphere || '0.00'} | CYL: ${rx.rightEye.cylinder || '0.00'} | AXIS: ${rx.rightEye.axis || '0'}` : '',
      os: isRx ? `SPH: ${rx.leftEye.sphere || '0.00'} | CYL: ${rx.leftEye.cylinder || '0.00'} | AXIS: ${rx.leftEye.axis || '0'}` : '',
      od_sph: isRx && rx.rightEye.sphere !== '' ? Number(rx.rightEye.sphere) : null,
      od_cyl: isRx && rx.rightEye.cylinder !== '' ? Number(rx.rightEye.cylinder) : null,
      od_axis: isRx && rx.rightEye.axis !== '' ? Number(rx.rightEye.axis) : null,
      os_sph: isRx && rx.leftEye.sphere !== '' ? Number(rx.leftEye.sphere) : null,
      os_cyl: isRx && rx.leftEye.cylinder !== '' ? Number(rx.leftEye.cylinder) : null,
      os_axis: isRx && rx.leftEye.axis !== '' ? Number(rx.leftEye.axis) : null,
      pd: isRx && rx.pd !== '' ? Number(rx.pd) : null,
      rxDate: isRx && rx.issuedDate ? rx.issuedDate : null,
      rxNote: isRx ? rx.note || '' : '',
      prescriptionMode: currentPrescriptionOption,
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

  if (!product) {
    return (
      <div className="p-20 text-center font-bold flex flex-col items-center">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
        Đang tải dữ liệu sản phẩm...
      </div>
    );
  }

  const is3DReady = product.arUrl && product.arUrl.trim() !== '';

  return (
    <div className="bg-white min-h-screen pb-24 overflow-x-hidden relative">

      {/* ---------------- TOAST NOTIFICATION ---------------- */}
      <div className={`fixed top-10 left-1/2 transform -translate-x-1/2 z-[999] transition-all duration-300 ${toast.show ? 'translate-y-0 opacity-100' : '-translate-y-10 opacity-0 pointer-events-none'}`}>
        <div className={`flex items-center gap-2 px-6 py-3 rounded-full shadow-2xl font-bold text-sm ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-black/80 backdrop-blur-md text-white border border-white/20'}`}>
          {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-green-400" />}
          {toast.message}
        </div>
      </div>

      {/* ---------------- TRANG CHI TIẾT SẢN PHẨM ---------------- */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Link to="/" className="inline-flex items-center text-gray-500 hover:text-blue-600 mb-8 font-medium">
          <ChevronLeft className="w-5 h-5 mr-1" /> Trở về Cửa hàng
        </Link>

        <div className="flex flex-col md:flex-row gap-12">
          {/* CỘT TRÁI */}
          <div className="md:w-1/2 flex flex-col gap-6">
            <div className="bg-gray-50 rounded-[40px] p-10 aspect-square flex items-center justify-center relative border border-gray-100 shadow-inner overflow-hidden">
              <img src={product.images && product.images[activeImageIndex] ? product.images[activeImageIndex] : '/placeholder.png'} alt={product.name} className="w-full h-auto object-contain drop-shadow-2xl transition-all duration-300 ease-in-out" />
              {is3DReady && (
                <div className="absolute top-8 left-8 bg-indigo-600 text-white text-[10px] font-black px-4 py-2 rounded-full flex items-center shadow-lg animate-pulse gap-1">
                  <Box className="w-3 h-3" /> HỖ TRỢ 3D AR
                </div>
              )}
            </div>

            {/* GALLERY THUMBNAILS */}
            {product.images && product.images.length > 0 && (
              <div className="flex gap-3 overflow-x-auto py-2 justify-center scrollbar-thin">
                {product.images.map((imgUrl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveImageIndex(idx)}
                    className={`w-20 h-20 rounded-2xl overflow-hidden border-2 bg-gray-50 p-2 transition-all duration-300 shrink-0 ${
                      activeImageIndex === idx
                        ? 'border-blue-600 scale-105 shadow-md'
                        : 'border-gray-200 hover:border-blue-400'
                    }`}
                  >
                    <img
                      src={imgUrl}
                      alt={`thumbnail-${idx}`}
                      className="w-full h-full object-contain mix-blend-multiply transition-opacity duration-300"
                    />
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => setIsAROpen(true)}
              disabled={!is3DReady}
              className={`w-full py-5 rounded-3xl font-black text-xl flex items-center justify-center space-x-3 transition-all ${
                !is3DReady
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-900 text-white shadow-xl hover:bg-indigo-600 hover:scale-[1.01]'
              }`}
            >
              <Camera className="w-7 h-7" />
              <span>{!is3DReady ? "SẢN PHẨM NÀY CHƯA CÓ FILE 3D" : "THỬ KÍNH 3D NGAY"}</span>
            </button>
          </div>

          {/* CỘT PHẢI */}
          <div className="md:w-1/2 flex flex-col">
            <h1 className="text-4xl font-black text-gray-900 leading-tight">{product.name}</h1>

            {/* Average Rating Stars Indicator */}
            <div className="flex items-center gap-1.5 mt-2">
              <div className="flex items-center text-amber-400">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-4 h-4 ${
                      star <= (product.averageRating || 0)
                        ? 'fill-amber-400 text-amber-400'
                        : star - 0.5 <= (product.averageRating || 0)
                        ? 'fill-amber-400/50 text-amber-400'
                        : 'text-gray-200'
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs font-black text-gray-600">
                {product.averageRating ? product.averageRating.toFixed(1) : '0.0'} ({product.totalReviews || 0} đánh giá)
              </span>
            </div>
            
            <div className="mt-4 flex items-baseline gap-3 flex-wrap">
              {product.discountPercent > 0 ? (
                <>
                  <span className="text-3xl font-black text-red-600">{product.salePrice.toLocaleString('vi-VN')} VNĐ</span>
                  <span className="text-lg text-gray-400 line-through font-medium">{product.originalPrice.toLocaleString('vi-VN')} VNĐ</span>
                  <span className="text-[10px] bg-red-100 text-red-700 font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider ml-1 animate-pulse">Giảm {product.discountPercent}%</span>
                </>
              ) : (
                <span className="text-3xl font-black text-blue-600">{product.price.toLocaleString('vi-VN')} VNĐ</span>
              )}
            </div>

            {product.discountPercent > 0 && product.activeSale && (
              <div className="mt-4 bg-gradient-to-r from-red-50 to-orange-50 border border-red-100/50 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-red-600 shrink-0">
                  <Sparkles className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h4 className="font-bold text-xs text-red-800">Khuyến Mãi Đang Áp Dụng: {product.activeSale.name}</h4>
                  <p className="text-[10px] text-red-600 mt-0.5">
                    {product.remainingSaleQuantity !== null && product.remainingSaleQuantity > 0 ? (
                      <span className="font-black text-red-700 bg-red-100/80 px-2 py-0.5 rounded mr-1">Chỉ còn {product.remainingSaleQuantity} suất ưu đãi!</span>
                    ) : ''}
                    Giá ưu đãi đã được giảm trực tiếp vào giỏ hàng của bạn!
                  </p>
                </div>
              </div>
            )}

            <div className="h-px bg-gray-100 my-8"></div>
            <p className="text-gray-500 text-lg leading-relaxed mb-10">{product.description || "Gọng kính cao cấp, chất liệu siêu nhẹ mang lại cảm giác thoải mái khi đeo cả ngày."}</p>

            {product.category?.name?.toLowerCase().includes('cận') && (
              <div className="bg-gray-50 rounded-3xl p-6 mb-8 border border-gray-100 flex items-center justify-between shadow-sm">
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">Thông số thị lực</h3>
                  <p className="text-sm text-gray-400 mt-0.5 font-medium">
                    {getPrescriptionSummary()}
                  </p>
                </div>
                <button onClick={() => setShowPrescriptionSheet(true)} className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 text-blue-600 hover:bg-blue-50 transition-all active:scale-90">
                  <Edit3 className="w-6 h-6" />
                </button>
              </div>
            )}

            {(!user || user.role === 0) && (
              <button
                type="button"
                onClick={handleWishlistToggle}
                disabled={wishlistUpdating}
                className={`w-full py-4 rounded-3xl font-black text-lg flex items-center justify-center gap-3 border-2 transition-all active:scale-95 mb-4 ${
                  isWishlisted
                    ? 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100'
                    : 'bg-white text-gray-800 border-gray-200 hover:border-red-200 hover:text-red-600'
                }`}
              >
                <Heart className={`w-6 h-6 ${isWishlisted ? 'fill-red-500 text-red-500' : ''}`} />
                {isWishlisted ? 'Đã yêu thích' : 'Thêm yêu thích'}
              </button>
            )}

            <div className="flex gap-4">
              <button onClick={handleAddToCart} disabled={isAdded} className={`flex-1 py-6 rounded-3xl font-black text-lg flex items-center justify-center gap-2 shadow-2xl transition-all active:scale-95 ${isAdded ? 'bg-green-500 text-white shadow-green-200' : 'bg-blue-600 text-white shadow-blue-200 hover:bg-blue-700'}`}>
                {isAdded ? <><ShieldCheck className="w-6 h-6 animate-bounce" /> ĐÃ THÊM!</> : <><ShoppingCart className="w-6 h-6" /> THÊM VÀO GIỎ</>}
              </button>
              <button onClick={handleBuyNow} className="flex-1 py-6 rounded-3xl font-black text-lg flex items-center justify-center gap-2 shadow-2xl bg-gray-900 text-white hover:bg-indigo-600 transition-all active:scale-95 shadow-gray-900/10">
                MUA NGAY
              </button>
            </div>
          </div>
        </div>

        {/* ===================== SẢN PHẨM LIÊN QUAN ===================== */}
        {relatedProducts.length > 0 && (
          <div className="mt-16 border-t border-gray-100 pt-16">
            <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tight mb-2">Sản phẩm liên quan</h3>
            <p className="text-gray-500 text-sm mb-8">Có thể bạn cũng sẽ thích những mẫu kính mắt này</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {relatedProducts.map((prod) => (
                <ProductCard
                  key={prod._id}
                  product={prod}
                  showWishlistActions={!user || user.role === 0}
                  wishlistIds={wishlistIds}
                  onWishlistToggle={handleWishlistToggle}
                />
              ))}
            </div>
          </div>
        )}

        {/* ===================== HỆ THỐNG ĐÁNH GIÁ & NHẬN XÉT ===================== */}
        <div className="mt-16 border-t border-gray-100 pt-16">
          <div className="flex flex-col lg:flex-row gap-12">
            {/* Cột trái: Form đánh giá */}
            <div className="lg:w-1/3">
              <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tight mb-2">Đánh giá sản phẩm</h3>
              <p className="text-gray-500 text-sm mb-6">Ý kiến của khách hàng là động lực cải tiến chất lượng phục vụ của chúng tôi.</p>
              
              {isEligible ? (
                <form onSubmit={handleSaveReview} className="bg-gray-50 p-6 rounded-[32px] border border-gray-100 shadow-sm space-y-4">
                  <div className="text-xs font-black text-blue-600 uppercase tracking-wider">
                    {userReview ? 'Chỉnh sửa đánh giá của bạn' : 'Gửi đánh giá của bạn'}
                  </div>
                  
                  {/* Chọn sao */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1.5">Số sao đánh giá:</label>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setRatingInput(star)}
                          className="text-amber-400 hover:scale-110 transition active:scale-95"
                        >
                          <Star
                            className={`w-8 h-8 ${
                              star <= ratingInput ? 'fill-amber-400 text-amber-400' : 'text-gray-300'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Comment */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1.5">Nội dung nhận xét:</label>
                    <textarea
                      rows="4"
                      value={commentInput}
                      onChange={(e) => setCommentInput(e.target.value)}
                      placeholder="Hãy chia sẻ trải nghiệm thực tế của bạn về sản phẩm này..."
                      className="w-full p-4 rounded-2xl border border-gray-200 bg-white font-bold text-sm outline-none focus:ring-2 focus:ring-blue-600 resize-none transition"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingReview}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl text-sm transition-all active:scale-[0.98] shadow-lg shadow-blue-100 flex items-center justify-center gap-2"
                  >
                    {isSubmittingReview ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Đang lưu...
                      </>
                    ) : (
                      userReview ? 'CẬP NHẬT ĐÁNH GIÁ' : 'GỬI ĐÁNH GIÁ THỰC TẾ'
                    )}
                  </button>
                </form>
              ) : (
                <div className="bg-amber-50/50 border border-amber-100 p-5 rounded-2xl text-xs text-amber-800 font-bold leading-relaxed">
                  🔒 Chỉ những khách hàng đã mua và hoàn tất nhận đơn hàng chứa sản phẩm này mới có thể viết đánh giá & chấm sao.
                </div>
              )}
            </div>

            {/* Cột phải: Danh sách đánh giá */}
            <div className="lg:w-2/3">
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-lg font-black text-gray-900 uppercase">Đánh giá từ khách hàng ({reviews.length})</h4>
              </div>

              {reviews.length === 0 ? (
                <div className="bg-gray-50 border border-dashed rounded-[32px] p-12 text-center text-gray-400 font-medium">
                  Sản phẩm chưa có lượt đánh giá nào. Hãy là người đầu tiên mua kính và chia sẻ cảm nhận!
                </div>
              ) : (
                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                  {reviews.map((r, index) => (
                    <div key={index} className="bg-white border border-gray-100 rounded-3xl p-5 hover:shadow-sm transition">
                      <div className="flex justify-between items-start gap-4 mb-2">
                        <div>
                          <span className="font-extrabold text-gray-900 block" translate="no">{r.userDisplayName}</span>
                          <div className="flex items-center text-amber-400 mt-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`w-3.5 h-3.5 ${
                                  star <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200'
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                        <span className="text-[10px] text-gray-400 font-bold">
                          {new Date(r.createdAt).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                      <p className="text-gray-600 text-sm font-medium leading-relaxed mt-2" translate="no">“{r.comment}”</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- NGĂN KÉO NHẬP ĐỘ CẬN (TRANG CHÍNH) ---------------- */}
      <div className={`fixed inset-0 z-[60] transition-all duration-500 ${showPrescriptionSheet ? 'visible' : 'invisible'}`}>
        <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-500 ${showPrescriptionSheet ? 'opacity-100' : 'opacity-0'}`} onClick={() => setShowPrescriptionSheet(false)}></div>
        <div className={`absolute bottom-0 w-full bg-white rounded-t-[40px] p-10 transition-transform duration-500 ease-out shadow-2xl ${showPrescriptionSheet ? 'translate-y-0' : 'translate-y-full'}`}>
          <div className="max-w-md mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-gray-900 uppercase">Cài đặt độ cận</h2>
              <button onClick={() => setShowPrescriptionSheet(false)} className="bg-gray-100 p-2 rounded-full text-gray-400 hover:bg-gray-200"><X className="w-6 h-6" /></button>
            </div>

            {/* Warning Banner */}
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-xs text-amber-800 font-bold mb-6 flex items-start gap-2">
              <span className="shrink-0">⚠️</span>
              <span>Thông tin độ cận do khách hàng tự cung cấp. Vui lòng kiểm tra kỹ trước khi đặt kính.</span>
            </div>

            {/* Select Options */}
            <div className="space-y-3 mb-6">
              {/* Option 1: None */}
              <label className="flex items-center gap-3 p-4 rounded-2xl border border-gray-100 bg-gray-50 hover:bg-gray-100/50 cursor-pointer transition">
                <input type="radio" name="prescriptionOption" value="none" checked={prescriptionOption === 'none'} onChange={() => setPrescriptionOption('none')} className="w-5 h-5 accent-blue-600 cursor-pointer" />
                <div className="flex-1">
                  <span className="font-extrabold text-sm text-gray-800 block">Không cần độ cận</span>
                  <span className="text-xs text-gray-400 font-medium">Mua kính thời trang, không độ</span>
                </div>
              </label>

              {/* Option 2: Saved Profile */}
              <label className="flex items-center gap-3 p-4 rounded-2xl border border-gray-100 bg-gray-50 hover:bg-gray-100/50 cursor-pointer transition">
                <input type="radio" name="prescriptionOption" value="saved" checked={prescriptionOption === 'saved'} onChange={() => setPrescriptionOption('saved')} className="w-5 h-5 accent-blue-600 cursor-pointer" />
                <div className="flex-1">
                  <span className="font-extrabold text-sm text-gray-800 block">Sử dụng hồ sơ đã lưu</span>
                  {savedPrescription ? (
                    <span className="text-xs text-blue-600 font-bold block mt-0.5">
                      OD: SPH {savedPrescription.rightEye?.sphere ?? '0.00'}/CYL {savedPrescription.rightEye?.cylinder ?? '0.00'} | OS: SPH {savedPrescription.leftEye?.sphere ?? '0.00'}/CYL {savedPrescription.leftEye?.cylinder ?? '0.00'}
                    </span>
                  ) : (
                    <span className="text-xs text-red-500 font-medium block mt-0.5">
                      Bạn chưa lưu hồ sơ độ cận. <Link to="/my-prescription" className="text-blue-600 underline font-bold">Bấm vào đây để tạo mới</Link>
                    </span>
                  )}
                </div>
              </label>

              {/* Option 3: Custom Input */}
              <label className="flex items-center gap-3 p-4 rounded-2xl border border-gray-100 bg-gray-50 hover:bg-gray-100/50 cursor-pointer transition">
                <input type="radio" name="prescriptionOption" value="custom" checked={prescriptionOption === 'custom'} onChange={() => setPrescriptionOption('custom')} className="w-5 h-5 accent-blue-600 cursor-pointer" />
                <div className="flex-1">
                  <span className="font-extrabold text-sm text-gray-800 block">Nhập độ cận mới cho đơn này</span>
                  <span className="text-xs text-gray-400 font-medium">Tự điền thông số độ cận thủ công bên dưới</span>
                </div>
              </label>
            </div>

            {/* Custom Input Fields (Visible when custom is selected) */}
            {prescriptionOption === 'custom' && (
              <div className="space-y-4 max-h-[200px] overflow-y-auto pr-2 mb-6 border-t pt-4">
                {/* OD */}
                <div className="p-4 rounded-2xl bg-blue-50/30 border border-blue-100/30">
                  <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest block mb-2">Mắt phải (OD)</span>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[9px] font-bold text-gray-400">SPH</label>
                      <input type="number" step="0.25" placeholder="-0.00" value={prescriptionForm.rightEye.sphere} onChange={e => setPrescriptionForm(p => ({ ...p, rightEye: { ...p.rightEye, sphere: e.target.value } }))} className="w-full p-2.5 rounded-xl border border-gray-200 bg-white font-bold text-sm outline-none focus:ring-2 focus:ring-blue-600" />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-gray-400">CYL</label>
                      <input type="number" step="0.25" placeholder="-0.00" value={prescriptionForm.rightEye.cylinder} onChange={e => setPrescriptionForm(p => ({ ...p, rightEye: { ...p.rightEye, cylinder: e.target.value } }))} className="w-full p-2.5 rounded-xl border border-gray-200 bg-white font-bold text-sm outline-none focus:ring-2 focus:ring-blue-600" />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-gray-400">AXIS</label>
                      <input type="number" min="0" max="180" placeholder="0" value={prescriptionForm.rightEye.axis} onChange={e => setPrescriptionForm(p => ({ ...p, rightEye: { ...p.rightEye, axis: e.target.value } }))} className="w-full p-2.5 rounded-xl border border-gray-200 bg-white font-bold text-sm outline-none focus:ring-2 focus:ring-blue-600" />
                    </div>
                  </div>
                </div>

                {/* OS */}
                <div className="p-4 rounded-2xl bg-indigo-50/30 border border-indigo-100/30">
                  <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block mb-2">Mắt trái (OS)</span>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[9px] font-bold text-gray-400">SPH</label>
                      <input type="number" step="0.25" placeholder="-0.00" value={prescriptionForm.leftEye.sphere} onChange={e => setPrescriptionForm(p => ({ ...p, leftEye: { ...p.leftEye, sphere: e.target.value } }))} className="w-full p-2.5 rounded-xl border border-gray-200 bg-white font-bold text-sm outline-none focus:ring-2 focus:ring-blue-600" />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-gray-400">CYL</label>
                      <input type="number" step="0.25" placeholder="-0.00" value={prescriptionForm.leftEye.cylinder} onChange={e => setPrescriptionForm(p => ({ ...p, leftEye: { ...p.leftEye, cylinder: e.target.value } }))} className="w-full p-2.5 rounded-xl border border-gray-200 bg-white font-bold text-sm outline-none focus:ring-2 focus:ring-blue-600" />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-gray-400">AXIS</label>
                      <input type="number" min="0" max="180" placeholder="0" value={prescriptionForm.leftEye.axis} onChange={e => setPrescriptionForm(p => ({ ...p, leftEye: { ...p.leftEye, axis: e.target.value } }))} className="w-full p-2.5 rounded-xl border border-gray-200 bg-white font-bold text-sm outline-none focus:ring-2 focus:ring-blue-600" />
                    </div>
                  </div>
                </div>

                {/* PD & Date */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400">Khoảng cách đồng tử (PD)</label>
                    <input type="number" placeholder="mm" value={prescriptionForm.pd} onChange={e => setPrescriptionForm(p => ({ ...p, pd: e.target.value }))} className="w-full p-3 rounded-xl border border-gray-200 bg-white font-bold text-sm outline-none focus:ring-2 focus:ring-blue-600" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400">Ngày đo khám</label>
                    <input type="date" value={prescriptionForm.issuedDate} onChange={e => setPrescriptionForm(p => ({ ...p, issuedDate: e.target.value }))} className="w-full p-3 rounded-xl border border-gray-200 bg-white font-bold text-sm outline-none focus:ring-2 focus:ring-blue-600" />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="text-[10px] font-bold text-gray-400">Ghi chú</label>
                  <textarea rows="2" placeholder="Ghi chú thêm..." value={prescriptionForm.note} onChange={e => setPrescriptionForm(p => ({ ...p, note: e.target.value }))} className="w-full p-3 rounded-xl border border-gray-200 bg-white font-bold text-sm outline-none focus:ring-2 focus:ring-blue-600 resize-none" />
                </div>
              </div>
            )}

            <button onClick={() => setShowPrescriptionSheet(false)} className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95">XÁC NHẬN & LƯU</button>
          </div>
        </div>
      </div>

      {/* ===================== MODAL MÀN HÌNH AR 3D ===================== */}
      {isAROpen && (
        <VirtualTryOn
          product={product}
          allArProducts={allArProducts}
          activeARProduct={activeARProduct}
          setActiveARProduct={setActiveARProduct}
          onClose={() => setIsAROpen(false)}
        />
      )}
    </div>
  );
}
