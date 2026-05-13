import React, { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle, ArrowRight, ShoppingBag, Home } from 'lucide-react';

export default function Success() {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Lấy dữ liệu mã đơn hàng từ trang Checkout truyền sang
  const { orderId, method } = location.state || { orderId: 'DH_NA', method: 'Chưa rõ' };

  // Nếu ai đó tự gõ link /success mà không có đơn hàng thì đá về trang chủ
  useEffect(() => {
    if (orderId === 'DH_NA') {
      navigate('/');
    }
  }, [orderId, navigate]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white max-w-lg w-full rounded-[40px] p-10 text-center shadow-2xl border border-gray-100 relative overflow-hidden">
        
        {/* Pháo hoa trang trí (CSS đơn giản) */}
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-green-400 to-blue-500"></div>

        {/* Icon Thành công */}
        <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
          <CheckCircle className="w-12 h-12 text-green-500" />
        </div>

        <h1 className="text-3xl font-black text-gray-900 mb-2">Đặt hàng thành công!</h1>
        <p className="text-gray-500 mb-8">Cảm ơn bạn đã tin tưởng và mua sắm tại cửa hàng của chúng tôi.</p>

        <div className="bg-gray-50 rounded-2xl p-6 mb-8 border border-gray-100 text-left space-y-3">
          <div className="flex justify-between items-center border-b border-gray-200 pb-3">
            <span className="text-gray-500 font-medium">Mã đơn hàng</span>
            <span className="font-bold text-gray-900">{orderId}</span>
          </div>
          <div className="flex justify-between items-center pt-1">
            <span className="text-gray-500 font-medium">Phương thức</span>
            <span className="font-bold text-blue-600 text-right w-2/3">{method}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Link to="/" className="w-full py-4 rounded-xl font-bold text-lg bg-gray-900 text-white hover:bg-blue-600 transition flex items-center justify-center gap-2">
            <ShoppingBag className="w-5 h-5" /> Tiếp tục mua sắm
          </Link>
          <Link to="/" className="w-full py-4 rounded-xl font-bold text-lg bg-white text-gray-900 border-2 border-gray-200 hover:bg-gray-50 transition flex items-center justify-center gap-2">
            <Home className="w-5 h-5" /> Về trang chủ
          </Link>
        </div>
      </div>
    </div>
  );
}