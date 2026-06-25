const Review = require('../models/Review');
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const mongoose = require('mongoose');
const { createNotificationAndEmit } = require('../utils/notificationHelper');

// Helper to update product's averageRating and totalReviews dynamically
const updateProductRating = async (productId) => {
  try {
    const stats = await Review.aggregate([
      { $match: { productId: new mongoose.Types.ObjectId(productId) } },
      {
        $group: {
          _id: '$productId',
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 }
        }
      }
    ]);

    if (stats.length > 0) {
      await Product.findByIdAndUpdate(productId, {
        averageRating: Math.round(stats[0].averageRating * 10) / 10,
        totalReviews: stats[0].totalReviews
      });
    } else {
      await Product.findByIdAndUpdate(productId, {
        averageRating: 0,
        totalReviews: 0
      });
    }
  } catch (error) {
    console.error('Error updating product rating stats:', error);
  }
};

// Check if user has purchased the product and completed the order
exports.checkEligibility = async (req, res) => {
  try {
    const { productId } = req.params;
    const username = req.user.username;

    // Check if there is a completed order containing this product
    const completedOrders = await Order.find({
      username,
      status: 'completed',
      'items.productId': productId
    });

    const isEligible = completedOrders.length > 0;

    // Find any existing review by this user for this product
    const existingReview = await Review.findOne({ username, productId });

    return res.status(200).json({
      success: true,
      eligible: isEligible,
      existingReview
    });
  } catch (error) {
    console.error('Error checking review eligibility:', error);
    return res.status(500).json({ success: false, message: 'Lỗi hệ thống khi kiểm tra quyền đánh giá.' });
  }
};

// Save a review (create new or edit existing)
exports.saveReview = async (req, res) => {
  try {
    const { productId, rating, comment } = req.body;
    const username = req.user.username;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Số sao đánh giá phải từ 1 đến 5.' });
    }

    // 1. Validate if user is eligible (completed order containing product)
    const completedOrders = await Order.find({
      username,
      status: 'completed',
      'items.productId': productId
    });

    if (completedOrders.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Bạn chỉ được đánh giá sản phẩm sau khi đã mua và hoàn thành đơn hàng!'
      });
    }

    const orderId = completedOrders[0]._id;

    // 2. Check for existing review
    let review = await Review.findOne({ username, productId });
    let isNew = false;

    if (review) {
      // Edit existing review
      review.rating = Number(rating);
      review.comment = comment || '';
      review.orderId = orderId;
      await review.save();
    } else {
      // Create new review
      isNew = true;
      review = new Review({
        username,
        productId,
        orderId,
        rating: Number(rating),
        comment: comment || ''
      });
      await review.save();
    }

    // 3. Update product average rating & count
    await updateProductRating(productId);

    return res.status(200).json({
      success: true,
      message: isNew ? 'Thêm đánh giá thành công!' : 'Cập nhật đánh giá thành công!',
      review
    });
  } catch (error) {
    console.error('Error saving review:', error);
    return res.status(500).json({ success: false, message: 'Lỗi hệ thống khi lưu đánh giá.' });
  }
};

// Get reviews for a single product (public)
exports.getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const reviews = await Review.find({ productId }).sort({ createdAt: -1 }).lean();

    // Fetch display names for users
    const usernames = reviews.map(r => r.username);
    const users = await User.find({ username: { $in: usernames } }).lean();
    const userMap = users.reduce((map, u) => {
      map[u.username] = u.name || u.username;
      return map;
    }, {});

    const enrichedReviews = reviews.map(r => ({
      ...r,
      userDisplayName: userMap[r.username] || r.username
    }));

    return res.status(200).json({
      success: true,
      reviews: enrichedReviews
    });
  } catch (error) {
    console.error('Error fetching product reviews:', error);
    return res.status(500).json({ success: false, message: 'Lỗi hệ thống khi tải danh sách đánh giá.' });
  }
};

// Get all reviews (Staff/Admin manager)
exports.getAllReviews = async (req, res) => {
  try {
    const reviews = await Review.find()
      .populate('productId', 'name images price')
      .sort({ createdAt: -1 })
      .lean();

    // Fetch display names for users
    const usernames = reviews.map(r => r.username);
    const users = await User.find({ username: { $in: usernames } }).lean();
    const userMap = users.reduce((map, u) => {
      map[u.username] = u.name || u.username;
      return map;
    }, {});

    const enrichedReviews = reviews.map(r => ({
      ...r,
      userDisplayName: userMap[r.username] || r.username
    }));

    return res.status(200).json({
      success: true,
      reviews: enrichedReviews
    });
  } catch (error) {
    console.error('Error fetching all reviews:', error);
    return res.status(500).json({ success: false, message: 'Lỗi hệ thống khi tải tất cả đánh giá.' });
  }
};

// Delete review (Admin only)
exports.deleteReview = async (req, res) => {
  try {
    const { id } = req.params;
    const review = await Review.findByIdAndDelete(id);

    if (!review) {
      return res.status(404).json({ success: false, message: 'Đánh giá không tồn tại hoặc đã bị xóa trước đó.' });
    }

    // Recalculate average rating & count
    await updateProductRating(review.productId);

    return res.status(200).json({
      success: true,
      message: 'Xóa đánh giá thành công!'
    });
  } catch (error) {
    console.error('Error deleting review:', error);
    return res.status(500).json({ success: false, message: 'Lỗi hệ thống khi xóa đánh giá.' });
  }
};

// Reply to a review (Staff/Admin)
exports.replyReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { reply } = req.body;
    const replierName = req.user.name || req.user.username || 'Quản trị viên';

    if (reply === undefined) {
      return res.status(400).json({ success: false, message: 'Thiếu trường reply!' });
    }

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Đánh giá không tồn tại.' });
    }

    // Nếu reply rỗng, coi như xóa phản hồi cũ
    if (reply.trim() === '') {
      review.reply = undefined;
      review.replyBy = undefined;
      review.replyAt = undefined;
    } else {
      review.reply = reply.trim();
      review.replyBy = replierName;
      review.replyAt = new Date();

      // Gửi thông báo đến khách hàng
      try {
        const customer = await User.findOne({ username: review.username });
        if (customer) {
          const product = await Product.findById(review.productId);
          const productName = product ? product.name : 'kính mắt';
          
          await createNotificationAndEmit({
            userId: customer._id,
            type: 'review',
            title: 'Phản hồi đánh giá',
            message: `Cửa hàng đã phản hồi nhận xét của bạn về sản phẩm "${productName}".`,
            link: `/product/${review.productId}`,
            metadata: {
              reviewId: review._id.toString(),
              productId: review.productId.toString()
            }
          });
        }
      } catch (notifErr) {
        console.error('Lỗi khi gửi thông báo phản hồi đánh giá:', notifErr);
      }
    }
    
    await review.save();

    return res.status(200).json({
      success: true,
      message: reply.trim() === '' ? 'Đã xóa phản hồi!' : 'Phản hồi đánh giá thành công!',
      review
    });
  } catch (error) {
    console.error('Error replying review:', error);
    return res.status(500).json({ success: false, message: 'Lỗi hệ thống khi phản hồi đánh giá.' });
  }
};
