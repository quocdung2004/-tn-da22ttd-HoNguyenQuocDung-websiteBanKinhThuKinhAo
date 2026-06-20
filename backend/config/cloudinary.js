const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const imageCloudinaryStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'KinhMat_AR_Images',
    allowedFormats: ['jpeg', 'png', 'jpg', 'webp']
  }
});

const arMemoryStorage = multer.memoryStorage();

const productUploadStorage = {
  _handleFile(req, file, cb) {
    if (file.fieldname === 'arModel') {
      return arMemoryStorage._handleFile(req, file, cb);
    }

    return imageCloudinaryStorage._handleFile(req, file, cb);
  },

  _removeFile(req, file, cb) {
    if (file.fieldname === 'arModel') {
      return arMemoryStorage._removeFile(req, file, cb);
    }

    return imageCloudinaryStorage._removeFile(req, file, cb);
  }
};

const allowedImageExtensions = new Set(['.jpeg', '.jpg', '.png', '.webp']);
const allowedArExtensions = new Set(['.glb', '.gltf']);
const allowedArMimeTypes = new Set([
  'model/gltf-binary',
  'model/gltf+json',
  'application/json',
  'application/octet-stream'
]);

const fileFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (file.fieldname === 'arModel') {
    const isArModel =
      allowedArExtensions.has(extension) &&
      allowedArMimeTypes.has(file.mimetype);

    if (isArModel) return cb(null, true);

    const error = new Error(
      `File AR "${file.originalname}" khong hop le. Chi chap nhan .glb hoac .gltf.`
    );
    error.statusCode = 400;
    return cb(error);
  }

  const isImage =
    file.mimetype.startsWith('image/') &&
    allowedImageExtensions.has(extension);

  if (isImage) return cb(null, true);

  const error = new Error(
    `Anh "${file.originalname}" khong dung dinh dang JPEG, PNG hoac WEBP.`
  );
  error.statusCode = 400;
  return cb(error);
};

const uploadCloud = multer({
  storage: productUploadStorage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

console.log('Using config/cloudinary.js uploadCloud - images to Cloudinary, AR models to memory');

module.exports = uploadCloud;
