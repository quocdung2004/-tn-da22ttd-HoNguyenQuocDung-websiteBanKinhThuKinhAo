import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Truck, QrCode, CreditCard, Banknote, Loader2 } from 'lucide-react';

export default function Checkout() {
  const navigate = useNavigate();
  const location = useLocation();

  const [checkoutItems, setCheckoutItems] = useState([]);
  const selectedIds = location.state?.selectedItems || [];

  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', address: '', note: '' });
  const [paymentMethod, setPaymentMethod] = useState('cod');

  // Trạng thái cho luồng PayOS
  const [isProcessing, setIsProcessing] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [qrData, setQrData] = useState(null); // Lưu thông tin QR PayOS trả về
  const [activeOrderCode, setActiveOrderCode] = useState(null);

  // Dùng Ref để dọn dẹp interval khi rời trang
  const pollingIntervalRef = useRef(null);

  useEffect(() => {
    const savedCart = JSON.parse(localStorage.getItem('glassesCart')) || [];
    const itemsToCheckout = savedCart.filter(item => selectedIds.includes(item.cartId));
    setCheckoutItems(itemsToCheckout);

    if (itemsToCheckout.length === 0) {
      alert("Vui lòng chọn sản phẩm trước khi thanh toán!");
      navigate('/cart');
    }

    return () => {
      // Khi rời trang (unmount), phải dập tắt bộ đếm để tránh lag máy
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, []);

  const calculateTotal = () => {
    return checkoutItems.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  // --- HÀM 1: KHÁCH BẤM ĐẶT HÀNG ---
  const handlePlaceOrder = async () => {
    if (!customerInfo.name || !customerInfo.phone || !customerInfo.address) {
      alert("Vui lòng điền đầy đủ thông tin giao hàng!");
      return;
    }

    if (paymentMethod === 'banking') {
      // LUỒNG TỰ ĐỘNG PAYOS
      setIsProcessing(true);
      try {
        // Gọi Backend khởi tạo link PayOS
        const response = await fetch('/api/create-payment-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: calculateTotal(),
            description: `KinhMat ${customerInfo.phone.slice(-4)}` // Mô tả ngắn gọn
          })
        });

        const data = await response.json();

        if (data.success) {
          // PayOS trả về bin, accountNumber, amount, description -> Ta tự ghép ra ảnh QR
          const payData = data.paymentData;
          const qrImageUrl = `https://img.vietqr.io/image/${payData.bin}-${payData.accountNumber}-compact2.png?amount=${payData.amount}&addInfo=${payData.description}&accountName=${payData.accountName}`;

          setQrData({ url: qrImageUrl, amount: payData.amount, desc: payData.description });
          setActiveOrderCode(data.orderCode);
          setShowQR(true);

          // Bắt đầu bật chế độ "Lính canh": Cứ 2 giây hỏi Backend 1 lần xem tiền vào chưa
          startPollingPayment(data.orderCode);
        } else {
          alert("Lỗi kết nối PayOS, vui lòng thử lại!");
        }
      } catch (error) {
        console.error(error);
        alert("Không thể kết nối đến máy chủ thanh toán.");
      } finally {
        setIsProcessing(false);
      }

    } else {
      // LUỒNG COD BÌNH THƯỜNG
      processSuccessfulOrder(Number(Date.now().toString().slice(-9)));
    }
  };

  // --- HÀM 2: LÍNH CANH (POLLING) ---
  const startPollingPayment = (orderCode) => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/check-payment/${orderCode}`);
        const data = await response.json();

        // NẾU BACKEND BÁO ĐÃ CÓ TIỀN VÀO!
        if (data.status === 'PAID') {
          clearInterval(pollingIntervalRef.current); // Tắt lính canh
          processSuccessfulOrder(orderCode); // Hoàn tất đơn
        }
      } catch (error) {
        console.log("Đang chờ thanh toán...");
      }
    }, 2000); // 2 giây hỏi 1 lần
  };

  // --- HÀM 3: HOÀN TẤT ĐƠN HÀNG (CHẠY KHI COD HOẶC KHI PAYOS BÁO TING TINH) ---
  const processSuccessfulOrder = (finalOrderCode) => {
    const currentCart = JSON.parse(localStorage.getItem('glassesCart')) || [];
    const purchasedIds = checkoutItems.map(item => item.cartId);
    const remainingCart = currentCart.filter(item => !purchasedIds.includes(item.cartId));

    localStorage.setItem('glassesCart', JSON.stringify(remainingCart));
    window.dispatchEvent(new Event('cartUpdated'));

    const newOrder = {
      id: `DH${finalOrderCode}`,
      customer: customerInfo,
      items: checkoutItems,
      total: calculateTotal(),
      paymentMethod: paymentMethod,
      status: paymentMethod === 'banking' ? 'paid' : 'pending', // Phân loại rạch ròi
      date: new Date().toISOString()
    };

    const existingOrders = JSON.parse(localStorage.getItem('glassesOrders')) || [];
    localStorage.setItem('glassesOrders', JSON.stringify([newOrder, ...existingOrders]));

    const methodText = paymentMethod === 'cod' ? 'Thanh toán khi nhận hàng' : 'Đã thanh toán tự động qua QR';

    // Đá sang trang Success và ném cho nó cái mã đơn hàng + phương thức để hiển thị
    navigate('/success', {
      state: {
        orderId: `DH${finalOrderCode}`,
        method: methodText
      }
    });
  };

  if (checkoutItems.length === 0) return null;

  return (
    <div className="min-h-screen bg-gray-50 py-8 pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        <button onClick={() => navigate(-1)} className="inline-flex items-center text-gray-500 hover:text-blue-600 mb-6 font-medium transition">
          <ArrowLeft className="w-5 h-5 mr-2" /> Quay lại giỏ hàng
        </button>

        <h1 className="text-3xl font-black text-gray-900 mb-8">Thanh Toán Đơn Hàng</h1>

        <div className="flex flex-col lg:flex-row gap-8">

          {/* CỘT TRÁI: FORM */}
          <div className="lg:w-2/3 space-y-6">
            <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-gray-100">
              <h2 className="text-xl font-bold flex items-center gap-2 mb-6">
                <Truck className="text-blue-600 w-6 h-6" /> Thông tin nhận hàng
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-bold text-gray-700">Họ và tên *</label>
                  <input type="text" placeholder="Nguyễn Văn A" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none" value={customerInfo.name} onChange={e => setCustomerInfo({ ...customerInfo, name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-bold text-gray-700">Số điện thoại *</label>
                  <input type="tel" placeholder="0901234567" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none" value={customerInfo.phone} onChange={e => setCustomerInfo({ ...customerInfo, phone: e.target.value })} />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-bold text-gray-700">Địa chỉ chi tiết *</label>
                  <input type="text" placeholder="Số nhà, Phường/Xã..." className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none" value={customerInfo.address} onChange={e => setCustomerInfo({ ...customerInfo, address: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-gray-100">
              <h2 className="text-xl font-bold flex items-center gap-2 mb-6">
                <CreditCard className="text-blue-600 w-6 h-6" /> Phương thức thanh toán
              </h2>
              <div className="space-y-3">
                {/* Option COD */}
                <label className={`flex items-center p-4 border-2 rounded-2xl cursor-pointer transition-all ${paymentMethod === 'cod' ? 'border-blue-600 bg-blue-50/50' : 'border-gray-100 hover:border-blue-200'}`}>
                  <input type="radio" name="payment" value="cod" checked={paymentMethod === 'cod'} onChange={() => { setPaymentMethod('cod'); setShowQR(false); clearInterval(pollingIntervalRef.current); }} className="hidden" />
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center mr-4 flex-shrink-0 ${paymentMethod === 'cod' ? 'border-blue-600' : 'border-gray-300'}`}>
                    {paymentMethod === 'cod' && <div className="w-3 h-3 bg-blue-600 rounded-full"></div>}
                  </div>
                  <Banknote className="w-6 h-6 text-green-600 mr-3 flex-shrink-0" />
                  <div>
                    <div className="font-bold text-gray-900">Thanh toán khi nhận hàng (COD)</div>
                    <div className="text-sm text-gray-500">Thanh toán bằng tiền mặt khi shipper giao kính tới.</div>
                  </div>
                </label>

                {/* Option QR Tự động */}
                <label className={`flex items-center p-4 border-2 rounded-2xl cursor-pointer transition-all ${paymentMethod === 'banking' ? 'border-blue-600 bg-blue-50/50' : 'border-gray-100 hover:border-blue-200'}`}>
                  <input type="radio" name="payment" value="banking" checked={paymentMethod === 'banking'} onChange={() => setPaymentMethod('banking')} className="hidden" />
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center mr-4 flex-shrink-0 ${paymentMethod === 'banking' ? 'border-blue-600' : 'border-gray-300'}`}>
                    {paymentMethod === 'banking' && <div className="w-3 h-3 bg-blue-600 rounded-full"></div>}
                  </div>
                  <QrCode className="w-6 h-6 text-blue-600 mr-3 flex-shrink-0" />
                  <div>
                    <div className="font-bold text-gray-900">Chuyển khoản QR (Duyệt tự động 24/7)</div>
                    <div className="text-sm text-gray-500">Mở app Ngân hàng quét mã. Hệ thống tự động xác nhận đơn trong 3 giây.</div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* CỘT PHẢI: TỔNG KẾT & QR CODE */}
          <div className="lg:w-1/3">
            <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-gray-100 sticky top-24">
              <h3 className="text-xl font-bold text-gray-900 mb-6 border-b pb-4">Đơn hàng của bạn</h3>

              <div className="space-y-3 mb-6 max-h-48 overflow-y-auto pr-2">
                {checkoutItems.map((item, index) => (
                  <div key={index} className="flex justify-between text-sm">
                    <span className="text-gray-600 line-clamp-1 w-2/3">{item.quantity}x {item.name}</span>
                    <span className="font-bold">{(item.price * item.quantity).toLocaleString('vi-VN')} đ</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-gray-100 pt-4 mb-6">
                <div className="flex justify-between items-end">
                  <span className="text-gray-700 font-bold">Cần thanh toán</span>
                  <span className="text-2xl font-black text-blue-600">{calculateTotal().toLocaleString('vi-VN')} đ</span>
                </div>
              </div>

              {/* KHU VỰC HIỂN THỊ NÚT HOẶC MÃ QR */}
              {paymentMethod === 'cod' ? (
                <button onClick={handlePlaceOrder} className="w-full py-4 rounded-xl font-bold text-lg bg-gray-900 text-white hover:bg-blue-600 transition flex items-center justify-center gap-2 shadow-lg">
                  <CheckCircle2 className="w-6 h-6" /> Xác nhận Đặt Hàng
                </button>
              ) : (
                !showQR ? (
                  <button onClick={handlePlaceOrder} disabled={isProcessing} className="w-full py-4 rounded-xl font-bold text-lg bg-gray-900 text-white hover:bg-blue-600 disabled:bg-gray-400 transition flex items-center justify-center gap-2 shadow-lg">
                    {isProcessing ? <Loader2 className="w-6 h-6 animate-spin" /> : <QrCode className="w-6 h-6" />}
                    {isProcessing ? "Đang tạo mã QR..." : "Tạo mã QR Thanh toán"}
                  </button>
                ) : (
                  <div className="flex flex-col items-center animate-in fade-in duration-500 bg-blue-50/50 p-6 rounded-2xl border-2 border-blue-100">
                    <h4 className="font-bold text-blue-900 mb-4 text-center">Quét mã để thanh toán</h4>
                    <div className="bg-white p-2 rounded-2xl shadow-sm w-full flex justify-center mb-4 relative overflow-hidden">
                      <img src={qrData.url} alt="QR PayOS" className="w-full max-w-[200px] object-contain rounded-xl" />
                      {/* Hiệu ứng quét lade */}
                      <div className="absolute top-0 left-0 w-full h-1 bg-green-400/80 shadow-[0_0_15px_#4ade80] animate-[scan_2s_ease-in-out_infinite]"></div>
                    </div>

                    <div className="bg-white px-4 py-3 rounded-xl w-full text-center shadow-sm border border-gray-100 mb-4">
                      <p className="text-xs text-gray-500 mb-1">Mã đơn hàng (Nội dung CK)</p>
                      <p className="font-black text-lg text-blue-600 tracking-widest">{qrData.desc}</p>
                    </div>

                    <div className="flex items-center gap-3 w-full justify-center text-sm font-bold text-gray-600 bg-white py-3 rounded-full border border-gray-200">
                      <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                      Hệ thống đang chờ nhận tiền...
                    </div>

                    <button onClick={() => { setShowQR(false); clearInterval(pollingIntervalRef.current); }} className="mt-4 text-sm text-gray-400 hover:text-red-500 font-medium transition">
                      Hủy giao dịch
                    </button>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes scan {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}} />
    </div>
  );
}