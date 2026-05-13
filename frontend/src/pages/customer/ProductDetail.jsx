import React, { useState, useRef, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

import {
  Camera, ShoppingCart, ShieldCheck, ChevronLeft, X,
  RefreshCw, Download, Sparkles, ChevronDown, Edit3, Eye, StopCircle, ImageIcon,
  CheckCircle2, Loader2, Bug, Trash2
} from 'lucide-react';
import { PRODUCTS } from '../../constants/data';
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export default function ProductDetail() {
  const { id } = useParams();
  const product = PRODUCTS.find(p => p.id === parseInt(id));

  // ==========================================
  // 1. QUẢN LÝ TRẠNG THÁI (STATE)
  // ==========================================
  const [hasPrescription, setHasPrescription] = useState(false);
  const [od, setOd] = useState('');
  const [os, setOs] = useState('');
  const [isAdded, setIsAdded] = useState(false);

  const [isAROpen, setIsAROpen] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(true);
  const [activeARProduct, setActiveARProduct] = useState(product);

  const [showGlassesMenu, setShowGlassesMenu] = useState(false);
  const [showPrescriptionSheet, setShowPrescriptionSheet] = useState(false);
  const [showArDiopterControl, setShowArDiopterControl] = useState(false);
  const [arDiopter, setArDiopter] = useState(0);

  const [capturedImage, setCapturedImage] = useState(null);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // ==========================================
  // IN-APP DEBUGGER (TERMINAL DI ĐỘNG)
  // ==========================================
  const [debugLogs, setDebugLogs] = useState([]);
  const [showDebugPane, setShowDebugPane] = useState(false);

  const addLog = (...args) => {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    setDebugLogs(prev => [...prev, msg]);
    console.log(...args);
  };

  // ==========================================
  // 2. QUẢN LÝ THAM CHIẾU (REFS)
  // ==========================================
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const faceLandmarkerRef = useRef(null);
  const requestRef = useRef(null);
  const glassesImageRef = useRef(new Image());

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerIntervalRef = useRef(null);

  // TÍNH NĂNG MỚI: Ref dùng để lưu file thô chuẩn bị gửi lên Backend
  const recordedBlobRef = useRef(null);

  // ==========================================
  // 3. LOGIC TIỆN ÍCH & KHỞI TẠO
  // ==========================================
  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('userPrescription'));
    if (saved) {
      setOd(saved.od || ''); setOs(saved.os || '');
      if (saved.od || saved.os) setHasPrescription(true);
    }
  }, []);

  useEffect(() => {
    if (activeARProduct) glassesImageRef.current.src = activeARProduct.image;
  }, [activeARProduct]);

  useEffect(() => {
    const initAI = async () => {
      try {
        const filesetResolver = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
        faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`, delegate: "GPU" },
          outputFaceBlendshapes: true, runningMode: "VIDEO", numFaces: 1
        });
        setIsAiLoading(false);
        addLog("✅ AI đã khởi tạo thành công");
      } catch (err) {
        addLog("❌ Lỗi khởi tạo AI:", err.message);
      }
    };
    initAI();
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, []);

  // ==========================================
  // 4. THUẬT TOÁN VẼ KHUNG HÌNH (CANVAS ENGINE)
  // ==========================================
  const handleArDiopterChange = (val) => {
    setArDiopter(val);
    if (val > 0) {
      setHasPrescription(true); setOd(`-${val.toFixed(2)}`); setOs(`-${val.toFixed(2)}`);
    } else {
      setHasPrescription(false); setOd(''); setOs('');
    }
  };

  const drawScene = (landmarks) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !glassesImageRef.current.complete) return;
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.filter = `blur(${arDiopter * 2}px)`;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    if (landmarks) {
      const midPoint = landmarks[168], leftFace = landmarks[234], rightFace = landmarks[454], p1 = landmarks[33], p2 = landmarks[263];
      const faceWidth = Math.sqrt(Math.pow((rightFace.x - leftFace.x) * canvas.width, 2) + Math.pow((rightFace.y - leftFace.y) * canvas.height, 2));
      const glassesWidth = faceWidth * 1.15;
      const glassesHeight = glassesWidth * (glassesImageRef.current.height / glassesImageRef.current.width);
      const angle = Math.atan2((p2.y - p1.y) * canvas.height, (p2.x - p1.x) * canvas.width);

      ctx.save();
      ctx.translate(canvas.width - (midPoint.x * canvas.width), (midPoint.y * canvas.height) + (glassesHeight * 0.12));
      ctx.rotate(-angle);
      ctx.drawImage(glassesImageRef.current, -glassesWidth / 2, -glassesHeight / 2, glassesWidth, glassesHeight);
      ctx.restore();
    }
  };

  const predictWebcam = () => {
    if (videoRef.current && videoRef.current.readyState >= 2) {
      let landmarks = null;
      if (faceLandmarkerRef.current) {
        const results = faceLandmarkerRef.current.detectForVideo(videoRef.current, performance.now());
        landmarks = results.faceLandmarks?.[0] || null;
      }
      drawScene(landmarks);
    }
    if (isAROpen && !capturedImage && !recordedVideoUrl) {
      requestRef.current = requestAnimationFrame(predictWebcam);
    }
  };

  // ==========================================
  // 5. ĐIỀU KHIỂN QUAY PHIM
  // ==========================================
  const capturePhoto = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setCapturedImage(canvas.toDataURL("image/png"));
    setShowGlassesMenu(false);
    setShowArDiopterControl(false);
  };

  const startRecording = () => {
    addLog("--- BẮT ĐẦU QUAY VIDEO ---");
    chunksRef.current = [];

    const canvasStream = canvasRef.current.captureStream(30);
    const audioTracks = videoRef.current?.srcObject?.getAudioTracks() || [];
    const combinedStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);

    let mimeType = 'video/webm';
    if (MediaRecorder.isTypeSupported('video/webm;codecs=h264')) {
      mimeType = 'video/webm;codecs=h264';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
      mimeType = 'video/webm;codecs=vp9';
    } else if (MediaRecorder.isTypeSupported('video/mp4')) {
      mimeType = 'video/mp4';
    }

    addLog("Định dạng CHÍNH THỨC chọn được:", mimeType);

    try {
      const recorder = new MediaRecorder(combinedStream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const baseType = mimeType.split(';')[0];
        const rawBlob = new Blob(chunksRef.current, { type: baseType });
        addLog("🛑 Đã dừng quay. File gốc size:", rawBlob.size, "bytes");

        // LƯU RAW BLOB ĐỂ CHUẨN BỊ GỬI LÊN SERVER
        recordedBlobRef.current = rawBlob;

        // Hiển thị preview cho khách xem tạm
        setRecordedVideoUrl(URL.createObjectURL(rawBlob));
        clearInterval(timerIntervalRef.current);
        setRecordingTime(0);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setShowGlassesMenu(false);
      setShowArDiopterControl(false);

      setRecordingTime(0);
      timerIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (err) {
      addLog("❌ Lỗi MediaRecorder:", err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerIntervalRef.current);
    }
  };

  // ==========================================
  // HÀM TẢI XUỐNG GỌI API BACKEND (TÍNH NĂNG MỚI)
  // ==========================================
  const handleDownloadTikTokStyle = async () => {
    setIsDownloading(true);
    setDownloadProgress(0);

    // 1. Nếu là ẢNH TĨNH: Tải trực tiếp như bình thường
    if (capturedImage) {
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.floor(Math.random() * 20) + 10;
        if (progress >= 100) {
          clearInterval(interval);
          const a = document.createElement('a');
          a.href = capturedImage;
          a.download = `kinh-mat-${activeARProduct?.id}.png`;
          a.click();
          setIsDownloading(false);
          showToast('Đã lưu ảnh vào thiết bị', 'success');
        }
        setDownloadProgress(Math.min(progress, 100));
      }, 200);
      return;
    }

    // 2. Nếu là VIDEO: Gửi lên Backend để Convert sang MP4
    if (recordedBlobRef.current) {
      addLog("🚀 Bắt đầu gửi file lên Backend Convert...");

      // Fake progress lúc chờ server phản hồi
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += Math.floor(Math.random() * 5) + 2;
        if (progress < 90) setDownloadProgress(progress);
      }, 300);

      try {
        const formData = new FormData();
        formData.append('video', recordedBlobRef.current, 'video.webm');

        // GỌI API BACKEND (IP CỦA MÁY BẠN)
        // THAY BẰNG DÒNG NÀY:
        const response = await fetch('/api/convert', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) throw new Error("Server xử lý lỗi!");

        // Nhận cục MP4 chuẩn xịn từ Server về
        const mp4Blob = await response.blob();

        clearInterval(progressInterval);
        setDownloadProgress(100);

        // Tải MP4 vào điện thoại
        const url = URL.createObjectURL(mp4Blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `video-kinh-ar-${activeARProduct?.id}.mp4`;
        a.click();

        setTimeout(() => {
          setIsDownloading(false);
          showToast('Đã lưu video MP4 vào thiết bị', 'success');
          addLog("✅ Tải MP4 thành công!");
        }, 500);

      } catch (error) {
        clearInterval(progressInterval);
        setIsDownloading(false);
        showToast('Lỗi server, vui lòng thử lại!', 'error');
        addLog("❌ Lỗi Fetch Backend:", error.message);
      }
    }
  };

  // ==========================================
  // 6. ĐIỀU KHIỂN CAMERA
  // ==========================================
  const startCamera = () => {
    setCapturedImage(null); setRecordedVideoUrl(null); recordedBlobRef.current = null;
    setIsAROpen(true); setShowGlassesMenu(false); setShowArDiopterControl(false);
    setActiveARProduct(product);
    const currentDiop = hasPrescription ? Math.max(Math.abs(parseFloat(od) || 0), Math.abs(parseFloat(os) || 0)) : 0;
    setArDiopter(currentDiop);
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    if (isRecording) stopRecording();
    setIsAROpen(false); setCapturedImage(null); setRecordedVideoUrl(null); recordedBlobRef.current = null;
    clearInterval(timerIntervalRef.current);
  };

  useEffect(() => {
    if (isAROpen && videoRef.current) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true })
        .then((stream) => {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play();
            canvasRef.current.width = videoRef.current.videoWidth;
            canvasRef.current.height = videoRef.current.videoHeight;
            predictWebcam();
            addLog("✅ Camera đã mở thành công");
          };
        })
        .catch(err => {
          showToast('Vui lòng cấp quyền Camera/Micro', 'error');
          addLog("❌ Lỗi xin quyền Camera:", err.message);
        });
    }
  }, [isAROpen]);

  // ==========================================
  // 7. QUẢN LÝ GIỎ HÀNG
  // ==========================================
  const handleAddToCart = () => {
    if (hasPrescription && !od && !os) {
      showToast('Vui lòng nhập độ cận!', 'error');
      return;
    }
    const cartItemId = hasPrescription ? `${product.id}_rx_${od}_${os}` : `${product.id}_std`;
    const newItem = { cartId: cartItemId, productId: product.id, name: product.name, price: product.price, image: product.image, hasPrescription, od, os, quantity: 1 };
    const cart = JSON.parse(localStorage.getItem('glassesCart')) || [];
    const existIdx = cart.findIndex(item => item.cartId === newItem.cartId);
    if (existIdx !== -1) cart[existIdx].quantity += 1;
    else cart.push(newItem);
    localStorage.setItem('glassesCart', JSON.stringify(cart));
    window.dispatchEvent(new Event('cartUpdated'));

    setIsAdded(true);
    showToast('Đã thêm vào giỏ hàng', 'success');
    setTimeout(() => setIsAdded(false), 2000);
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (!product) return <div className="p-20 text-center font-bold">Đang tải dữ liệu...</div>;

  return (
    <div className="bg-white min-h-screen pb-24 overflow-x-hidden relative">

      {/* ---------------- IN-APP DEBUGGER CHO MOBILE ---------------- */}
      <button
        onClick={() => setShowDebugPane(!showDebugPane)}
        className="fixed bottom-4 right-4 z-[9999] bg-yellow-500 text-white p-3 rounded-full shadow-[0_0_15px_rgba(234,179,8,0.5)] active:scale-90"
      >
        <Bug className="w-6 h-6" />
      </button>

      <div className={`fixed bottom-0 left-0 w-full h-[50vh] bg-black/95 z-[9998] border-t-2 border-green-500 p-4 font-mono text-[10px] sm:text-xs overflow-y-auto transition-transform duration-300 ${showDebugPane ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="flex justify-between items-center mb-3 sticky top-0 bg-black pb-2 border-b border-gray-800">
          <span className="text-green-500 font-bold">TERMINAL DI ĐỘNG v1.0</span>
          <button onClick={() => setDebugLogs([])} className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
        </div>
        {debugLogs.length === 0 ? <p className="text-gray-500 italic">Chưa có log nào...</p> : null}
        {debugLogs.map((log, i) => (
          <div key={i} className={`${log.includes('❌') ? 'text-red-400' : log.includes('✅') ? 'text-green-400' : log.includes('🛑') ? 'text-yellow-400' : 'text-gray-300'} mb-1.5 border-b border-white/5 pb-1`}>
            <span className="text-gray-600 mr-2">[{i + 1}]</span> {log}
          </div>
        ))}
      </div>

      {/* ---------------- TOAST NOTIFICATION ---------------- */}
      <div className={`fixed top-10 left-1/2 transform -translate-x-1/2 z-[999] transition-all duration-300 ${toast.show ? 'translate-y-0 opacity-100' : '-translate-y-10 opacity-0 pointer-events-none'}`}>
        <div className={`flex items-center gap-2 px-6 py-3 rounded-full shadow-2xl font-bold text-sm ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-black/80 backdrop-blur-md text-white border border-white/20'}`}>
          {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-green-400" />}
          {toast.message}
        </div>
      </div>

      {/* ---------------- TRANG CHI TIẾT SẢN PHẨM ---------------- */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Link to="/" className="inline-flex items-center text-gray-500 hover:text-blue-600 mb-8 font-medium">
          <ChevronLeft className="w-5 h-5 mr-1" /> Quay lại cửa hàng
        </Link>

        <div className="flex flex-col md:flex-row gap-12">
          {/* CỘT TRÁI */}
          <div className="md:w-1/2 flex flex-col gap-6">
            <div className="bg-gray-50 rounded-[40px] p-10 aspect-square flex items-center justify-center relative border border-gray-100 shadow-inner overflow-hidden">
              <img src={product.image} alt={product.name} className="w-full h-auto object-contain drop-shadow-2xl" />
              {product.isARAvailable && (
                <div className="absolute top-8 left-8 bg-green-500 text-white text-[10px] font-black px-4 py-2 rounded-full flex items-center shadow-lg animate-pulse">
                  HỖ TRỢ THỬ KÍNH ẢO
                </div>
              )}
            </div>
            <button onClick={startCamera} disabled={isAiLoading || !product.isARAvailable} className={`w-full py-5 rounded-3xl font-black text-xl flex items-center justify-center space-x-3 transition-all ${!product.isARAvailable ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white shadow-xl hover:scale-[1.01]'}`}>
              <Camera className="w-7 h-7" />
              <span>{isAiLoading ? "ĐANG TẢI AI..." : "THỬ KÍNH THỰC TẾ ẢO (AR)"}</span>
            </button>
          </div>

          {/* CỘT PHẢI */}
          <div className="md:w-1/2 flex flex-col">
            <h1 className="text-4xl font-black text-gray-900 leading-tight">{product.name}</h1>
            <div className="text-3xl font-black text-blue-600 mt-4">{product.price.toLocaleString('vi-VN')} VNĐ</div>
            <div className="h-px bg-gray-100 my-8"></div>
            <p className="text-gray-500 text-lg leading-relaxed mb-10">{product.description || "Gọng kính cao cấp, chất liệu siêu nhẹ mang lại cảm giác thoải mái khi đeo cả ngày."}</p>

            <div className="bg-gray-50 rounded-3xl p-6 mb-8 border border-gray-100 flex items-center justify-between shadow-sm">
              <div>
                <h3 className="font-bold text-gray-900 text-lg">Thông số thị lực</h3>
                <p className="text-sm text-gray-400 mt-0.5 font-medium">
                  {hasPrescription ? `Phải (OD): ${od} | Trái (OS): ${os}` : "Bấm nút bên phải để áp dụng độ cận"}
                </p>
              </div>
              <button onClick={() => setShowPrescriptionSheet(true)} className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 text-blue-600 hover:bg-blue-50 transition-all active:scale-90">
                <Edit3 className="w-6 h-6" />
              </button>
            </div>

            <button onClick={handleAddToCart} disabled={isAdded} className={`w-full py-6 rounded-3xl font-black text-xl flex items-center justify-center gap-3 shadow-2xl transition-all active:scale-95 ${isAdded ? 'bg-green-500 text-white shadow-green-200' : 'bg-gray-900 text-white shadow-gray-200 hover:bg-black'}`}>
              {isAdded ? <><ShieldCheck className="w-7 h-7 animate-bounce" /> ĐÃ THÊM!</> : <><ShoppingCart className="w-7 h-7" /> THÊM VÀO GIỎ</>}
            </button>
          </div>
        </div>
      </div>

      {/* ---------------- NGĂN KÉO NHẬP ĐỘ CẬN (TRANG CHÍNH) ---------------- */}
      <div className={`fixed inset-0 z-[60] transition-all duration-500 ${showPrescriptionSheet ? 'visible' : 'invisible'}`}>
        <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-500 ${showPrescriptionSheet ? 'opacity-100' : 'opacity-0'}`} onClick={() => setShowPrescriptionSheet(false)}></div>
        <div className={`absolute bottom-0 w-full bg-white rounded-t-[40px] p-10 transition-transform duration-500 ease-out shadow-2xl ${showPrescriptionSheet ? 'translate-y-0' : 'translate-y-full'}`}>
          <div className="max-w-md mx-auto">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-gray-900 uppercase">Cài đặt độ cận</h2>
              <button onClick={() => setShowPrescriptionSheet(false)} className="bg-gray-100 p-2 rounded-full text-gray-400 hover:bg-gray-200"><X className="w-6 h-6" /></button>
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
            <button onClick={() => setShowPrescriptionSheet(false)} className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-lg mt-10 shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95">XÁC NHẬN & LƯU</button>
          </div>
        </div>
      </div>

      {/* ---------------- MODAL AR ---------------- */}
      {isAROpen && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-in fade-in duration-300">

          {/* Header */}
          <div className="p-6 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent z-10 text-white absolute top-0 w-full">
            <span className="font-bold tracking-wide flex items-center gap-2 uppercase"><div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div> PHÒNG THỬ KÍNH ẢO</span>
            <button onClick={stopCamera} className="bg-white/20 hover:bg-red-500 text-white p-2 rounded-full transition-colors"><X className="w-8 h-8" /></button>
          </div>

          <div className="relative flex-1 flex items-center justify-center overflow-hidden">
            <video ref={videoRef} autoPlay playsInline muted className="absolute opacity-0 w-px h-px pointer-events-none -z-10" />
            <canvas ref={canvasRef} className="w-full h-full object-cover transform -scale-x-100" />

            {capturedImage && <div className="absolute inset-0 z-30 bg-black"><img src={capturedImage} className="w-full h-full object-cover transform -scale-x-100" alt="Captured" /></div>}
            {recordedVideoUrl && <div className="absolute inset-0 z-30 bg-black"><video src={recordedVideoUrl} autoPlay loop playsInline className="w-full h-full object-cover transform -scale-x-100" /></div>}

            {/* BỘ ĐẾM THỜI GIAN */}
            {isRecording && (
              <div className="absolute top-20 w-full flex justify-center z-20 animate-in slide-in-from-top-4">
                <div className="bg-red-600 text-white px-4 py-1.5 rounded-full font-bold text-sm tracking-widest flex items-center gap-2 shadow-lg shadow-red-600/50">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                  {formatTime(recordingTime)}
                </div>
              </div>
            )}

            {/* BỘ ĐIỀU KHIỂN AR & HUD */}
            {(!capturedImage && !recordedVideoUrl) && (
              <>
                <div className={`absolute top-24 right-6 bg-black/60 backdrop-blur-2xl border border-white/20 text-white p-5 rounded-[35px] text-center flex flex-col items-center z-30 shadow-2xl transition-all duration-300 transform origin-right ${showArDiopterControl ? 'translate-x-0 opacity-100' : 'translate-x-12 opacity-0 pointer-events-none'}`}>
                  <button onClick={() => setShowArDiopterControl(false)} className="absolute top-4 right-4 text-white/50 hover:text-white transition"><X className="w-4 h-4" /></button>
                  <p className="text-[10px] font-black tracking-widest opacity-60 mb-2 mt-2 uppercase flex items-center gap-1"><Sparkles className="w-3 h-3 text-blue-400" /> Độ Cận</p>
                  <p className="font-black text-blue-400 text-3xl mb-4 leading-none">{arDiopter > 0 ? `-${arDiopter.toFixed(2)}` : '0.00'}</p>
                  <input type="range" min="0" max="10" step="0.25" value={arDiopter} onChange={(e) => handleArDiopterChange(parseFloat(e.target.value))} className="w-28 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500 mb-3" />
                  <div className="w-full h-px bg-white/10 mb-2"></div>
                  <p className="text-[9px] font-bold opacity-50 uppercase tracking-widest">MỜ: <span className="text-yellow-400">{arDiopter * 2}PX</span></p>
                </div>

                {/* THANH CÔNG CỤ DƯỚI CÙNG */}
                <div className={`absolute w-full flex justify-between items-center px-8 z-20 transition-all duration-500 ${showGlassesMenu ? 'bottom-56 opacity-0 pointer-events-none' : 'bottom-16 opacity-100'}`}>
                  <button onClick={() => setShowGlassesMenu(true)} className={`flex flex-col items-center gap-1 group w-16 transition-opacity ${isRecording ? 'opacity-0' : 'opacity-100'}`}>
                    <div className="w-14 h-14 bg-black/40 backdrop-blur-md rounded-full border border-white/30 flex items-center justify-center text-white group-hover:bg-white/20 transition-all active:scale-95"><Sparkles className="w-6 h-6 text-blue-400" /></div>
                    <span className="text-white text-[10px] font-black tracking-widest uppercase mt-1 drop-shadow-md">Đổi mẫu</span>
                  </button>

                  <div className={`flex items-center gap-6 backdrop-blur-md p-2 rounded-full border transition-all duration-300 ${isRecording ? 'bg-transparent border-transparent' : 'bg-black/40 border-white/20'}`}>
                    <button onClick={capturePhoto} className={`flex flex-col items-center group ml-2 transition-all duration-300 ${isRecording ? 'w-0 overflow-hidden opacity-0 mx-0' : 'w-12 h-12 opacity-100'}`}>
                      <div className="w-12 h-12 bg-white rounded-full border-[3px] border-gray-300 flex items-center justify-center active:scale-90 transition-transform"><ImageIcon className="w-5 h-5 text-gray-800" /></div>
                    </button>

                    <div className={`w-px h-8 bg-white/20 transition-all ${isRecording ? 'hidden' : 'block'}`}></div>

                    <button onClick={isRecording ? stopRecording : startRecording} className={`flex flex-col items-center group transition-all duration-300 ${isRecording ? 'scale-125' : 'mr-2'}`}>
                      <div className={`rounded-full border-[3px] flex items-center justify-center transition-all ${isRecording ? 'w-20 h-20 border-red-500 bg-red-500/20' : 'w-12 h-12 border-white bg-transparent'}`}>
                        {isRecording ? <StopCircle className="text-red-500 w-8 h-8 animate-pulse" /> : <div className="w-8 h-8 bg-red-600 rounded-full group-hover:scale-110 transition-transform shadow-lg" />}
                      </div>
                    </button>
                  </div>

                  <button onClick={() => setShowArDiopterControl(!showArDiopterControl)} className={`flex flex-col items-center gap-1 group w-16 transition-opacity ${isRecording ? 'opacity-0' : 'opacity-100'}`}>
                    <div className={`w-14 h-14 backdrop-blur-md rounded-full border flex items-center justify-center text-white transition-all active:scale-95 ${showArDiopterControl ? 'bg-blue-600 border-blue-400' : 'bg-black/40 border-white/30 group-hover:bg-white/20'}`}><Eye className={`w-6 h-6 ${showArDiopterControl ? 'text-white' : 'text-blue-400'}`} /></div>
                    <span className="text-white text-[10px] font-black tracking-widest uppercase mt-1 drop-shadow-md">Độ cận</span>
                  </button>
                </div>

                {/* NGĂN KÉO CHỌN MẪU KÍNH */}
                <div className={`absolute bottom-0 w-full z-30 bg-black/80 backdrop-blur-3xl rounded-t-[40px] border-t border-white/10 pt-6 pb-12 transition-transform duration-500 ease-out ${showGlassesMenu ? 'translate-y-0' : 'translate-y-full'}`}>
                  <div className="flex justify-between items-center px-8 mb-6">
                    <span className="text-white text-xs font-black tracking-widest flex items-center gap-2 uppercase"><Sparkles className="w-4 h-4 text-blue-400" /> Danh sách gọng</span>
                    <button onClick={() => setShowGlassesMenu(false)} className="bg-white/10 p-2 rounded-full text-white hover:bg-white/30 transition"><ChevronDown className="w-5 h-5" /></button>
                  </div>
                  <div className="flex gap-4 overflow-x-auto px-8 pb-4" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    {PRODUCTS.filter(p => p.isARAvailable).map((item) => (
                      <button key={item.id} onClick={() => setActiveARProduct(item)} className={`relative flex-shrink-0 w-32 h-32 rounded-[32px] border-2 transition-all duration-300 ${activeARProduct?.id === item.id ? 'bg-white/10 border-blue-500 scale-105 shadow-2xl' : 'bg-black/20 border-white/5 opacity-40 hover:opacity-100'}`}>
                        <img src={item.image} className="w-full h-full object-contain p-5 drop-shadow-2xl" alt={item.name} />
                        {activeARProduct?.id === item.id && <div className="absolute bottom-0 w-full bg-blue-600 text-white text-[10px] font-black py-1.5 uppercase tracking-tighter">ĐANG ĐEO</div>}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* MÀN HÌNH CHỜ KHI ĐANG TẢI */}
            {isDownloading && (
              <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in">
                <Loader2 className="w-12 h-12 text-white animate-spin mb-4" />
                <div className="text-white font-black text-2xl tracking-widest">{downloadProgress}%</div>
                <div className="text-gray-400 text-xs uppercase mt-2 font-bold">Đang lưu vào thiết bị</div>
                <div className="w-48 h-1 bg-white/20 mt-6 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all duration-200" style={{ width: `${downloadProgress}%` }}></div>
                </div>
              </div>
            )}

            {/* GIAO DIỆN HÀNH ĐỘNG SAU KHI CHỤP/QUAY XONG */}
            {(capturedImage || recordedVideoUrl) && !isDownloading && (
              <div className="absolute bottom-12 w-full px-6 z-40 max-w-md mx-auto grid grid-cols-2 gap-4 animate-in slide-in-from-bottom-10 duration-500">
                <button onClick={() => { setCapturedImage(null); setRecordedVideoUrl(null); requestRef.current = requestAnimationFrame(predictWebcam); }} className="bg-white/20 backdrop-blur-md text-white py-4 rounded-[24px] font-black flex items-center justify-center gap-2 border border-white/30 hover:bg-white/30 transition-all active:scale-95">
                  <RefreshCw className="w-5 h-5" /> LÀM LẠI
                </button>
                <button onClick={handleDownloadTikTokStyle} className="bg-blue-600 text-white py-4 rounded-[24px] font-black flex items-center justify-center gap-2 shadow-xl hover:bg-blue-700 transition-all active:scale-95">
                  <Download className="w-5 h-5" /> LƯU VỀ MÁY
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}