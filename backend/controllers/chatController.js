const mongoose = require('mongoose');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

// [GET] /api/chat/my-conversation (Khách hàng lấy hoặc tự khởi tạo phòng chat duy nhất của mình)
exports.getMyConversation = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, message: 'Người dùng chưa xác thực hoặc thiếu ID!' });
    }

    let conversation = await Conversation.findOne({ customer: req.user.id })
      .populate('customer', 'username name email phone')
      .populate('assignedStaff', 'username name')
      .populate('lastMessage');
    
    // Nếu chưa có hội thoại, tự động khởi tạo mới cho khách hàng
    if (!conversation) {
      conversation = await Conversation.create({ customer: req.user.id });
      // Query lại để thực hiện populate đầy đủ thông tin mẫu
      conversation = await Conversation.findById(conversation._id)
        .populate('customer', 'username name email phone');
    }
    
    res.status(200).json({ success: true, conversation });
  } catch (error) {
    console.error('❌ Lỗi trong getMyConversation controller:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy cuộc hội thoại!', error: error.message });
  }
};

// [GET] /api/chat/conversations (Staff/Admin lấy danh sách tất cả hội thoại của toàn bộ khách hàng)
exports.getConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find()
      .populate('customer', 'username name email phone')
      .populate('assignedStaff', 'username name')
      .populate('lastMessage')
      .sort({ updatedAt: -1 }); // Trả về cuộc hội thoại có tin nhắn mới cập nhật lên đầu
      
    res.status(200).json({ success: true, conversations });
  } catch (error) {
    console.error('❌ Lỗi trong getConversations controller:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách hội thoại!', error: error.message });
  }
};

// [GET] /api/chat/messages/:conversationId (Lấy lịch sử tin nhắn của cuộc hội thoại)
exports.getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;

    // Phòng chống lỗi đúc sai ID Mongoose
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ success: false, message: 'Định dạng ID cuộc hội thoại không hợp lệ!' });
    }
    
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy cuộc hội thoại!' });
    }
    
    // Kiểm tra phân quyền: Khách hàng chỉ được xem tin nhắn của chính mình
    if (req.user.role === 0 && conversation.customer.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: 'Từ chối truy cập. Cuộc hội thoại này không thuộc về bạn!' });
    }
    
    // Lấy tin nhắn sắp xếp từ cũ tới mới để hiển thị đúng mạch trò chuyện
    const messages = await Message.find({ conversationId })
      .sort({ timestamp: 1 });
      
    res.status(200).json({ success: true, messages });
  } catch (error) {
    console.error('❌ Lỗi trong getMessages controller:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách tin nhắn!', error: error.message });
  }
};

// [PUT] /api/chat/read/:conversationId (Đánh dấu đã đọc toàn bộ tin nhắn)
exports.markConversationRead = async (req, res) => {
  try {
    const { conversationId } = req.params;

    // Phòng chống lỗi đúc sai ID Mongoose
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ success: false, message: 'Định dạng ID cuộc hội thoại không hợp lệ!' });
    }
    
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy cuộc hội thoại!' });
    }
    
    // Kiểm tra phân quyền & Đánh dấu đã đọc theo từng vai trò
    if (req.user.role === 0) {
      // Khách hàng đọc -> reset unread cho customer
      if (conversation.customer.toString() !== req.user.id.toString()) {
        return res.status(403).json({ success: false, message: 'Từ chối truy cập!' });
      }
      conversation.unreadCountByCustomer = 0;
    } else {
      // Nhân viên đọc -> reset unread cho staff
      conversation.unreadCountByStaff = 0;
    }
    
    await conversation.save();
    res.status(200).json({ success: true, message: 'Đánh dấu đã đọc thành công!' });
  } catch (error) {
    console.error('❌ Lỗi trong markConversationRead controller:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ!', error: error.message });
  }
};

// [PUT] /api/chat/close/:conversationId (Staff/Admin đóng cuộc hội thoại chăm sóc)
exports.closeConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;

    // Phòng chống lỗi đúc sai ID Mongoose
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ success: false, message: 'Định dạng ID cuộc hội thoại không hợp lệ!' });
    }
    
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy cuộc hội thoại!' });
    }
    
    conversation.status = 'closed';
    await conversation.save();
    
    res.status(200).json({ success: true, message: 'Đã đóng cuộc hội thoại thành công!', conversation });
  } catch (error) {
    console.error('❌ Lỗi trong closeConversation controller:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ!', error: error.message });
  }
};

// [PUT] /api/chat/assign/:conversationId (Staff nhận hoặc Admin gán cuộc hội thoại)
exports.assignStaffToConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { staffId } = req.body || {};
    
    console.log(`🔌 [DEBUG-ASSIGN] Nhận yêu cầu gán hội thoại ${conversationId}. staffId truyền lên: ${staffId || 'không có'}, req.user.id: ${req.user?.id}`);

    // 1. Validate định dạng conversationId
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ success: false, message: 'Định dạng ID cuộc hội thoại không hợp lệ!' });
    }
    
    // 2. Tìm cuộc hội thoại trong Database
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy cuộc hội thoại nào tương ứng!' });
    }
    
    // 3. Xác định ID staff được gán
    const targetStaffId = staffId || req.user?.id;
    if (!targetStaffId) {
      return res.status(400).json({ success: false, message: 'Không tìm thấy thông tin nhân viên để tiếp nhận!' });
    }

    // 4. Validate định dạng targetStaffId
    if (!mongoose.Types.ObjectId.isValid(targetStaffId)) {
      return res.status(400).json({ success: false, message: 'Định dạng ID nhân viên được gán không hợp lệ!' });
    }
    
    // 5. Kiểm tra sự tồn tại và phân quyền của User được gán
    const staffUser = await User.findById(targetStaffId);
    if (!staffUser) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin tài khoản nhân viên tương ứng trong hệ thống!' });
    }

    if (staffUser.role !== 1 && staffUser.role !== 2) {
      return res.status(403).json({ success: false, message: 'Tài khoản được gán không phải là Nhân viên (Staff) hoặc Quản trị viên (Admin)!' });
    }
    
    // 6. Cập nhật thông tin phân bổ
    conversation.assignedStaff = targetStaffId;
    
    // Nếu cuộc hội thoại đang ở trạng thái 'closed', tự động mở lại khi được phân bổ staff mới
    if (conversation.status === 'closed') {
      conversation.status = 'open';
    }
    
    await conversation.save();
    
    // 7. Populate trả về dữ liệu hoàn chỉnh để hiển thị trên frontend lập tức
    const updatedConversation = await Conversation.findById(conversationId)
      .populate('customer', 'username name email phone')
      .populate('assignedStaff', 'username name')
      .populate('lastMessage');
      
    console.log(`✅ [DEBUG-ASSIGN] Gán thành công hội thoại ${conversationId} cho nhân viên ${staffUser.name || staffUser.username}`);

    res.status(200).json({ 
      success: true, 
      message: 'Phân bổ nhân viên phụ trách thành công!', 
      conversation: updatedConversation 
    });
  } catch (error) {
    console.error('❌ Lỗi chi tiết trong assignStaffToConversation controller:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi gán nhân viên!', error: error.message });
  }
};
