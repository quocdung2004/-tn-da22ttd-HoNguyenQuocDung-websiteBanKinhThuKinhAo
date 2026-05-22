import React, { useState, useRef, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import {
  Camera, ShoppingCart, ShieldCheck, ChevronLeft, X,
  RefreshCw, Download, Sparkles, ChevronDown, Edit3, Eye, StopCircle, ImageIcon,
  CheckCircle2, Loader2, Bug, Trash2, Box
} from 'lucide-react';
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export default function ProductDetail() {
  const { id } = useParams();
  
  // ==========================================
  // 1. QUẢN LÝ TRẠNG THÁI (STATE)
  // ==========================================
  const [product, setProduct] = useState(null);
  const [allArProducts, setAllArProducts] = useState([]);
  
  const [hasPrescription, setHasPrescription] = useState(false);
  const [od, setOd] = useState('');
  const [os, setOs] = useState('');
  const [isAdded, setIsAdded] = useState(false);

  const [isAROpen, setIsAROpen] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(true);
  const [activeARProduct, setActiveARProduct] = useState(null);

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
  
  // IN-APP DEBUGGER
  const [debugLogs, setDebugLogs] = useState([]);
  const [showDebugPane, setShowDebugPane] = useState(false);

  const addLog = (...args) => {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    setDebugLogs(prev => [...prev, msg]);
    console.log(...args);
  };

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  // ==========================================
  // 2. QUẢN LÝ THAM CHIẾU (REFS)
  // ==========================================
  const videoRef = useRef(null);
  const canvasRef = useRef(null); 
  const faceLandmarkerRef = useRef(null);
  const requestRef = useRef(null);
  
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerIntervalRef = useRef(null);
  const recordedBlobRef = useRef(null);
  const recordingCanvasRef = useRef(null);
  const liveCanvasRef = useRef(null); // canvas composite (video + 3D) cho live preview

  // THREE.JS REFS
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const glassesModelRef = useRef(null);
  const occluderRef = useRef(null); // mesh vô hình để che gọng kính khi xoay mặt

  // REFS ổn định cho animation loop — tránh stale closure
  const isAROpenRef = useRef(false);
  const isRecordingRef = useRef(false);
  const capturedImageRef = useRef(null);
  const recordedVideoUrlRef = useRef(null);
  const activeARProductRef = useRef(null);

  // ==========================================
  // 3. GỌI API LẤY DỮ LIỆU
  // ==========================================
  useEffect(() => {
    const fetchProductData = async () => {
      try {
        const res = await fetch(`/api/products`);
        const data = await res.json();
        if (data.success) {
          const currentProd = data.products.find(p => p._id === id);
          setProduct(currentProd);
          setActiveARProduct(currentProd);
          
          const arAvailable = data.products.filter(p => p.arUrl && p.arUrl.trim() !== '');
          setAllArProducts(arAvailable);
        }
      } catch (error) {
        addLog("❌ Lỗi tải dữ liệu sản phẩm:", error);
      }
    };
    fetchProductData();

    const saved = JSON.parse(localStorage.getItem('userPrescription'));
    if (saved) {
      setOd(saved.od || ''); setOs(saved.os || '');
      if (saved.od || saved.os) setHasPrescription(true);
    }
  }, [id]);

  // ==========================================
  // 4. KHỞI TẠO AI VÀ THREE.JS
  // ==========================================
  useEffect(() => {
    const initAI = async () => {
      try {
        const filesetResolver = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
        faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`, delegate: "GPU" },
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true, // ← ma trận 4x4 chính xác như TikTok AR
          runningMode: "VIDEO",
          numFaces: 1
        });
        setIsAiLoading(false);
        addLog("✅ AI MediaPipe đã sẵn sàng (với Transformation Matrix)");
      } catch (err) {
        addLog("❌ Lỗi AI:", err.message);
      }
    };
    initAI();
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, []);

  const initThreeJS = (width, height) => {
    if (!canvasRef.current) return;
    if (rendererRef.current) rendererRef.current.dispose();

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.sortObjects = true; // đảm bảo renderOrder được tôn trọng
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 10;
    cameraRef.current = camera;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(0, 10, 10);
    scene.add(directionalLight);

    // ── FACE MESH OCCLUDER (478 đỉnh, ôm sát da mặt như TikTok) ──
    // Khác với hình cầu ước lượng, đây là mesh thật của MediaPipe → che pixel-perfect
    // FaceLandmarker trả về 478 landmarks; face mesh có các triangle chuẩn MediaPipe
    // Ta dùng BufferGeometry rỗng, sẽ cập nhật vertices mỗi frame
    const FACE_MESH_TRIANGLES = FaceLandmarker.FACE_LANDMARKS_TESSELATION;
    // Xây dựng index buffer từ danh sách các cạnh của MediaPipe
    // Mỗi phần tử trong FACE_LANDMARKS_TESSELATION là { start: number, end: number } (cạnh)
    // Ta cần tập hợp các tam giác: dùng chuẩn indices từ MediaPipe face mesh
    // MediaPipe cung cấp sẵn bộ 468/478 vertices và face topology
    const occluderGeo = new THREE.BufferGeometry();
    // Tạo placeholder vertices; sẽ được ghi đè mỗi frame
    const vertexCount = 478;
    occluderGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));

    // Xây dựng index từ FACE_LANDMARKS_TESSELATION (danh sách cạnh → tam giác)
    // MediaPipe tessellation là list của { start, end } pairs tạo thành triangles
    // Mỗi 3 cặp liên tiếp tạo thành 1 tam giác
    const tessellation = FaceLandmarker.FACE_LANDMARKS_TESSELATION;
    const indices = [];
    for (let i = 0; i < tessellation.length; i += 3) {
      if (tessellation[i+2]) {
        indices.push(tessellation[i].start, tessellation[i+1].start, tessellation[i+2].start);
      }
    }
    occluderGeo.setIndex(indices.length > 0 ? indices : null);

    const occluderMat = new THREE.MeshBasicMaterial({
      colorWrite: false, // vô hình với người dùng
      depthWrite: true,  // nhưng ghi depth buffer → che gọng kính phía sau
      side: THREE.FrontSide,
    });
    const occluder = new THREE.Mesh(occluderGeo, occluderMat);
    occluder.renderOrder = 0; // render TRƯỚC kính
    scene.add(occluder);
    occluderRef.current = occluder;
  };

  // HÀM TẢI MODEL 3D — tách ra để gọi lại được sau khi initThreeJS hoàn tất
  const loadGlassesModel = (prod) => {
    if (!sceneRef.current || !prod || !prod.arUrl) return;

    // Xóa mẫu kính cũ khỏi Scene
    if (glassesModelRef.current) {
      sceneRef.current.remove(glassesModelRef.current);
      glassesModelRef.current = null;
    }

    addLog(`Đang tải file 3D: ${prod.arUrl}`);
    const loader = new GLTFLoader();

    loader.load(
      prod.arUrl,
      (gltf) => {
        const model = gltf.scene;

        // 1. Ép hiển thị 2 mặt + bật depthTest để occluder có thể che kính
        model.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material.side = THREE.DoubleSide;
            child.material.depthWrite = true;
            child.material.depthTest = true;
            child.renderOrder = 1; // render SAU occluder (renderOrder 0)
          }
        });

        // 2. Đo lường và normalize về chiều ngang = 2
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 2 / maxDim;
        model.scale.set(scale, scale, scale);

        // 3. Dời trọng tâm về chính giữa
        const center = box.getCenter(new THREE.Vector3());
        model.position.x = -center.x * scale;
        model.position.y = -center.y * scale;
        model.position.z = -center.z * scale;

        // 4. Đóng gói vào Group
        const group = new THREE.Group();
        group.add(model);
        group.userData.originalWidth = 2; // chiều rộng sau khi normalize

        sceneRef.current.add(group);
        glassesModelRef.current = group;

        addLog("✅ Đã load và Auto-scale Kính 3D thành công!");
      },
      undefined,
      (error) => addLog("❌ Lỗi tải GLTF:", error.message || error)
    );
  };

  // Khi người dùng đổi mẫu kính — chỉ chạy khi scene đã sẵn sàng
  // (lần đầu mở AR, scene chưa có → dùng loadGlassesModel sau initThreeJS bên dưới)
  useEffect(() => {
    activeARProductRef.current = activeARProduct;
    if (sceneRef.current) {
      loadGlassesModel(activeARProduct);
    }
  }, [activeARProduct]);

  // ==========================================
  // 5. RENDER 3D VÀ THEO DÕI KHUÔN MẶT
  // ==========================================
  const render3DScene = (landmarks, width, height, transformMatrix) => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;

    if (landmarks && glassesModelRef.current) {
      // ── LANDMARKS ──
      const noseBridge   = landmarks[168];
      const leftEyeTop   = landmarks[159];
      const rightEyeTop  = landmarks[386];
      const leftEyeBot   = landmarks[145];
      const rightEyeBot  = landmarks[374];
      const leftEyeOut   = landmarks[33];  // góc ngoài mắt trái
      const rightEyeOut  = landmarks[263]; // góc ngoài mắt phải
      const leftTemple   = landmarks[127]; // thái dương trái
      const rightTemple  = landmarks[356]; // thái dương phải
      const faceLeft     = landmarks[234]; // điểm rộng nhất mặt trái (vùng tai)
      const faceRight    = landmarks[454]; // điểm rộng nhất mặt phải (vùng tai)
      const chin         = landmarks[152];
      const forehead     = landmarks[10];

      // ── Tâm mắt ──
      const leftEyeCY  = (leftEyeTop.y  + leftEyeBot.y)  / 2;
      const rightEyeCY = (rightEyeTop.y + rightEyeBot.y) / 2;
      const eyeCenterY = (leftEyeCY + rightEyeCY) / 2;

      // ── Chuyển sang Three.js world-space ──
      const dz = cameraRef.current.position.z;
      const vFov = (cameraRef.current.fov * Math.PI) / 180;
      const visibleHeight = 2 * Math.tan(vFov / 2) * dz;
      const visibleWidth  = visibleHeight * (width / height);

      // Hàm chuyển 1 landmark MediaPipe → THREE.Vector3 world-space
      // MediaPipe: x,y ∈ [0,1], z đơn vị tương đương x (âm = gần camera)
      const toW = (lm) => new THREE.Vector3(
        (lm.x - 0.5) * visibleWidth,
        -(lm.y - 0.5) * visibleHeight,
        -lm.z * visibleWidth   // negate: MediaPipe z âm = gần camera = Three.js z dương
      );

      // ── POSITION: kính nằm đúng tại sống mũi trong 3D ──
      const noseBridgeW = toW(noseBridge);
      const posX = (noseBridge.x - 0.5) * visibleWidth;
      const posY = -(eyeCenterY - 0.5) * visibleHeight;
      const glassesZ = noseBridgeW.z + 0.06; // sát sống mũi + buffer nhỏ chống clip
      glassesModelRef.current.position.set(posX, posY, glassesZ);

      // ── ROTATION (CẢI TIẾN TRỤC CHUẨN, KHÔNG PHỤ THUỘC MIRROR) ──
      // Vector hướng lên trên mặt (từ cằm lên trán)
      const upVec = new THREE.Vector3().subVectors(toW(forehead), toW(chin)).normalize();
      
      // Vector hướng thẳng ra phía trước mặt (từ thái dương ra sống mũi)
      // Dùng thái dương (127, 356) làm điểm neo phía sau để gọng kính đâm thẳng ra sau tai, không bị xệ
      const templesMidpoint = new THREE.Vector3().addVectors(toW(landmarks[127]), toW(landmarks[356])).multiplyScalar(0.5);
      const forwardVec = new THREE.Vector3().subVectors(noseBridgeW, templesMidpoint).normalize();
      
      // Trục Z: Hướng thẳng ra trước mặt
      const zAxis = forwardVec.clone();
      
      // Trục X: Hướng sang phải khuôn mặt (Quy tắc bàn tay phải: Y x Z = X)
      const xAxis = new THREE.Vector3().crossVectors(upVec, zAxis).normalize();
      
      // Trục Y: Hướng lên trên chuẩn, vuông góc hoàn toàn với X và Z (Z x X = Y)
      const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();

      const rotMat = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
      glassesModelRef.current.setRotationFromMatrix(rotMat);

      // ── SCALE: khoảng cách 3D thực (rotation-invariant) ──
      const faceLeftW3D    = toW(faceLeft);    // 234: viền má/tai trái
      const faceRightW3D   = toW(faceRight);   // 454: viền má/tai phải
      const leftTempleW3D  = toW(leftTemple);  // 127
      const rightTempleW3D = toW(rightTemple); // 356
      const leftEyeOutW3D  = toW(leftEyeOut);
      const rightEyeOutW3D = toW(rightEyeOut);

      const faceDist3D   = faceLeftW3D.distanceTo(faceRightW3D);   // ~chiều rộng khuôn mặt
      const templeDist3D = leftTempleW3D.distanceTo(rightTempleW3D);
      const eyeDist3D    = leftEyeOutW3D.distanceTo(rightEyeOutW3D);

      // Glasses width: Kính ôm vừa vặn vào khuôn mặt
      const targetW3D = Math.max(
        faceDist3D   * 0.95,
        templeDist3D * 1.05,
        eyeDist3D    * 1.35
      );
      const sc = targetW3D / (glassesModelRef.current.userData.originalWidth || 1);
      glassesModelRef.current.scale.set(sc, sc, sc);

      // ── OCCLUDER (MÔ PHỎNG ĐẦU NGƯỜI 3D ĐỂ CHE GỌNG) ──
      if (occluderRef.current) {
        // Tăng chiều rộng occluder để đảm bảo nó che được phần gọng ở hai bên thái dương
        const headRadiusW = faceDist3D * 0.55; 
        const headRadiusH = toW(forehead).distanceTo(toW(chin)) * 0.6; 
        const headRadiusD = faceDist3D * 0.6;  

        // Tâm của đầu: lùi về phía sau dọc theo trục Z của khuôn mặt
        const occluderCenter = noseBridgeW.clone().add(
          zAxis.clone().multiplyScalar(-faceDist3D * 0.55)
        );
        // Dời tâm xuống dưới một chút
        occluderCenter.add(yAxis.clone().multiplyScalar(-headRadiusH * 0.15));

        occluderRef.current.position.copy(occluderCenter);
        occluderRef.current.scale.set(headRadiusW, headRadiusH, headRadiusD);
        occluderRef.current.setRotationFromMatrix(rotMat); // BẬT LẠI ROTATION: đầu phải xoay theo mặt
      }
    }

    rendererRef.current.render(sceneRef.current, cameraRef.current);
  };

  const predictWebcam = () => {
    if (videoRef.current && videoRef.current.readyState >= 2) {
      const width = videoRef.current.videoWidth;
      const height = videoRef.current.videoHeight;
      
      let landmarks = null;
      let transformMatrix = null;
      if (faceLandmarkerRef.current) {
        const results = faceLandmarkerRef.current.detectForVideo(videoRef.current, performance.now());
        landmarks = results.faceLandmarks?.[0] || null;
        // Lấy ma trận biến đổi 4x4 chính xác của MediaPipe
        transformMatrix = results.facialTransformationMatrixes?.[0] || null;
      }
      // Render Three.js vào WebGL canvas ẩn (canvasRef)
      render3DScene(landmarks, width, height, transformMatrix);

      // ── COMPOSITE LIVE PREVIEW ──
      // Vẽ video + 3D vào liveCanvas theo cùng cách chụp ảnh:
      // cả hai được flip trong 1 context → KHÔNG bao giờ lệch nhau
      if (liveCanvasRef.current) {
        const lCtx = liveCanvasRef.current.getContext('2d');
        lCtx.clearRect(0, 0, width, height);
        lCtx.save();
        lCtx.translate(width, 0);
        lCtx.scale(-1, 1);
        lCtx.drawImage(videoRef.current, 0, 0, width, height);
        lCtx.drawImage(canvasRef.current, 0, 0, width, height); // 3D overlay
        lCtx.restore();
      }

      // ── MIX FRAME KHI QUAY PHIM (dùng liveCanvas để tái sử dụng composite đã tính) ──
      if (isRecordingRef.current && recordingCanvasRef.current) {
        const rCtx = recordingCanvasRef.current.getContext('2d');
        rCtx.clearRect(0, 0, width, height);
        rCtx.save();
        rCtx.translate(width, 0);
        rCtx.scale(-1, 1);
        rCtx.drawImage(videoRef.current, 0, 0, width, height);
        rCtx.drawImage(canvasRef.current, 0, 0, width, height);
        rCtx.restore();
      }
    }

    // Dùng refs thay state để luôn đọc giá trị mới nhất
    if (isAROpenRef.current && !capturedImageRef.current && !recordedVideoUrlRef.current) {
      requestRef.current = requestAnimationFrame(predictWebcam);
    }
  };

  // ==========================================
  // 6. CHỤP ẢNH, QUAY VIDEO VÀ ĐIỀU KHIỂN AR
  // ==========================================
  const startCamera = () => {
    setCapturedImage(null); setRecordedVideoUrl(null); recordedBlobRef.current = null;
    capturedImageRef.current = null; recordedVideoUrlRef.current = null;
    setIsAROpen(true); isAROpenRef.current = true;
    setShowGlassesMenu(false); setShowArDiopterControl(false);
    setActiveARProduct(product); activeARProductRef.current = product;
    const currentDiop = hasPrescription ? Math.max(Math.abs(parseFloat(od) || 0), Math.abs(parseFloat(os) || 0)) : 0;
    setArDiopter(currentDiop);
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    if (isRecording) stopRecording();
    setIsAROpen(false); isAROpenRef.current = false;
    setCapturedImage(null); capturedImageRef.current = null;
    setRecordedVideoUrl(null); recordedVideoUrlRef.current = null;
    recordedBlobRef.current = null;
    clearInterval(timerIntervalRef.current);
  };

  useEffect(() => {
    if (isAROpen && videoRef.current) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true })
        .then((stream) => {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play();
            const w = videoRef.current.videoWidth;
            const h = videoRef.current.videoHeight;

            // Canvas WebGL ẩn cho Three.js renderer
            canvasRef.current.width = w; canvasRef.current.height = h;

            // Canvas hiển thị live preview (composite video + 3D)
            if (liveCanvasRef.current) {
              liveCanvasRef.current.width = w;
              liveCanvasRef.current.height = h;
            }

            // Canvas cho recording
            const recCanvas = document.createElement('canvas');
            recCanvas.width = w; recCanvas.height = h;
            recordingCanvasRef.current = recCanvas;

            initThreeJS(w, h);
            // FIX RACE CONDITION: gọi thẳng loadGlassesModel ngay sau khi
            // initThreeJS hoàn tất vì useEffect của activeARProduct đã chạy
            // trước đó lúc sceneRef còn null nên bỏ qua.
            loadGlassesModel(activeARProductRef.current);
            predictWebcam();
            addLog(`✅ Camera Ready (${w}x${h})`);
          };
        })
        .catch(err => showToast('Vui lòng cấp quyền Camera/Micro', 'error'));
    }
  }, [isAROpen]);

  const capturePhoto = () => {
    setShowGlassesMenu(false); setShowArDiopterControl(false);
    // Dùng requestAnimationFrame để đảm bảo Three.js đã render frame mới nhất
    // TRƯỚC khi capture → kính luôn xuất hiện trong ảnh
    requestAnimationFrame(() => {
      // Ép render đồng bộ một lần nữa để đảm bảo canvas 3D đã có pixel
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }

      // Sau khi renderer đã ghi vào canvas, lấy pixel ngay trong frame này
      requestAnimationFrame(() => {
        const w = videoRef.current?.videoWidth;
        const h = videoRef.current?.videoHeight;
        if (!w || !h) return;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w;
        tempCanvas.height = h;
        const ctx = tempCanvas.getContext('2d');

        // Vẽ video VÀ canvas 3D trong cùng một transform flip
        // Lý do: canvas Three.js có pixel kính ở x = anchorX * w
        // Sau khi flip cùng với video → kính xuất hiện ở (1 - anchorX) * w
        // = đúng vị trí khuôn mặt đã mirror → khớp hoàn hảo
        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        if (arDiopter > 0) ctx.filter = `blur(${arDiopter * 2}px)`;
        ctx.drawImage(videoRef.current, 0, 0, w, h);
        ctx.filter = 'none';
        // Vẽ canvas Three.js TRONG cùng flip → kính khớp đúng khuôn mặt
        ctx.drawImage(canvasRef.current, 0, 0, w, h);
        ctx.restore();

        const dataUrl = tempCanvas.toDataURL("image/png");
        setCapturedImage(dataUrl);
        capturedImageRef.current = dataUrl;
        addLog('📸 Chụp ảnh thành công với kính 3D');
      });
    });
  };

  const startRecording = () => {
    addLog("--- BẮT ĐẦU QUAY VIDEO 3D ---");
    chunksRef.current = [];
    
    const canvasStream = recordingCanvasRef.current.captureStream(30);
    const audioTracks = videoRef.current?.srcObject?.getAudioTracks() || [];
    const combinedStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);

    let mimeType = 'video/webm';
    if (MediaRecorder.isTypeSupported('video/webm;codecs=h264')) mimeType = 'video/webm;codecs=h264';
    else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) mimeType = 'video/webm;codecs=vp9';
    else if (MediaRecorder.isTypeSupported('video/mp4')) mimeType = 'video/mp4';

    try {
      const recorder = new MediaRecorder(combinedStream, { mimeType });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const rawBlob = new Blob(chunksRef.current, { type: mimeType.split(';')[0] });
        recordedBlobRef.current = rawBlob;
        setRecordedVideoUrl(URL.createObjectURL(rawBlob));
        clearInterval(timerIntervalRef.current);
        setRecordingTime(0);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true); isRecordingRef.current = true;
      setShowGlassesMenu(false); setShowArDiopterControl(false);

      setRecordingTime(0);
      timerIntervalRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } catch (err) { addLog("❌ Lỗi MediaRecorder:", err.message); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false); isRecordingRef.current = false;
      clearInterval(timerIntervalRef.current);
    }
  };

  const handleDownloadTikTokStyle = async () => {
    setIsDownloading(true);
    setDownloadProgress(0);

    if (capturedImage) {
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.floor(Math.random() * 20) + 10;
        if (progress >= 100) {
          clearInterval(interval);
          const a = document.createElement('a');
          a.href = capturedImage;
          a.download = `kinh-mat-${activeARProduct?._id}.png`;
          a.click();
          setIsDownloading(false);
          showToast('Đã lưu ảnh vào thiết bị', 'success');
        }
        setDownloadProgress(Math.min(progress, 100));
      }, 200);
      return;
    }

    if (recordedBlobRef.current) {
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += Math.floor(Math.random() * 5) + 2;
        if (progress < 90) setDownloadProgress(progress);
      }, 300);

      try {
        const formData = new FormData();
        formData.append('video', recordedBlobRef.current, 'video.webm');
        const response = await fetch('/api/convert', { method: 'POST', body: formData });
        if (!response.ok) throw new Error("Server xử lý lỗi!");

        const mp4Blob = await response.blob();
        clearInterval(progressInterval);
        setDownloadProgress(100);

        const url = URL.createObjectURL(mp4Blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `video-kinh-ar-${activeARProduct?._id}.mp4`;
        a.click();

        setTimeout(() => {
          setIsDownloading(false);
          showToast('Đã lưu video MP4 vào thiết bị', 'success');
        }, 500);
      } catch (error) {
        clearInterval(progressInterval);
        setIsDownloading(false);
        showToast('Lỗi server, vui lòng thử lại!', 'error');
      }
    }
  };

  // ==========================================
  // 7. GIỎ HÀNG & TIỆN ÍCH
  // ==========================================
  const handleAddToCart = () => {
    if (hasPrescription && !od && !os) {
      showToast('Vui lòng nhập độ cận!', 'error');
      return;
    }
    const cartItemId = hasPrescription ? `${product._id}_rx_${od}_${os}` : `${product._id}_std`;
    const newItem = { 
      cartId: cartItemId, 
      productId: product._id, 
      name: product.name, 
      price: product.price, 
      image: product.images[0], 
      hasPrescription, od, os, quantity: 1 
    };
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

  const handleArDiopterChange = (val) => {
    setArDiopter(val);
    if (val > 0) { setHasPrescription(true); setOd(`-${val.toFixed(2)}`); setOs(`-${val.toFixed(2)}`); } 
    else { setHasPrescription(false); setOd(''); setOs(''); }
  };

  if (!product) return <div className="p-20 text-center font-bold flex flex-col items-center"><Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4"/>Đang tải dữ liệu sản phẩm...</div>;

  const is3DReady = product.arUrl && product.arUrl.trim() !== '';

  return (
    <div className="bg-white min-h-screen pb-24 overflow-x-hidden relative">

      {/* ---------------- IN-APP DEBUGGER ---------------- */}
      <button onClick={() => setShowDebugPane(!showDebugPane)} className="fixed bottom-4 right-4 z-[9999] bg-yellow-500 text-white p-3 rounded-full shadow-[0_0_15px_rgba(234,179,8,0.5)] active:scale-90">
        <Bug className="w-6 h-6" />
      </button>
      <div className={`fixed bottom-0 left-0 w-full h-[50vh] bg-black/95 z-[9998] border-t-2 border-green-500 p-4 font-mono text-[10px] sm:text-xs overflow-y-auto transition-transform duration-300 ${showDebugPane ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="flex justify-between items-center mb-3 sticky top-0 bg-black pb-2 border-b border-gray-800">
          <span className="text-green-500 font-bold">TERMINAL DI ĐỘNG v1.0</span>
          <button onClick={() => setDebugLogs([])} className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
        </div>
        {debugLogs.map((log, i) => (<div key={i} className="mb-1 border-b border-white/5 pb-1"><span className="text-gray-600 mr-2">[{i + 1}]</span> {log}</div>))}
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
          <ChevronLeft className="w-5 h-5 mr-1" /> Trở về Cửa hàng
        </Link>

        <div className="flex flex-col md:flex-row gap-12">
          {/* CỘT TRÁI */}
          <div className="md:w-1/2 flex flex-col gap-6">
            <div className="bg-gray-50 rounded-[40px] p-10 aspect-square flex items-center justify-center relative border border-gray-100 shadow-inner overflow-hidden">
              <img src={product.images && product.images[0] ? product.images[0] : '/placeholder.png'} alt={product.name} className="w-full h-auto object-contain drop-shadow-2xl" />
              {is3DReady && (
                <div className="absolute top-8 left-8 bg-indigo-600 text-white text-[10px] font-black px-4 py-2 rounded-full flex items-center shadow-lg animate-pulse gap-1">
                  <Box className="w-3 h-3"/> HỖ TRỢ 3D AR
                </div>
              )}
            </div>
            
            <button onClick={startCamera} disabled={isAiLoading || !is3DReady} className={`w-full py-5 rounded-3xl font-black text-xl flex items-center justify-center space-x-3 transition-all ${!is3DReady ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-900 text-white shadow-xl hover:bg-indigo-600 hover:scale-[1.01]'}`}>
              <Camera className="w-7 h-7" />
              <span>{isAiLoading ? "ĐANG TẢI AI..." : (!is3DReady ? "SẢN PHẨM NÀY CHƯA CÓ FILE 3D" : "THỬ KÍNH 3D NGAY")}</span>
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

            <button onClick={handleAddToCart} disabled={isAdded} className={`w-full py-6 rounded-3xl font-black text-xl flex items-center justify-center gap-3 shadow-2xl transition-all active:scale-95 ${isAdded ? 'bg-green-500 text-white shadow-green-200' : 'bg-blue-600 text-white shadow-blue-200 hover:bg-blue-700'}`}>
              {isAdded ? <><ShieldCheck className="w-7 h-7 animate-bounce" /> ĐÃ THÊM VÀO GIỎ!</> : <><ShoppingCart className="w-7 h-7" /> THÊM VÀO GIỎ HÀNG</>}
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

      {/* ===================== MODAL MÀN HÌNH AR 3D ===================== */}
      {isAROpen && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-in fade-in duration-300">
          
          <div className="p-6 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent z-10 text-white absolute top-0 w-full">
            <span className="font-bold tracking-wide flex items-center gap-2 uppercase"><div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div> PHÒNG THỬ KÍNH 3D</span>
            <button onClick={stopCamera} className="bg-white/20 hover:bg-red-500 text-white p-2 rounded-full transition-colors"><X className="w-8 h-8" /></button>
          </div>

          <div className="relative flex-1 flex items-center justify-center overflow-hidden">
            {/* Video nguồn ẩn — chỉ cấp frame cho AI + compositing, không hiển thị trực tiếp */}
            <video ref={videoRef} autoPlay playsInline muted style={{ display: 'none' }} />
            {/* WebGL canvas ẩn — Three.js render vào đây rồi ta lấy pixels */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            {/* LIVE PREVIEW CANVAS: composite video + 3D trong cùng 1 context → KHÔNG bao giờ lệch */}
            <canvas ref={liveCanvasRef} className="absolute top-0 left-0 w-full h-full object-cover pointer-events-none z-10" />

            {/* BỘ ĐẾM THỜI GIAN QUAY VIDEO */}
            {isRecording && (
              <div className="absolute top-20 w-full flex justify-center z-20 animate-in slide-in-from-top-4">
                <div className="bg-red-600 text-white px-4 py-1.5 rounded-full font-bold text-sm tracking-widest flex items-center gap-2 shadow-lg shadow-red-600/50">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                  {formatTime(recordingTime)}
                </div>
              </div>
            )}

            {/* BỘ ĐIỀU KHIỂN ĐỘ MỜ THEO ĐỘ CẬN */}
            {(!capturedImage && !recordedVideoUrl) && (
              <div className={`absolute top-24 right-6 bg-black/60 backdrop-blur-2xl border border-white/20 text-white p-5 rounded-[35px] text-center flex flex-col items-center z-30 shadow-2xl transition-all duration-300 transform origin-right ${showArDiopterControl ? 'translate-x-0 opacity-100' : 'translate-x-12 opacity-0 pointer-events-none'}`}>
                <button onClick={() => setShowArDiopterControl(false)} className="absolute top-4 right-4 text-white/50 hover:text-white transition"><X className="w-4 h-4" /></button>
                <p className="text-[10px] font-black tracking-widest opacity-60 mb-2 mt-2 uppercase flex items-center gap-1"><Sparkles className="w-3 h-3 text-blue-400" /> Độ Cận</p>
                <p className="font-black text-blue-400 text-3xl mb-4 leading-none">{arDiopter > 0 ? `-${arDiopter.toFixed(2)}` : '0.00'}</p>
                <input type="range" min="0" max="10" step="0.25" value={arDiopter} onChange={(e) => handleArDiopterChange(parseFloat(e.target.value))} className="w-28 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500 mb-3" />
                <div className="w-full h-px bg-white/10 mb-2"></div>
                <p className="text-[9px] font-bold opacity-50 uppercase tracking-widest">MỜ: <span className="text-yellow-400">{arDiopter * 2}PX</span></p>
              </div>
            )}

            {/* MÀN HÌNH PREVIEW SAU KHI CHỤP/QUAY */}
            {/* ✅ LỖI 2 FIX: Bỏ -scale-x-100 vì ảnh/video đã được render đúng chiều khi chụp */}
            {capturedImage && <div className="absolute inset-0 z-30 bg-black"><img src={capturedImage} className="w-full h-full object-cover" alt="Captured" /></div>}
            {recordedVideoUrl && <div className="absolute inset-0 z-30 bg-black"><video src={recordedVideoUrl} autoPlay loop playsInline className="w-full h-full object-cover" /></div>}
            
            {/* THANH ĐIỀU KHIỂN CHÍNH (Đổi mẫu, Chụp, Quay, Chỉnh độ cận) */}
            {(!capturedImage && !recordedVideoUrl) && (
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
            )}

            {/* NGĂN KÉO CHỌN MẪU KÍNH 3D */}
            <div className={`absolute bottom-0 w-full z-30 bg-black/80 backdrop-blur-3xl rounded-t-[40px] pt-6 pb-12 transition-transform duration-500 ease-out ${showGlassesMenu ? 'translate-y-0' : 'translate-y-full'}`}>
              <div className="flex justify-between items-center px-8 mb-6">
                <span className="text-white text-xs font-black tracking-widest uppercase flex items-center gap-2"><Box className="w-4 h-4 text-blue-400" /> KHO KÍNH 3D ({allArProducts.length})</span>
                <button onClick={() => setShowGlassesMenu(false)} className="bg-white/10 p-2 rounded-full text-white"><ChevronDown className="w-5 h-5" /></button>
              </div>
              <div className="flex gap-4 overflow-x-auto px-8 pb-4" style={{ scrollbarWidth: 'none' }}>
                {allArProducts.map((item) => (
                  <button key={item._id} onClick={() => setActiveARProduct(item)} className={`relative flex-shrink-0 w-32 h-32 rounded-[32px] border-2 transition-all duration-300 ${activeARProduct?._id === item._id ? 'bg-white/10 border-blue-500 scale-105 shadow-2xl' : 'bg-black/20 border-white/5 opacity-40 hover:opacity-100'}`}>
                    <img src={item.images[0]} className="w-full h-full object-cover p-2 rounded-[30px]" alt={item.name} />
                    {activeARProduct?._id === item._id && <div className="absolute bottom-0 w-full bg-blue-600 text-white text-[10px] font-black py-1.5 uppercase tracking-tighter rounded-b-[28px]">ĐANG ĐEO</div>}
                  </button>
                ))}
              </div>
            </div>

            {/* MÀN HÌNH LOADING LƯU FILE */}
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

            {/* NÚT LÀM LẠI HOẶC LƯU VỀ MÁY */}
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