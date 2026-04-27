import React, { useState, useRef, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  Camera, ShoppingCart, ShieldCheck, ChevronLeft, X, 
  RefreshCw, Download, Sparkles, ChevronDown, Edit3, Eye 
} from 'lucide-react';
import { PRODUCTS } from '../../constants/data';
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export default function ProductDetail() {
  const { id } = useParams();
  const product = PRODUCTS.find(p => p.id === parseInt(id));

  // --- 1. QUẢN LÝ TRẠNG THÁI (STATE) ---
  const [hasPrescription, setHasPrescription] = useState(false);
  const [od, setOd] = useState('');
  const [os, setOs] = useState('');
  const [isAROpen, setIsAROpen] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(true);
  const [capturedImage, setCapturedImage] = useState(null); 
  const [isAdded, setIsAdded] = useState(false); 
  
  // Trạng thái điều khiển Ngăn kéo và AI trong phòng AR
  const [activeARProduct, setActiveARProduct] = useState(product);
  const [showGlassesMenu, setShowGlassesMenu] = useState(false);
  const [showPrescriptionSheet, setShowPrescriptionSheet] = useState(false);
  
  // TÍNH NĂNG MỚI: State để ẩn/hiện bảng điều khiển độ cận trong phòng AR
  const [showArDiopterControl, setShowArDiopterControl] = useState(false);
  const [arDiopter, setArDiopter] = useState(0);

  // --- 2. QUẢN LÝ THAM CHIẾU (REFS) ---
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const faceLandmarkerRef = useRef(null);
  const requestRef = useRef(null);
  const glassesImageRef = useRef(new Image());

  // --- 3. LOGIC ĐỒNG BỘ DỮ LIỆU ---
  
  // Tự động tải hồ sơ độ cận từ máy khách nếu có
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('userPrescription'));
    if (saved) {
      setOd(saved.od || '');
      setOs(saved.os || '');
      if (saved.od || saved.os) {
        setHasPrescription(true);
      }
    }
  }, []);

  // Cập nhật ảnh kính khi khách hàng đổi mẫu trong AR
  useEffect(() => {
    if (activeARProduct) {
      glassesImageRef.current.src = activeARProduct.image;
    }
  }, [activeARProduct]);

  // Khởi tạo bộ não AI (MediaPipe)
  useEffect(() => {
    const initAI = async () => {
      try {
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "GPU"
          },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 1
        });
        setIsAiLoading(false);
      } catch (err) {
        console.error("Lỗi khởi tạo AI:", err);
      }
    };
    initAI();

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  // --- 4. LOGIC XỬ LÝ ĐỘ CẬN & HIỆU ỨNG MỜ ---
  
  const handleArDiopterChange = (val) => {
    setArDiopter(val);
    // Khi kéo thanh trượt trong AR, tự động điền vào form mua hàng
    if (val > 0) {
      setHasPrescription(true);
      setOd(`-${val.toFixed(2)}`);
      setOs(`-${val.toFixed(2)}`);
    } else {
      setHasPrescription(false);
      setOd('');
      setOs('');
    }
  };

  const calculateBlur = () => {
    // Nếu đang trong AR thì ưu tiên giá trị từ thanh trượt
    if (isAROpen) return arDiopter * 2;
    // Nếu ở ngoài thì tính dựa trên số nhập trong form
    if (!hasPrescription) return 0;
    const maxVal = Math.max(Math.abs(parseFloat(od) || 0), Math.abs(parseFloat(os) || 0));
    return maxVal * 2;
  };

  // --- 5. THUẬT TOÁN VẼ KÍNH (AR ENGINE) ---
  const drawGlasses = (landmarks) => {
    const canvas = canvasRef.current;
    if (!canvas || !glassesImageRef.current.complete) return;
    const ctx = canvas.getContext("2d");

    // Tọa độ các điểm mốc quan trọng
    const midPoint = landmarks[168]; 
    const leftFace = landmarks[234]; 
    const rightFace = landmarks[454]; 
    const p1 = landmarks[33];        
    const p2 = landmarks[263];       

    // Tính toán tỷ lệ dựa trên kích thước thực tế khuôn mặt
    const faceWidth = Math.sqrt(
      Math.pow((rightFace.x - leftFace.x) * canvas.width, 2) +
      Math.pow((rightFace.y - leftFace.y) * canvas.height, 2)
    );
    const glassesWidth = faceWidth * 1.15; 
    const glassesHeight = glassesWidth * (glassesImageRef.current.height / glassesImageRef.current.width);

    // Tính toán góc nghiêng khuôn mặt
    const angle = Math.atan2(
      (p2.y - p1.y) * canvas.height,
      (p2.x - p1.x) * canvas.width
    );

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    
    // Di chuyển và xoay khung hình để vẽ kính khớp với sống mũi
    ctx.translate(
      (midPoint.x * canvas.width), 
      (midPoint.y * canvas.height) + (glassesHeight * 0.12)
    );
    ctx.rotate(angle);
    
    ctx.drawImage(
      glassesImageRef.current,
      -glassesWidth / 2,
      -glassesHeight / 2,
      glassesWidth,
      glassesHeight
    );
    
    ctx.restore();
  };

  const predictWebcam = () => {
    if (faceLandmarkerRef.current && videoRef.current?.readyState === 4) {
      const results = faceLandmarkerRef.current.detectForVideo(videoRef.current, performance.now());
      if (results.faceLandmarks?.[0]) {
        drawGlasses(results.faceLandmarks[0]);
      }
    }
    if (isAROpen && !capturedImage) {
      requestRef.current = requestAnimationFrame(predictWebcam);
    }
  };

  // --- 6. ĐIỀU KHIỂN CAMERA ---
  const startCamera = () => {
    setCapturedImage(null);
    setIsAROpen(true);
    setShowGlassesMenu(false);
    setShowArDiopterControl(false); // Ẩn bảng điều khiển độ cận lúc mới mở
    setActiveARProduct(product);
    // Đồng bộ số đo hiện tại vào thanh trượt AR
    const currentDiop = hasPrescription ? Math.max(Math.abs(parseFloat(od) || 0), Math.abs(parseFloat(os) || 0)) : 0;
    setArDiopter(currentDiop);
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
    setIsAROpen(false);
    setCapturedImage(null);
    setShowArDiopterControl(false);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;
    const tempCtx = tempCanvas.getContext("2d");

    // Lật ảnh để đúng chiều gương
    tempCtx.translate(tempCanvas.width, 0);
    tempCtx.scale(-1, 1);
    
    tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
    tempCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
    
    setCapturedImage(tempCanvas.toDataURL("image/png"));
    setShowGlassesMenu(false);
    setShowArDiopterControl(false);
  };

  useEffect(() => {
    if (isAROpen && videoRef.current) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
        .then((stream) => {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            canvasRef.current.width = videoRef.current.videoWidth;
            canvasRef.current.height = videoRef.current.videoHeight;
            predictWebcam();
          };
        });
    }
  }, [isAROpen]);

  // --- 7. QUẢN LÝ GIỎ HÀNG ---
  const handleAddToCart = () => {
    if (hasPrescription && !od && !os) {
      alert("Vui lòng nhập thông số độ cận trước khi thêm vào giỏ!");
      return;
    }

    const cartItemId = hasPrescription ? `${product.id}_rx_${od}_${os}` : `${product.id}_std`;
    const newItem = {
      cartId: cartItemId,
      productId: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      hasPrescription,
      od, os,
      quantity: 1
    };

    const cart = JSON.parse(localStorage.getItem('glassesCart')) || [];
    const existingIndex = cart.findIndex(item => item.cartId === newItem.cartId);

    if (existingIndex !== -1) {
      cart[existingIndex].quantity += 1;
    } else {
      cart.push(newItem);
    }

    localStorage.setItem('glassesCart', JSON.stringify(cart));
    window.dispatchEvent(new Event('cartUpdated'));
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 2000);
  };

  if (!product) return <div className="p-20 text-center font-bold">Đang tải dữ liệu...</div>;

  return (
    <div className="bg-white min-h-screen pb-24 overflow-x-hidden">
      {/* ---------------- TRANG CHI TIẾT SẢN PHẨM ---------------- */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Link to="/" className="inline-flex items-center text-gray-500 hover:text-blue-600 mb-8 font-medium">
          <ChevronLeft className="w-5 h-5 mr-1" /> Quay lại cửa hàng
        </Link>

        <div className="flex flex-col md:flex-row gap-12">
          {/* CỘT TRÁI: HIỂN THỊ ẢNH & AR */}
          <div className="md:w-1/2 flex flex-col gap-6">
            <div className="bg-gray-50 rounded-[40px] p-10 aspect-square flex items-center justify-center relative border border-gray-100 shadow-inner overflow-hidden">
              <img src={product.image} alt={product.name} className="w-full h-auto object-contain drop-shadow-2xl" />
              {product.isARAvailable && (
                <div className="absolute top-8 left-8 bg-green-500 text-white text-[10px] font-black px-4 py-2 rounded-full flex items-center shadow-lg animate-pulse">
                  HỖ TRỢ THỬ KÍNH ẢO
                </div>
              )}
            </div>

            <button
              onClick={startCamera}
              disabled={isAiLoading || !product.isARAvailable}
              className={`w-full py-5 rounded-3xl font-black text-xl flex items-center justify-center space-x-3 transition-all ${!product.isARAvailable ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl hover:scale-[1.01]'}`}
            >
              <Camera className="w-7 h-7" />
              <span>{isAiLoading ? "ĐANG TẢI AI..." : "THỬ KÍNH THỰC TẾ ẢO (AR)"}</span>
            </button>
          </div>

          {/* CỘT PHẢI: THÔNG TIN CHI TIẾT */}
          <div className="md:w-1/2 flex flex-col">
            <h1 className="text-4xl font-black text-gray-900 leading-tight">{product.name}</h1>
            <div className="text-3xl font-black text-blue-600 mt-4">{product.price.toLocaleString('vi-VN')} VNĐ</div>
            <div className="h-px bg-gray-100 my-8"></div>
            <p className="text-gray-500 text-lg leading-relaxed mb-10">{product.description || "Gọng kính cao cấp, chất liệu siêu nhẹ mang lại cảm giác thoải mái khi đeo cả ngày."}</p>

            {/* PHẦN ĐỘ CẬN TỐI GIẢN (GIẤU TRONG NGĂN KÉO) */}
            <div className="bg-gray-50 rounded-3xl p-6 mb-8 border border-gray-100 flex items-center justify-between shadow-sm">
              <div>
                <h3 className="font-bold text-gray-900">Thông số thị lực</h3>
                <p className="text-sm text-gray-400 mt-0.5 font-medium">
                  {hasPrescription ? `Phải (OD): ${od} | Trái (OS): ${os}` : "Bấm nút bên cạnh để áp dụng độ cận"}
                </p>
              </div>
              <button 
                onClick={() => setShowPrescriptionSheet(true)}
                className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 text-blue-600 hover:bg-blue-50 transition-all active:scale-90"
              >
                <Edit3 className="w-6 h-6" />
              </button>
            </div>

            <button
              onClick={handleAddToCart}
              disabled={isAdded}
              className={`w-full py-6 rounded-3xl font-black text-xl flex items-center justify-center gap-3 shadow-2xl transition-all active:scale-95 ${isAdded ? 'bg-green-500 text-white shadow-green-200' : 'bg-gray-900 text-white shadow-gray-200 hover:bg-black'}`}
            >
              {isAdded ? <><ShieldCheck className="w-7 h-7 animate-bounce" /> ĐÃ THÊM!</> : <><ShoppingCart className="w-7 h-7" /> THÊM VÀO GIỎ</>}
            </button>
          </div>
        </div>
      </div>

      {/* ---------------- NGĂN KÉO NHẬP ĐỘ CẬN (CHO TRANG CHÍNH) ---------------- */}
      <div className={`fixed inset-0 z-[60] transition-all duration-500 ${showPrescriptionSheet ? 'visible' : 'invisible'}`}>
        <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-500 ${showPrescriptionSheet ? 'opacity-100' : 'opacity-0'}`} onClick={() => setShowPrescriptionSheet(false)}></div>
        <div className={`absolute bottom-0 w-full bg-white rounded-t-[40px] p-10 transition-transform duration-500 ease-out shadow-2xl ${showPrescriptionSheet ? 'translate-y-0' : 'translate-y-full'}`}>
          <div className="max-w-md mx-auto">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Cài đặt độ cận</h2>
              <button onClick={() => setShowPrescriptionSheet(false)} className="bg-gray-100 p-2 rounded-full text-gray-400 hover:bg-gray-200 transition"><X className="w-6 h-6"/></button>
            </div>
            
            <div className="flex items-center justify-between p-5 bg-blue-50 rounded-2xl mb-8 border border-blue-100">
              <span className="font-bold text-blue-900">Sử dụng kính thuốc</span>
              <input type="checkbox" checked={hasPrescription} onChange={() => setHasPrescription(!hasPrescription)} className="w-6 h-6 accent-blue-600 cursor-pointer" />
            </div>

            <div className={`grid grid-cols-2 gap-4 transition-all duration-300 ${hasPrescription ? 'opacity-100' : 'opacity-20 pointer-events-none'}`}>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Mắt phải (OD)</label>
                <input type="number" value={od} onChange={(e) => setOd(e.target.value)} step="0.25" placeholder="-1.50" className="w-full p-5 rounded-2xl bg-gray-50 border-none outline-none focus:ring-2 focus:ring-blue-500 font-bold text-lg" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Mắt trái (OS)</label>
                <input type="number" value={os} onChange={(e) => setOs(e.target.value)} step="0.25" placeholder="-1.25" className="w-full p-5 rounded-2xl bg-gray-50 border-none outline-none focus:ring-2 focus:ring-blue-500 font-bold text-lg" />
              </div>
            </div>

            <button onClick={() => setShowPrescriptionSheet(false)} className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-lg mt-10 shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95">
              XÁC NHẬN & LƯU
            </button>
          </div>
        </div>
      </div>

      {/* ---------------- MODAL AR GIAO DIỆN TIKTOK CÓ ẨN/HIỆN ĐỘ CẬN ---------------- */}
      {isAROpen && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-in fade-in duration-300">
          
          {/* Header */}
          <div className="p-6 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent z-10 text-white absolute top-0 w-full">
            <span className="font-bold tracking-wide flex items-center gap-2 uppercase"><div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div> PHÒNG THỬ KÍNH ẢO</span>
            <button onClick={stopCamera} className="bg-white/20 hover:bg-red-500 text-white p-2 rounded-full transition-colors"><X className="w-8 h-8" /></button>
          </div>

          <div className="relative flex-1 flex items-center justify-center overflow-hidden">
            {/* Luồng Camera & Blur */}
            <video
              ref={videoRef}
              autoPlay playsInline muted
              className="absolute inset-0 w-full h-full object-cover transform -scale-x-100"
              style={{ filter: `blur(${arDiopter * 2}px)` }}
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full object-cover transform -scale-x-100 pointer-events-none"
            />

            {capturedImage && <div className="absolute inset-0 z-30 bg-black"><img src={capturedImage} className="w-full h-full object-cover" alt="Captured" /></div>}

            {!capturedImage && (
              <>
                {/* HUD: ĐIỀU KHIỂN ĐỘ CẬN (ĐÃ ĐƯỢC ẨN BẰNG HIỆU ỨNG TRƯỢT NGANG) */}
                <div 
                  className={`absolute top-24 right-6 bg-black/60 backdrop-blur-2xl border border-white/20 text-white p-5 rounded-[35px] text-center flex flex-col items-center z-30 shadow-2xl transition-all duration-300 transform origin-right
                    ${showArDiopterControl ? 'translate-x-0 opacity-100' : 'translate-x-12 opacity-0 pointer-events-none'}
                  `}
                >
                  <button onClick={() => setShowArDiopterControl(false)} className="absolute top-4 right-4 text-white/50 hover:text-white transition">
                    <X className="w-4 h-4" />
                  </button>
                  <p className="text-[10px] font-black tracking-widest opacity-60 mb-2 mt-2 uppercase flex items-center gap-1"><Sparkles className="w-3 h-3 text-blue-400" /> Độ Cận</p>
                  <p className="font-black text-blue-400 text-3xl mb-4 leading-none">{arDiopter > 0 ? `-${arDiopter.toFixed(2)}` : '0.00'}</p>
                  <input 
                    type="range" min="0" max="10" step="0.25" value={arDiopter} 
                    onChange={(e) => handleArDiopterChange(parseFloat(e.target.value))} 
                    className="w-28 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500 mb-3" 
                  />
                  <div className="w-full h-px bg-white/10 mb-2"></div>
                  <p className="text-[9px] font-bold opacity-50 uppercase tracking-widest">
                    MỜ: <span className="text-yellow-400">{arDiopter * 2}PX</span>
                  </p>
                </div>

                {/* Nhóm nút: Đổi mẫu (Trái) - Chụp ảnh (Giữa) - Độ cận (Phải) */}
                <div className={`absolute w-full flex justify-center items-center z-20 transition-all duration-500 ${showGlassesMenu ? 'bottom-56 opacity-0 pointer-events-none' : 'bottom-20 opacity-100'}`}>
                  
                  {/* NÚT ĐỔI MẪU KÍNH */}
                  <button onClick={() => setShowGlassesMenu(true)} className="absolute left-8 sm:left-12 flex flex-col items-center gap-1 group">
                    <div className="w-14 h-14 bg-black/40 backdrop-blur-md rounded-full border border-white/30 flex items-center justify-center text-white group-hover:bg-white/20 transition-all active:scale-95">
                      <Sparkles className="w-6 h-6 text-blue-400" />
                    </div>
                    <span className="text-white text-[10px] font-black tracking-widest uppercase mt-1 drop-shadow-md">Đổi mẫu</span>
                  </button>

                  {/* NÚT CHỤP ẢNH */}
                  <button onClick={capturePhoto} className="group relative flex items-center justify-center z-20">
                    <div className="absolute w-20 h-20 bg-white/30 rounded-full animate-ping"></div>
                    <div className="w-16 h-16 bg-white rounded-full border-4 border-gray-400 shadow-2xl active:scale-90 transition-transform"></div>
                  </button>

                  {/* NÚT BẬT/TẮT ĐỘ CẬN */}
                  <button onClick={() => setShowArDiopterControl(!showArDiopterControl)} className="absolute right-8 sm:right-12 flex flex-col items-center gap-1 group">
                    <div className={`w-14 h-14 backdrop-blur-md rounded-full border flex items-center justify-center text-white transition-all active:scale-95 ${showArDiopterControl ? 'bg-blue-600 border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.6)]' : 'bg-black/40 border-white/30 group-hover:bg-white/20'}`}>
                      <Eye className={`w-6 h-6 ${showArDiopterControl ? 'text-white' : 'text-blue-400'}`} />
                    </div>
                    <span className="text-white text-[10px] font-black tracking-widest uppercase mt-1 drop-shadow-md">Độ cận</span>
                  </button>
                </div>

                {/* NGĂN KÉO CHỌN MẪU KÍNH TRONG AR */}
                <div 
                  className={`absolute bottom-0 w-full z-30 bg-black/80 backdrop-blur-3xl rounded-t-[40px] border-t border-white/10 pt-6 pb-12 transition-transform duration-500 ease-out
                    ${showGlassesMenu ? 'translate-y-0' : 'translate-y-full'}
                  `}
                >
                  <div className="flex justify-between items-center px-8 mb-6">
                    <span className="text-white text-xs font-black tracking-widest flex items-center gap-2 uppercase"><Sparkles className="w-4 h-4 text-blue-400" /> Danh sách gọng</span>
                    <button onClick={() => setShowGlassesMenu(false)} className="bg-white/10 p-2 rounded-full text-white hover:bg-white/30 transition"><ChevronDown className="w-5 h-5" /></button>
                  </div>
                  <div className="flex gap-4 overflow-x-auto px-8" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    {PRODUCTS.filter(p => p.isARAvailable).map((item) => (
                      <button 
                        key={item.id} onClick={() => setActiveARProduct(item)} 
                        className={`relative flex-shrink-0 w-32 h-32 rounded-[32px] border-2 transition-all duration-300 ${activeARProduct?.id === item.id ? 'bg-white/10 border-blue-500 scale-105 shadow-2xl' : 'bg-black/20 border-white/5 opacity-40 hover:opacity-100'}`}
                      >
                        <img src={item.image} className="w-full h-full object-contain p-5 drop-shadow-2xl" alt={item.name} />
                        {activeARProduct?.id === item.id && <div className="absolute bottom-0 w-full bg-blue-600 text-white text-[10px] font-black py-1.5 uppercase tracking-tighter">ĐANG ĐEO</div>}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* GIAO DIỆN SAU KHI CHỤP */}
            {capturedImage && (
              <div className="absolute bottom-12 w-full px-6 z-40 max-w-md mx-auto grid grid-cols-2 gap-4 animate-in slide-in-from-bottom-10 duration-500">
                <button 
                  onClick={() => { setCapturedImage(null); requestRef.current = requestAnimationFrame(predictWebcam); }} 
                  className="bg-white/20 backdrop-blur-md text-white py-4 rounded-[24px] font-black flex items-center justify-center gap-2 border border-white/30 hover:bg-white/30 transition-all active:scale-95"
                >
                  <RefreshCw className="w-5 h-5" /> CHỤP LẠI
                </button>
                <a 
                  href={capturedImage} download={`ar-glass-${activeARProduct?.id}.png`} 
                  className="bg-blue-600 text-white py-4 rounded-[24px] font-black flex items-center justify-center gap-2 shadow-xl hover:bg-blue-700 transition-all active:scale-95"
                >
                  <Download className="w-5 h-5" /> TẢI VỀ
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}