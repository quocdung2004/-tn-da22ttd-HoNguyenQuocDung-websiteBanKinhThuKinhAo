# Website Bán Kính Mắt Tích Hợp Chức Năng Thử Kính Ảo

Đây là khóa luận tốt nghiệp của **Hồ Nguyễn Quốc Dũng** Lớp **DA22TTD**. Hệ thống là một website thương mại điện tử chuyên cung cấp các sản phẩm kính mắt, điểm đặc biệt là tích hợp công nghệ AR cho phép khách hàng **thử kính ảo trực tuyến** ngay trên trình duyệt thông qua webcam.

---

## 🚀 Tính Năng Chính

### 1. Dành cho Khách Hàng (Customer)
* **Xem & Tìm kiếm sản phẩm**: Lọc sản phẩm theo thương hiệu, danh mục, giá cả.
* **Thử kính ảo**: Sử dụng webcam để nhận diện khuôn mặt và ướm thử kính 3D thời gian thực (tích hợp **MediaPipe** & **Three.js**).
* **Quản lý đơn kính thuốc**: Lưu trữ và quản lý thông số mắt để đặt tròng kính phù hợp.
* **Giỏ hàng & Thanh toán trực tuyến**: Tích hợp cổng thanh toán **PayOS** tiện lợi và an toàn.
* **Ví điện tử nội bộ**: Quản lý số dư, thực hiện giao dịch hoàn tiền, nạp tiền và yêu cầu rút tiền.
* **Hỗ trợ trực tuyến**: Chat trực tiếp (real-time) với nhân viên tư vấn.
* **Hệ thống thông báo**: Nhận thông báo thời gian thực về trạng thái đơn hàng, ưu đãi.

### 2. Dành cho Nhân Viên & Quản Trị Viên (Staff & Admin)
* **Bảng điều khiển (Dashboard)**: Thống kê doanh thu, đơn hàng, người dùng trực quan.
* **Quản lý sản phẩm & Kho hàng**: Quản lý danh mục, thương hiệu, sản phẩm và hóa đơn nhập kho (Import Receipt).
* **Quản lý đơn hàng**: Duyệt, cập nhật trạng thái đơn hàng và xử lý yêu cầu hủy đơn từ khách hàng.
* **Quản lý yêu cầu rút tiền**: Duyệt và xử lý các yêu cầu rút tiền từ ví của khách hàng.
* **Hỗ trợ khách hàng**: Hệ thống chat nhiều hội thoại cùng lúc để hỗ trợ khách hàng nhanh chóng.
* **Quản lý Banner quảng cáo**: Cập nhật ảnh chương trình khuyến mãi hiển thị trên trang chủ.

---

## 🛠️ Công Nghệ Sử Dụng

### Frontend
* **ReactJS (v19)** & **Vite**: Thư viện UI và công cụ build tối ưu hiệu năng.
* **Tailwind CSS (v4)**: Framework CSS hiện đại giúp xây dựng giao diện responsive và bắt mắt.
* **Three.js** & **MediaPipe Task Vision**: Xử lý đồ họa 3D và nhận diện điểm mốc khuôn mặt (facial landmarks) phục vụ tính năng thử kính ảo.
* **Socket.io Client**: Kết nối thời gian thực cho tính năng chat và thông báo.

### Backend
* **Node.js** & **Express**: Xây dựng RESTful API cho ứng dụng.
* **MongoDB & Mongoose**: Cơ sở dữ liệu NoSQL lưu trữ dữ liệu sản phẩm, người dùng, đơn hàng...
* **Supabase** & **Cloudinary**: Lưu trữ dữ liệu hình ảnh sản phẩm, ảnh kính 3D và các tài liệu khác.
* **PayOS**: API thanh toán trực tuyến nhanh gọn tại Việt Nam.
* **Socket.io**: Xử lý kết nối websocket thời gian thực phía máy chủ.

---

## 📂 Cấu Trúc Thư Mục Dự Án

```text
├── docs/                     # Chứa báo cáo khóa luận (PDF & DOCX)
└── src/
    ├── backend/              # Mã nguồn phía Server (Node.js & Express)
    └── frontend/             # Mã nguồn phía Client (React, Vite, Tailwind v4)
```

---

## 🛠️ Hướng Dẫn Cài Đặt & Chạy Dự Án

### 📋 Yêu cầu hệ thống
* Đã cài đặt **Node.js** (Khuyến nghị phiên bản 18 trở lên).
* Cơ sở dữ liệu **MongoDB** (Local hoặc MongoDB Atlas).
* Tài khoản **Cloudinary**, **Supabase** và **PayOS** để lấy các API Key tương ứng.

### 1. Cấu hình Biến Môi Trường (Environment Variables)

Tại thư mục `src/backend/`, tạo file `.env` dựa theo file `.env.example` và điền đầy đủ thông tin:
```env
PORT=3001
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key

CLOUDINARY_CLOUD_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_key
CLOUDINARY_API_SECRET=your_cloudinary_secret

SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

PAYOS_CLIENT_ID=your_payos_client_id
PAYOS_API_KEY=your_payos_api_key
PAYOS_CHECKSUM_KEY=your_payos_checksum_key
PAYMENT_CANCEL_SECRET=your_payment_cancel_secret
```

### 2. Chạy Backend
Mở terminal tại thư mục dự án và chạy các lệnh sau:
```bash
cd src/backend
npm install
npm run dev
```
Server backend sẽ chạy tại: `http://localhost:3001`

### 3. Chạy Frontend
Mở một cửa sổ terminal mới và chạy:
```bash
cd src/frontend
npm install
npm run dev
```
Ứng dụng frontend sẽ chạy tại: `http://localhost:5173` (hoặc cổng hiển thị trên terminal).

---

## 📝 Bản Quyền
Dự án được thực hiện bởi sinh viên **Hồ Nguyễn Quốc Dũng**. Vui lòng không sao chép dưới mọi hình thức khi chưa được sự đồng ý.
