import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { MessageSquare, Send, CheckCircle2, UserCheck, XCircle, Search, Sparkles } from 'lucide-react';

export default function ChatManagement() {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCustomerTyping, setIsCustomerTyping] = useState(false);

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Tự động cuộn xuống cuối khung tin nhắn
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isCustomerTyping]);

  // 1. Lấy danh sách hội thoại của toàn bộ khách hàng khi mount
  const fetchConversations = async () => {
    const token = localStorage.getItem('glassesToken');
    if (!token) return;
    try {
      const res = await fetch('/api/chat/conversations', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setConversations(data.conversations || []);
      }
    } catch (err) {
      console.error('Lỗi lấy danh sách hội thoại:', err);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, []);

  // 2. Tải tin nhắn chi tiết khi bấm chọn một cuộc hội thoại
  const handleSelectConversation = async (conv) => {
    setSelectedConv(conv);
    setIsCustomerTyping(false);
    
    const token = localStorage.getItem('glassesToken');
    if (!token) return;

    try {
      // Gọi REST API lấy lịch sử tin nhắn và xóa số tin nhắn chưa đọc
      const res = await fetch(`/api/chat/messages/${conv._id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setMessages(data.messages || []);
      }

      // Phát tín hiệu Socket báo đã tham gia phòng hội thoại và đã đọc
      if (socket) {
        socket.emit('chat:join_conversation', { conversationId: conv._id });
        socket.emit('chat:mark_read', { conversationId: conv._id });
      }

      // Cập nhật state unread cục bộ tức thì
      setConversations((prev) =>
        prev.map((c) => (c._id === conv._id ? { ...c, unreadCountByStaff: 0 } : c))
      );
    } catch (err) {
      console.error('Lỗi lấy lịch sử tin nhắn:', err);
    }
  };

  // 3. Tích hợp Sockets Realtime phía Staff
  useEffect(() => {
    if (!socket) return;

    // Lắng nghe cập nhật cuộc hội thoại tổng quan (để sắp xếp lại danh sách và hiện unread badge)
    const handleConversationUpdated = (updatedConv) => {
      setConversations((prev) => {
        // Loại bỏ hội thoại cũ ra và đẩy hội thoại mới cập nhật lên đầu danh sách
        const filtered = prev.filter((c) => c._id !== updatedConv._id);
        return [updatedConv, ...filtered];
      });

      // Nếu đang mở đúng cuộc hội thoại này, tự động đồng bộ lại state
      if (selectedConv && selectedConv._id === updatedConv._id) {
        setSelectedConv(updatedConv);
      }
    };

    // Lắng nghe tin nhắn mới
    const handleNewMessage = (message) => {
      if (selectedConv && message.conversationId === selectedConv._id) {
        setMessages((prev) => [...prev, message]);
        // Tự động đánh dấu đã đọc
        socket.emit('chat:mark_read', { conversationId: selectedConv._id });
      }
    };

    // Lắng nghe khách hàng đang gõ chữ
    const handleTyping = (data) => {
      if (selectedConv && data.conversationId === selectedConv._id) {
        setIsCustomerTyping(data.isTyping);
      }
    };

    socket.on('conversation:updated', handleConversationUpdated);
    socket.on('chat:new_message', handleNewMessage);
    socket.on('chat:typing', handleTyping);

    return () => {
      socket.off('conversation:updated', handleConversationUpdated);
      socket.off('chat:new_message', handleNewMessage);
      socket.off('chat:typing', handleTyping);
    };
  }, [socket, selectedConv]);

  // 4. Xử lý gõ tin nhắn phía Staff
  const handleInputChange = (e) => {
    setInputValue(e.target.value);
    if (!socket || !selectedConv) return;

    // Gửi sự kiện typing lên server báo hiệu Staff đang gõ
    socket.emit('chat:typing', { conversationId: selectedConv._id, isTyping: true });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('chat:typing', { conversationId: selectedConv._id, isTyping: false });
    }, 2000);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputValue.trim() || !socket || !selectedConv) return;

    socket.emit('chat:send_message', {
      conversationId: selectedConv._id,
      content: inputValue
    });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socket.emit('chat:typing', { conversationId: selectedConv._id, isTyping: false });

    setInputValue('');
  };

  // 5. Action: Nhận phụ trách hội thoại (Assign Staff)
  const handleAssignSelf = async () => {
    if (!selectedConv) return;
    const token = localStorage.getItem('glassesToken');
    try {
      const res = await fetch(`/api/chat/assign/${selectedConv._id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.conversation) {
        setSelectedConv(data.conversation);
        setConversations((prev) =>
          prev.map((c) => (c._id === data.conversation._id ? data.conversation : c))
        );
        alert('Đã tiếp nhận hỗ trợ khách hàng này!');
      }
    } catch (err) {
      console.error('Lỗi nhận xử lý:', err);
    }
  };

  // 6. Action: Đóng cuộc hội thoại chăm sóc (Close Conversation)
  const handleCloseConversation = async () => {
    if (!selectedConv) return;
    const confirmClose = window.confirm('Bạn có chắc chắn muốn đóng cuộc hội thoại chăm sóc này không? Khách hàng sẽ tạm thời không nhắn tin được nữa.');
    if (!confirmClose) return;

    const token = localStorage.getItem('glassesToken');
    try {
      const res = await fetch(`/api/chat/close/${selectedConv._id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.conversation) {
        setSelectedConv(data.conversation);
        setConversations((prev) =>
          prev.map((c) => (c._id === data.conversation._id ? data.conversation : c))
        );
        alert('Đã đóng cuộc hội thoại chăm sóc khách hàng thành công!');
      }
    } catch (err) {
      console.error('Lỗi đóng cuộc hội thoại:', err);
    }
  };

  // Lọc danh sách hội thoại theo ô tìm kiếm (Tên, SĐT, Email)
  const filteredConversations = conversations.filter((conv) => {
    const cust = conv.customer || {};
    const searchStr = `${cust.name || ''} ${cust.username || ''} ${cust.phone || ''} ${cust.email || ''}`.toLowerCase();
    return searchStr.includes(searchQuery.toLowerCase());
  });

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-50/50 font-sans overflow-hidden">
      
      {/* 📱 PANEL TRÁI: DANH SÁCH CUỘC HỘI THOẠI CỦA KHÁCH HÀNG */}
      <div className="w-80 bg-white border-r border-gray-100 flex flex-col shrink-0">
        
        {/* Tìm kiếm */}
        <div className="p-4 border-b border-gray-100 shrink-0">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-gray-400 absolute left-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm khách hàng (Tên, SĐT...)"
              className="w-full pl-9 pr-4 py-2.5 bg-gray-50 rounded-xl text-xs outline-none focus:ring-1 focus:ring-green-600 transition"
            />
          </div>
        </div>

        {/* Danh sách */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredConversations.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-xs">
              Không tìm thấy cuộc hội thoại nào
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const cust = conv.customer || {};
              const isSelected = selectedConv?._id === conv._id;
              const hasUnread = conv.unreadCountByStaff > 0;
              const isClosed = conv.status === 'closed';

              return (
                <button
                  key={conv._id}
                  onClick={() => handleSelectConversation(conv)}
                  className={`w-full text-left p-3.5 rounded-2xl flex items-start gap-3 transition-all duration-200 ${
                    isSelected
                      ? 'bg-green-50/80 border border-green-100/50 shadow-sm'
                      : 'hover:bg-gray-50/80 border border-transparent'
                  }`}
                >
                  {/* Avatar */}
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                    isSelected ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {(cust.name || cust.username || 'KH').substring(0, 2).toUpperCase()}
                  </div>

                  {/* Metadata */}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <h4 className={`text-xs truncate max-w-[70%] ${hasUnread ? 'font-black text-gray-900' : 'font-bold text-gray-700'}`}>
                        {cust.name || cust.username}
                      </h4>
                      <span className="text-[9px] text-gray-400 shrink-0">
                        {new Date(conv.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <p className={`text-[10px] truncate mb-1 ${hasUnread ? 'font-bold text-gray-800' : 'text-gray-500'}`}>
                      {conv.lastMessage?.content || 'Chưa có tin nhắn...'}
                    </p>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {isClosed ? (
                        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[8px] font-bold rounded-md">Đóng</span>
                      ) : (
                        <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[8px] font-bold rounded-md">Mở</span>
                      )}

                      {conv.assignedStaff ? (
                        <span className="text-[8px] text-gray-400 truncate max-w-[100px]">
                          👤 {conv.assignedStaff.name || conv.assignedStaff.username}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-[8px] font-bold rounded-md">Chờ xử lý</span>
                      )}
                    </div>
                  </div>

                  {/* Badge số tin nhắn chưa đọc */}
                  {hasUnread && (
                    <span className="w-5 h-5 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center shrink-0 border border-white">
                      {conv.unreadCountByStaff}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 🖥️ PANEL PHẢI: KHUNG CHI TIẾT ĐÀN HỘI THOẠI & TIN NHẮN */}
      <div className="flex-1 bg-white flex flex-col overflow-hidden">
        {selectedConv ? (
          <>
            {/* Header thông tin khách */}
            <div className="p-4 border-b border-gray-100 flex items-center justify-between shrink-0 shadow-sm bg-white z-10">
              <div>
                <h3 className="font-extrabold text-sm text-gray-800 flex items-center gap-1.5">
                  {selectedConv.customer?.name || selectedConv.customer?.username} 
                  <Sparkles className="w-3.5 h-3.5 text-green-500" />
                </h3>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  SĐT: {selectedConv.customer?.phone || 'Chưa cung cấp'} | Email: {selectedConv.customer?.email || 'Chưa cung cấp'}
                </p>
              </div>

              {/* Nhóm Actions */}
              <div className="flex items-center gap-2">
                {/* Nút nhận xử lý */}
                {(!selectedConv.assignedStaff || selectedConv.assignedStaff._id !== user.id) && (
                  <button
                    onClick={handleAssignSelf}
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white font-bold text-[10px] rounded-xl shadow-sm transition flex items-center gap-1.5"
                  >
                    <UserCheck className="w-3.5 h-3.5" /> Nhận Xử Lý
                  </button>
                )}

                {/* Nút đóng hội thoại */}
                {selectedConv.status !== 'closed' && (
                  <button
                    onClick={handleCloseConversation}
                    className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-[10px] rounded-xl transition flex items-center gap-1.5"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Đóng Hội Thoại
                  </button>
                )}
              </div>
            </div>

            {/* Khung chat */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50/20">
              {messages.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-xs">
                  Không tìm thấy tin nhắn nào trong lịch sử
                </div>
              ) : (
                messages.map((msg) => {
                  const isStaff = msg.senderRole === 2 || msg.senderRole === 1;
                  const isMe = msg.sender === user.id;

                  return (
                    <div key={msg._id} className={`flex ${isStaff ? 'justify-end' : 'justify-start'}`}>
                      <div className="flex flex-col max-w-[70%]">
                        <span className={`text-[8px] text-gray-400 mb-0.5 block ${isStaff ? 'text-right' : 'text-left'}`}>
                          {isStaff ? (isMe ? 'Bạn (Nhân viên)' : 'Staff khác') : 'Khách hàng'}
                        </span>
                        
                        <div
                          className={`px-4 py-2.5 rounded-2xl text-xs font-medium shadow-sm break-words leading-relaxed ${
                            isStaff
                              ? 'bg-green-600 text-white rounded-tr-none'
                              : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                          }`}
                        >
                          <p>{msg.content}</p>
                          <span className={`text-[8px] block text-right mt-1 opacity-70 ${
                            isStaff ? 'text-green-100' : 'text-gray-400'
                          }`}>
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {/* Hiển thị Khách đang gõ tin nhắn */}
              {isCustomerTyping && (
                <div className="flex justify-start">
                  <div className="bg-white text-gray-500 border border-gray-100 px-4 py-2.5 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-1.5">
                    <span className="text-[10px]">Khách hàng đang nhập tin nhắn</span>
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

            {/* Ô nhập tin nhắn */}
            <div className="p-3 border-t border-gray-100 shrink-0 bg-white">
              {selectedConv.status === 'closed' ? (
                <div className="bg-red-50 text-red-600 p-3 rounded-2xl text-center text-xs font-bold flex items-center justify-center gap-2">
                  <XCircle className="w-4 h-4" /> Cuộc hội thoại này đã đóng. Hãy bấm "Nhận Xử Lý" để tự động mở lại phòng chat.
                </div>
              ) : (
                <form onSubmit={handleSendMessage} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    placeholder="Nhập câu trả lời cho khách hàng tại đây..."
                    className="flex-1 px-4 py-3 bg-gray-50 rounded-xl text-xs outline-none focus:ring-1 focus:ring-green-600 transition"
                  />
                  <button
                    type="submit"
                    disabled={!inputValue.trim()}
                    className="w-10 h-10 bg-green-600 hover:bg-green-700 text-white rounded-xl flex items-center justify-center transition disabled:opacity-50 disabled:hover:bg-green-600 shrink-0 shadow-md"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
          </>
        ) : (
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-55/10 text-center">
            <div className="w-16 h-16 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center mb-4 shadow-inner">
              <MessageSquare className="w-8 h-8" />
            </div>
            <h4 className="font-extrabold text-gray-800 text-base mb-1">Chưa Chọn Hội Thoại</h4>
            <p className="text-xs text-gray-500 max-w-[280px]">
              Vui lòng chọn một cuộc trò chuyện từ danh sách bên trái để bắt đầu nhắn tin và chăm sóc khách hàng.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
