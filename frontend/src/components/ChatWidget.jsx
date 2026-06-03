import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, X, Send, Lock, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

export default function ChatWidget() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isStaffTyping, setIsStaffTyping] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Tự động cuộn xuống cuối danh sách tin nhắn
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isStaffTyping, isOpen]);

  // 1. Tải thông tin phòng chat và lịch sử tin nhắn
  useEffect(() => {
    if (!user) {
      setConversation(null);
      setMessages([]);
      setUnreadCount(0);
      return;
    }

    // KHÔNG tải thông tin chat nếu người dùng hiện tại là Staff (2) hoặc Admin (1)
    if (user.role !== 0) {
      setConversation(null);
      setMessages([]);
      setUnreadCount(0);
      return;
    }

    const token = localStorage.getItem('glassesToken');
    if (!token) return;

    const initChat = async () => {
      try {
        // Lấy hoặc tự tạo Conversation của chính mình
        const convRes = await fetch('/api/chat/my-conversation', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const convData = await convRes.json();
        
        if (convData.success && convData.conversation) {
          const conv = convData.conversation;
          setConversation(conv);
          setUnreadCount(conv.unreadCountByCustomer || 0);

          // Lấy lịch sử tin nhắn
          const msgRes = await fetch(`/api/chat/messages/${conv._id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const msgData = await msgRes.json();
          if (msgData.success) {
            setMessages(msgData.messages || []);
          }
        }
      } catch (err) {
        console.error('Lỗi khởi tạo chat widget:', err);
      }
    };

    initChat();
  }, [user, isOpen]);

  // 2. Tích hợp lắng nghe Socket Realtime
  useEffect(() => {
    if (!socket || !conversation) return;
    
    // KHÔNG kết nối Socket của ChatWidget nếu người dùng là Staff/Admin
    if (user && user.role !== 0) return;

    // Join vào phòng chat riêng
    socket.emit('chat:join_conversation', { conversationId: conversation._id });

    // Khi mở hộp chat, tự động đánh dấu đã đọc
    if (isOpen) {
      socket.emit('chat:mark_read', { conversationId: conversation._id });
      setUnreadCount(0);
    }

    // Lắng nghe tin nhắn mới
    const handleNewMessage = (message) => {
      if (message.conversationId === conversation._id) {
        setMessages((prev) => [...prev, message]);
        
        // Nếu đang đóng hộp chat và tin nhắn gửi từ staff, tăng số lượng unread
        if (!isOpen && message.senderRole !== 0) {
          setUnreadCount((prev) => prev + 1);
        } else if (isOpen && message.senderRole !== 0) {
          // Nếu đang mở, báo lại cho server đã đọc
          socket.emit('chat:mark_read', { conversationId: conversation._id });
        }
      }
    };

    // Lắng nghe tín hiệu staff đang gõ chữ
    const handleTyping = (data) => {
      if (data.conversationId === conversation._id) {
        setIsStaffTyping(data.isTyping);
      }
    };

    // Lắng nghe cập nhật cuộc hội thoại tổng quan
    const handleConversationUpdated = (updatedConv) => {
      if (updatedConv._id === conversation._id) {
        setConversation(updatedConv);
        if (!isOpen) {
          setUnreadCount(updatedConv.unreadCountByCustomer || 0);
        }
      }
    };

    socket.on('chat:new_message', handleNewMessage);
    socket.on('chat:typing', handleTyping);
    socket.on('conversation:updated', handleConversationUpdated);

    return () => {
      socket.off('chat:new_message', handleNewMessage);
      socket.off('chat:typing', handleTyping);
      socket.off('conversation:updated', handleConversationUpdated);
    };
  }, [socket, conversation, isOpen]);

  // 3. Xử lý gõ tin nhắn & Gửi tin nhắn
  const handleInputChange = (e) => {
    setInputValue(e.target.value);

    if (!socket || !conversation || (user && user.role !== 0)) return;

    // Gửi sự kiện typing lên server
    socket.emit('chat:typing', { conversationId: conversation._id, isTyping: true });

    // Xóa timeout cũ và đặt timeout mới để tự tắt typing sau 2 giây ngừng gõ
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('chat:typing', { conversationId: conversation._id, isTyping: false });
    }, 2000);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputValue.trim() || !socket || !conversation || (user && user.role !== 0)) return;

    // Gửi qua socket (Server sẽ lưu DB trước rồi phát đi)
    socket.emit('chat:send_message', {
      conversationId: conversation._id,
      content: inputValue
    });

    // Tắt trạng thái typing ngay lập tức
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socket.emit('chat:typing', { conversationId: conversation._id, isTyping: false });

    setInputValue('');
  };

  // TUYỆT ĐỐI KHÔNG render nút chat hay hộp thoại nếu user là Staff (2) hoặc Admin (1)
  if (user && user.role !== 0) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 font-sans">
      {/* 🔴 NÚT BẤM TRÒN NỔI (CHAT WIDGET TRIGGER) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-all duration-300 relative group"
      >
        {isOpen ? <X className="w-6 h-6 transition-transform duration-300 rotate-90" /> : <MessageCircle className="w-6 h-6 transition-transform duration-300 hover:rotate-12" />}
        
        {/* Unread count badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white animate-bounce">
            {unreadCount}
          </span>
        )}
      </button>

      {/* 💬 HỘP THOẠI KHUNG CHAT PREMIUM GLASSMORPHISM */}
      {isOpen && (
        <div className="absolute bottom-16 right-0 w-96 h-[500px] bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl border border-gray-200/50 flex flex-col overflow-hidden transition-all duration-300 transform scale-100 origin-bottom-right">
          
          {/* Header */}
          <div className="p-4 bg-gradient-to-r from-gray-900 to-gray-800 text-white flex items-center justify-between shrink-0 shadow-md">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm shadow-inner">
                CS
              </div>
              <div>
                <h3 className="font-extrabold text-sm flex items-center gap-1">
                  Hỗ Trợ Realtime <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                </h3>
                <span className="text-[10px] text-green-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span> Nhân viên online
                </span>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white transition">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Content */}
          {!user ? (
            /* 🔒 BẮT BUỘC ĐĂNG NHẬP */
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-gray-50/50">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-gray-400">
                <Lock className="w-8 h-8" />
              </div>
              <h4 className="font-bold text-gray-800 text-base mb-2">Đăng nhập để Chat</h4>
              <p className="text-xs text-gray-500 max-w-[240px] mb-6">
                Vui lòng đăng nhập tài khoản để kết nối trực tiếp với nhân viên hỗ trợ.
              </p>
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate('/login');
                }}
                className="px-6 py-2.5 bg-gray-900 hover:bg-blue-600 text-white font-bold text-xs rounded-xl shadow-md transition-all duration-300"
              >
                Đến trang Đăng Nhập
              </button>
            </div>
          ) : (
            /* ✉️ KHUNG TRÒ TRÒN CHUYÊN NGHIỆP */
            <>
              {/* Message List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/30">
                {messages.length === 0 ? (
                  <div className="text-center py-10 text-gray-400 text-xs">
                    Hãy gửi tin nhắn đầu tiên để kết nối với bộ phận chăm sóc khách hàng!
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMe = msg.sender === user.id || msg.senderRole === 0;
                    return (
                      <div key={msg._id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-xs font-medium shadow-sm transition-all duration-200 ${
                            isMe
                              ? 'bg-blue-600 text-white rounded-tr-none'
                              : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                          }`}
                        >
                          <p className="leading-relaxed break-words">{msg.content}</p>
                          <span
                            className={`text-[8px] block text-right mt-1 opacity-70 ${
                              isMe ? 'text-blue-100' : 'text-gray-400'
                            }`}
                          >
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Typing Indicator */}
                {isStaffTyping && (
                  <div className="flex justify-start">
                    <div className="bg-white text-gray-500 border border-gray-100 px-4 py-2.5 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-1.5">
                      <span className="text-[10px]">Nhân viên đang nhập tin nhắn</span>
                      <span className="flex gap-1 items-center mt-1">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                      </span>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-gray-100 flex items-center gap-2 shrink-0">
                <input
                  type="text"
                  value={inputValue}
                  onChange={handleInputChange}
                  placeholder="Nhập câu hỏi tại đây..."
                  className="flex-1 px-4 py-2.5 bg-gray-50 rounded-xl text-xs outline-none focus:ring-1 focus:ring-blue-600 transition"
                />
                <button
                  type="submit"
                  disabled={!inputValue.trim()}
                  className="w-9 h-9 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center justify-center transition disabled:opacity-50 disabled:hover:bg-blue-600 shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}
