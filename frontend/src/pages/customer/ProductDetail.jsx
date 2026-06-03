import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getCartKey } from '../../utils/cartHelper';
import {
  Camera, ShoppingCart, ShieldCheck, ChevronLeft, Edit3, X, Loader2, Box, CheckCircle2, Sparkles
} from 'lucide-react';
import VirtualTryOn from './VirtualTryOn';

export default function ProductDetail() {
  const { id } = useParams();

  // ==========================================
  // 1. QUẢN LÝ TRẠNG THÁI (STATE)
  // ==========================================
  const [product, setProduct] = useState(null);
  const [allArProducts, setAllArProducts] = useState([]);

  const [hasPrescription, setHasPrescription] = useState(false);
  const [od, setOd] = useState('');
  const [os, setOs] = useState('');
  const [isAdded, setIsAdded] = useState(false);

  const [isAROpen, setIsAROpen] = useState(false);
  const [activeARProduct, setActiveARProduct] = useState(null);
  const [showPrescriptionSheet, setShowPrescriptionSheet] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // ==========================================
  // 2. GỌI API LẤY DỮ LIỆU SẢN PHẨM
  // ==========================================
  useEffect(() => {
    const fetchProductData = async () => {
      try {
        const res = await fetch(`/api/products`);
        const data = await res.json();
        if (data.success) {
          const currentProd = data.products.find(p => p._id === id);
          setProduct(currentProd);
          setActiveARProduct(currentProd);

          const arAvailable = data.products.filter(p => p.arUrl && p.arUrl.trim() !== '');
          setAllArProducts(arAvailable);
        }
      } catch (error) {
        console.error("❌ Lỗi tải dữ liệu sản phẩm:", error);
      }
    };
    fetchProductData();

    const saved = JSON.parse(localStorage.getItem('userPrescription'));
    if (saved) {
      setOd(saved.od || ''); setOs(saved.os || '');
      if (saved.od || saved.os) setHasPrescription(true);
    }
  }, [id]);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  // ==========================================
  // 3. THÊM VÀO GIỎ HÀNG
  // ==========================================
  const handleAddToCart = () => {
    if (hasPrescription && !od && !os) {
      showToast('Vui lòng nhập độ cận!', 'error');
      return;
    }
    const cartItemId = hasPrescription ? `${product._id}_rx_${od}_${os}` : `${product._id}_std`;
    const newItem = {
      cartId: cartItemId,
      productId: product._id,
      name: product.name,
      price: product.discountPercent > 0 ? product.salePrice : product.price,
      originalPrice: product.discountPercent > 0 ? product.originalPrice : product.price,
      discountPercent: product.discountPercent || 0,
      salePrice: product.discountPercent > 0 ? product.salePrice : product.price,
      image: product.images[0],
      hasPrescription, od, os, quantity: 1
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
    setTimeout(() => setIsAdded(false), 2000);
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
              <img src={product.images && product.images[0] ? product.images[0] : '/placeholder.png'} alt={product.name} className="w-full h-auto object-contain drop-shadow-2xl" />
              {is3DReady && (
                <div className="absolute top-8 left-8 bg-indigo-600 text-white text-[10px] font-black px-4 py-2 rounded-full flex items-center shadow-lg animate-pulse gap-1">
                  <Box className="w-3 h-3" /> HỖ TRỢ 3D AR
                </div>
              )}
            </div>

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
                  <p className="text-[10px] text-red-600 mt-0.5">Giá ưu đãi đã được giảm trực tiếp vào giỏ hàng của bạn!</p>
                </div>
              </div>
            )}

            <div className="h-px bg-gray-100 my-8"></div>
            <p className="text-gray-500 text-lg leading-relaxed mb-10">{product.description || "Gọng kính cao cấp, chất liệu siêu nhẹ mang lại cảm giác thoải mái khi đeo cả ngày."}</p>

            <div className="bg-gray-50 rounded-3xl p-6 mb-8 border border-gray-100 flex items-center justify-between shadow-sm">
              <div>
                <h3 className="font-bold text-gray-900 text-lg">Thông số thị lực</h3>
                <p className="text-sm text-gray-400 mt-0.5 font-medium">
                  {hasPrescription ? `Phải (OD): ${od} | Trái (OS): ${os}` : "Bấm nút bên phải để áp dụng độ cận"}
                </p>
              </div>
              <button onClick={() => setShowPrescriptionSheet(true)} className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 text-blue-600 hover:bg-blue-50 transition-all active:scale-90">
                <Edit3 className="w-6 h-6" />
              </button>
            </div>

            <button onClick={handleAddToCart} disabled={isAdded} className={`w-full py-6 rounded-3xl font-black text-xl flex items-center justify-center gap-3 shadow-2xl transition-all active:scale-95 ${isAdded ? 'bg-green-500 text-white shadow-green-200' : 'bg-blue-600 text-white shadow-blue-200 hover:bg-blue-700'}`}>
              {isAdded ? <><ShieldCheck className="w-7 h-7 animate-bounce" /> ĐÃ THÊM VÀO GIỎ!</> : <><ShoppingCart className="w-7 h-7" /> THÊM VÀO GIỎ HÀNG</>}
            </button>
          </div>
        </div>
      </div>

      {/* ---------------- NGĂN KÉO NHẬP ĐỘ CẬN (TRANG CHÍNH) ---------------- */}
      <div className={`fixed inset-0 z-[60] transition-all duration-500 ${showPrescriptionSheet ? 'visible' : 'invisible'}`}>
        <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-500 ${showPrescriptionSheet ? 'opacity-100' : 'opacity-0'}`} onClick={() => setShowPrescriptionSheet(false)}></div>
        <div className={`absolute bottom-0 w-full bg-white rounded-t-[40px] p-10 transition-transform duration-500 ease-out shadow-2xl ${showPrescriptionSheet ? 'translate-y-0' : 'translate-y-full'}`}>
          <div className="max-w-md mx-auto">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-gray-900 uppercase">Cài đặt độ cận</h2>
              <button onClick={() => setShowPrescriptionSheet(false)} className="bg-gray-100 p-2 rounded-full text-gray-400 hover:bg-gray-200"><X className="w-6 h-6" /></button>
            </div>
            <div className="flex items-center justify-between p-5 bg-blue-50 rounded-2xl mb-8 border border-blue-100">
              <span className="font-bold text-blue-900">Sử dụng kính thuốc</span>
              <input type="checkbox" checked={hasPrescription} onChange={() => setHasPrescription(!hasPrescription)} className="w-6 h-6 accent-blue-600 cursor-pointer" />
            </div>
            <div className={`grid grid-cols-2 gap-4 transition-all duration-300 ${hasPrescription ? 'opacity-100' : 'opacity-20 pointer-events-none'}`}>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Mắt phải (OD)</label>
                <input type="number" value={od} onChange={(e) => setOd(e.target.value)} step="0.25" placeholder="-1.50" className="w-full p-5 rounded-2xl bg-gray-50 border-none outline-none focus:ring-2 focus:ring-blue-500 font-bold text-lg" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Mắt trái (OS)</label>
                <input type="number" value={os} onChange={(e) => setOs(e.target.value)} step="0.25" placeholder="-1.25" className="w-full p-5 rounded-2xl bg-gray-50 border-none outline-none focus:ring-2 focus:ring-blue-500 font-bold text-lg" />
              </div>
            </div>
            <button onClick={() => setShowPrescriptionSheet(false)} className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-lg mt-10 shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95">XÁC NHẬN & LƯU</button>
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