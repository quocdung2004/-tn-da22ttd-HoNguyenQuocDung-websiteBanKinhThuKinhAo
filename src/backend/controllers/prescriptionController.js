const Prescription = require('../models/Prescription');

// [GET] /api/prescription (Lấy hồ sơ độ cận hiện tại của khách hàng)
exports.getPrescription = async (req, res) => {
  try {
    const username = req.user.username;
    const prescription = await Prescription.findOne({ username });
    
    res.json({
      success: true,
      prescription: prescription || null
    });
  } catch (error) {
    console.error('Lỗi lấy hồ sơ độ cận:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy hồ sơ độ cận!' });
  }
};

// [POST] /api/prescription (Tạo mới hoặc Cập nhật hồ sơ độ cận của khách hàng)
exports.savePrescription = async (req, res) => {
  try {
    const username = req.user.username;
    const { rightEye, leftEye, pd, issuedDate, note } = req.body;

    const updateData = {
      rightEye: {
        sphere: rightEye?.sphere !== undefined ? Number(rightEye.sphere) : null,
        cylinder: rightEye?.cylinder !== undefined ? Number(rightEye.cylinder) : null,
        axis: rightEye?.axis !== undefined ? Number(rightEye.axis) : null
      },
      leftEye: {
        sphere: leftEye?.sphere !== undefined ? Number(leftEye.sphere) : null,
        cylinder: leftEye?.cylinder !== undefined ? Number(leftEye.cylinder) : null,
        axis: leftEye?.axis !== undefined ? Number(leftEye.axis) : null
      },
      pd: pd !== undefined ? Number(pd) : null,
      issuedDate: issuedDate ? new Date(issuedDate) : new Date(),
      note: note || ''
    };

    let prescription = await Prescription.findOneAndUpdate(
      { username },
      { $set: updateData },
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      message: 'Lưu hồ sơ độ cận thành công!',
      prescription
    });
  } catch (error) {
    console.error('Lỗi lưu hồ sơ độ cận:', error);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lưu hồ sơ độ cận!' });
  }
};
