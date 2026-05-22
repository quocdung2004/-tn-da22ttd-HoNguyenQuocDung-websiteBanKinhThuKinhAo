import React, { useState, useEffect } from 'react';
import { Users, UserCheck, ShieldAlert, PlusCircle, Pencil, Lock, Unlock, Mail, Phone, User, RefreshCw, X, AlertTriangle } from 'lucide-react';

export default function UserManager() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Tab hiện tại: 'staff' hoặc 'customer'
  const [activeTab, setActiveTab] = useState('staff');
  
  // State quản lý Modal Thêm/Sửa Staff
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null); // null = Đang tạo mới, object = Đang chỉnh sửa
  const [staffForm, setStaffForm] = useState({
    username: '',
    password: '',
    name: '',
    phone: '',
    email: ''
  });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // State quản lý Modal Xác nhận Khóa / Mở khóa
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    user: null // Đối tượng user đang tác động
  });

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('glassesToken');
      const res = await fetch('/api/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setUsers(data.users);
      } else {
        setError(data.message || 'Lấy danh sách người dùng thất bại!');
      }
    } catch (err) {
      console.error(err);
      setError('Lỗi kết nối máy chủ. Vui lòng thử lại!');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Lọc danh sách theo tab hoạt động
  // role === 2 là Staff, role === 0 là Customer. Riêng role === 1 là Admin cũng hiển thị ở Staff để đầy đủ quản trị.
  const filteredUsers = users.filter(u => {
    if (activeTab === 'staff') {
      return u.role === 1 || u.role === 2;
    } else {
      return u.role === 0;
    }
  });

  // Mở Modal lập tài khoản Staff mới
  const handleOpenCreateStaff = () => {
    setEditingStaff(null);
    setStaffForm({
      username: '',
      password: '',
      name: '',
      phone: '',
      email: ''
    });
    setFormError('');
    setIsStaffModalOpen(true);
  };

  // Mở Modal sửa tài khoản Staff
  const handleOpenEditStaff = (staff) => {
    setEditingStaff(staff);
    setStaffForm({
      username: staff.username,
      password: '', // Chừa trống để Admin tùy chọn reset mật khẩu
      name: staff.name || '',
      phone: staff.phone || '',
      email: staff.email || ''
    });
    setFormError('');
    setIsStaffModalOpen(true);
  };

  // Submit Modal Form Staff
  const handleStaffFormSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);

    // Validate cơ bản
    if (!editingStaff && (!staffForm.username || !staffForm.password)) {
      setFormError('Vui lòng điền tên đăng nhập và mật khẩu!');
      setSubmitting(false);
      return;
    }

    try {
      const token = localStorage.getItem('glassesToken');
      const url = editingStaff 
        ? `/api/users/staff/${editingStaff._id}`
        : '/api/users/staff';
      const method = editingStaff ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(staffForm)
      });
      const data = await res.json();

      if (data.success) {
        setIsStaffModalOpen(false);
        // Tải lại danh sách tươi từ MongoDB
        fetchUsers();
      } else {
        setFormError(data.message || 'Thao tác thất bại!');
      }
    } catch (err) {
      console.error(err);
      setFormError('Lỗi kết nối máy chủ, vui lòng thao tác lại!');
    } finally {
      setSubmitting(false);
    }
  };

  // Mở Confirm Modal Khóa / Mở khóa
  const handleOpenConfirmToggleBlock = (user) => {
    setConfirmModal({
      isOpen: true,
      user
    });
  };

  // Thực thi Khóa / Mở khóa người dùng
  const handleConfirmToggleBlock = async () => {
    const { user } = confirmModal;
    if (!user) return;

    try {
      const token = localStorage.getItem('glassesToken');
      const res = await fetch(`/api/users/${user._id}/toggle-block`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();

      if (data.success) {
        setConfirmModal({ isOpen: false, user: null });
        fetchUsers(); // Tải lại danh sách
      } else {
        alert(data.message || 'Thay đổi trạng thái tài khoản thất bại!');
      }
    } catch (err) {
      console.error(err);
      alert('Lỗi kết nối. Không thể khóa/mở khóa tài khoản!');
    }
  };

  return (
    <div className="p-6 sm:p-8 min-h-screen bg-gray-50/50">
      
      {/* ================= TIÊU ĐỀ & NÚT THÊM STAFF ================= */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-900 flex items-center gap-3">
            <Users className="w-8 h-8 text-blue-600" /> Quản Lý Tài Khoản
          </h1>
          <p className="text-gray-500 mt-1 font-medium">Hệ thống quản lý Nhân viên & phân quyền Khách hàng tối cao.</p>
        </div>
        
        {activeTab === 'staff' && (
          <button
            onClick={handleOpenCreateStaff}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold px-5 py-3 rounded-2xl shadow-md hover:shadow-lg transition transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <PlusCircle className="w-5 h-5" /> Thêm Nhân Viên Mới
          </button>
        )}
      </div>

      {/* ================= THANH TABS CHỌN ĐỐI TƯỢNG ================= */}
      <div className="flex bg-white p-1.5 rounded-2xl border border-gray-100 max-w-md shadow-sm mb-8">
        <button
          onClick={() => setActiveTab('staff')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'staff'
              ? 'bg-gray-900 text-white shadow-md'
              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <UserCheck className="w-4 h-4" /> Nhân Viên ({users.filter(u => u.role === 1 || u.role === 2).length})
        </button>
        <button
          onClick={() => setActiveTab('customer')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'customer'
              ? 'bg-gray-900 text-white shadow-md'
              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <Users className="w-4 h-4" /> Khách Hàng ({users.filter(u => u.role === 0).length})
        </button>
      </div>

      {/* ================= GIAO DIỆN CHÍNH ================= */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white border border-gray-100 rounded-3xl shadow-sm">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-400 font-bold mt-4">Đang tải danh sách tài khoản...</p>
        </div>
      ) : error ? (
        <div className="text-center py-16 bg-white border border-gray-100 rounded-3xl shadow-sm">
          <ShieldAlert className="w-16 h-16 text-red-500 mx-auto mb-4 animate-bounce" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">Đã xảy ra sự cố!</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">{error}</p>
          <button 
            onClick={fetchUsers} 
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Thử lại
          </button>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-20 bg-white border border-gray-100 rounded-3xl shadow-sm">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
            <Users className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">Không có tài khoản nào</h3>
          <p className="text-gray-400 mt-1">Danh sách đối tượng này hiện đang trống rỗng.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-3xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="p-4 sm:p-5 text-xs font-bold uppercase tracking-wider text-gray-400 pl-6 sm:pl-8">Họ Tên / Username</th>
                  <th className="p-4 sm:p-5 text-xs font-bold uppercase tracking-wider text-gray-400">Email</th>
                  <th className="p-4 sm:p-5 text-xs font-bold uppercase tracking-wider text-gray-400">Điện Thoại</th>
                  <th className="p-4 sm:p-5 text-xs font-bold uppercase tracking-wider text-gray-400">Vai Trò</th>
                  <th className="p-4 sm:p-5 text-xs font-bold uppercase tracking-wider text-gray-400">Trạng Thái</th>
                  <th className="p-4 sm:p-5 text-xs font-bold uppercase tracking-wider text-gray-400 pr-6 sm:pr-8 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUsers.map((user) => (
                  <tr 
                    key={user._id} 
                    className={`hover:bg-gray-50/50 transition-colors ${
                      user.isBlocked ? 'bg-red-50/10' : ''
                    }`}
                  >
                    {/* Username & Họ tên */}
                    <td className="p-4 sm:p-5 pl-6 sm:pl-8">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                          user.role === 1 
                            ? 'bg-amber-100 text-amber-700' 
                            : user.role === 2 
                            ? 'bg-blue-100 text-blue-700' 
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          {user.name ? user.name.substring(0, 2).toUpperCase() : 'US'}
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                            {user.name || 'Chưa thiết lập'}
                            {user.isBlocked && (
                              <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-black rounded-md">Bị khóa</span>
                            )}
                          </h4>
                          <span className="text-xs text-gray-400 font-medium">@{user.username}</span>
                        </div>
                      </div>
                    </td>
                    
                    {/* Email */}
                    <td className="p-4 sm:p-5 text-sm text-gray-600 font-medium">
                      {user.email ? (
                        <span className="flex items-center gap-1.5">
                          <Mail className="w-4 h-4 text-gray-400" /> {user.email}
                        </span>
                      ) : (
                        <span className="text-gray-300">--</span>
                      )}
                    </td>
                    
                    {/* Điện thoại */}
                    <td className="p-4 sm:p-5 text-sm text-gray-600 font-medium">
                      {user.phone ? (
                        <span className="flex items-center gap-1.5">
                          <Phone className="w-4 h-4 text-gray-400" /> {user.phone}
                        </span>
                      ) : (
                        <span className="text-gray-300">--</span>
                      )}
                    </td>
                    
                    {/* Vai Trò */}
                    <td className="p-4 sm:p-5">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                        user.role === 1
                          ? 'bg-amber-100 text-amber-800'
                          : user.role === 2
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {user.role === 1 ? 'Admin' : user.role === 2 ? 'Staff' : 'Khách'}
                      </span>
                    </td>
                    
                    {/* Trạng Thái */}
                    <td className="p-4 sm:p-5">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-black flex items-center gap-1.5 w-fit ${
                        user.isBlocked
                          ? 'bg-red-100 text-red-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          user.isBlocked ? 'bg-red-600' : 'bg-emerald-600'
                        }`}></span>
                        {user.isBlocked ? 'Đang Khóa' : 'Hoạt Động'}
                      </span>
                    </td>
                    
                    {/* Thao tác */}
                    <td className="p-4 sm:p-5 pr-6 sm:pr-8 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Chỉ cho sửa thông tin nếu là Staff (role 2) */}
                        {user.role === 2 && (
                          <button
                            onClick={() => handleOpenEditStaff(user)}
                            className="p-2 bg-gray-50 hover:bg-gray-100 text-gray-600 hover:text-gray-900 rounded-xl transition"
                            title="Chỉnh sửa thông tin"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        
                        {/* Nút Khóa / Mở khóa (Ẩn nếu là chính tài khoản đang login) */}
                        {user._id !== localStorage.getItem('glassesUser') && (
                          <button
                            onClick={() => handleOpenConfirmToggleBlock(user)}
                            className={`p-2 rounded-xl transition ${
                              user.isBlocked
                                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-600 hover:text-emerald-700'
                                : 'bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700'
                            }`}
                            title={user.isBlocked ? 'Mở khóa tài khoản' : 'Khóa tài khoản'}
                          >
                            {user.isBlocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= MODAL THÊM / SỬA STAFF ================= */}
      {isStaffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-gray-100 overflow-hidden transform transition-all animate-scaleUp">
            
            {/* Header Modal */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-xl font-bold text-gray-950 flex items-center gap-2">
                {editingStaff ? <Pencil className="w-5 h-5 text-blue-600" /> : <PlusCircle className="w-5 h-5 text-blue-600" />}
                {editingStaff ? 'Cập Nhật Nhân Viên' : 'Thêm Nhân Viên Mới'}
              </h3>
              <button
                onClick={() => setIsStaffModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-900 rounded-xl hover:bg-gray-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleStaffFormSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-4 bg-red-50 border border-red-100 text-red-700 text-sm font-bold rounded-2xl flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-red-500 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Tên đăng nhập (Khóa nếu sửa) */}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 pl-1">Tên đăng nhập</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">@</span>
                  <input
                    type="text"
                    disabled={!!editingStaff}
                    required
                    value={staffForm.username}
                    onChange={(e) => setStaffForm({ ...staffForm, username: e.target.value })}
                    className="w-full pl-9 pr-4 py-3 bg-gray-50 border border-gray-100 disabled:bg-gray-100 disabled:text-gray-400 rounded-2xl font-bold text-gray-900 focus:outline-none focus:border-blue-500 focus:bg-white transition"
                    placeholder="VD: dung_staff"
                  />
                </div>
              </div>

              {/* Mật khẩu */}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 pl-1">
                  Mật khẩu {editingStaff && <span className="text-[10px] text-blue-500 lowercase">(Để trống nếu không muốn đổi)</span>}
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="password"
                    required={!editingStaff}
                    value={staffForm.password}
                    onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
                    className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-gray-900 focus:outline-none focus:border-blue-500 focus:bg-white transition"
                    placeholder={editingStaff ? "Nhập mật khẩu reset mới..." : "Nhập mật khẩu..."}
                  />
                </div>
              </div>

              {/* Họ tên */}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 pl-1">Họ và tên</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    required
                    value={staffForm.name}
                    onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
                    className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-gray-900 focus:outline-none focus:border-blue-500 focus:bg-white transition"
                    placeholder="VD: Nguyễn Văn Dũng"
                  />
                </div>
              </div>

              {/* Số điện thoại */}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 pl-1">Số điện thoại</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    required
                    value={staffForm.phone}
                    onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
                    className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-gray-900 focus:outline-none focus:border-blue-500 focus:bg-white transition"
                    placeholder="VD: 0987654321"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 pl-1">Email</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="email"
                    required
                    value={staffForm.email}
                    onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                    className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-gray-900 focus:outline-none focus:border-blue-500 focus:bg-white transition"
                    placeholder="VD: staff@dungglasses.com"
                  />
                </div>
              </div>

              {/* Footer Buttons */}
              <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsStaffModalOpen(false)}
                  className="flex-1 py-3 text-gray-500 hover:text-gray-900 font-bold hover:bg-gray-100 rounded-2xl transition"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold rounded-2xl shadow-md hover:shadow-lg transition"
                >
                  {submitting ? 'Đang xử lý...' : editingStaff ? 'Lưu Thay Đổi' : 'Tạo Tài Khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL XÁC NHẬN KHÓA / MỞ KHÓA ================= */}
      {confirmModal.isOpen && confirmModal.user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-gray-100 p-6 transform transition-all animate-scaleUp">
            <div className="flex items-center justify-center w-12 h-12 bg-amber-50 text-amber-600 rounded-full mx-auto mb-4 border border-amber-100">
              <AlertTriangle className="w-6 h-6 animate-pulse" />
            </div>
            
            <h3 className="text-xl font-bold text-center text-gray-900 mb-2">
              {confirmModal.user.isBlocked ? 'Mở Khóa Tài Khoản?' : 'Khóa Tài Khoản?'}
            </h3>
            
            <p className="text-gray-500 text-sm text-center mb-6 leading-relaxed">
              Bạn có chắc chắn muốn {confirmModal.user.isBlocked ? 'mở khóa' : 'khóa'} tài khoản{' '}
              <strong className="text-gray-900 font-black">@{confirmModal.user.username}</strong> ({confirmModal.user.name}) không?{' '}
              {!confirmModal.user.isBlocked && 'Tài khoản này sau khi khóa sẽ không thể truy cập, đặt hàng hoặc thao tác trên website!'}
            </p>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setConfirmModal({ isOpen: false, user: null })}
                className="flex-1 py-3 text-gray-500 hover:text-gray-900 font-bold hover:bg-gray-100 rounded-2xl transition"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleConfirmToggleBlock}
                className={`flex-1 py-3 text-white font-bold rounded-2xl shadow-md hover:shadow-lg transition ${
                  confirmModal.user.isBlocked 
                    ? 'bg-emerald-600 hover:bg-emerald-700' 
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {confirmModal.user.isBlocked ? 'Mở Khóa Ngay' : 'Khóa Tài Khoản'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
