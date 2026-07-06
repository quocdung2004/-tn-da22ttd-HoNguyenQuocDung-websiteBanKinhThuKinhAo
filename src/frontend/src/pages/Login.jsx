import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  
  const from = location.state?.from || '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await response.json();

      if (data.success) {
        alert(`Đăng nhập thành công! Chào mừng ${data.user.name || data.user.username}.`);
        login(data.user, data.token);
        // Điều hướng dựa vào Role (0: Khách, 1: Admin, 2: Staff, 3: Shipper)
        if (data.user.role === 1) navigate('/admin');
        else if (data.user.role === 2) navigate('/staff');
        else if (data.user.role === 3) navigate('/shipper');
        else navigate(from);
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
        <h2 className="text-3xl font-black text-center text-gray-900 mb-8">Đăng nhập</h2>
        
        {error && <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium mb-6 text-center">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="text-sm font-bold text-gray-700">Tên đăng nhập</label>
            <input required type="text" className="mt-1 w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none" onChange={e => setFormData({...formData, username: e.target.value})} />
          </div>
          <div>
            <label className="text-sm font-bold text-gray-700">Mật khẩu</label>
            <input required type="password" className="mt-1 w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-600 outline-none" onChange={e => setFormData({...formData, password: e.target.value})} />
          </div>

          <button type="submit" className="w-full py-4 bg-gray-900 text-white font-bold rounded-xl hover:bg-blue-600 transition">
            Đăng Nhập
          </button>
        </form>

        <p className="mt-6 text-center text-gray-600">
          Chưa có tài khoản? <Link to="/register" className="font-bold text-blue-600 hover:underline">Tạo tài khoản</Link>
        </p>
      </div>
    </div>
  );
}