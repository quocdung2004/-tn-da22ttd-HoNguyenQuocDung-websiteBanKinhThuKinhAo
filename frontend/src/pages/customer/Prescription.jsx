import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Clipboard, Save, AlertTriangle, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function MyPrescription() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [prescription, setPrescription] = useState({
    rightEye: { sphere: '', cylinder: '', axis: '' },
    leftEye: { sphere: '', cylinder: '', axis: '' },
    pd: '',
    issuedDate: '',
    note: ''
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const fetchPrescription = async () => {
      try {
        const token = localStorage.getItem('glassesToken');
        const res = await fetch('/api/prescription', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json();
        if (data.success && data.prescription) {
          const rx = data.prescription;
          setPrescription({
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
        console.error('Lỗi lấy hồ sơ độ cận:', err);
        setMessage({ text: 'Không thể tải hồ sơ độ cận của bạn!', type: 'error' });
      } finally {
        setLoading(false);
      }
    };

    fetchPrescription();
  }, [user, navigate]);

  const handleEyeChange = (eye, field, value) => {
    setPrescription(prev => ({
      ...prev,
      [eye]: {
        ...prev[eye],
        [field]: value
      }
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ text: '', type: '' });

    try {
      const token = localStorage.getItem('glassesToken');
      const res = await fetch('/api/prescription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          rightEye: {
            sphere: prescription.rightEye.sphere !== '' ? Number(prescription.rightEye.sphere) : undefined,
            cylinder: prescription.rightEye.cylinder !== '' ? Number(prescription.rightEye.cylinder) : undefined,
            axis: prescription.rightEye.axis !== '' ? Number(prescription.rightEye.axis) : undefined
          },
          leftEye: {
            sphere: prescription.leftEye.sphere !== '' ? Number(prescription.leftEye.sphere) : undefined,
            cylinder: prescription.leftEye.cylinder !== '' ? Number(prescription.leftEye.cylinder) : undefined,
            axis: prescription.leftEye.axis !== '' ? Number(prescription.leftEye.axis) : undefined
          },
          pd: prescription.pd !== '' ? Number(prescription.pd) : undefined,
          issuedDate: prescription.issuedDate || undefined,
          note: prescription.note
        })
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ text: 'Cập nhật hồ sơ độ cận thành công!', type: 'success' });
      } else {
        setMessage({ text: data.message || 'Lưu thất bại!', type: 'error' });
      }
    } catch (err) {
      console.error('Lỗi lưu hồ sơ độ cận:', err);
      setMessage({ text: 'Lỗi kết nối máy chủ.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="font-bold text-gray-500">Đang tải hồ sơ độ cận...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-black text-gray-900 mb-8 flex items-center gap-2">
          <Eye className="w-8 h-8 text-blue-600" /> Hồ sơ độ cận của tôi
        </h1>

        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-8">
            
            {/* Cảnh báo bắt buộc */}
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start gap-3 mb-6">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 font-bold">
                Thông tin độ cận do khách hàng tự cung cấp. Vui lòng kiểm tra kỹ trước khi đặt kính.
              </p>
            </div>

            {message.text && (
              <div className={`p-4 rounded-xl font-medium mb-6 ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {message.text}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-8">
              
              {/* PHẢI (OD) */}
              <div>
                <h3 className="text-md font-extrabold text-blue-700 uppercase tracking-wider mb-4 border-b pb-2 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span> Mắt Phải (OD)
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Độ Cầu (SPH)</label>
                    <input type="number" step="0.25" placeholder="-0.00" value={prescription.rightEye.sphere} onChange={e => handleEyeChange('rightEye', 'sphere', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Độ Loạn (CYL)</label>
                    <input type="number" step="0.25" placeholder="-0.00" value={prescription.rightEye.cylinder} onChange={e => handleEyeChange('rightEye', 'cylinder', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Trục Loạn (AXIS)</label>
                    <input type="number" min="0" max="180" placeholder="0 - 180" value={prescription.rightEye.axis} onChange={e => handleEyeChange('rightEye', 'axis', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none" />
                  </div>
                </div>
              </div>

              {/* TRÁI (OS) */}
              <div>
                <h3 className="text-md font-extrabold text-indigo-700 uppercase tracking-wider mb-4 border-b pb-2 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span> Mắt Trái (OS)
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Độ Cầu (SPH)</label>
                    <input type="number" step="0.25" placeholder="-0.00" value={prescription.leftEye.sphere} onChange={e => handleEyeChange('leftEye', 'sphere', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Độ Loạn (CYL)</label>
                    <input type="number" step="0.25" placeholder="-0.00" value={prescription.leftEye.cylinder} onChange={e => handleEyeChange('leftEye', 'cylinder', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Trục Loạn (AXIS)</label>
                    <input type="number" min="0" max="180" placeholder="0 - 180" value={prescription.leftEye.axis} onChange={e => handleEyeChange('leftEye', 'axis', e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none" />
                  </div>
                </div>
              </div>

              {/* KHOẢNG CÁCH ĐỒNG TỬ & NGÀY ĐO */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Khoảng cách đồng tử (PD) (mm)</label>
                  <input type="number" placeholder="50 - 75" value={prescription.pd} onChange={e => setPrescription({...prescription, pd: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Ngày đo khám mắt</label>
                  <input type="date" value={prescription.issuedDate} onChange={e => setPrescription({...prescription, issuedDate: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none" />
                </div>
              </div>

              {/* GHI CHÚ */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Ghi chú thêm</label>
                <textarea rows="3" placeholder="Nhập ghi chú hoặc tên bác sĩ/phòng khám (nếu có)" value={prescription.note} onChange={e => setPrescription({...prescription, note: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none resize-none"></textarea>
              </div>

              <div className="flex justify-end pt-4">
                <button type="submit" disabled={saving} className="flex items-center gap-2 bg-gray-900 text-white px-8 py-4 rounded-2xl font-black hover:bg-blue-600 transition shadow-lg disabled:bg-gray-400">
                  <Save className="w-5 h-5" /> {saving ? 'Đang lưu...' : 'Lưu hồ sơ độ cận'}
                </button>
              </div>

            </form>
          </div>
        </div>
      </div>
    </div>
  );
}