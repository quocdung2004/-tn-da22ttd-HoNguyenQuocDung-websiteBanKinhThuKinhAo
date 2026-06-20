import React from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin, Eye } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-slate-950 text-slate-400 border-t border-slate-900 font-sans">
      {/* Main Footer Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 md:gap-12">
          
          {/* Cột 1 - Thương hiệu */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-white">
              <Eye className="w-8 h-8 text-blue-500 animate-pulse shrink-0" />
              <span className="text-2xl font-black tracking-wider bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent">
                GlassAR
              </span>
            </div>
            <p className="text-sm leading-relaxed text-slate-400">
              Hệ thống thử kính thực tế tăng cường (AR) giúp khách hàng trải nghiệm sản phẩm trực tuyến một cách chân thực nhất.
            </p>
          </div>

          {/* Cột 2 - Liên kết nhanh */}
          <div className="flex flex-col gap-4">
            <h4 className="text-white font-extrabold text-sm uppercase tracking-widest border-b border-slate-900 pb-2">
              Liên kết nhanh
            </h4>
            <ul className="flex flex-col gap-2.5 text-sm">
              <li>
                <Link to="/" className="hover:text-blue-500 transition-colors duration-300 flex items-center gap-1 group">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></span>
                  Trang chủ
                </Link>
              </li>
              <li>
                <a href="/#product-section" className="hover:text-blue-500 transition-colors duration-300 flex items-center gap-1 group">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></span>
                  Sản phẩm
                </a>
              </li>
              <li>
                <a href="/#product-section" className="hover:text-blue-500 transition-colors duration-300 flex items-center gap-1 group">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></span>
                  Thử kính AR
                </a>
              </li>
              <li>
                <Link to="/cart" className="hover:text-blue-500 transition-colors duration-300 flex items-center gap-1 group">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></span>
                  Giỏ hàng
                </Link>
              </li>
              <li>
                <a href="mailto:support@glassar.vn" className="hover:text-blue-500 transition-colors duration-300 flex items-center gap-1 group">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></span>
                  Liên hệ
                </a>
              </li>
            </ul>
          </div>

          {/* Cột 3 - Hỗ trợ khách hàng */}
          <div className="flex flex-col gap-4">
            <h4 className="text-white font-extrabold text-sm uppercase tracking-widest border-b border-slate-900 pb-2">
              Hỗ trợ khách hàng
            </h4>
            <ul className="flex flex-col gap-2.5 text-sm">
              <li>
                <Link to="#" className="hover:text-blue-500 transition-colors duration-300 flex items-center gap-1 group">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></span>
                  Chính sách bảo hành
                </Link>
              </li>
              <li>
                <Link to="#" className="hover:text-blue-500 transition-colors duration-300 flex items-center gap-1 group">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></span>
                  Chính sách đổi trả
                </Link>
              </li>
              <li>
                <Link to="#" className="hover:text-blue-500 transition-colors duration-300 flex items-center gap-1 group">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></span>
                  Hướng dẫn mua hàng
                </Link>
              </li>
              <li>
                <Link to="#" className="hover:text-blue-500 transition-colors duration-300 flex items-center gap-1 group">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></span>
                  Điều khoản sử dụng
                </Link>
              </li>
            </ul>
          </div>

          {/* Cột 4 - Liên hệ */}
          <div className="flex flex-col gap-4">
            <h4 className="text-white font-extrabold text-sm uppercase tracking-widest border-b border-slate-900 pb-2">
              Thông tin liên hệ
            </h4>
            <ul className="flex flex-col gap-3 text-sm">
              <li className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                <span>123 Đường Ba Tháng Hai, Quận 10, TP. Hồ Chí Minh</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-blue-500 shrink-0" />
                <a href="tel:0901234567" className="hover:text-blue-500 transition-colors">0901 234 567</a>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-blue-500 shrink-0" />
                <a href="mailto:support@glassar.vn" className="hover:text-blue-500 transition-colors">support@glassar.vn</a>
              </li>
            </ul>
            
            {/* Các icon mạng xã hội */}
            <div className="flex items-center gap-3 mt-2">
              {/* Facebook */}
              <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-slate-900 hover:bg-blue-600 hover:text-white flex items-center justify-center transition-all duration-300 hover:scale-110 shadow-lg text-slate-400">
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z"/>
                </svg>
              </a>
              {/* Instagram */}
              <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-slate-900 hover:bg-pink-600 hover:text-white flex items-center justify-center transition-all duration-300 hover:scale-110 shadow-lg text-slate-400">
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                </svg>
              </a>
              {/* TikTok */}
              <a href="https://tiktok.com" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-slate-900 hover:bg-white hover:text-black flex items-center justify-center transition-all duration-300 hover:scale-110 shadow-lg text-slate-400">
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.17-2.86-.74-3.94-1.74-.22-.2-.43-.43-.63-.67-.07 2.45-.04 4.9-.06 7.35-.04 2.31-.66 4.67-2.18 6.43-1.57 1.87-3.98 2.79-6.39 2.62-2.58-.12-5.11-1.56-6.43-3.8-1.45-2.39-1.47-5.59-.05-8 1.34-2.35 3.9-3.79 6.59-3.69 1.13.03 2.25.33 3.23.89l-.01 4.01c-.69-.5-1.52-.77-2.38-.76-1.72-.01-3.37 1.05-3.95 2.69-.6 1.61-.17 3.56.98 4.79 1.13 1.25 2.97 1.68 4.54 1.11 1.53-.52 2.54-2.02 2.55-3.66.02-3.63.01-7.26.01-10.89.54-.03 1.08-.03 1.62-.05z"/>
                </svg>
              </a>
              {/* YouTube */}
              <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-slate-900 hover:bg-red-600 hover:text-white flex items-center justify-center transition-all duration-300 hover:scale-110 shadow-lg text-slate-400">
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M23.498 6.163a3.003 3.003 0 00-2.11-2.107C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.388.511a3.002 3.002 0 00-2.11 2.107C0 8.053 0 12 0 12s0 3.947.502 5.837a3.003 3.003 0 002.11 2.107C4.495 20.455 12 20.455 12 20.455s7.505 0 9.388-.511a3.002 3.002 0 002.11-2.107c.502-1.89.502-5.837.502-5.837s0-3.947-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </a>
            </div>
          </div>

        </div>

        {/* Separator Border */}
        <div className="border-t border-slate-900 my-10" />

        {/* Bottom Metadata & Copyright */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 text-xs text-slate-500">
          <div className="flex flex-col gap-1.5 text-center md:text-left">
            <p className="font-semibold text-slate-400">
              © 2026 Hồ Nguyễn Quốc Dũng. All Rights Reserved.
            </p>
            <p>
              Khóa luận tốt nghiệp: &ldquo;Hệ thống thử kính thực tế tăng cường (AR) trên nền tảng Web&rdquo;
            </p>
          </div>
          
          <div className="text-center md:text-right">
            <p className="text-slate-400 font-bold bg-slate-900/60 px-4 py-2 rounded-xl border border-slate-900 inline-block">
              Designed & Developed by Hồ Nguyễn Quốc Dũng
            </p>
          </div>
        </div>

      </div>
    </footer>
  );
}
