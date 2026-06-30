import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function Register() {
  const [formData, setFormData] = useState({ name: '', phone: '', username: '', password: '' });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await response.json();

      if (data.success) {
        alert('Đăng ký thành công! Đang chuyển hướng đến Đăng nhập...');
        navigate('/login');
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Không thể kết nối đến máy chủ.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
        <h2 className="text-3xl font-black text-center text-gray-900 mb-8">Tạo tài khoản</h2>
        
        {error && <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium mb-6 text-center">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="text-sm font-bold text-gray-700">Họ và tên</label>
            <input required type="text" className="mt-1 w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none" onChange={e => setFormData({...formData, name: e.target.value})} />
          </div>
          <div>
            <label className="text-sm font-bold text-gray-700">Số điện thoại</label>
            <input required type="tel" className="mt-1 w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none" onChange={e => setFormData({...formData, phone: e.target.value})} />
          </div>
          <div>
            <label className="text-sm font-bold text-gray-700">Tên đăng nhập (Email)</label>
            <input required type="text" className="mt-1 w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none" onChange={e => setFormData({...formData, username: e.target.value})} />
          </div>
          <div>
            <label className="text-sm font-bold text-gray-700">Mật khẩu</label>
            <input required type="password" className="mt-1 w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none" onChange={e => setFormData({...formData, password: e.target.value})} />
          </div>

          <button type="submit" className="w-full py-4 bg-gray-900 text-white font-bold rounded-xl hover:bg-blue-600 transition">
            Đăng Ký
          </button>
        </form>

        <p className="mt-6 text-center text-gray-600">
          Đã có tài khoản? <Link to="/login" className="font-bold text-blue-600 hover:underline">Đăng nhập ngay</Link>
        </p>
      </div>
    </div>
  );
}