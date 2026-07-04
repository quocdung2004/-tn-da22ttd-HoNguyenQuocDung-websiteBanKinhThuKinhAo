import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, AlertCircle } from 'lucide-react';

export default function OrderInvoiceQR({ orderId, orderCode }) {
  const [qrToken, setQrToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchQRToken = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem('glassesToken');
        const res = await fetch(`/api/orders/${orderId}/qr-token`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json();
        if (data.success) {
          setQrToken(data.qrToken);
        } else {
          setError(data.message || 'Không thể lấy QR Token');
        }
      } catch (err) {
        console.error('Lỗi khi lấy QR token:', err);
        setError('Lỗi kết nối');
      } finally {
        setLoading(false);
      }
    };

    if (orderId) {
      fetchQRToken();
    }
  }, [orderId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-2 border border-gray-150 rounded-2xl bg-white w-24 h-24">
        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
        <span className="text-[10px] text-gray-400 mt-1 font-bold">Đang tạo...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-1 border border-red-100 rounded-2xl bg-red-50 w-24 h-24 text-center">
        <AlertCircle className="w-4 h-4 text-red-500" />
        <span className="text-[9px] text-red-600 font-bold mt-1 leading-tight">{error}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center p-2 bg-white border border-gray-200 rounded-2xl shadow-sm w-fit">
      {qrToken && (
        <QRCodeSVG
          value={qrToken}
          size={80}
          bgColor="#ffffff"
          fgColor="#1e293b"
          level="M"
          includeMargin={false}
        />
      )}
    </div>
  );
}
