import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { User, Lock, Save, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Profile() {
  const { user, login } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  
  const [message, setMessage] = useState({ text: '', type: '' });

  // Load thông tin hiện tại vào Form
  useEffect(() => {
    if (!user) {
      navigate('/login'); // Nếu chưa đăng nhập thì đá về trang Login
      return;
    }
    setFormData(prev => ({ ...prev, name: user.name || '', phone: user.phone || '' }));
  }, [user, navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage({ text: '', type: '' });

    // Validate mật khẩu mới
    if (formData.newPassword && formData.newPassword !== formData.confirmPassword) {
      return setMessage({ text: 'Mật khẩu mới không khớp!', type: 'error' });
    }

    try {
      // Lấy thẻ token từ kho
      const token = localStorage.getItem('glassesToken');

      const response = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` // Đưa thẻ cho Cổng bảo vệ xem
        },
        body: JSON.stringify(formData)
      });
      
      const data = await response.json();

      if (data.success) {
        setMessage({ text: data.message, type: 'success' });
        // Cập nhật lại Trạm phát sóng để Navbar đổi tên ngay lập tức
        login(data.user, token); 
        // Xóa trắng ô password
        setFormData(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }));
      } else {
        setMessage({ text: data.message, type: 'error' });
      }
    } catch (error) {
      setMessage({ text: 'Lỗi kết nối đến máy chủ.', type: 'error' });
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-black text-gray-900 mb-8">Hồ sơ cá nhân</h1>

        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-8">
            
            {message.text && (
              <div className={`p-4 rounded-xl font-medium mb-6 ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {message.text}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-8">
              
              {/* KHU VỰC THÔNG TIN CƠ BẢN */}
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
                  <User className="w-5 h-5 text-blue-600" /> Thông tin liên hệ
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Tên đăng nhập (Email)</label>
                    <input type="text" value={user.username} disabled className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-100 text-gray-500 cursor-not-allowed" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Họ và tên</label>
                    <input type="text" name="name" value={formData.name} onChange={handleChange} required className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Số điện thoại</label>
                    <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none" />
                  </div>
                </div>
              </div>

              <hr className="border-gray-100" />

              {/* KHU VỰC ĐỔI MẬT KHẨU */}
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
                  <Lock className="w-5 h-5 text-blue-600" /> Đổi mật khẩu
                </h3>
                
                {/* Kiểm tra nếu là Google thì không cho sửa pass */}
                {user.authProvider === 'google' ? (
                  <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-xl flex items-start gap-3">
                    <ShieldAlert className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
                    <p className="text-sm text-yellow-800 font-medium">
                      Tài khoản của bạn được liên kết qua Google. Bạn không cần và không thể đổi mật khẩu tại đây.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-bold text-gray-700 mb-1">Mật khẩu hiện tại</label>
                      <input type="password" name="currentPassword" value={formData.currentPassword} onChange={handleChange} placeholder="Bỏ trống nếu không muốn đổi" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Mật khẩu mới</label>
                      <input type="password" name="newPassword" value={formData.newPassword} onChange={handleChange} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Nhập lại mật khẩu mới</label>
                      <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none" />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-4">
                <button type="submit" className="flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-600 transition shadow-lg">
                  <Save className="w-5 h-5" /> Lưu thay đổi
                </button>
              </div>

            </form>
          </div>
        </div>
      </div>
    </div>
  );
}