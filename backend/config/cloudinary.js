const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    // Nếu là file 3D (.glb)
    if (file.fieldname === 'arModel') {
      return {
        folder: 'KinhMat_AR_Models',
        resource_type: 'raw', // Bắt buộc phải là raw đối với các file không phải ảnh/video thông thường
      };
    }
    // Nếu là file ảnh logo/sản phẩm thông thường
    return {
      folder: 'KinhMat_AR_Images',
      allowedFormats: ['jpeg', 'png', 'jpg', 'webp'],
    };
  }
});

const uploadCloud = multer({ storage });
module.exports = uploadCloud;