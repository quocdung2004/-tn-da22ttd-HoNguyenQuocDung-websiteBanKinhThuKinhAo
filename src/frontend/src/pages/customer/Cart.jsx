import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2, Plus, Minus, ArrowLeft, ShoppingBag, ShieldCheck, AlertTriangle } from 'lucide-react'; // Import thêm AlertTriangle
import { getCartKey } from '../../utils/cartHelper';

export default function Cart() {
  const navigate = useNavigate();
  const [cartItems, setCartItems] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);

  // --- STATE MỚI: Quản lý hộp thoại Xóa ---
  const [itemToDelete, setItemToDelete] = useState(null); // Chứa ID của sản phẩm đang định xóa

  useEffect(() => {
    const cartKey = getCartKey();
    const savedCart = JSON.parse(localStorage.getItem(cartKey)) || [];
    setCartItems(savedCart);
    setSelectedItems(savedCart.map(item => item.cartId));
  }, []);

  const saveAndSyncCart = (newCart) => {
    setCartItems(newCart);
    const cartKey = getCartKey();
    localStorage.setItem(cartKey, JSON.stringify(newCart));
    window.dispatchEvent(new Event('cartUpdated'));
  };

  const updateQuantity = (cartId, delta) => {
    const newCart = cartItems.map(item => {
      if (item.cartId === cartId) {
        const newQuantity = item.quantity + delta;
        return { ...item, quantity: newQuantity > 0 ? newQuantity : 1 };
      }
      return item;
    });
    saveAndSyncCart(newCart);
  };

  // --- LOGIC XÓA ĐƯỢC CẬP NHẬT ---

  // 1. Hàm mở hộp thoại hỏi (Thay vì xóa ngay)
  const promptRemoveItem = (cartId) => {
    setItemToDelete(cartId);
  };

  // 2. Hàm Xác nhận Xóa (Chạy khi bấm nút Đồng ý)
  const confirmRemove = () => {
    if (!itemToDelete) return;

    const newCart = cartItems.filter(item => item.cartId !== itemToDelete);
    saveAndSyncCart(newCart);
    setSelectedItems(prev => prev.filter(id => id !== itemToDelete));

    setItemToDelete(null); // Đóng hộp thoại sau khi xóa xong
  };

  // 3. Hàm Hủy Xóa
  const cancelRemove = () => {
    setItemToDelete(null);
  };

  const toggleSelect = (cartId) => {
    setSelectedItems(prev =>
      prev.includes(cartId) ? prev.filter(id => id !== cartId) : [...prev, cartId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedItems.length === cartItems.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(cartItems.map(item => item.cartId));
    }
  };

  const calculateTotal = () => {
    return cartItems
      .filter(item => selectedItems.includes(item.cartId))
      .reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const calculateSelectedQuantity = () => {
    return cartItems
      .filter(item => selectedItems.includes(item.cartId))
      .reduce((sum, item) => sum + item.quantity, 0);
  };

  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-10 rounded-3xl shadow-sm flex flex-col items-center max-w-md w-full text-center">
          <div className="w-24 h-24 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-6">
            <ShoppingBag className="w-12 h-12" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Giỏ hàng trống</h2>
          <p className="text-gray-500 mb-8">Bạn chưa chọn chiếc kính nào. Hãy quay lại cửa hàng để khám phá nhé!</p>
          <Link to="/" className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-blue-700 transition flex items-center justify-center gap-2">
            <ArrowLeft className="w-5 h-5" /> Tiếp tục mua sắm
          </Link>
        </div>
      </div>
    );
  }

  const isAllSelected = selectedItems.length === cartItems.length && cartItems.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 py-8 pb-24 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        <Link to="/" className="inline-flex items-center text-gray-500 hover:text-blue-600 mb-6 font-medium transition">
          <ArrowLeft className="w-5 h-5 mr-2" /> Tiếp tục mua sắm
        </Link>

        <h1 className="text-3xl font-black text-gray-900 mb-8">Giỏ hàng của bạn</h1>

        <div className="flex flex-col lg:flex-row gap-8">

          <div className="lg:w-2/3 space-y-4">

            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
              <button onClick={toggleSelectAll} className="flex items-center gap-3 text-gray-700 hover:text-blue-600 transition group font-medium">
                <div className={`w-6 h-6 rounded flex items-center justify-center border-2 transition-colors ${isAllSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 group-hover:border-blue-400'}`}>
                  {isAllSelected && <ShieldCheck className="w-4 h-4 text-white" />}
                </div>
                Chọn tất cả ({cartItems.length} sản phẩm)
              </button>
            </div>

            {cartItems.map((item) => {
              const isSelected = selectedItems.includes(item.cartId);

              return (
                <div key={item.cartId} className={`bg-white p-3 sm:p-5 rounded-2xl shadow-sm border-2 transition-all flex items-start gap-3 sm:gap-4 ${isSelected ? 'border-blue-400' : 'border-transparent hover:border-gray-200'}`}>

                  <button onClick={() => toggleSelect(item.cartId)} className="mt-1 sm:mt-2 flex-shrink-0">
                    <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded flex items-center justify-center border-2 transition-colors ${isSelected ? 'bg-blue-600 border-blue-600 shadow-md shadow-blue-200' : 'border-gray-300 bg-gray-50 hover:border-blue-400'}`}>
                      {isSelected && <ShieldCheck className="w-3 h-3 sm:w-4 sm:h-4 text-white" />}
                    </div>
                  </button>

                  <div className="w-20 h-20 sm:w-28 sm:h-28 bg-gray-50 rounded-xl flex-shrink-0 p-1 cursor-pointer" onClick={() => toggleSelect(item.cartId)}>
                    <img src={item.image} alt={item.name} className="w-full h-full object-contain" />
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col justify-between h-full min-h-[5rem] sm:min-h-[7rem]">
                    <div className="flex justify-between items-start gap-2">
                      <h3 className="text-sm sm:text-lg font-bold text-gray-900 leading-tight line-clamp-2">{item.name}</h3>

                      {/* --- THAY ĐỔI: GỌI HÀM PROMPT THAY VÌ XÓA LUÔN --- */}
                      <button
                        onClick={() => promptRemoveItem(item.cartId)}
                        className="text-gray-400 hover:text-red-500 p-1 -mr-2 -mt-1 transition"
                      >
                        <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                    </div>

                     {item.hasPrescription ? (
                      <div className="mt-1 space-y-1">
                        {item.od_sph !== undefined && item.od_sph !== null ? (
                          <>
                            <div className="flex flex-wrap gap-1.5">
                              <span className="bg-blue-50 text-blue-700 text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded border border-blue-100" translate="no">
                                Phải (OD): SPH {item.od_sph} | CYL {item.od_cyl ?? 0} | AXIS {item.od_axis ?? 0}
                              </span>
                              <span className="bg-blue-50 text-blue-700 text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded border border-blue-100" translate="no">
                                Trái (OS): SPH {item.os_sph} | CYL {item.os_cyl ?? 0} | AXIS {item.os_axis ?? 0}
                              </span>
                            </div>
                            <div className="flex gap-2 text-[10px] text-gray-500 font-bold">
                              <span>PD: {item.pd ? `${item.pd} mm` : 'N/A'}</span>
                              {item.rxDate && <span>• Ngày đo: {new Date(item.rxDate).toLocaleDateString('vi-VN')}</span>}
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-wrap gap-1 sm:gap-2">
                            <span className="bg-blue-50 text-blue-700 text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded border border-blue-100" translate="no">
                              OD: {item.od || '0.00'}
                            </span>
                            <span className="bg-blue-50 text-blue-700 text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded border border-blue-100" translate="no">
                              OS: {item.os || '0.00'}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] sm:text-sm text-gray-500 mt-1">Mắt thường</p>
                    )}

                    <div className="mt-2 flex items-end justify-between">
                      <div className="flex flex-col gap-1">
                        {item.discountPercent > 0 && item.originalPrice > item.price ? (
                          <>
                            <span className="text-[10px] text-gray-400 line-through leading-none">
                              {item.originalPrice.toLocaleString('vi-VN')} đ
                            </span>
                            <span className="font-black text-red-500 text-[15px] sm:text-lg leading-none">
                              {item.price.toLocaleString('vi-VN')} đ
                            </span>
                          </>
                        ) : (
                          <span className="font-black text-blue-600 text-[15px] sm:text-lg leading-none">
                            {item.price.toLocaleString('vi-VN')} đ
                          </span>
                        )}
                      </div>

                      <div className="flex items-center bg-gray-100 rounded border border-gray-200">
                        <button onClick={() => updateQuantity(item.cartId, -1)} disabled={item.quantity <= 1} className="w-7 h-7 flex items-center justify-center bg-white text-gray-600 disabled:opacity-50">
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-8 text-center text-xs sm:text-sm font-bold text-gray-900 border-x border-gray-200">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.cartId, 1)} className="w-7 h-7 flex items-center justify-center bg-white text-gray-600 hover:text-blue-600">
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>

          <div className="lg:w-1/3">
            <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-gray-100 sticky top-24">
              <h3 className="text-xl font-bold text-gray-900 mb-6">Tóm tắt đơn hàng</h3>

              <div className="space-y-4 mb-6">
                <div className="flex justify-between text-gray-600">
                  <span>Tổng tiền ({calculateSelectedQuantity()} sản phẩm)</span>
                  <span className="font-bold text-gray-900">{calculateTotal().toLocaleString('vi-VN')} đ</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Phí vận chuyển</span>
                  <span className="font-bold text-green-600">Miễn phí</span>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-6 mb-8">
                <div className="flex justify-between items-end">
                  <span className="text-lg font-bold text-gray-900">Tổng thanh toán</span>
                  <span className="text-3xl font-black text-blue-600">{calculateTotal().toLocaleString('vi-VN')} đ</span>
                </div>
                <p className="text-xs text-gray-400 mt-2 text-right">(Đã bao gồm VAT)</p>
              </div>

              <button
                disabled={selectedItems.length === 0}
                // GẮN THÊM DÒNG ONCLICK NÀY: Nó sẽ chuyển trang và "cầm theo" mảng selectedItems
                onClick={() => navigate('/checkout', { state: { selectedItems } })}
                className={`w-full py-5 rounded-2xl font-bold text-xl transition flex items-center justify-center gap-2 shadow-lg transform active:scale-95
      ${selectedItems.length === 0
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-900 text-white hover:bg-blue-600'
                  }
    `}
              >
                <ShieldCheck className="w-6 h-6" />
                {selectedItems.length === 0 ? 'Vui lòng chọn sản phẩm' : `Thanh toán (${calculateSelectedQuantity()})`}
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* ================= MODAL XÁC NHẬN XÓA ================= */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">

            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Bỏ sản phẩm này?</h3>
              <p className="text-gray-500 mb-8 text-sm px-2">
                Bạn có chắc chắn muốn xóa sản phẩm này khỏi giỏ hàng không?
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={cancelRemove}
                className="flex-1 bg-gray-100 text-gray-700 py-3.5 rounded-xl font-bold hover:bg-gray-200 transition"
              >
                Không
              </button>
              <button
                onClick={confirmRemove}
                className="flex-1 bg-red-500 text-white py-3.5 rounded-xl font-bold hover:bg-red-600 transition shadow-lg shadow-red-500/30"
              >
                Đồng ý
              </button>
            </div>

          </div>
        </div>
      )}
      {/* ======================================================= */}

    </div>
  );
}