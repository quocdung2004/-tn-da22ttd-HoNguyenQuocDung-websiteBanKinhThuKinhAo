import axios from 'axios';

const axiosClient = axios.create({
  // baseURL trỏ tới biến môi trường VITE_BACKEND_URL được cấu hình trên host (ví dụ: Netlify)
  baseURL: import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Tự động gắn Token (từ localStorage) vào Header của mọi request
axiosClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('glassesToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default axiosClient;
