import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, Clock, Inbox } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';

export default function NotificationBell() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const bellRef = useRef(null);

  // 1. Tải danh sách thông báo kiên định từ Database qua API
  const fetchNotifications = async () => {
    const token = localStorage.getItem('glassesToken');
    if (!user || !token) return;

    try {
      const res = await fetch('/api/notifications', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        const list = data.notifications || [];
        setNotifications(list);
        setUnreadCount(list.filter(n => !n.isRead).length);
      }
    } catch (err) {
      console.warn('⚠️ Lỗi kết nối API tải thông báo:', err.message);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [user]);

  // 2. Lắng nghe thông báo Realtime từ Socket.IO
  useEffect(() => {
    if (!socket) return;

    const handleNewNotification = (payload) => {
      if (payload?.success && payload?.notification) {
        const newNotif = payload.notification;
        
        // Thêm vào hàng đầu danh sách, cập nhật badge tức thì
        setNotifications(prev => [newNotif, ...prev.slice(0, 49)]);
        setUnreadCount(prev => prev + 1);

        // Hiển thị Toast nổi nhẹ nhàng
        try {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(newNotif.title, { body: newNotif.message });
          }
        } catch (e) {}
      }
    };

    socket.on('notification:new', handleNewNotification);

    return () => {
      socket.off('notification:new', handleNewNotification);
    };
  }, [socket]);

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // 3. Đánh dấu một thông báo đã đọc
  const handleMarkAsRead = async (id, e) => {
    if (e) e.stopPropagation();
    const token = localStorage.getItem('glassesToken');
    if (!token) return;

    try {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setNotifications(prev => 
          prev.map(n => n._id === id ? { ...n, isRead: true } : n)
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 4. Đánh dấu tất cả đã đọc
  const handleMarkAllAsRead = async () => {
    const token = localStorage.getItem('glassesToken');
    if (!token) return;

    try {
      const res = await fetch('/api/notifications/read-all', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        setUnreadCount(0);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 5. Click điều hướng liên kết và chuyển trạng thái đọc
  const handleNotificationClick = async (item) => {
    setIsOpen(false);
    if (!item.isRead) {
      await handleMarkAsRead(item._id);
    }
    if (item.link) {
      navigate(item.link);
    }
  };

  // Định dạng ngày giờ thân thiện
  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} giờ trước`;
    
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  };

  if (!user) return null;

  return (
    <div className="relative font-sans" ref={bellRef}>
      
      {/* Icon chuông và badge đỏ */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-blue-600 hover:bg-gray-50 rounded-xl transition focus:outline-none"
      >
        <Bell className={`w-6 h-6 ${unreadCount > 0 ? 'animate-swing' : ''}`} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 bg-red-500 text-white text-[9px] font-black w-4.5 h-4.5 flex items-center justify-center rounded-full shadow-sm animate-bounce">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* DROPDOWN MENU CHUÔNG (Glassmorphism design) */}
      {isOpen && (
        <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-100/80 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          
          {/* Header Dropdown */}
          <div className="flex justify-between items-center px-4 py-2 border-b border-gray-100 pb-2">
            <h3 className="text-sm font-black text-gray-900 flex items-center gap-1.5">
              <Inbox className="w-4.5 h-4.5 text-blue-600" /> Hộp thư thông báo
            </h3>
            {unreadCount > 0 && (
              <button 
                onClick={handleMarkAllAsRead}
                className="text-[10px] font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-1 rounded"
              >
                Đọc tất cả
              </button>
            )}
          </div>

          {/* List thông báo cuộn */}
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-gray-400">
                <Inbox className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-xs font-bold">Không có thông báo nào!</p>
              </div>
            ) : (
              notifications.slice(0, 10).map((item) => (
                <div
                  key={item._id}
                  onClick={() => handleNotificationClick(item)}
                  className={`px-4 py-3 text-left hover:bg-gray-50/80 transition cursor-pointer flex gap-3 relative ${
                    !item.isRead ? 'bg-blue-50/20' : ''
                  }`}
                >
                  {/* Trạng thái chấm xanh dương chưa đọc */}
                  {!item.isRead && (
                    <div className="absolute top-4 left-2 w-2 h-2 bg-blue-600 rounded-full"></div>
                  )}

                  {/* Icon loại thông báo */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                    item.type === 'wallet' || item.type === 'withdraw'
                      ? 'bg-emerald-50 text-emerald-600'
                      : item.type === 'order'
                        ? 'bg-blue-50 text-blue-600'
                        : 'bg-amber-50 text-amber-600'
                  }`}>
                    <Clock className="w-4 h-4" />
                  </div>

                  {/* Nội dung text */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs text-gray-900 truncate leading-snug ${
                      !item.isRead ? 'font-black' : 'font-medium'
                    }`}>
                      {item.title}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
                      {item.message}
                    </p>
                    <span className="text-[9px] text-gray-400 mt-1 block">
                      {formatTimeAgo(item.createdAt)}
                    </span>
                  </div>

                  {/* Nút đánh dấu đã đọc nhanh */}
                  {!item.isRead && (
                    <button
                      onClick={(e) => handleMarkAsRead(item._id, e)}
                      title="Đánh dấu đã đọc"
                      className="p-1 hover:bg-gray-200/50 rounded-lg text-gray-400 hover:text-green-600 transition shrink-0 self-start"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
          
        </div>
      )}
    </div>
  );
}
