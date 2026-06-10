import React, { useState, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import {
  X, RefreshCw, Download, Sparkles, ChevronDown, Eye, StopCircle, ImageIcon,
  Loader2, Bug, Trash2, Box, Copy
} from 'lucide-react';
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { TRIANGULATION } from "../../constants/triangulation";

const countConnectedComponents = (geometry) => {
  if (!geometry) return 0;
  const positionAttr = geometry.attributes.position;
  if (!positionAttr) return 0;
  const vertexCount = positionAttr.count;
  const indexAttr = geometry.index;

  if (vertexCount > 8000) return 1;

  const adj = Array.from({ length: vertexCount }, () => []);
  if (indexAttr) {
    const indices = indexAttr.array;
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i];
      const b = indices[i + 1];
      const c = indices[i + 2];
      if (adj[a] && adj[b] && adj[c]) {
        adj[a].push(b, c);
        adj[b].push(a, c);
        adj[c].push(a, b);
      }
    }
  } else {
    for (let i = 0; i < vertexCount; i += 3) {
      const a = i;
      const b = i + 1;
      const c = i + 2;
      if (b < vertexCount && c < vertexCount && adj[a] && adj[b] && adj[c]) {
        adj[a].push(b, c);
        adj[b].push(a, c);
        adj[c].push(a, b);
      }
    }
  }

  const visited = new Uint8Array(vertexCount);
  let componentsCount = 0;

  for (let i = 0; i < vertexCount; i++) {
    if (!visited[i]) {
      componentsCount++;
      const queue = [i];
      visited[i] = 1;
      let qHead = 0;
      while (qHead < queue.length) {
        const curr = queue[qHead++];
        const neighbors = adj[curr];
        if (neighbors) {
          for (let n = 0; n < neighbors.length; n++) {
            const neighbor = neighbors[n];
            if (!visited[neighbor]) {
              visited[neighbor] = 1;
              queue.push(neighbor);
            }
          }
        }
      }
    }
  }
  return componentsCount;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const AR_FIT_CONFIG = {
  ipdWidthRatio: 2.15,
  faceWidthRatio: 0.88,
  templeWidthRatio: 0.96,
  minFaceSpan: 0.34,
  edgePadding: 0.035,
  faceBlendWeight: 0.55,
  minScaleRatioFromIpd: 0.92,
  maxScaleRatioFromIpd: 1.22,
  templeYawThreshold: 0.08,
  templeDepthScaleBase: 1.35,
  templeDepthScaleYawBoost: 0.45,
  maxTempleDepthScale: 1.8,
  templeAnchorSideOffsetRatio: 0.10,
  templeAnchorBackOffsetRatio: 0.28
};

const ENABLE_LEGACY_TEMPLE_FADE = false;
const YAW_SIDE_THRESHOLD_DEG = 8;

const OCCLUDER_MODE = {
  FULL_FACE: 'FULL_FACE',
  SIDE_FACE: 'SIDE_FACE',
  NARROW_SIDE: 'NARROW_SIDE'
};

const NARROW_LEFT_OCCLUDER_LANDMARKS = [
  127, 234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152,
  162, 21, 54, 103
];

const NARROW_RIGHT_OCCLUDER_LANDMARKS = [
  356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152,
  389, 251, 284, 332
];

const NARROW_OCCLUDER_EXCLUDED_LANDMARKS = new Set([
  1, 2, 4, 5, 6, 9, 10, 33, 61, 76, 78, 80, 81, 82, 84, 85, 86, 87, 88, 89,
  90, 91, 92, 133, 145, 159, 168, 197, 200, 263, 291, 306, 308, 310, 311,
  312, 314, 315, 316, 317, 318, 319, 320, 321, 362, 374, 386, 468, 473
]);

const buildNarrowOccluderTriangles = (seedLandmarks) => {
  const seedSet = new Set(seedLandmarks);
  const expandedSet = new Set(seedLandmarks);

  for (let i = 0; i < TRIANGULATION.length; i += 3) {
    const tri = [TRIANGULATION[i], TRIANGULATION[i + 1], TRIANGULATION[i + 2]];
    if (tri.some((idx) => seedSet.has(idx))) {
      tri.forEach((idx) => {
        if (!NARROW_OCCLUDER_EXCLUDED_LANDMARKS.has(idx)) {
          expandedSet.add(idx);
        }
      });
    }
  }

  const triangles = [];
  for (let i = 0; i < TRIANGULATION.length; i += 3) {
    const a = TRIANGULATION[i];
    const b = TRIANGULATION[i + 1];
    const c = TRIANGULATION[i + 2];
    if (
      expandedSet.has(a) &&
      expandedSet.has(b) &&
      expandedSet.has(c) &&
      !NARROW_OCCLUDER_EXCLUDED_LANDMARKS.has(a) &&
      !NARROW_OCCLUDER_EXCLUDED_LANDMARKS.has(b) &&
      !NARROW_OCCLUDER_EXCLUDED_LANDMARKS.has(c)
    ) {
      triangles.push(a, b, c);
    }
  }

  return triangles;
};

const getYawVisibilityState = (yawDegrees) => {
  if (yawDegrees > YAW_SIDE_THRESHOLD_DEG) {
    return { nearSide: 'LEFT', farSide: 'RIGHT' };
  }
  if (yawDegrees < -YAW_SIDE_THRESHOLD_DEG) {
    return { nearSide: 'RIGHT', farSide: 'LEFT' };
  }
  return { nearSide: 'BOTH', farSide: 'NONE' };
};

const estimateTempleVisibleLengths = (yawDegrees, nearSide, farSide) => {
  const yawAbs = Math.abs(yawDegrees);
  const nearLength = clamp(1 - yawAbs / 100, 0.42, 1);
  const farLength = clamp(1 - Math.max(0, yawAbs - YAW_SIDE_THRESHOLD_DEG) / 42, 0, 1);

  if (farSide === 'LEFT') {
    return { left: farLength, right: nearLength };
  }
  if (farSide === 'RIGHT') {
    return { left: nearLength, right: farLength };
  }
  return { left: 1, right: 1 };
};

const isTemplePart = (part) =>
  part === 'LEFT_TEMPLE' || part === 'RIGHT_TEMPLE' || part === 'BOTH_TEMPLES';

const getVisibleTempleSide = (yaw) => {
  if (yaw > AR_FIT_CONFIG.templeYawThreshold) return 'RIGHT_TEMPLE';
  if (yaw < -AR_FIT_CONFIG.templeYawThreshold) return 'LEFT_TEMPLE';
  return 'CENTER';
};

const shouldRenderTempleInPass = (part, visibleTempleSide, pass) => {
  if (!isTemplePart(part)) return false;
  if (visibleTempleSide === 'CENTER') return pass === 1;
  if (part === 'BOTH_TEMPLES') return pass === 2;
  return pass === 2 ? part === visibleTempleSide : part !== visibleTempleSide;
};

const splitMergedTempleMesh = (mesh) => {
  const sourceGeometry = mesh.geometry;
  const positionAttr = sourceGeometry?.attributes?.position;
  if (!positionAttr) return null;

  const indexArray = sourceGeometry.index ? sourceGeometry.index.array : null;
  const triangleCount = indexArray ? indexArray.length / 3 : Math.floor(positionAttr.count / 3);
  const attributeNames = Object.keys(sourceGeometry.attributes);
  const buckets = {
    LEFT_TEMPLE: Object.fromEntries(attributeNames.map((name) => [name, []])),
    RIGHT_TEMPLE: Object.fromEntries(attributeNames.map((name) => [name, []]))
  };

  const pushVertex = (bucket, vertexIndex) => {
    attributeNames.forEach((name) => {
      const attr = sourceGeometry.attributes[name];
      for (let item = 0; item < attr.itemSize; item++) {
        buckets[bucket][name].push(attr.array[vertexIndex * attr.itemSize + item]);
      }
    });
  };

  for (let tri = 0; tri < triangleCount; tri++) {
    const ia = indexArray ? indexArray[tri * 3] : tri * 3;
    const ib = indexArray ? indexArray[tri * 3 + 1] : tri * 3 + 1;
    const ic = indexArray ? indexArray[tri * 3 + 2] : tri * 3 + 2;
    const centerX = (positionAttr.getX(ia) + positionAttr.getX(ib) + positionAttr.getX(ic)) / 3;
    const bucket = centerX < 0 ? 'LEFT_TEMPLE' : 'RIGHT_TEMPLE';
    pushVertex(bucket, ia);
    pushVertex(bucket, ib);
    pushVertex(bucket, ic);
  }

  return ['LEFT_TEMPLE', 'RIGHT_TEMPLE'].map((part) => {
    const geometry = new THREE.BufferGeometry();
    attributeNames.forEach((name) => {
      const attr = sourceGeometry.attributes[name];
      const values = buckets[part][name];
      const TypedArray = attr.array.constructor;
      geometry.setAttribute(name, new THREE.BufferAttribute(new TypedArray(values), attr.itemSize, attr.normalized));
    });
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const clone = mesh.clone(false);
    clone.name = `${mesh.name || 'MergedTemple'}_${part === 'LEFT_TEMPLE' ? 'Left' : 'Right'}`;
    clone.geometry = geometry;
    clone.material = Array.isArray(mesh.material)
      ? mesh.material.map((mat) => mat.clone())
      : mesh.material.clone();
    clone.userData = { ...mesh.userData, partType: part, splitFromMergedTemple: mesh.name || 'UNNAMED' };
    clone.frustumCulled = false;
    return clone;
  });
};

const applyTempleDepthFit = (mesh, depthScale) => {
  if (!mesh?.geometry) return;
  if (!mesh.userData.originalTempleTransform) {
    mesh.geometry.computeBoundingBox();
    mesh.userData.originalTempleTransform = {
      position: mesh.position.clone(),
      scale: mesh.scale.clone(),
      frontZ: mesh.geometry.boundingBox ? mesh.geometry.boundingBox.max.z : 0
    };
  }

  const original = mesh.userData.originalTempleTransform;
  mesh.scale.set(
    original.scale.x,
    original.scale.y,
    original.scale.z * depthScale
  );
  mesh.position.set(
    original.position.x,
    original.position.y,
    original.position.z + original.scale.z * original.frontZ * (1 - depthScale)
  );
};

export default function VirtualTryOn({
  product,
  allArProducts,
  activeARProduct,
  setActiveARProduct,
  onClose
}) {
  // ==========================================
  // 1. QUẢN LÝ TRẠNG THÁI (STATE)
  // ==========================================
  const [isAiLoading, setIsAiLoading] = useState(true);
  const [showGlassesMenu, setShowGlassesMenu] = useState(false);
  const [showArDiopterControl, setShowArDiopterControl] = useState(false);
  const [arDiopter, setArDiopter] = useState(0);

  const [capturedImage, setCapturedImage] = useState(null);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [faceFitHint, setFaceFitHint] = useState('');

  // IN-APP DEBUGGER
  const [debugLogs, setDebugLogs] = useState([]);
  const [showDebugPane, setShowDebugPane] = useState(false);
  const [activeTest, setActiveTest] = useState("NONE"); // "NONE", "A", "B", "C"
  const [showOccluderDebug, setShowOccluderDebug] = useState(false);
  const [showTempleOccluderDebug, setShowTempleOccluderDebug] = useState(false);
  const [showFullGlbTest, setShowFullGlbTest] = useState(false);
  const [showCleanFullOccluder, setShowCleanFullOccluder] = useState(false);
  const [showProduction2Pass, setShowProduction2Pass] = useState(false);
  const [showPass1MeshAudit, setShowPass1MeshAudit] = useState(false);
  const [showPass2Interference, setShowPass2Interference] = useState(false);
  const [pass1OnlyFreeze, setPass1OnlyFreeze] = useState(false);
  const [pass1ThenPass2NoClear, setPass1ThenPass2NoClear] = useState(false);
  const [showOccluderWireframe, setShowOccluderWireframe] = useState(false);
  const [showTempleAnchorDebug, setShowTempleAnchorDebug] = useState(false);
  const [showFullOccluderDebug, setShowFullOccluderDebug] = useState(false);
  const [showSideOccluderDebug, setShowSideOccluderDebug] = useState(false);
  const [showNarrowOccluderDebug, setShowNarrowOccluderDebug] = useState(false);

  // MESH CLASSIFICATION DIAGNOSTIC FOR MOBILE
  const [meshDebugData, setMeshDebugData] = useState([]);
  const [showMeshDebug, setShowMeshDebug] = useState(false);
  const [gltfTree, setGltfTree] = useState("");
  const [gltfWarning, setGltfWarning] = useState("");

  const [liveDiagnosticSpecs, setLiveDiagnosticSpecs] = useState([]);
  const [helperStatus, setHelperStatus] = useState({
    redOrigin: 'NOT_CREATED',
    greenCenter: 'NOT_CREATED',
    blueCentroid: 'NOT_CREATED',
    yellowBbox: 'NOT_CREATED',
    axes: 'NOT_CREATED'
  });
  const [totalHelpers, setTotalHelpers] = useState(0);
  const [debugTarget, setDebugTarget] = useState("Object_7");
  const debugTargetRef = useRef("Object_7");
  const [fittingDiagnostics, setFittingDiagnostics] = useState({
    faceWidth: 0,
    glassesWidth: 0,
    finalScale: 0,
    finalPos: "0, 0, 0",
    finalRot: "0, 0, 0",
    fittingBoxType: "Full Model Bounding Box (including handles)",
    rawModelSize: "0, 0, 0",
    rawSizeExcludingTemples: "0, 0, 0"
  });
  const [box3Diagnostics, setBox3Diagnostics] = useState({
    includedExcludingTemples: "",
    excludedExcludingTemples: "",
    sizeObj5: "N/A",
    sizeObj7: "N/A",
    sizeObj9: "N/A",
    size59: "N/A",
    size579: "N/A"
  });
  const [anchorDiagnostics, setAnchorDiagnostics] = useState({
    lm6Pos: "0, 0, 0",
    lm168Pos: "0, 0, 0",
    lm197Pos: "0, 0, 0",
    glassesAnchorPos: "0, 0, 0",
    offset197: "0, 0, 0",
    offset168: "0, 0, 0",
    drivingLandmark: "Landmark 168 (noseBridge) blends with Eye Center"
  });
  const [positionBreakdown, setPositionBreakdown] = useState({
    rawAnchor: "0, 0, 0",
    afterNoseOffset: "0, 0, 0",
    afterVerticalOffset: "0, 0, 0",
    afterDepthOffset: "0, 0, 0",
    afterSmoothing: "0, 0, 0",
    finalPosition: "0, 0, 0",
    offsetY: 0,
    offsetZ: 0,
    forwardOffset: 0,
    upOffset: 0
  });
  const [anchorWeightAnalysis, setAnchorWeightAnalysis] = useState({
    lm168Pos: "0, 0, 0",
    lm197Pos: "0, 0, 0",
    lm6Pos: "0, 0, 0",
    formula: "",
    weight168: 0,
    weight197: 0,
    dist168: 0,
    dist197: 0,
    dominantDriver: "",
    pred168: "0, 0, 0",
    pred197: "0, 0, 0",
    currentAnchor: "0, 0, 0"
  });
  const [anatomicalBridgeDiagnostics, setAnatomicalBridgeDiagnostics] = useState({
    anchorYBefore: "0.0000",
    anchorYAfter: "0.0000",
    appliedDrop: "0.0000",
    bridgeOffsetYOld: "0.0000",
    bridgeOffsetYNew: "0.0000",
    deltaWorldY: "0.0000",
    dist168Before: "0.0000",
    dist168After: "0.0000",
    dist197Before: "0.0000",
    dist197After: "0.0000",
    lensTopY: "0.0000",
    lensBottomY: "0.0000",
    pupilY: "0.0000",
    eyeVerticalRatio: "0.0000",
    suggestedAdjustmentLocal: "0.0000",
    suggestedBridgeOffsetY: "0.0000",
    deltaWorldYReq: "0.0000",
    // Dynamic tracking metrics
    posDeltaX: "0.0000",
    posDeltaY: "0.0000",
    posDeltaZ: "0.0000",
    rotDelta: "0.0000",
    lerpX: "0.0000",
    lerpY: "0.0000",
    lerpZ: "0.0000",
    slerpRot: "0.0000",
    // Occlusion diagnostics
    occluderVisible: "false",
    fullOccluderVisible: "false",
    occluderRenderOrder: "0",
    fullOccluderRenderOrder: "0",
    occluderDepthWrite: "false",
    occluderDepthTest: "false",
    occluderColorWrite: "false",
    // Temple detection and diagnostics
    leftTempleMeshes: "TEMPLE_DETECTION_FAILED",
    rightTempleMeshes: "TEMPLE_DETECTION_FAILED",
    bothTempleMeshes: "None",
    templeDiagnosticsText: "TEMPLE_DETECTION_FAILED",
    // Dynamic adaptive LERP/SLERP targets
    targetLerpX: "0.0000",
    targetLerpY: "0.0000",
    targetLerpZ: "0.0000",
    targetSlerp: "0.0000",
    // Temple Fade Debug
    yawDegrees: "0.0000",
    templeFadeFactor: "0.0000",
    object7Opacity: "1.0000",
    object7ForcedHidden: "true",
    occluderMode: OCCLUDER_MODE.NARROW_SIDE,
    nearSide: "BOTH",
    farSide: "NONE",
    visibleTempleLengthLeft: "1.0000",
    visibleTempleLengthRight: "1.0000"
  });
  const [templeAnchorDiagnostics, setTempleAnchorDiagnostics] = useState({
    faceWidth: "0.0000",
    yawDegrees: "0.0000",
    leftTempleApprox: "0.0000, 0.0000, 0.0000",
    rightTempleApprox: "0.0000, 0.0000, 0.0000",
    sideOffset: "0.0000",
    backOffset: "0.0000"
  });

  // ==========================================
  // 2. CÁC THAM CHIẾU (REFS)
  // ==========================================
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const liveCanvasRef = useRef(null);
  const faceLandmarkerRef = useRef(null);
  const requestRef = useRef(null);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerIntervalRef = useRef(null);
  const recordedBlobRef = useRef(null);
  const recordingCanvasRef = useRef(null);
  const diagnosticFrameCountRef = useRef(0);

  // THREE.JS REFS
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const glassesModelRef = useRef(null);
  const occluderRef = useRef(null);
  const fullOccluderRef = useRef(null);
  const narrowOccluderRef = useRef(null);
  const reflectionLightRef = useRef(null);
  const helperGroupRef = useRef(null);
  const meshRefs = useRef({
    Object_5: null,
    Object_7: null,
    Object_9: null
  });

  const isAROpenRef = useRef(true);
  const isRecordingRef = useRef(false);
  const capturedImageRef = useRef(null);
  const recordedVideoUrlRef = useRef(null);
  const activeARProductRef = useRef(null);
  const activeTestRef = useRef("NONE");
  const faceFitHintRef = useRef('');

  useEffect(() => {
    activeTestRef.current = activeTest;
  }, [activeTest]);

  const showOccluderDebugRef = useRef(false);
  useEffect(() => {
    showOccluderDebugRef.current = showOccluderDebug;
  }, [showOccluderDebug]);

  const showTempleOccluderDebugRef = useRef(false);
  useEffect(() => {
    showTempleOccluderDebugRef.current = showTempleOccluderDebug;
  }, [showTempleOccluderDebug]);

  const showFullGlbTestRef = useRef(false);
  useEffect(() => {
    showFullGlbTestRef.current = showFullGlbTest;
  }, [showFullGlbTest]);

  const showCleanFullOccluderRef = useRef(false);
  useEffect(() => {
    showCleanFullOccluderRef.current = showCleanFullOccluder;
  }, [showCleanFullOccluder]);

  const showProduction2PassRef = useRef(false);
  useEffect(() => {
    showProduction2PassRef.current = showProduction2Pass;
  }, [showProduction2Pass]);

  const showPass1MeshAuditRef = useRef(false);
  useEffect(() => {
    showPass1MeshAuditRef.current = showPass1MeshAudit;
  }, [showPass1MeshAudit]);

  const showPass2InterferenceRef = useRef(false);
  useEffect(() => {
    showPass2InterferenceRef.current = showPass2Interference;
  }, [showPass2Interference]);

  const pass1OnlyFreezeRef = useRef(false);
  useEffect(() => {
    pass1OnlyFreezeRef.current = pass1OnlyFreeze;
  }, [pass1OnlyFreeze]);

  const pass1ThenPass2NoClearRef = useRef(false);
  useEffect(() => {
    pass1ThenPass2NoClearRef.current = pass1ThenPass2NoClear;
  }, [pass1ThenPass2NoClear]);

  const showOccluderWireframeRef = useRef(false);
  useEffect(() => {
    showOccluderWireframeRef.current = showOccluderWireframe;
  }, [showOccluderWireframe]);

  const showTempleAnchorDebugRef = useRef(false);
  useEffect(() => {
    showTempleAnchorDebugRef.current = showTempleAnchorDebug;
  }, [showTempleAnchorDebug]);

  const showFullOccluderDebugRef = useRef(false);
  useEffect(() => {
    showFullOccluderDebugRef.current = showFullOccluderDebug;
  }, [showFullOccluderDebug]);

  const showSideOccluderDebugRef = useRef(false);
  useEffect(() => {
    showSideOccluderDebugRef.current = showSideOccluderDebug;
  }, [showSideOccluderDebug]);

  const showNarrowOccluderDebugRef = useRef(false);
  useEffect(() => {
    showNarrowOccluderDebugRef.current = showNarrowOccluderDebug;
  }, [showNarrowOccluderDebug]);

  const showMeshDebugRef = useRef(false);
  useEffect(() => {
    showMeshDebugRef.current = showMeshDebug;
  }, [showMeshDebug]);

  // SMOOTHING REFS
  const prevQuatRef = useRef(new THREE.Quaternion());
  const prevPositionRef = useRef(new THREE.Vector3());
  const prevScaleRef = useRef(1.0);

  useEffect(() => {
    activeARProductRef.current = activeARProduct;
  }, [activeARProduct]);

  // ==========================================
  // 3. TIỆN ÍCH LOG & TOAST
  // ==========================================
  const addLog = (...args) => {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    setDebugLogs(prev => [...prev, msg]);
    console.log(...args);
  };

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const updateFaceFitHint = (hint) => {
    if (faceFitHintRef.current === hint) return;
    faceFitHintRef.current = hint;
    setFaceFitHint(hint);
  };

  const handleCopyCalibration = () => {
    let allMeshesStr = "";
    const pass1List = [];
    const pass2List = [];
    let obj7State = null;

    let obj5Geom = "Object_5 not found";
    let obj7Geom = "Object_7 not found";
    let obj9Geom = "Object_9 not found";
    let obj7VsFullModel = "N/A";

    if (glassesModelRef.current) {
      const fullModelBox = new THREE.Box3().setFromObject(glassesModelRef.current);
      const fullSize = new THREE.Vector3();
      fullModelBox.getSize(fullSize);
      const fullCenter = new THREE.Vector3();
      fullModelBox.getCenter(fullCenter);

      glassesModelRef.current.traverse((child) => {
        if (child.isMesh) {
          const part = child.userData.partType || 'UNDEFINED';
          allMeshesStr += `${child.name || 'UNNAMED'} | ${part} | ${child.visible} | ${child.renderOrder}\n`;
          
          if (part === 'LEFT_TEMPLE' || part === 'RIGHT_TEMPLE' || part === 'BOTH_TEMPLES') {
            pass1List.push(child.name);
          } else if (part === 'FRONT_FRAME' || part === 'LENS') {
            pass2List.push(child.name);
          }

          if (child.name === 'Object_5' || child.name === 'Object_7' || child.name === 'Object_9') {
            child.geometry.computeBoundingBox();
            const localBox = child.geometry.boundingBox;
            const localSize = new THREE.Vector3();
            localBox.getSize(localSize);
            const localCenter = new THREE.Vector3();
            localBox.getCenter(localCenter);

            const worldBox = new THREE.Box3().setFromObject(child);
            const worldSize = new THREE.Vector3();
            worldBox.getSize(worldSize);
            const worldCenter = new THREE.Vector3();
            worldBox.getCenter(worldCenter);

            const vertexCount = child.geometry.attributes.position ? child.geometry.attributes.position.count : 0;
            let triCount = 0;
            if (child.geometry.index) {
              triCount = child.geometry.index.count / 3;
            } else if (child.geometry.attributes.position) {
              triCount = child.geometry.attributes.position.count / 3;
            }

            const diagnosticText = `Mesh Name: ${child.name}
  - Parent: ${child.parent ? (child.parent.name || child.parent.type) : 'None'}
  - PartType: ${part}
  - Visible: ${child.visible}
  - RenderOrder: ${child.renderOrder}
  - BBox Local Size: X=${localSize.x.toFixed(6)}, Y=${localSize.y.toFixed(6)}, Z=${localSize.z.toFixed(6)}
  - BBox Local Center: X=${localCenter.x.toFixed(6)}, Y=${localCenter.y.toFixed(6)}, Z=${localCenter.z.toFixed(6)}
  - BBox World Size: X=${worldSize.x.toFixed(6)}, Y=${worldSize.y.toFixed(6)}, Z=${worldSize.z.toFixed(6)}
  - BBox World Center: X=${worldCenter.x.toFixed(6)}, Y=${worldCenter.y.toFixed(6)}, Z=${worldCenter.z.toFixed(6)}
  - Vertex Count: ${vertexCount}
  - Triangle Count: ${triCount.toFixed(0)}`;

            if (child.name === 'Object_5') obj5Geom = diagnosticText;
            else if (child.name === 'Object_7') {
              obj7Geom = diagnosticText;
              
              const xRatio = (localSize.x / fullSize.x) * 100;
              const yRatio = (localSize.y / fullSize.y) * 100;
              const zRatio = (localSize.z / fullSize.z) * 100;
              obj7VsFullModel = `Object_7 vs Full Model Dimensions Ratio:
  - Width (X) Ratio: ${xRatio.toFixed(2)}% (${localSize.x.toFixed(4)} vs ${fullSize.x.toFixed(4)})
  - Height (Y) Ratio: ${yRatio.toFixed(2)}% (${localSize.y.toFixed(4)} vs ${fullSize.y.toFixed(4)})
  - Depth (Z) Ratio: ${zRatio.toFixed(2)}% (${localSize.z.toFixed(4)} vs ${fullSize.z.toFixed(4)})`;
            }
            else if (child.name === 'Object_9') obj9Geom = diagnosticText;
          }
        }
      });
    }

    let fullGlbTestDiagnosticsStr = "";
    if (glassesModelRef.current) {
      glassesModelRef.current.traverse((child) => {
        if (child.isMesh) {
          let vertexCount = 0;
          if (child.geometry && child.geometry.attributes && child.geometry.attributes.position) {
            vertexCount = child.geometry.attributes.position.count;
          }
          let triCount = 0;
          if (child.geometry && child.geometry.index) {
            triCount = child.geometry.index.count / 3;
          } else if (child.geometry && child.geometry.attributes && child.geometry.attributes.position) {
            triCount = child.geometry.attributes.position.count / 3;
          }
          const parentName = child.parent ? (child.parent.name || child.parent.type) : "None";
          const materialName = child.material ? (child.material.name || "NO_MAT") : "NO_MAT";
          
          fullGlbTestDiagnosticsStr += `Mesh: ${child.name || "UNNAMED"} | Parent: ${parentName} | Material: ${materialName} | Vertices: ${vertexCount} | Triangles: ${triCount.toFixed(0)} | Visible: ${child.visible.toString()}\n`;
        }
      });
    }

    let mainOccDiag = "NOT_CREATED";
    if (occluderRef.current) {
      occluderRef.current.geometry.computeBoundingBox();
      const oBox = occluderRef.current.geometry.boundingBox;
      const oSize = new THREE.Vector3();
      oBox.getSize(oSize);
      const oCenter = new THREE.Vector3();
      oBox.getCenter(oCenter);
      mainOccDiag = `Main Occluder:
  - World Size: X=${oSize.x.toFixed(6)}, Y=${oSize.y.toFixed(6)}, Z=${oSize.z.toFixed(6)}
  - World Center: X=${oCenter.x.toFixed(6)}, Y=${oCenter.y.toFixed(6)}, Z=${oCenter.z.toFixed(6)}`;
    }

    let fullOccDiag = "NOT_CREATED";
    if (fullOccluderRef.current) {
      fullOccluderRef.current.geometry.computeBoundingBox();
      const fBox = fullOccluderRef.current.geometry.boundingBox;
      const fSize = new THREE.Vector3();
      fBox.getSize(fSize);
      const fCenter = new THREE.Vector3();
      fBox.getCenter(fCenter);
      fullOccDiag = `Full Face Occluder:
  - World Size: X=${fSize.x.toFixed(6)}, Y=${fSize.y.toFixed(6)}, Z=${fSize.z.toFixed(6)}
  - World Center: X=${fCenter.x.toFixed(6)}, Y=${fCenter.y.toFixed(6)}, Z=${fCenter.z.toFixed(6)}`;
    }

    let distanceDiag = "N/A";
    if (occluderRef.current && glassesModelRef.current) {
      const gCenter = new THREE.Vector3();
      new THREE.Box3().setFromObject(glassesModelRef.current).getCenter(gCenter);
      const oCenter = new THREE.Vector3();
      occluderRef.current.geometry.computeBoundingSphere();
      if (occluderRef.current.geometry.boundingSphere) {
        oCenter.copy(occluderRef.current.geometry.boundingSphere.center);
      }
      const dist = gCenter.distanceTo(oCenter);
      distanceDiag = `Distance between glasses center and occluder center: ${dist.toFixed(6)} units`;
    }

    const payload = `--- AR GLASSES CALIBRATION EXPORT ---
Timestamp: ${new Date().toISOString()}
Product Name: ${activeARProduct?.name || 'N/A'}
Product ID: ${activeARProduct?._id || 'N/A'}
Scale: ${glassesModelRef.current ? glassesModelRef.current.scale.x.toFixed(6) : 'N/A'}
Position: ${glassesModelRef.current ? `${glassesModelRef.current.position.x.toFixed(6)}, ${glassesModelRef.current.position.y.toFixed(6)}, ${glassesModelRef.current.position.z.toFixed(6)}` : 'N/A'}
Rotation: ${glassesModelRef.current ? `${glassesModelRef.current.rotation.x.toFixed(6)}, ${glassesModelRef.current.position.y.toFixed(6)}, ${glassesModelRef.current.position.z.toFixed(6)}` : 'N/A'}

--- EXPERIMENT 1: FULL GLB VISIBILITY TEST ---
FULL_GLB_TEST: ${showFullGlbTest}
Mesh Hierarchical Diagnostics:
${fullGlbTestDiagnosticsStr}

--- GEOMETRY DIAGNOSTICS ---
${obj5Geom}
----------------------------------
${obj7Geom}
----------------------------------
${obj9Geom}
----------------------------------
${obj7VsFullModel}

--- TEMPLE OCCLUDER SPATIAL EXPERIMENT ---
TEMPLE_OCCLUDER_DEBUG = ${showTempleOccluderDebug}
${mainOccDiag}
----------------------------------
${fullOccDiag}
----------------------------------
${distanceDiag}

--- RUNTIME PASS CLASSIFICATION ---
ALL MESHES RENDER-ORDER AND PART-TYPE:
${allMeshesStr}
PASS 1 (Render first, behind head):
${JSON.stringify(pass1List, null, 2)}
PASS 2 (Render second, in front):
${JSON.stringify(pass2List, null, 2)}
`;

    navigator.clipboard.writeText(payload)
      .then(() => showToast("Đã copy dữ liệu căn chỉnh vào Clipboard!", "success"))
      .catch(() => showToast("Không thể copy vào clipboard!", "error"));
  };

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
          outputFacialTransformationMatrixes: true,
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
    renderer.sortObjects = true;
    renderer.autoClear = false;
    renderer.localClippingEnabled = false;
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

    const reflectionLight = new THREE.DirectionalLight(0xffffff, 2.0);
    reflectionLight.position.set(0, 5, 15);
    scene.add(reflectionLight);
    reflectionLightRef.current = reflectionLight;

    const FRONT_FACE_EXCLUSION = new Set([
      33, 7, 163, 144, 145, 153, 154, 155, 133,
      173, 157, 158, 159, 160, 161, 246, 130, 247, 110, 24, 23,
      29, 30, 27, 28, 56, 190, 221, 222, 223, 224, 225,
      263, 249, 390, 373, 374, 380, 381, 382, 362,
      398, 384, 385, 386, 387, 388, 466, 359, 467,
      339, 255, 254, 253, 252, 256, 341, 463, 414, 286,
      10, 151, 9, 8, 107, 66, 105, 63, 70, 156, 124,
      46, 53, 52, 65, 55, 193, 189, 244, 245,
      276, 283, 282, 295, 285, 300, 293, 334, 296, 336,
      0, 13, 14, 15, 16, 17, 37, 39, 40, 61, 76, 77,
      78, 80, 81, 82, 84, 85, 86, 87, 88, 89, 90, 91, 92,
      267, 269, 270, 291, 306, 307, 308, 310, 311, 312,
      314, 315, 316, 317, 318, 319, 320, 321, 324, 325,
      178, 179, 180, 181, 182, 183, 184, 185, 186, 191,
      194, 200, 201, 204, 208, 210, 211, 212, 214, 216,
      32, 125, 44, 164, 167, 393,
      152, 175, 18, 83, 200, 199, 175,
    ]);

    const sideFaceTriangles = [];
    for (let i = 0; i < TRIANGULATION.length; i += 3) {
      const a = TRIANGULATION[i], b = TRIANGULATION[i + 1], c = TRIANGULATION[i + 2];
      if (!FRONT_FACE_EXCLUSION.has(a) && !FRONT_FACE_EXCLUSION.has(b) && !FRONT_FACE_EXCLUSION.has(c)) {
        sideFaceTriangles.push(a, b, c);
      }
    }

    const narrowLeftTriangles = buildNarrowOccluderTriangles(NARROW_LEFT_OCCLUDER_LANDMARKS);
    const narrowRightTriangles = buildNarrowOccluderTriangles(NARROW_RIGHT_OCCLUDER_LANDMARKS);
    const narrowBothTriangles = [...narrowLeftTriangles, ...narrowRightTriangles];

    const occluderGeo = new THREE.BufferGeometry();
    occluderGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(478 * 3), 3));
    occluderGeo.setIndex(sideFaceTriangles);

    const occluderMat = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    const occluder = new THREE.Mesh(occluderGeo, occluderMat);
    occluder.renderOrder = -10;
    occluder.material.depthWrite = true;
    occluder.material.depthTest = true;
    occluder.material.colorWrite = false;
    occluder.frustumCulled = false;
    occluder.visible = false;
    scene.add(occluder);
    occluderRef.current = occluder;

    const narrowOccluderGeo = new THREE.BufferGeometry();
    narrowOccluderGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(478 * 3), 3));
    narrowOccluderGeo.setIndex(narrowBothTriangles);

    const narrowOccluderMat = new THREE.MeshBasicMaterial({
      color: 0x00ff66,
      colorWrite: false,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide
    });
    const narrowOccluder = new THREE.Mesh(narrowOccluderGeo, narrowOccluderMat);
    narrowOccluder.renderOrder = -10;
    narrowOccluder.material.depthWrite = true;
    narrowOccluder.material.depthTest = true;
    narrowOccluder.material.colorWrite = false;
    narrowOccluder.frustumCulled = false;
    narrowOccluder.visible = false;
    narrowOccluder.userData = {
      mode: OCCLUDER_MODE.NARROW_SIDE,
      activeSide: 'BOTH',
      leftIndices: narrowLeftTriangles,
      rightIndices: narrowRightTriangles,
      bothIndices: narrowBothTriangles
    };
    scene.add(narrowOccluder);
    narrowOccluderRef.current = narrowOccluder;

    const fullOccluderGeo = new THREE.BufferGeometry();
    fullOccluderGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(478 * 3), 3));
    fullOccluderGeo.setIndex(Array.from(TRIANGULATION));

    const fullOccluderMat = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide
    });
    const fullOccluder = new THREE.Mesh(fullOccluderGeo, fullOccluderMat);
    fullOccluder.renderOrder = -10;
    fullOccluder.material.depthWrite = true;
    fullOccluder.material.depthTest = true;
    fullOccluder.material.colorWrite = false;
    fullOccluder.frustumCulled = false;
    fullOccluder.visible = false;
    scene.add(fullOccluder);
    fullOccluderRef.current = fullOccluder;
  };

  const loadGlassesModel = (prod) => {
    setGltfWarning("");
    setGltfTree("");
    setHelperStatus({
      redOrigin: 'NOT_CREATED',
      greenCenter: 'NOT_CREATED',
      blueCentroid: 'NOT_CREATED',
      yellowBbox: 'NOT_CREATED',
      axes: 'NOT_CREATED'
    });
    setTotalHelpers(0);
    if (!sceneRef.current || !prod || !prod.arUrl) return;

    if (glassesModelRef.current) {
      sceneRef.current.remove(glassesModelRef.current);
      glassesModelRef.current = null;
    }

    console.log("🚀 [AR BUILD_VERSION] 1.0.5 - PREMIUM RIGID TEMPLES ACTIVATED");
    addLog("🚀 [AR BUILD] Version 1.0.5 - Premium Rigid Temples");
    addLog(`Đang tải file 3D: ${prod.arUrl}`);
    const loader = new GLTFLoader();

    loader.load(
      prod.arUrl,
      (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        console.log('====== [AR DIAGNOSTIC] BẮT ĐẦU ĐỌC CẤU TRÚC MODEL GLTF ======');
        let meshIndex = 0;
        const diagList = [];
        const mergedTempleSplitCandidates = [];

        model.traverse((child) => {
          if (child.isMesh) {
            child.material.side = THREE.DoubleSide;
            child.material.depthWrite = true;
            child.material.depthTest = true;
            child.renderOrder = 1;

            meshIndex++;
            child.geometry.computeBoundingBox();
            const childBox = child.geometry.boundingBox;
            const childCenter = new THREE.Vector3();
            childBox.getCenter(childCenter);
            const childSize = new THREE.Vector3();
            childBox.getSize(childSize);

            const zRange = size.z > 0 ? size.z : 1;
            const relativeZ = (childCenter.z - box.min.z) / zRange;

            const meshName = (child.name || '').toLowerCase();
            const matName = (child.material && child.material.name ? child.material.name : '').toLowerCase();
            const isLensMesh = meshName.includes('lens') || meshName.includes('glass') || meshName.includes('kính') || matName.includes('lens') || matName.includes('glass') || matName.includes('kính');
            const isTempleMesh = meshName.includes('handle') || meshName.includes('temple') || meshName.includes('càng') || meshName.includes('object_7') ||
                                 matName.includes('handle') || matName.includes('temple') || matName.includes('càng');

            const isNearCenter = Math.abs(childCenter.x) < 0.35 * size.x;

            if (isLensMesh) {
              child.userData.partType = 'LENS';
              child.material.transparent = true;
              child.material.opacity = 0.30;
              if (child.material.roughness !== undefined) child.material.roughness = 0.08;
              if (child.material.metalness !== undefined) child.material.metalness = 0.05;
              child.material.depthWrite = false;
            } else if (isTempleMesh) {
              if (childCenter.x < -0.01) {
                child.userData.partType = 'LEFT_TEMPLE';
              } else if (childCenter.x > 0.01) {
                child.userData.partType = 'RIGHT_TEMPLE';
              } else {
                child.userData.partType = 'BOTH_TEMPLES';
              }
              child.material.transparent = true;
              child.material.opacity = 1.0;
            } else if (relativeZ > 0.60 || isNearCenter) {
              child.userData.partType = 'FRONT_FRAME';
            } else {
              if (childCenter.x < 0) {
                child.userData.partType = 'LEFT_TEMPLE';
              } else {
                child.userData.partType = 'RIGHT_TEMPLE';
              }
              child.material.transparent = true;
              child.material.opacity = 1.0;
            }

            let vertexCount = 0;
            if (child.geometry && child.geometry.attributes && child.geometry.attributes.position) {
              vertexCount = child.geometry.attributes.position.count;
            }
            const parentName = child.parent ? child.parent.name || child.parent.type : 'None';
            const childCount = child.children ? child.children.length : 0;

            const isTemple = child.userData.partType === 'LEFT_TEMPLE' || child.userData.partType === 'RIGHT_TEMPLE';
            const tag = isTemple ? `⚠️ [${child.userData.partType}]` : `✅ [${child.userData.partType}]`;

            diagList.push({
              "Index": meshIndex,
              "Status": tag,
              "Mesh Name": child.name || 'NO_NAME',
              "Material Name": child.material ? (child.material.name || 'NO_MAT') : 'NO_MAT',
              "Parent Name": parentName,
              "RenderOrder": child.renderOrder,
              "Visible": child.visible.toString(),
              "DepthTest": child.material ? child.material.depthTest.toString() : 'false',
              "DepthWrite": child.material ? child.material.depthWrite.toString() : 'false',
              "Transparent": child.material ? child.material.transparent.toString() : 'false',
              "Opacity": child.material ? child.material.opacity.toString() : '1.0',
              "BBox Size X": childSize.x.toFixed(4),
              "BBox Size Y": childSize.y.toFixed(4),
              "BBox Size Z": childSize.z.toFixed(4),
              "Center X": childCenter.x.toFixed(4),
              "Center Y": childCenter.y.toFixed(4),
              "Center Z": childCenter.z.toFixed(4),
              "Relative Z": relativeZ.toFixed(4),
              "PartType": child.userData.partType,
              "PosX": child.position.x.toFixed(4),
              "PosY": child.position.y.toFixed(4),
              "PosZ": child.position.z.toFixed(4),
              "RotX": child.rotation.x.toFixed(4),
              "RotY": child.rotation.y.toFixed(4),
              "RotZ": child.rotation.z.toFixed(4),
              "ScaleX": child.scale.x.toFixed(4),
              "ScaleY": child.scale.y.toFixed(4),
              "ScaleZ": child.scale.z.toFixed(4),
              "VertexCount": vertexCount,
              "ChildCount": childCount
            });

            const isHandlesMerged = meshName.includes("handle") || meshName.includes("temple") || meshName.includes("càng") || meshName.includes("gọng");
            const hasBothSides = childSize.x > size.x * 0.70;
            if (isHandlesMerged && hasBothSides) {
              setGltfWarning("WARNING: Handles mesh contains merged geometry. Independent LEFT_TEMPLE / RIGHT_TEMPLE articulation impossible.");
            }
            if (child.userData.partType === 'BOTH_TEMPLES' && hasBothSides) {
              mergedTempleSplitCandidates.push(child);
            }

            let targetKey = null;
            if (meshName.includes("object_5")) targetKey = "Object_5";
            else if (meshName.includes("object_7") || meshName.includes("handle") || meshName.includes("càng") || meshName.includes("temple")) targetKey = "Object_7";
            else if (meshName.includes("object_9")) targetKey = "Object_9";

            if (targetKey) {
              meshRefs.current[targetKey] = child;

              const centroid = new THREE.Vector3();
              const posAttr = child.geometry.attributes.position;
              if (posAttr) {
                let sumX = 0, sumY = 0, sumZ = 0;
                const count = posAttr.count;
                const step = Math.max(1, Math.floor(count / 300));
                let sampledCount = 0;
                for (let i = 0; i < count; i += step) {
                  sumX += posAttr.getX(i);
                  sumY += posAttr.getY(i);
                  sumZ += posAttr.getZ(i);
                  sampledCount++;
                }
                centroid.set(sumX / sampledCount, sumY / sampledCount, sumZ / sampledCount);
              }
              child.userData.localCentroid = centroid;
            }
          }
        });

        mergedTempleSplitCandidates.forEach((child) => {
          const splitMeshes = splitMergedTempleMesh(child);
          if (!splitMeshes || splitMeshes.length !== 2 || !child.parent) return;

          child.visible = false;
          child.userData.partType = 'MERGED_TEMPLE_SOURCE';
          child.userData.skipProductionRender = true;

          splitMeshes.forEach((splitMesh) => {
            splitMesh.renderOrder = child.renderOrder;
            if (splitMesh.material) {
              const materials = Array.isArray(splitMesh.material) ? splitMesh.material : [splitMesh.material];
              materials.forEach((mat) => {
                if (mat) {
                  mat.transparent = true;
                  mat.opacity = 1.0;
                  mat.depthWrite = true;
                  mat.depthTest = true;
                  mat.side = THREE.DoubleSide;
                }
              });
            }
            child.parent.add(splitMesh);
          });

          setGltfWarning("INFO: Object_7 was split into LEFT_TEMPLE and RIGHT_TEMPLE for side-aware AR rendering.");
        });

        const buildGLTFTree = (node, prefix = '') => {
          let typeStr = node.type || 'Object3D';
          let nameStr = node.name || 'UNNAMED';
          let vertexStr = "";
          if (node.isMesh && node.geometry && node.geometry.attributes && node.geometry.attributes.position) {
            vertexStr = ` (${node.geometry.attributes.position.count} vtx)`;
          }
          let text = `${prefix}├─ ${nameStr} [${typeStr}]${vertexStr}\n`;
          if (node.children && node.children.length > 0) {
            node.children.forEach((childNode, idx) => {
              const isLast = idx === node.children.length - 1;
              const newPrefix = prefix + (isLast ? '   ' : '│  ');
              text += buildGLTFTree(childNode, newPrefix);
            });
          }
          return text;
        };
        const treeStr = buildGLTFTree(model);
        setGltfTree(treeStr);

        console.log("====== 📊 [AR GLTF SCENE DIAGNOSTICS] ======");
        console.table(diagList);
        setMeshDebugData(diagList);

        if (helperGroupRef.current) {
          sceneRef.current.remove(helperGroupRef.current);
        }
        const helperGroup = new THREE.Group();
        helperGroup.renderOrder = 999;
        sceneRef.current.add(helperGroup);
        helperGroupRef.current = helperGroup;

        const redGeo = new THREE.SphereGeometry(0.08, 16, 16);
        const redMat = new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false, depthWrite: false, transparent: false, opacity: 1.0, toneMapped: false });
        const redSphere = new THREE.Mesh(redGeo, redMat);
        redSphere.name = "redSphere";
        redSphere.renderOrder = 999;
        redSphere.visible = false;
        helperGroup.add(redSphere);

        const greenGeo = new THREE.SphereGeometry(0.08, 16, 16);
        const greenMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, depthTest: false, depthWrite: false, transparent: false, opacity: 1.0, toneMapped: false });
        const greenSphere = new THREE.Mesh(greenGeo, greenMat);
        greenSphere.name = "greenSphere";
        greenSphere.renderOrder = 999;
        greenSphere.visible = false;
        helperGroup.add(greenSphere);

        const blueGeo = new THREE.SphereGeometry(0.08, 16, 16);
        const blueMat = new THREE.MeshBasicMaterial({ color: 0x0000ff, depthTest: false, depthWrite: false, transparent: false, opacity: 1.0, toneMapped: false });
        const blueSphere = new THREE.Mesh(blueGeo, blueMat);
        blueSphere.name = "blueSphere";
        blueSphere.renderOrder = 999;
        blueSphere.visible = false;
        helperGroup.add(blueSphere);

        const yellowGeo = new THREE.SphereGeometry(0.08, 16, 16);
        const yellowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false, transparent: false, opacity: 1.0, toneMapped: false });
        const yellowSphere = new THREE.Mesh(yellowGeo, yellowMat);
        yellowSphere.name = "yellowSphere";
        yellowSphere.renderOrder = 999;
        yellowSphere.visible = false;
        helperGroup.add(yellowSphere);

        const purpleGeo = new THREE.SphereGeometry(0.08, 16, 16);
        const purpleMat = new THREE.MeshBasicMaterial({ color: 0x8b00ff, depthTest: false, depthWrite: false, transparent: false, opacity: 1.0, toneMapped: false });
        const purpleSphere = new THREE.Mesh(purpleGeo, purpleMat);
        purpleSphere.name = "purpleSphere";
        purpleSphere.renderOrder = 999;
        purpleSphere.visible = false;
        helperGroup.add(purpleSphere);

        const whiteGeo = new THREE.SphereGeometry(0.08, 16, 16);
        const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffff00, depthTest: false, depthWrite: false, transparent: false, opacity: 1.0, toneMapped: false });
        const whiteSphere = new THREE.Mesh(whiteGeo, whiteMat);
        whiteSphere.name = "whiteSphere";
        whiteSphere.renderOrder = 999;
        whiteSphere.visible = false;
        helperGroup.add(whiteSphere);

        const orangeGeo = new THREE.SphereGeometry(0.08, 16, 16);
        const orangeMat = new THREE.MeshBasicMaterial({ color: 0xffa500, depthTest: false, depthWrite: false, transparent: false, opacity: 1.0, toneMapped: false });
        const orangeSphere = new THREE.Mesh(orangeGeo, orangeMat);
        orangeSphere.name = "orangeSphere";
        orangeSphere.renderOrder = 999;
        orangeSphere.visible = false;
        helperGroup.add(orangeSphere);

        const lineMat = new THREE.LineBasicMaterial({ color: 0x00ff00, depthTest: false, depthWrite: false, transparent: false, opacity: 1.0, toneMapped: false });
        const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
        const connectionLine = new THREE.Line(lineGeo, lineMat);
        connectionLine.name = "connectionLine";
        connectionLine.renderOrder = 999;
        connectionLine.visible = false;
        helperGroup.add(connectionLine);

        const leftTempleAnchorGeo = new THREE.SphereGeometry(0.065, 16, 16);
        const leftTempleAnchorMat = new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false, depthWrite: false, transparent: false, opacity: 1.0, toneMapped: false });
        const leftTempleAnchorSphere = new THREE.Mesh(leftTempleAnchorGeo, leftTempleAnchorMat);
        leftTempleAnchorSphere.name = "leftTempleApproxSphere";
        leftTempleAnchorSphere.renderOrder = 1000;
        leftTempleAnchorSphere.visible = false;
        helperGroup.add(leftTempleAnchorSphere);

        const rightTempleAnchorGeo = new THREE.SphereGeometry(0.065, 16, 16);
        const rightTempleAnchorMat = new THREE.MeshBasicMaterial({ color: 0x008cff, depthTest: false, depthWrite: false, transparent: false, opacity: 1.0, toneMapped: false });
        const rightTempleAnchorSphere = new THREE.Mesh(rightTempleAnchorGeo, rightTempleAnchorMat);
        rightTempleAnchorSphere.name = "rightTempleApproxSphere";
        rightTempleAnchorSphere.renderOrder = 1000;
        rightTempleAnchorSphere.visible = false;
        helperGroup.add(rightTempleAnchorSphere);

        const leftTempleLineMat = new THREE.LineBasicMaterial({ color: 0xff0000, depthTest: false, depthWrite: false, transparent: false, opacity: 1.0, toneMapped: false });
        const leftTempleLineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
        const leftTempleApproxLine = new THREE.Line(leftTempleLineGeo, leftTempleLineMat);
        leftTempleApproxLine.name = "leftTempleApproxLine";
        leftTempleApproxLine.renderOrder = 1000;
        leftTempleApproxLine.visible = false;
        helperGroup.add(leftTempleApproxLine);

        const rightTempleLineMat = new THREE.LineBasicMaterial({ color: 0x008cff, depthTest: false, depthWrite: false, transparent: false, opacity: 1.0, toneMapped: false });
        const rightTempleLineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
        const rightTempleApproxLine = new THREE.Line(rightTempleLineGeo, rightTempleLineMat);
        rightTempleApproxLine.name = "rightTempleApproxLine";
        rightTempleApproxLine.renderOrder = 1000;
        rightTempleApproxLine.visible = false;
        helperGroup.add(rightTempleApproxLine);

        setHelperStatus({
          redOrigin: 'CREATED',
          greenCenter: 'CREATED',
          blueCentroid: 'CREATED',
          yellowBbox: 'CREATED',
          axes: 'NOT_CREATED'
        });
        setTotalHelpers(12);

        let sizeObj5 = "N/A";
        let sizeObj7 = "N/A";
        let sizeObj9 = "N/A";

        const box5 = new THREE.Box3();
        const box7 = new THREE.Box3();
        const box9 = new THREE.Box3();

        let found5 = false, found7 = false, found9 = false;

        model.traverse((child) => {
          if (child.isMesh) {
            const meshName = (child.name || '').toLowerCase();
            const childBox = new THREE.Box3().setFromObject(child);
            const sz = childBox.getSize(new THREE.Vector3());
            const szStr = `${sz.x.toFixed(4)}, ${sz.y.toFixed(4)}, ${sz.z.toFixed(4)}`;

            if (meshName.includes("object_5")) {
              box5.copy(childBox);
              sizeObj5 = szStr;
              found5 = true;
            } else if (meshName.includes("object_7") || meshName.includes("handle") || meshName.includes("càng") || meshName.includes("temple")) {
              box7.copy(childBox);
              sizeObj7 = szStr;
              found7 = true;
            } else if (meshName.includes("object_9")) {
              box9.copy(childBox);
              sizeObj9 = szStr;
              found9 = true;
            }
          }
        });

        const box59 = new THREE.Box3();
        if (found5) box59.union(box5);
        if (found9) box59.union(box9);
        const size59 = (found5 || found9)
          ? `${box59.getSize(new THREE.Vector3()).x.toFixed(4)}, ${box59.getSize(new THREE.Vector3()).y.toFixed(4)}, ${box59.getSize(new THREE.Vector3()).z.toFixed(4)}`
          : "N/A";

        const localBridgeCenter = new THREE.Vector3();
        if (found5 || found9) {
          box59.getCenter(localBridgeCenter);
        }
        model.userData.localBridgeCenter = localBridgeCenter;

        const box579 = new THREE.Box3();
        if (found5) box579.union(box5);
        if (found7) box579.union(box7);
        if (found9) box579.union(box9);
        const size579 = (found5 || found7 || found9)
          ? `${box579.getSize(new THREE.Vector3()).x.toFixed(4)}, ${box579.getSize(new THREE.Vector3()).y.toFixed(4)}, ${box579.getSize(new THREE.Vector3()).z.toFixed(4)}`
          : "N/A";

        const inclList = [];
        const exclList = [];
        const boxExcludingTemples = new THREE.Box3();
        let addedAny = false;

        model.traverse((child) => {
          if (child.isMesh) {
            const isExcludedType = child.userData.partType === 'LEFT_TEMPLE' || child.userData.partType === 'RIGHT_TEMPLE';
            if (isExcludedType) {
              exclList.push(child.name || "UNNAMED");
            } else {
              boxExcludingTemples.expandByObject(child);
              addedAny = true;
              inclList.push(child.name || "UNNAMED");
            }
          }
        });

        const rawModelSizeStr = `${size.x.toFixed(4)}, ${size.y.toFixed(4)}, ${size.z.toFixed(4)}`;
        const rawSizeExcludingTemplesStr = addedAny
          ? `${boxExcludingTemples.getSize(new THREE.Vector3()).x.toFixed(4)}, ${boxExcludingTemples.getSize(new THREE.Vector3()).y.toFixed(4)}, ${boxExcludingTemples.getSize(new THREE.Vector3()).z.toFixed(4)}`
          : "N/A (No non-temple meshes found)";

        model.userData.rawModelSizeStr = rawModelSizeStr;
        model.userData.rawSizeExcludingTemplesStr = rawSizeExcludingTemplesStr;

        setBox3Diagnostics({
          includedExcludingTemples: inclList.join(", ") || "None",
          excludedExcludingTemples: exclList.join(", ") || "None",
          sizeObj5,
          sizeObj7,
          sizeObj9,
          size59,
          size579
        });

        const sc = 2.0 / size.x;
        model.scale.set(sc, sc, sc);

        const bridgeOffsetX = -center.x * sc;
        const bridgeOffsetYOld = -(center.y + size.y * 0.28) * sc;
        const bridgeOffsetYNew = 0.132000;
        const bridgeOffsetY = bridgeOffsetYNew;
        const bridgeOffsetZ = -(center.z + size.z * 0.5) * sc;
        model.position.set(bridgeOffsetX, bridgeOffsetY, bridgeOffsetZ);

        model.userData.bridgeOffsetYOld = bridgeOffsetYOld;
        model.userData.bridgeOffsetYNew = bridgeOffsetYNew;
        model.userData.scFactor = sc;

        const anchorGroup = new THREE.Group();
        anchorGroup.add(model);
        anchorGroup.userData.originalWidth = 2;

        sceneRef.current.add(anchorGroup);
        glassesModelRef.current = anchorGroup;

        addLog('✅ Kính 3D loaded — pivot tại nose bridge và đã phân loại bộ phận');
      },
      undefined,
      (error) => addLog('❌ Lỗi tải GLTF:', error.message || error)
    );
  };

  // ==========================================
  // 5. RENDER 3D VÀ THEO DÕI KHUÔN MẶT
  // ==========================================
  const render3DScene = (landmarks, width, height, transformMatrix) => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;

    rendererRef.current.clear();

    if (landmarks && glassesModelRef.current) {
      let s = prevScaleRef.current;
      let debugDeltaX = 0;
      let debugDeltaY = 0;
      let debugDeltaZ = 0;
      let debugRotDelta = 0;
      let debugLerpX = 0;
      let debugLerpY = 0;
      let debugLerpZ = 0;
      let debugSlerpRot = 0;
      let debugYawDegrees = 0;
      let debugTempleFadeFactor = 0;
      let debugObject7Opacity = 1.0;

      const noseBridge = landmarks[168];
      const leftEyeTop = landmarks[159];
      const rightEyeTop = landmarks[386];
      const leftEyeBot = landmarks[145];
      const rightEyeBot = landmarks[374];
      const leftEyeOut = landmarks[33];
      const rightEyeOut = landmarks[263];
      const faceLeft = landmarks[234];
      const faceRight = landmarks[454];
      const chin = landmarks[152];
      const forehead = landmarks[10];

      const leftEyeCY = (leftEyeTop.y + leftEyeBot.y) / 2;
      const rightEyeCY = (rightEyeTop.y + rightEyeBot.y) / 2;
      const eyeCenterY = (leftEyeCY + rightEyeCY) / 2;

      const dz = cameraRef.current.position.z;
      const vFov = (cameraRef.current.fov * Math.PI) / 180;
      const visibleHeight = 2 * Math.tan(vFov / 2) * dz;
      const visibleWidth = visibleHeight * (width / height);

      const toW = (lm) => {
        const xVal = (showCleanFullOccluderRef.current && !showProduction2PassRef.current && !showPass1MeshAuditRef.current && !showPass2InterferenceRef.current)
          ? -(lm.x - 0.5) * visibleWidth
          : (lm.x - 0.5) * visibleWidth;
        return new THREE.Vector3(
          xVal,
          -(lm.y - 0.5) * visibleHeight,
          -lm.z * visibleWidth
        );
      };

      const noseBridgeW = toW(noseBridge);

      try {
        if (transformMatrix && transformMatrix.data && transformMatrix.data.length === 16) {
          const faceMat4 = new THREE.Matrix4().fromArray(transformMatrix.data);
          const _pos = new THREE.Vector3();
          const _scale = new THREE.Vector3();
          const targetQuat = new THREE.Quaternion();
          faceMat4.decompose(_pos, targetQuat, _scale);

          if (showCleanFullOccluderRef.current && !showProduction2PassRef.current && !showPass1MeshAuditRef.current && !showPass2InterferenceRef.current) {
            targetQuat.y = -targetQuat.y;
            targetQuat.z = -targetQuat.z;
          }

          const correction = new THREE.Quaternion();
          targetQuat.multiply(correction);

          const quatDot = Math.abs(prevQuatRef.current.dot(targetQuat));
          const rotDelta = 1.0 - quatDot;
          const SLERP_ROT = Math.min(0.98, Math.max(0.75, rotDelta * 60.0));
          debugRotDelta = rotDelta;
          debugSlerpRot = SLERP_ROT;
          prevQuatRef.current.slerp(targetQuat, SLERP_ROT);
          glassesModelRef.current.quaternion.copy(prevQuatRef.current);
        } else {
          glassesModelRef.current.quaternion.copy(prevQuatRef.current);
        }

        const euler = new THREE.Euler().setFromQuaternion(prevQuatRef.current, 'YXZ');
        const yaw = euler.y;
        const pitch = euler.x;
        const yawFactor = Math.abs(yaw);

        const yawAbsRad = Math.abs(yaw);
        const yawDegreesVal = yawAbsRad * 180 / Math.PI;
        debugYawDegrees = yaw * 180 / Math.PI;
        const yawVisibilityState = getYawVisibilityState(debugYawDegrees);
        const templeVisibleLengths = estimateTempleVisibleLengths(
          debugYawDegrees,
          yawVisibilityState.nearSide,
          yawVisibilityState.farSide
        );

        glassesModelRef.current.userData.occlusionMode = OCCLUDER_MODE.NARROW_SIDE;
        glassesModelRef.current.userData.occlusionSideState = {
          yawDegrees: debugYawDegrees,
          nearSide: yawVisibilityState.nearSide,
          farSide: yawVisibilityState.farSide,
          visibleTempleLengthLeft: templeVisibleLengths.left,
          visibleTempleLengthRight: templeVisibleLengths.right
        };

        if (narrowOccluderRef.current) {
          const activeSide = yawVisibilityState.farSide === 'LEFT'
            ? 'LEFT'
            : yawVisibilityState.farSide === 'RIGHT'
              ? 'RIGHT'
              : 'BOTH';

          if (narrowOccluderRef.current.userData.activeSide !== activeSide) {
            const indices = activeSide === 'LEFT'
              ? narrowOccluderRef.current.userData.leftIndices
              : activeSide === 'RIGHT'
                ? narrowOccluderRef.current.userData.rightIndices
                : narrowOccluderRef.current.userData.bothIndices;
            narrowOccluderRef.current.geometry.setIndex(indices);
            narrowOccluderRef.current.geometry.computeBoundingSphere();
            narrowOccluderRef.current.userData.activeSide = activeSide;
          }
        }

        let activeFadeFactor = 0.0;
        let activeOpacity = 1.0;
        if (yawDegreesVal >= 30) {
          activeOpacity = 0.05;
          activeFadeFactor = 1.0;
        } else if (yawDegreesVal >= 10) {
          activeFadeFactor = (yawDegreesVal - 10) / (30 - 10);
          activeOpacity = 1.0 - activeFadeFactor * 0.95;
        }
        debugTempleFadeFactor = activeFadeFactor;
        debugObject7Opacity = activeOpacity;

        if (reflectionLightRef.current) {
          const baseDist = 15;
          const lightX = Math.sin(-yaw * 1.5) * baseDist;
          const lightY = Math.sin(-pitch * 1.5) * baseDist + 5;
          const lightZ = Math.cos(-yaw * 1.5) * baseDist;
          reflectionLightRef.current.position.set(lightX, lightY, lightZ);
        }

        const leftPupil = landmarks[468] || landmarks[159];
        const rightPupil = landmarks[473] || landmarks[386];

        const leftPupilW = toW(leftPupil);
        const rightPupilW = toW(rightPupil);
        const faceLeftW = toW(faceLeft);
        const faceRightW = toW(faceRight);
        const eyeOuterMidW = toW(leftEyeOut).add(toW(rightEyeOut)).multiplyScalar(0.5);
        const lm168HeadW = toW(landmarks[168]);
        const lm197HeadW = toW(landmarks[197]);
        const headCenter = lm168HeadW.clone()
          .add(lm197HeadW)
          .add(eyeOuterMidW)
          .multiplyScalar(1 / 3);

        const ipd3D = leftPupilW.distanceTo(rightPupilW);
        const faceWidth3D = faceLeftW.distanceTo(faceRightW);
        const headRightVector = new THREE.Vector3(1, 0, 0).applyQuaternion(prevQuatRef.current).normalize();
        const headBackVector = new THREE.Vector3(0, 0, -1).applyQuaternion(prevQuatRef.current).normalize();
        const templeSideOffset = faceWidth3D * AR_FIT_CONFIG.templeAnchorSideOffsetRatio;
        const templeBackOffset = faceWidth3D * AR_FIT_CONFIG.templeAnchorBackOffsetRatio;
        const leftTempleApprox = faceLeftW.clone()
          .addScaledVector(headRightVector, -templeSideOffset)
          .addScaledVector(headBackVector, templeBackOffset);
        const rightTempleApprox = faceRightW.clone()
          .addScaledVector(headRightVector, templeSideOffset)
          .addScaledVector(headBackVector, templeBackOffset);
        glassesModelRef.current.userData.templeAnchorApprox = {
          headCenter,
          leftTempleApprox,
          rightTempleApprox,
          sideOffset: templeSideOffset,
          backOffset: templeBackOffset
        };

        const ipdTargetWidth = ipd3D * AR_FIT_CONFIG.ipdWidthRatio;
        const faceTargetWidth = faceWidth3D * AR_FIT_CONFIG.faceWidthRatio;
        const anatomyTargetWidth = Math.max(ipdTargetWidth, faceTargetWidth);
        const constrainedAnatomyWidth = clamp(
          anatomyTargetWidth,
          ipdTargetWidth * AR_FIT_CONFIG.minScaleRatioFromIpd,
          ipdTargetWidth * AR_FIT_CONFIG.maxScaleRatioFromIpd
        );
        const targetWidth =
          ipdTargetWidth * (1 - AR_FIT_CONFIG.faceBlendWeight) +
          constrainedAnatomyWidth * AR_FIT_CONFIG.faceBlendWeight;
        const targetScale = targetWidth / (glassesModelRef.current.userData.originalWidth || 2.0);

        if (diagnosticFrameCountRef.current % 15 === 0) {
          const faceSpan = Math.abs(faceRight.x - faceLeft.x);
          const faceMinX = Math.min(faceLeft.x, faceRight.x);
          const faceMaxX = Math.max(faceLeft.x, faceRight.x);
          const faceIsCropped =
            faceMinX < AR_FIT_CONFIG.edgePadding ||
            faceMaxX > 1 - AR_FIT_CONFIG.edgePadding ||
            forehead.y < AR_FIT_CONFIG.edgePadding ||
            chin.y > 1 - AR_FIT_CONFIG.edgePadding;

          if (faceIsCropped) {
            updateFaceFitHint('Lui camera mot chut de thay du tran, cam va hai ben mat.');
          } else if (faceSpan < AR_FIT_CONFIG.minFaceSpan) {
            updateFaceFitHint('Dua mat gan camera hon de quet ro hai ben thai duong.');
          } else {
            updateFaceFitHint('');
          }
        }

        const deltaScale = Math.abs(targetScale - prevScaleRef.current);
        const LERP_SCALE = Math.min(0.6, Math.max(0.15, deltaScale * 8.0));
        prevScaleRef.current += (targetScale - prevScaleRef.current) * LERP_SCALE;
        s = prevScaleRef.current;
        glassesModelRef.current.scale.set(s, s, s);

        const anatomyScalePressure = ipdTargetWidth > 0
          ? clamp((constrainedAnatomyWidth / ipdTargetWidth) - 1, 0, 0.3)
          : 0;
        const templeDepthScale = clamp(
          AR_FIT_CONFIG.templeDepthScaleBase + anatomyScalePressure * 1.1 + yawFactor * AR_FIT_CONFIG.templeDepthScaleYawBoost,
          AR_FIT_CONFIG.templeDepthScaleBase,
          AR_FIT_CONFIG.maxTempleDepthScale
        );
        const visibleTempleSide = getVisibleTempleSide(yaw);
        glassesModelRef.current.userData.visibleTempleSide = visibleTempleSide;
        glassesModelRef.current.userData.templeDepthScale = templeDepthScale;

        glassesModelRef.current.traverse((child) => {
          if (child.isMesh && isTemplePart(child.userData.partType)) {
            applyTempleDepthFit(child, templeDepthScale);
          }
        });

        const leftEyeInner = landmarks[133];
        const rightEyeInner = landmarks[362];
        const eyeMidX = (leftEyeInner.x + rightEyeInner.x) / 2;
        const eyeMidY = (leftEyeInner.y + rightEyeInner.y) / 2;

        const templeReachMax = 0.10;
        const noseFitOffset = 0.010;

        const lm197 = landmarks[197];
        const lm168 = landmarks[168];

        let anchorX = (lm197.x * 0.70 + lm168.x * 0.25 + eyeMidX * 0.05 - 0.5) * visibleWidth;
        if (showCleanFullOccluderRef.current && !showProduction2PassRef.current && !showPass1MeshAuditRef.current && !showPass2InterferenceRef.current) {
          anchorX = -anchorX;
        }
        const anchorY = -((lm197.y * 0.70 + lm168.y * 0.25 + eyeMidY * 0.05) - 0.5) * visibleHeight;
        const ANATOMICAL_BRIDGE_DROP = 0.005;
        const anchorYBeforeDrop = anchorY;
        const anchorYAfterDrop = anchorY - ANATOMICAL_BRIDGE_DROP * s;

        const pitchOffsetY = pitch * 0.005 * s;
        const adjustedAnchorY = anchorYAfterDrop + pitchOffsetY;

        const pitchOffsetZ = Math.max(0, -pitch) * 0.003 * s;

        const blendedZ = lm197.z * 0.70 + lm168.z * 0.25 + ((leftEyeInner.z + rightEyeInner.z) / 2) * 0.05;
        const baseZ = -blendedZ * visibleWidth + noseFitOffset * s - pitchOffsetZ;

        const headForward = new THREE.Vector3(0, 0, 1).applyQuaternion(prevQuatRef.current);
        const FACE_OFFSET = (-noseFitOffset + 0.01 * yawFactor) * s;
        const targetPos = new THREE.Vector3(anchorX, adjustedAnchorY, baseZ)
          .addScaledVector(headForward, FACE_OFFSET);

        const deltaX = Math.abs(targetPos.x - prevPositionRef.current.x);
        const deltaY = Math.abs(targetPos.y - prevPositionRef.current.y);
        const deltaZ = Math.abs(targetPos.z - prevPositionRef.current.z);

        const LERP_X = Math.min(0.98, Math.max(0.85, deltaX * 10.0));
        const LERP_Y = Math.min(0.98, Math.max(0.85, deltaY * 12.0));
        const LERP_Z = Math.min(0.98, Math.max(0.85, deltaZ * 10.0));

        debugDeltaX = deltaX;
        debugDeltaY = deltaY;
        debugDeltaZ = deltaZ;
        debugLerpX = LERP_X;
        debugLerpY = LERP_Y;
        debugLerpZ = LERP_Z;

        prevPositionRef.current.x += (targetPos.x - prevPositionRef.current.x) * LERP_X;
        prevPositionRef.current.y += (targetPos.y - prevPositionRef.current.y) * LERP_Y;
        prevPositionRef.current.z += (targetPos.z - prevPositionRef.current.z) * LERP_Z;
        glassesModelRef.current.position.copy(prevPositionRef.current);

        if (glassesModelRef.current.children[0]) {
          glassesModelRef.current.children[0].rotation.y = ((showCleanFullOccluderRef.current && !showProduction2PassRef.current && !showPass1MeshAuditRef.current && !showPass2InterferenceRef.current) ? -yaw : yaw) * 0.07;
        }

        if (ENABLE_LEGACY_TEMPLE_FADE && !showFullGlbTestRef.current && !showCleanFullOccluderRef.current && !showProduction2PassRef.current && !showPass1MeshAuditRef.current && !showPass2InterferenceRef.current) {
          glassesModelRef.current.traverse((child) => {
            if (child.isMesh) {
              const part = child.userData.partType;
              if (part === 'LEFT_TEMPLE' || part === 'RIGHT_TEMPLE') {
                const isVisibleSide = visibleTempleSide === 'CENTER' || part === visibleTempleSide;
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach((mat) => {
                  if (mat) {
                    mat.transparent = true;
                    mat.opacity = isVisibleSide ? 1.0 : activeOpacity;
                  }
                });
              }
            }
          });
        } else {
          glassesModelRef.current.traverse((child) => {
            if (child.isMesh && child.material) {
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach((mat) => {
                if (mat) {
                  const part = child.userData.partType;
                  if (part === 'LENS') {
                    mat.transparent = true;
                    mat.opacity = 0.35;
                  } else {
                    mat.transparent = false;
                    mat.opacity = 1.0;
                  }
                  mat.side = THREE.DoubleSide;
                  mat.clippingPlanes = [];
                }
              });
            }
          });
        }

        if (helperGroupRef.current) {
          const lm6W = toW(landmarks[6]);
          const lm168W = toW(landmarks[168]);
          const lm197W = toW(landmarks[197]);
          const actualRoot = glassesModelRef.current.position;
          const classicHelperVisible = showMeshDebugRef.current;

          const redSphere = helperGroupRef.current.getObjectByName("redSphere");
          if (redSphere) {
            redSphere.visible = classicHelperVisible;
            if (classicHelperVisible) redSphere.position.copy(lm6W);
          }

          const greenSphere = helperGroupRef.current.getObjectByName("greenSphere");
          if (greenSphere) {
            greenSphere.visible = classicHelperVisible;
            if (classicHelperVisible) greenSphere.position.copy(lm168W);
          }

          const blueSphere = helperGroupRef.current.getObjectByName("blueSphere");
          if (blueSphere) {
            blueSphere.visible = classicHelperVisible;
            if (classicHelperVisible) blueSphere.position.copy(lm197W);
          }

          const yellowSphere = helperGroupRef.current.getObjectByName("yellowSphere");
          if (yellowSphere) {
            yellowSphere.visible = classicHelperVisible;
            if (classicHelperVisible) yellowSphere.position.copy(actualRoot);
          }

          const purpleSphere = helperGroupRef.current.getObjectByName("purpleSphere");
          if (purpleSphere) {
            purpleSphere.visible = classicHelperVisible;
            if (classicHelperVisible) purpleSphere.position.copy(lm168W);
          }

          const whiteSphere = helperGroupRef.current.getObjectByName("whiteSphere");
          if (whiteSphere) {
            whiteSphere.visible = classicHelperVisible;
            if (classicHelperVisible) whiteSphere.position.copy(lm197W);
          }

          const orangeSphere = helperGroupRef.current.getObjectByName("orangeSphere");
          if (orangeSphere && glassesModelRef.current) {
            orangeSphere.visible = classicHelperVisible;
            const localBridgeCenter = glassesModelRef.current.userData.localBridgeCenter || new THREE.Vector3();
            const worldBridgeCenter = localBridgeCenter.clone().applyMatrix4(glassesModelRef.current.matrixWorld);
            if (classicHelperVisible) orangeSphere.position.copy(worldBridgeCenter);

            const connectionLine = helperGroupRef.current.getObjectByName("connectionLine");
            if (connectionLine) {
              connectionLine.visible = classicHelperVisible;
              if (classicHelperVisible) {
                const posAttr = connectionLine.geometry.attributes.position;
                posAttr.setXYZ(0, actualRoot.x, actualRoot.y, actualRoot.z);
                posAttr.setXYZ(1, worldBridgeCenter.x, worldBridgeCenter.y, worldBridgeCenter.z);
                posAttr.needsUpdate = true;
              }
            }
          }

          const templeAnchorVisible = showTempleAnchorDebugRef.current;
          const leftTempleAnchorSphere = helperGroupRef.current.getObjectByName("leftTempleApproxSphere");
          const rightTempleAnchorSphere = helperGroupRef.current.getObjectByName("rightTempleApproxSphere");
          const leftTempleApproxLine = helperGroupRef.current.getObjectByName("leftTempleApproxLine");
          const rightTempleApproxLine = helperGroupRef.current.getObjectByName("rightTempleApproxLine");

          if (leftTempleAnchorSphere) {
            leftTempleAnchorSphere.visible = templeAnchorVisible;
            if (templeAnchorVisible) leftTempleAnchorSphere.position.copy(leftTempleApprox);
          }
          if (rightTempleAnchorSphere) {
            rightTempleAnchorSphere.visible = templeAnchorVisible;
            if (templeAnchorVisible) rightTempleAnchorSphere.position.copy(rightTempleApprox);
          }
          if (leftTempleApproxLine) {
            leftTempleApproxLine.visible = templeAnchorVisible;
            if (templeAnchorVisible) {
              const linePos = leftTempleApproxLine.geometry.attributes.position;
              linePos.setXYZ(0, faceLeftW.x, faceLeftW.y, faceLeftW.z);
              linePos.setXYZ(1, leftTempleApprox.x, leftTempleApprox.y, leftTempleApprox.z);
              linePos.needsUpdate = true;
            }
          }
          if (rightTempleApproxLine) {
            rightTempleApproxLine.visible = templeAnchorVisible;
            if (templeAnchorVisible) {
              const linePos = rightTempleApproxLine.geometry.attributes.position;
              linePos.setXYZ(0, faceRightW.x, faceRightW.y, faceRightW.z);
              linePos.setXYZ(1, rightTempleApprox.x, rightTempleApprox.y, rightTempleApprox.z);
              linePos.needsUpdate = true;
            }
          }
        }

        diagnosticFrameCountRef.current++;
        if (diagnosticFrameCountRef.current % 15 === 0 && glassesModelRef.current) {
          const liveSpecs = [];
          glassesModelRef.current.traverse((child) => {
            if (child.isMesh) {
              const worldPos = new THREE.Vector3();
              child.getWorldPosition(worldPos);

              const mat = child.matrixWorld.elements;
              const matStr = `[${mat[0].toFixed(2)}, ${mat[4].toFixed(2)}, ${mat[8].toFixed(2)}, ${mat[12].toFixed(2)} | ` +
                `${mat[1].toFixed(2)}, ${mat[5].toFixed(2)}, ${mat[9].toFixed(2)}, ${mat[13].toFixed(2)} | ` +
                `${mat[2].toFixed(2)}, ${mat[6].toFixed(2)}, ${mat[10].toFixed(2)}, ${mat[14].toFixed(2)} | ` +
                `${mat[3].toFixed(2)}, ${mat[7].toFixed(2)}, ${mat[11].toFixed(2)}, ${mat[15].toFixed(2)}]`;

              const chain = [];
              let p = child.parent;
              while (p) {
                chain.push(`${p.name || p.type} (${p.type})`);
                p = p.parent;
              }
              const parentChainStr = chain.reverse().join(" -> ");

              let hasAbnormalParent = false;
              let pCheck = child.parent;
              while (pCheck && pCheck !== sceneRef.current) {
                if (pCheck.position.length() > 5.0 || Math.abs(pCheck.scale.x - 1.0) > 0.3 || Math.abs(pCheck.rotation.y) > 0.05) {
                  hasAbnormalParent = true;
                }
                pCheck = pCheck.parent;
              }

              let ccCount = child.userData.ccCount;
              if (ccCount === undefined) {
                ccCount = countConnectedComponents(child.geometry);
                child.userData.ccCount = ccCount;
              }

              const groupsCount = child.geometry.groups ? child.geometry.groups.length : 0;

              child.geometry.computeBoundingBox();
              const bbox = child.geometry.boundingBox;
              const sizeVec = new THREE.Vector3();
              bbox.getSize(sizeVec);
              const centerVec = new THREE.Vector3();
              bbox.getCenter(centerVec);

              let vertexCount = 0;
              if (child.geometry.attributes && child.geometry.attributes.position) {
                vertexCount = child.geometry.attributes.position.count;
              }

              liveSpecs.push({
                Index: child.userData.meshIndex || (liveSpecs.length + 1),
                Name: child.name || "NO_NAME",
                Material: child.material ? (child.material.name || "NO_MAT") : "NO_MAT",
                PartType: child.userData.partType || "UNKNOWN",
                WorldPos: `${worldPos.x.toFixed(4)}, ${worldPos.y.toFixed(4)}, ${worldPos.z.toFixed(4)}`,
                WorldMat: matStr,
                ParentChain: parentChainStr,
                AbnormalParent: hasAbnormalParent ? "⚠️ CO CHUNG CU" : "✅ KHONG",
                Size: `${sizeVec.x.toFixed(4)}, ${sizeVec.y.toFixed(4)}, ${sizeVec.z.toFixed(4)}`,
                Center: `${centerVec.x.toFixed(4)}, ${centerVec.y.toFixed(4)}, ${centerVec.z.toFixed(4)}`,
                Vertices: vertexCount,
                Kids: child.children ? child.children.length : 0,
                CC: ccCount,
                Groups: groupsCount,
                LocalPos: `${child.position.x.toFixed(4)}, ${child.position.y.toFixed(4)}, ${child.position.z.toFixed(4)}`,
                LocalRot: `${child.rotation.x.toFixed(4)}, ${child.rotation.y.toFixed(4)}, ${child.rotation.z.toFixed(4)}`,
                LocalScale: `${child.scale.x.toFixed(4)}, ${child.scale.y.toFixed(4)}, ${child.scale.z.toFixed(4)}`
              });
            }
          });
          setLiveDiagnosticSpecs(liveSpecs);

          const fl = toW(faceLeft);
          const fr = toW(faceRight);
          const faceWidthW = fl.distanceTo(fr);

          const pos = glassesModelRef.current.position;
          const rot = new THREE.Euler().setFromQuaternion(glassesModelRef.current.quaternion, 'YXZ');
          const rotDeg = `Yaw: ${(rot.y * 180 / Math.PI).toFixed(1)}°, Pitch: ${(rot.x * 180 / Math.PI).toFixed(1)}°, Roll: ${(rot.z * 180 / Math.PI).toFixed(1)}°`;

          let rawSizeStr = "N/A";
          let rawExclStr = "N/A";
          let modelNode = null;
          glassesModelRef.current.traverse((child) => {
            if (child.userData.rawModelSizeStr) {
              rawSizeStr = child.userData.rawModelSizeStr;
              rawExclStr = child.userData.rawSizeExcludingTemplesStr;
            }
            if (child.userData.bridgeOffsetYOld !== undefined) {
              modelNode = child;
            }
          });

          let bridgeOffsetYOld = 0;
          let bridgeOffsetYNew = 0;
          let deltaWorldY = 0;
          let dist168Before = 0;
          let dist168After = 0;
          let dist197Before = 0;
          let dist197After = 0;

          setFittingDiagnostics({
            faceWidth: faceWidth3D.toFixed(4),
            glassesWidth: targetWidth.toFixed(4),
            finalScale: s.toFixed(4),
            finalPos: `${pos.x.toFixed(4)}, ${pos.y.toFixed(4)}, ${pos.z.toFixed(4)}`,
            finalRot: rotDeg,
            fittingBoxType: "IPD + face width blend",
            rawModelSize: rawSizeStr,
            rawSizeExcludingTemples: rawExclStr
          });

          const templeAnchorSnapshot = {
            faceWidth: faceWidth3D.toFixed(4),
            yawDegrees: debugYawDegrees.toFixed(4),
            leftTempleApprox: `${leftTempleApprox.x.toFixed(4)}, ${leftTempleApprox.y.toFixed(4)}, ${leftTempleApprox.z.toFixed(4)}`,
            rightTempleApprox: `${rightTempleApprox.x.toFixed(4)}, ${rightTempleApprox.y.toFixed(4)}, ${rightTempleApprox.z.toFixed(4)}`,
            sideOffset: templeSideOffset.toFixed(4),
            backOffset: templeBackOffset.toFixed(4)
          };
          setTempleAnchorDiagnostics(templeAnchorSnapshot);

          if (showTempleAnchorDebugRef.current && diagnosticFrameCountRef.current % 60 === 0) {
            console.log('TEMPLE_ANCHOR_DEBUG', templeAnchorSnapshot);
          }

          if (diagnosticFrameCountRef.current % 60 === 0) {
            console.log('AR_OCCLUDER_SIDE_STATE', {
              yawDegrees: debugYawDegrees.toFixed(4),
              nearSide: yawVisibilityState.nearSide,
              farSide: yawVisibilityState.farSide,
              visibleTempleLengthLeft: templeVisibleLengths.left.toFixed(4),
              visibleTempleLengthRight: templeVisibleLengths.right.toFixed(4),
              occluderMode: OCCLUDER_MODE.NARROW_SIDE
            });
          }

          if (modelNode) {
            bridgeOffsetYOld = modelNode.userData.bridgeOffsetYOld;
            bridgeOffsetYNew = modelNode.userData.bridgeOffsetYNew;
            
            const totalScaleY = glassesModelRef.current.scale.y;
            deltaWorldY = (bridgeOffsetYNew - bridgeOffsetYOld) * totalScaleY;

            const lm168W = toW(landmarks[168]);
            const lm197W = toW(landmarks[197]);
            
            const bridgeCenterWorldNew = new THREE.Vector3();
            modelNode.localToWorld(bridgeCenterWorldNew.set(0, 0, 0));
            
            const bridgeCenterWorldOld = new THREE.Vector3();
            modelNode.localToWorld(bridgeCenterWorldOld.set(0, bridgeOffsetYOld - bridgeOffsetYNew, 0));

            dist168Before = lm168W.distanceTo(bridgeCenterWorldOld);
            dist168After = lm168W.distanceTo(bridgeCenterWorldNew);
            dist197Before = lm197W.distanceTo(bridgeCenterWorldOld);
            dist197After = lm197W.distanceTo(bridgeCenterWorldNew);
          }

          const lensBox = new THREE.Box3();
          let foundLens = false;
          glassesModelRef.current.traverse((child) => {
            if (child.isMesh) {
              const nameLower = child.name.toLowerCase();
              const isFrontFrameMesh = child.name === 'Object_5' || child.name === 'Object_9' || child.userData.partType === 'FRONT_FRAME';
              const isExcludedHandle = child.name === 'Object_7' || child.userData.partType === 'LEFT_TEMPLE' || child.userData.partType === 'RIGHT_TEMPLE' || child.userData.partType === 'BOTH_TEMPLES' || child.userData.partType === 'TEMPLE' || nameLower.includes('handle') || nameLower.includes('temple');

              if (isFrontFrameMesh && !isExcludedHandle) {
                lensBox.expandByObject(child);
                foundLens = true;
              }
            }
          });

          const pupilYWorld = -(((landmarks[133].y + landmarks[362].y) / 2) - 0.5) * visibleHeight;
          let lensTopY = 0;
          let lensBottomY = 0;
          let eyeVerticalRatio = 0;
          let deltaWorldYReq = 0;
          let deltaLocalY = 0;
          let suggestedBridgeOffsetY = 0;

          if (foundLens) {
            lensTopY = lensBox.max.y;
            lensBottomY = lensBox.min.y;
            const lensHeight = lensTopY - lensBottomY;
            if (lensHeight > 0) {
              eyeVerticalRatio = (pupilYWorld - lensTopY) / (lensBottomY - lensTopY);
            }
            const currentLensCenterY = (lensTopY + lensBottomY) / 2;
            deltaWorldYReq = pupilYWorld - currentLensCenterY;
            const totalScaleY = glassesModelRef.current.scale.y;
            if (totalScaleY > 0) {
              deltaLocalY = deltaWorldYReq / totalScaleY;
            }
            if (modelNode) {
              suggestedBridgeOffsetY = modelNode.position.y + deltaLocalY;
            }
          }

          const leftTempleNames = [];
          const rightTempleNames = [];
          const bothTempleNames = [];
          const templeDiagnosticsList = [];

          if (glassesModelRef.current) {
            glassesModelRef.current.traverse((child) => {
              if (child.isMesh) {
                const part = child.userData.partType;
                if (part === 'LEFT_TEMPLE' || part === 'RIGHT_TEMPLE' || part === 'BOTH_TEMPLES') {
                  if (part === 'LEFT_TEMPLE') leftTempleNames.push(child.name);
                  else if (part === 'RIGHT_TEMPLE') rightTempleNames.push(child.name);
                  else bothTempleNames.push(child.name);

                  templeDiagnosticsList.push({
                    name: child.name || 'UNNAMED',
                    partType: part,
                    visible: child.visible,
                    renderOrder: child.renderOrder,
                    depthTest: child.material ? child.material.depthTest : false,
                    depthWrite: child.material ? child.material.depthWrite : false,
                    transparent: child.material ? child.material.transparent : false,
                    opacity: child.material ? child.material.opacity : 1.0,
                    colorWrite: child.material ? child.material.colorWrite : true
                  });
                }
              }
            });
          }

          let templeDiagText = "";
          if (templeDiagnosticsList.length === 0) {
            templeDiagText = "TEMPLE_DETECTION_FAILED";
          } else {
            templeDiagnosticsList.forEach((t, idx) => {
              templeDiagText += `\nTemple [${idx + 1}]: Name: ${t.name} | Part: ${t.partType} | Visible: ${t.visible} | Order: ${t.renderOrder} | DepthTest: ${t.depthTest} | DepthWrite: ${t.depthWrite} | Transparent: ${t.transparent} | Opacity: ${t.opacity} | ColorWrite: ${t.colorWrite}`;
            });
          }

          setAnatomicalBridgeDiagnostics({
            anchorYBefore: anchorYBeforeDrop.toFixed(6),
            anchorYAfter: anchorYAfterDrop.toFixed(6),
            appliedDrop: (ANATOMICAL_BRIDGE_DROP * s).toFixed(6),
            bridgeOffsetYOld: bridgeOffsetYOld.toFixed(6),
            bridgeOffsetYNew: bridgeOffsetYNew.toFixed(6),
            deltaWorldY: deltaWorldY.toFixed(6),
            dist168Before: dist168Before.toFixed(6),
            dist168After: dist168After.toFixed(6),
            dist197Before: dist197Before.toFixed(6),
            dist197After: dist197After.toFixed(6),
            lensTopY: lensTopY.toFixed(6),
            lensBottomY: lensBottomY.toFixed(6),
            pupilY: pupilYWorld.toFixed(6),
            eyeVerticalRatio: eyeVerticalRatio.toFixed(6),
            suggestedAdjustmentLocal: deltaLocalY.toFixed(6),
            suggestedBridgeOffsetY: suggestedBridgeOffsetY.toFixed(6),
            deltaWorldYReq: deltaWorldYReq.toFixed(6),
            posDeltaX: debugDeltaX.toFixed(6),
            posDeltaY: debugDeltaY.toFixed(6),
            posDeltaZ: debugDeltaZ.toFixed(6),
            rotDelta: debugRotDelta.toFixed(6),
            lerpX: debugLerpX.toFixed(6),
            lerpY: debugLerpY.toFixed(6),
            lerpZ: debugLerpZ.toFixed(6),
            slerpRot: debugSlerpRot.toFixed(6),
            occluderVisible: occluderRef.current ? occluderRef.current.visible.toString() : "N/A",
            fullOccluderVisible: fullOccluderRef.current ? fullOccluderRef.current.visible.toString() : "N/A",
            occluderRenderOrder: occluderRef.current ? occluderRef.current.renderOrder.toString() : "N/A",
            fullOccluderRenderOrder: fullOccluderRef.current ? fullOccluderRef.current.renderOrder.toString() : "N/A",
            occluderDepthWrite: occluderRef.current ? occluderRef.current.material.depthWrite.toString() : "N/A",
            occluderDepthTest: occluderRef.current ? occluderRef.current.material.depthTest.toString() : "N/A",
            occluderColorWrite: occluderRef.current ? occluderRef.current.material.colorWrite.toString() : "N/A",
            leftTempleMeshes: leftTempleNames.length > 0 ? leftTempleNames.join(", ") : (bothTempleNames.length > 0 ? `None (Merged in BOTH_TEMPLES: ${bothTempleNames.join(", ")})` : "TEMPLE_DETECTION_FAILED"),
            rightTempleMeshes: rightTempleNames.length > 0 ? rightTempleNames.join(", ") : (bothTempleNames.length > 0 ? `None (Merged in BOTH_TEMPLES: ${bothTempleNames.join(", ")})` : "TEMPLE_DETECTION_FAILED"),
            bothTempleMeshes: bothTempleNames.length > 0 ? bothTempleNames.join(", ") : "None",
            templeDiagnosticsText: templeDiagText,
            targetLerpX: debugDeltaX.toFixed(6),
            targetLerpY: debugDeltaY.toFixed(6),
            targetLerpZ: debugDeltaZ.toFixed(6),
            targetSlerp: debugRotDelta.toFixed(6),
            yawDegrees: debugYawDegrees.toFixed(4),
            templeFadeFactor: debugTempleFadeFactor.toFixed(4),
            object7Opacity: debugObject7Opacity.toFixed(4),
            object7ForcedHidden: "true",
            occluderMode: glassesModelRef.current.userData.occlusionMode || OCCLUDER_MODE.NARROW_SIDE,
            nearSide: yawVisibilityState.nearSide,
            farSide: yawVisibilityState.farSide,
            visibleTempleLengthLeft: templeVisibleLengths.left.toFixed(4),
            visibleTempleLengthRight: templeVisibleLengths.right.toFixed(4)
          });
        }

        glassesModelRef.current.traverse((child) => {
          if (child.isMesh) {
            if (child.material) {
              if (!child.userData.isMaterialCloned) {
                if (Array.isArray(child.material)) {
                  child.material = child.material.map(m => m.clone());
                } else {
                  child.material = child.material.clone();
                }
                child.userData.isMaterialCloned = true;
              }
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach((mat) => {
                if (mat) {
                  mat.transparent = false;
                  mat.opacity = 1.0;
                  mat.clippingPlanes = [];
                }
              });
            }

            if (showOccluderDebugRef.current || showTempleOccluderDebugRef.current) {
              child.visible = true;
            } else {
              const testMode = activeTestRef.current;
              if (testMode === "A") {
                child.visible = (child.name === 'Object_5');
              } else if (testMode === "B") {
                child.visible = (child.name === 'Object_7');
              } else if (testMode === "C") {
                child.visible = (child.name === 'Object_9');
              } else {
                child.visible = true;
              }
            }
          }
        });
      } catch (e) {
        console.warn('[AR] render3DScene tracking error:', e.message);
      }

      if (landmarks && landmarks.length >= 468) {
        const posAttr = occluderRef.current ? occluderRef.current.geometry.attributes.position : null;
        const fullPosAttr = fullOccluderRef.current ? fullOccluderRef.current.geometry.attributes.position : null;
        const narrowPosAttr = narrowOccluderRef.current ? narrowOccluderRef.current.geometry.attributes.position : null;

        for (let i = 0; i < Math.min(landmarks.length, 478); i++) {
          const w = toW(landmarks[i]);
          if (posAttr) posAttr.setXYZ(i, w.x, w.y, w.z);
          if (fullPosAttr) fullPosAttr.setXYZ(i, w.x, w.y, w.z);
          if (narrowPosAttr) narrowPosAttr.setXYZ(i, w.x, w.y, w.z);
        }

        if (posAttr) {
          posAttr.needsUpdate = true;
          occluderRef.current.geometry.computeBoundingSphere();
          occluderRef.current.position.set(0, 0, 0);
        }
        if (fullPosAttr) {
          fullPosAttr.needsUpdate = true;
          fullOccluderRef.current.geometry.computeBoundingSphere();
          fullOccluderRef.current.position.set(0, 0, 0);
        }
        if (narrowPosAttr) {
          narrowPosAttr.needsUpdate = true;
          narrowOccluderRef.current.geometry.computeBoundingSphere();
          narrowOccluderRef.current.position.set(0, 0, 0);
        }
      }

      if (fullOccluderRef.current && fullOccluderRef.current.material) {
        if (showOccluderWireframeRef.current) {
          fullOccluderRef.current.visible = true;
          fullOccluderRef.current.material.colorWrite = true;
          fullOccluderRef.current.material.depthWrite = false;
          fullOccluderRef.current.material.depthTest = false;
          fullOccluderRef.current.material.wireframe = true;
          fullOccluderRef.current.material.transparent = true;
          fullOccluderRef.current.material.opacity = 0.3;
          fullOccluderRef.current.material.side = THREE.DoubleSide;
          if (fullOccluderRef.current.material.color) {
            fullOccluderRef.current.material.color.setHex(0x00ff00);
          }
        } else {
          fullOccluderRef.current.material.wireframe = false;
          fullOccluderRef.current.material.transparent = false;
          fullOccluderRef.current.material.opacity = 1.0;
        }
      }

      if (showOccluderWireframeRef.current && fullOccluderRef.current && glassesModelRef.current && (diagnosticFrameCountRef.current % 150 === 0)) {
        const occPos = new THREE.Vector3();
        fullOccluderRef.current.getWorldPosition(occPos);

        const occRot = new THREE.Quaternion();
        fullOccluderRef.current.getWorldQuaternion(occRot);
        const occEuler = new THREE.Euler().setFromQuaternion(occRot);

        const occScale = new THREE.Vector3();
        fullOccluderRef.current.getWorldScale(occScale);

        const glassPos = new THREE.Vector3();
        glassesModelRef.current.getWorldPosition(glassPos);

        const dist = occPos.distanceTo(glassPos);

        addLog("--- OCCLUDER WIREFRAME AUDIT DIAGNOSTICS ---");
        addLog(`OCCLUDER_WORLD_POSITION: x: ${occPos.x.toFixed(4)}, y: ${occPos.y.toFixed(4)}, z: ${occPos.z.toFixed(4)}`);
        addLog(`OCCLUDER_WORLD_ROTATION (Euler): x: ${occEuler.x.toFixed(4)}, y: ${occEuler.y.toFixed(4)}, z: ${occEuler.z.toFixed(4)}`);
        addLog(`OCCLUDER_WORLD_SCALE: x: ${occScale.x.toFixed(4)}, y: ${occScale.y.toFixed(4)}, z: ${occScale.z.toFixed(4)}`);
        addLog(`DISTANCE_TO_GLASSES_CENTER: ${dist.toFixed(4)}`);
      }

      if (!window.lastOcclusionLogTime || Date.now() - window.lastOcclusionLogTime > 4000) {
        window.lastOcclusionLogTime = Date.now();
        console.log("=== 🛡️ [AR RUNTIME OCCLUSION PASS VERIFICATION] ===");
        
        console.log("1. ALL MESHES OF GLB:");
        const allMeshes = [];
        glassesModelRef.current.traverse((child) => {
          if (child.isMesh) {
            allMeshes.push({
              name: child.name || 'UNNAMED',
              partType: child.userData.partType || 'UNDEFINED',
              visible: child.visible,
              renderOrder: child.renderOrder
            });
          }
        });
        console.table(allMeshes);

        let obj7State = null;
        const pass1List = [];
        const pass2List = [];

        glassesModelRef.current.traverse((child) => {
          if (child.isMesh) {
            const part = child.userData.partType;
            if (part === 'LEFT_TEMPLE' || part === 'RIGHT_TEMPLE' || part === 'BOTH_TEMPLES') {
              pass1List.push(child.name + ` (${part})`);
            } else if (part === 'FRONT_FRAME' || part === 'LENS') {
              pass2List.push(child.name + ` (${part})`);
            }

            if (child.name === 'Object_7') {
              obj7State = {
                name: child.name,
                parent: child.parent ? (child.parent.name || child.parent.type) : 'None',
                partType: part,
                visible: child.visible,
                renderOrder: child.renderOrder,
                depthTest: child.material ? child.material.depthTest : false,
                depthWrite: child.material ? child.material.depthWrite : false,
                transparent: child.material ? child.material.transparent : false,
                opacity: child.material ? child.material.opacity : 1.0
              };
            }
          }
        });

        console.log("\nPASS1 TEMPLES:");
        console.log(JSON.stringify(pass1List, null, 2));

        console.log("\nPASS2 FRAME:");
        console.log(JSON.stringify(pass2List, null, 2));

        console.log("\nOBJECT_7 STATE:");
        console.log(JSON.stringify(obj7State || { error: "Object_7 not found" }, null, 2));
        console.log("==================================================");
      }

      if (showFullGlbTestRef.current) {
        if (occluderRef.current) occluderRef.current.visible = false;
        if (fullOccluderRef.current) fullOccluderRef.current.visible = false;

        glassesModelRef.current.traverse((child) => {
          if (child.isMesh) {
            child.visible = true;
            child.renderOrder = 0;
            child.frustumCulled = false;
            if (child.material) {
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach((mat) => {
                if (mat) {
                  const part = child.userData.partType;
                  if (part === 'LENS') {
                    mat.transparent = true;
                    mat.opacity = 0.35;
                  } else {
                    mat.transparent = false;
                    mat.opacity = 1.0;
                  }
                  mat.side = THREE.DoubleSide;
                  mat.clippingPlanes = [];
                }
              });
            }
          }
        });

        rendererRef.current.render(sceneRef.current, cameraRef.current);
      } else if (showPass2InterferenceRef.current) {
        // Mode: PASS2_INTERFERENCE_AUDIT
        const autoClearVal = rendererRef.current.autoClear;

        // Clear before PASS 1
        rendererRef.current.clear();
        const clearBeforePass1Called = true;

        if (occluderRef.current) occluderRef.current.visible = false;
        if (fullOccluderRef.current) {
          fullOccluderRef.current.visible = true;
          fullOccluderRef.current.material.colorWrite = false;
          fullOccluderRef.current.material.depthWrite = true;
          fullOccluderRef.current.material.depthTest = true;
          fullOccluderRef.current.material.side = THREE.DoubleSide;
        }

        const pass1Visible = [];
        glassesModelRef.current.traverse((child) => {
          if (child.isMesh) {
            const part = child.userData.partType;
            if (part === 'LEFT_TEMPLE' || part === 'RIGHT_TEMPLE' || part === 'BOTH_TEMPLES') {
              child.visible = true;
              pass1Visible.push(child.name || "UNNAMED");
            } else {
              child.visible = false;
            }
            if (child.material) {
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach((mat) => {
                if (mat) {
                  mat.transparent = false;
                  mat.opacity = 1.0;
                  mat.side = THREE.DoubleSide;
                  mat.clippingPlanes = [];
                }
              });
            }
          }
        });

        rendererRef.current.render(sceneRef.current, cameraRef.current);

        if (pass1OnlyFreezeRef.current) {
          // Restore all meshes to visible for other systems
          glassesModelRef.current.traverse((child) => {
            if (child.isMesh) child.visible = true;
          });
          if (fullOccluderRef.current) fullOccluderRef.current.visible = true;

          if (diagnosticFrameCountRef.current % 150 === 0) {
            addLog("--- PASS2 INTERFERENCE AUDIT (PASS1 ONLY FREEZE) ---");
            addLog(`PASS1_VISIBLE_MESHES: ${JSON.stringify(pass1Visible)}`);
            addLog("PASS 2 was skipped (frozen after PASS 1).");
          }
          diagnosticFrameCountRef.current++;
        } else {
          // Clear depth or skip based on pass1ThenPass2NoClear
          let clearDepthBetweenPassesCalled = false;
          if (!pass1ThenPass2NoClearRef.current) {
            rendererRef.current.clearDepth();
            clearDepthBetweenPassesCalled = true;
          }

          if (fullOccluderRef.current) fullOccluderRef.current.visible = showOccluderWireframeRef.current;
          if (occluderRef.current) occluderRef.current.visible = false;

          const pass2Visible = [];
          glassesModelRef.current.traverse((child) => {
            if (child.isMesh) {
              const part = child.userData.partType;
              if (part === 'FRONT_FRAME' || part === 'LENS') {
                child.visible = true;
                
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                const matDetails = materials.map((mat) => mat ? {
                  transparent: mat.transparent,
                  opacity: mat.opacity,
                  depthTest: mat.depthTest,
                  depthWrite: mat.depthWrite,
                  colorWrite: mat.colorWrite
                } : null);

                pass2Visible.push({
                  name: child.name || "UNNAMED",
                  materials: matDetails,
                  renderOrder: child.renderOrder
                });
              } else {
                child.visible = false;
              }
              if (child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach((mat) => {
                  if (mat) {
                    if (part === 'LENS') {
                      mat.transparent = true;
                      mat.opacity = 0.35;
                    } else {
                      mat.transparent = false;
                      mat.opacity = 1.0;
                    }
                    mat.side = THREE.DoubleSide;
                    mat.clippingPlanes = [];
                  }
                });
              }
            }
          });

          const clearOrClearColorCalledBeforePass2 = false;

          rendererRef.current.render(sceneRef.current, cameraRef.current);

          // Restore all meshes to visible for other systems
          glassesModelRef.current.traverse((child) => {
            if (child.isMesh) child.visible = true;
          });
          if (fullOccluderRef.current) fullOccluderRef.current.visible = true;

          if (diagnosticFrameCountRef.current % 150 === 0) {
            addLog("--- PASS2 INTERFERENCE AUDIT ---");
            addLog(`renderer.autoClear: ${autoClearVal}`);
            addLog(`clearBeforePass1Called: ${clearBeforePass1Called}`);
            addLog(`clearDepthCalledBetweenPasses: ${clearDepthBetweenPassesCalled}`);
            addLog(`clearOrClearColorCalledBeforePass2: ${clearOrClearColorCalledBeforePass2}`);
            addLog(`PASS1_VISIBLE_MESHES: ${JSON.stringify(pass1Visible)}`);
            addLog(`PASS2_VISIBLE_MESHES: ${JSON.stringify(pass2Visible, null, 2)}`);
          }
          diagnosticFrameCountRef.current++;
        }
      } else if (showPass1MeshAuditRef.current) {
        // Mode: PASS1_MESH_AUDIT
        rendererRef.current.clear();

        if (occluderRef.current) occluderRef.current.visible = false;
        if (fullOccluderRef.current) fullOccluderRef.current.visible = false;

        const auditMeshes = [];
        const auditBounds = [];

        glassesModelRef.current.traverse((child) => {
          if (child.isMesh) {
            const part = child.userData.partType;
            if (part === 'LEFT_TEMPLE' || part === 'RIGHT_TEMPLE' || part === 'BOTH_TEMPLES') {
              child.visible = true;

              // Calculate bounding box in world space
              child.geometry.computeBoundingBox();
              const box = new THREE.Box3().copy(child.geometry.boundingBox).applyMatrix4(child.matrixWorld);
              const min = { x: box.min.x, y: box.min.y, z: box.min.z };
              const max = { x: box.max.x, y: box.max.y, z: box.max.z };
              const sizeVec = new THREE.Vector3();
              box.getSize(sizeVec);
              const size = { x: sizeVec.x, y: sizeVec.y, z: sizeVec.z };

              auditBounds.push({
                name: child.name || "UNNAMED",
                min,
                max,
                size
              });

              // Material count
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach((mat) => {
                if (mat) {
                  mat.transparent = false;
                  mat.opacity = 1.0;
                  mat.side = THREE.DoubleSide;
                  mat.clippingPlanes = [];
                }
              });

              auditMeshes.push({
                name: child.name || "UNNAMED",
                parent: child.parent ? (child.parent.name || "UNNAMED") : "NONE",
                visible: child.visible,
                vertexCount: child.geometry.attributes.position.count,
                materialCount: materials.length
              });
            } else {
              child.visible = false;
            }
          }
        });

        rendererRef.current.render(sceneRef.current, cameraRef.current);

        glassesModelRef.current.traverse((child) => {
          if (child.isMesh) {
            child.visible = true;
          }
        });

        if (diagnosticFrameCountRef.current % 150 === 0) {
          addLog("--- PASS1 MESH AUDIT DIAGNOSTICS ---");
          addLog(`PASS1_VISIBLE_MESHES: ${JSON.stringify(auditMeshes, null, 2)}`);
          addLog(`PASS1_WORLD_BOUNDS: ${JSON.stringify(auditBounds, null, 2)}`);
        }
        diagnosticFrameCountRef.current++;
      } else if (showProduction2PassRef.current) {
        // Mode: PRODUCTION 2-PASS
        rendererRef.current.clear();

        if (occluderRef.current) occluderRef.current.visible = false;
        if (fullOccluderRef.current) {
          fullOccluderRef.current.visible = true;
          fullOccluderRef.current.material.colorWrite = false;
          fullOccluderRef.current.material.depthWrite = true;
          fullOccluderRef.current.material.depthTest = true;
          fullOccluderRef.current.material.side = THREE.DoubleSide;
        }

        const pass1Visible = [];
        glassesModelRef.current.traverse((child) => {
          if (child.isMesh) {
            const part = child.userData.partType;
            if (part === 'LEFT_TEMPLE' || part === 'RIGHT_TEMPLE' || part === 'BOTH_TEMPLES') {
              child.visible = true;
              pass1Visible.push(child.name || "UNNAMED");
            } else {
              child.visible = false;
            }
            if (child.material) {
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach((mat) => {
                if (mat) {
                  mat.transparent = false;
                  mat.opacity = 1.0;
                  mat.side = THREE.DoubleSide;
                  mat.clippingPlanes = [];
                }
              });
            }
          }
        });

        rendererRef.current.render(sceneRef.current, cameraRef.current);

        rendererRef.current.clearDepth();

        if (fullOccluderRef.current) fullOccluderRef.current.visible = showOccluderWireframeRef.current;
        if (occluderRef.current) occluderRef.current.visible = false;

        const pass2Visible = [];
        glassesModelRef.current.traverse((child) => {
          if (child.isMesh) {
            const part = child.userData.partType;
            if (part === 'FRONT_FRAME' || part === 'LENS') {
              child.visible = true;
              pass2Visible.push(child.name || "UNNAMED");
            } else {
              child.visible = false;
            }
            if (child.material) {
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach((mat) => {
                if (mat) {
                  if (part === 'LENS') {
                    mat.transparent = true;
                    mat.opacity = 0.35;
                  } else {
                    mat.transparent = false;
                    mat.opacity = 1.0;
                  }
                  mat.side = THREE.DoubleSide;
                  mat.clippingPlanes = [];
                }
              });
            }
          }
        });

        rendererRef.current.render(sceneRef.current, cameraRef.current);

        glassesModelRef.current.traverse((child) => {
          if (child.isMesh) {
            child.visible = true;
          }
        });
        if (fullOccluderRef.current) fullOccluderRef.current.visible = true;

        if (diagnosticFrameCountRef.current % 150 === 0) {
          addLog("--- PRODUCTION 2-PASS DIAGNOSTICS ---");
          addLog(`PASS1_VISIBLE_MESHES: ${JSON.stringify(pass1Visible)}`);
          addLog(`PASS2_VISIBLE_MESHES: ${JSON.stringify(pass2Visible)}`);
          addLog(`clearDepthCalledBetweenPasses: true`);
        }
        diagnosticFrameCountRef.current++;
      } else if (showCleanFullOccluderRef.current) {
        // Mode B: Clean Full Face Occluder Test
        rendererRef.current.clear();

        if (occluderRef.current) occluderRef.current.visible = false;
        if (fullOccluderRef.current) {
          fullOccluderRef.current.visible = true;
          fullOccluderRef.current.material.colorWrite = false;
          fullOccluderRef.current.material.depthWrite = true;
          fullOccluderRef.current.material.depthTest = true;
          fullOccluderRef.current.material.side = THREE.DoubleSide;
        }

        glassesModelRef.current.traverse((child) => {
          if (child.isMesh) {
            child.visible = true;
            child.renderOrder = 0;
            child.frustumCulled = false;
            if (child.material) {
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach((mat) => {
                if (mat) {
                  const part = child.userData.partType;
                  if (part === 'LENS') {
                    mat.transparent = true;
                    mat.opacity = 0.35;
                  } else {
                    mat.transparent = false;
                    mat.opacity = 1.0;
                  }
                  mat.side = THREE.DoubleSide;
                  mat.clippingPlanes = [];
                }
              });
            }
          }
        });

        // 1st pass: render only depth-only fullOccluder
        glassesModelRef.current.visible = false;
        if (fullOccluderRef.current) fullOccluderRef.current.visible = true;
        rendererRef.current.render(sceneRef.current, cameraRef.current);

        // 2nd pass: render glasses model normally, without clearDepth()
        glassesModelRef.current.visible = true;
        if (fullOccluderRef.current) fullOccluderRef.current.visible = false;
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      } else if (showTempleOccluderDebugRef.current) {
        if (occluderRef.current) {
          occluderRef.current.visible = true;
          if (occluderRef.current.material) {
            occluderRef.current.material.colorWrite = true;
            occluderRef.current.material.transparent = false;
            occluderRef.current.material.opacity = 1.0;
            occluderRef.current.material.color.setHex(0xff0000);
            occluderRef.current.material.depthWrite = true;
            occluderRef.current.material.depthTest = true;
          }
        }
        if (fullOccluderRef.current) {
          fullOccluderRef.current.visible = true;
          if (fullOccluderRef.current.material) {
            fullOccluderRef.current.material.colorWrite = true;
            fullOccluderRef.current.material.transparent = false;
            fullOccluderRef.current.material.opacity = 1.0;
            fullOccluderRef.current.material.color.setHex(0x0000ff);
            fullOccluderRef.current.material.depthWrite = true;
            fullOccluderRef.current.material.depthTest = true;
          }
        }

        glassesModelRef.current.traverse((child) => {
          if (child.isMesh) {
            child.visible = true;
            if (child.material) {
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach((mat) => {
                if (mat) {
                  if (child.name === 'Object_7') {
                    if (!child.userData.originalColorHex) {
                      child.userData.originalColorHex = mat.color.getHex();
                    }
                    mat.color.setHex(0x00ff00);
                  } else {
                    if (child.userData.originalColorHex) {
                      mat.color.setHex(child.userData.originalColorHex);
                    }
                  }
                  mat.transparent = false;
                  mat.opacity = 1.0;
                }
              });
            }
          }
        });

        rendererRef.current.render(sceneRef.current, cameraRef.current);
      } else {
        if (glassesModelRef.current) {
          glassesModelRef.current.traverse((child) => {
            if (child.isMesh && child.userData.originalColorHex && child.material) {
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach((mat) => {
                if (mat) {
                  mat.color.setHex(child.userData.originalColorHex);
                }
              });
            }
          });
        }
      }

      if (showFullGlbTestRef.current || showCleanFullOccluderRef.current || showProduction2PassRef.current || showPass1MeshAuditRef.current || showPass2InterferenceRef.current || showTempleOccluderDebugRef.current) {
        // Render was already handled above
      } else if (
        showOccluderDebugRef.current ||
        showFullOccluderDebugRef.current ||
        showSideOccluderDebugRef.current ||
        showNarrowOccluderDebugRef.current
      ) {
        const shouldShowSideOccluder = showOccluderDebugRef.current || showSideOccluderDebugRef.current;
        const shouldShowFullOccluder = showOccluderDebugRef.current || showFullOccluderDebugRef.current;
        const shouldShowNarrowOccluder = showNarrowOccluderDebugRef.current;

        if (occluderRef.current) {
          occluderRef.current.visible = shouldShowSideOccluder;
          if (occluderRef.current.material) {
            occluderRef.current.material.colorWrite = true;
            occluderRef.current.material.transparent = true;
            occluderRef.current.material.opacity = 0.25;
            occluderRef.current.material.color.setHex(0xff0000);
            occluderRef.current.material.depthWrite = false;
            occluderRef.current.material.depthTest = true;
          }
        }
        if (fullOccluderRef.current) {
          fullOccluderRef.current.visible = shouldShowFullOccluder;
          if (fullOccluderRef.current.material) {
            fullOccluderRef.current.material.colorWrite = true;
            fullOccluderRef.current.material.transparent = true;
            fullOccluderRef.current.material.opacity = 0.22;
            fullOccluderRef.current.material.color.setHex(0x0000ff);
            fullOccluderRef.current.material.depthWrite = false;
            fullOccluderRef.current.material.depthTest = true;
          }
        }
        if (narrowOccluderRef.current) {
          narrowOccluderRef.current.visible = shouldShowNarrowOccluder;
          if (narrowOccluderRef.current.material) {
            narrowOccluderRef.current.material.colorWrite = true;
            narrowOccluderRef.current.material.transparent = true;
            narrowOccluderRef.current.material.opacity = 0.28;
            narrowOccluderRef.current.material.color.setHex(0x00ff66);
            narrowOccluderRef.current.material.depthWrite = false;
            narrowOccluderRef.current.material.depthTest = true;
          }
        }

        glassesModelRef.current.traverse((child) => {
          if (child.isMesh) {
            child.visible = true;
            if (child.material) {
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach((mat) => {
                if (mat) {
                  mat.transparent = false;
                  mat.opacity = 1.0;
                }
              });
            }
          }
        });

        rendererRef.current.render(sceneRef.current, cameraRef.current);
      } else if (activeTestRef.current !== "NONE") {
        if (occluderRef.current) {
          occluderRef.current.visible = false;
          if (occluderRef.current.material) {
            occluderRef.current.material.colorWrite = false;
            occluderRef.current.material.transparent = false;
            occluderRef.current.material.opacity = 1.0;
          }
        }
        if (fullOccluderRef.current) {
          fullOccluderRef.current.visible = false;
          if (fullOccluderRef.current.material) {
            fullOccluderRef.current.material.colorWrite = false;
            fullOccluderRef.current.material.transparent = false;
            fullOccluderRef.current.material.opacity = 1.0;
          }
        }

        rendererRef.current.render(sceneRef.current, cameraRef.current);
      } else {
        if (occluderRef.current && occluderRef.current.material) {
          occluderRef.current.material.colorWrite = false;
          occluderRef.current.material.transparent = false;
          occluderRef.current.material.opacity = 1.0;
        }
        if (fullOccluderRef.current && fullOccluderRef.current.material) {
          fullOccluderRef.current.material.colorWrite = false;
          fullOccluderRef.current.material.transparent = false;
          fullOccluderRef.current.material.opacity = 1.0;
        }
        if (narrowOccluderRef.current && narrowOccluderRef.current.material) {
          narrowOccluderRef.current.material.colorWrite = false;
          narrowOccluderRef.current.material.transparent = false;
          narrowOccluderRef.current.material.opacity = 1.0;
        }

        glassesModelRef.current.traverse((child) => {
          if (child.isMesh) {
            const part = child.userData.partType;
            child.visible = !child.userData.skipProductionRender;
            child.renderOrder = 0;
            child.frustumCulled = false;
            if (child.material) {
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach((mat) => {
                if (mat) {
                  if (part === 'LENS') {
                    mat.transparent = true;
                    mat.opacity = 0.35;
                  } else {
                    mat.transparent = false;
                    mat.opacity = 1.0;
                  }
                  mat.depthTest = true;
                  mat.depthWrite = true;
                  mat.side = THREE.DoubleSide;
                  mat.clippingPlanes = [];
                }
              });
            }
          }
        });

        if (occluderRef.current) occluderRef.current.visible = false;
        if (fullOccluderRef.current) fullOccluderRef.current.visible = false;
        if (narrowOccluderRef.current) {
          narrowOccluderRef.current.visible = true;
          narrowOccluderRef.current.position.set(0, 0, 0);
          if (narrowOccluderRef.current.material) {
            narrowOccluderRef.current.material.colorWrite = false;
            narrowOccluderRef.current.material.depthWrite = true;
            narrowOccluderRef.current.material.depthTest = true;
            narrowOccluderRef.current.material.wireframe = false;
            narrowOccluderRef.current.material.transparent = false;
            narrowOccluderRef.current.material.opacity = 1.0;
            narrowOccluderRef.current.material.side = THREE.DoubleSide;
          }
        }

        glassesModelRef.current.visible = false;
        rendererRef.current.render(sceneRef.current, cameraRef.current);

        glassesModelRef.current.visible = true;
        if (narrowOccluderRef.current) narrowOccluderRef.current.visible = false;
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    } else {
      if (faceFitHintRef.current) updateFaceFitHint('');
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
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
        transformMatrix = results.facialTransformationMatrixes?.[0] || null;
      }
      try {
        render3DScene(landmarks, width, height, transformMatrix);
      } catch (err) {
        console.error('[AR CRITICAL RENDER LOOP ERROR - CONTINUING FRAME]:', err.stack || err);
      }

      if (liveCanvasRef.current) {
        const lCtx = liveCanvasRef.current.getContext('2d');
        lCtx.clearRect(0, 0, width, height);
        lCtx.save();
        lCtx.translate(width, 0);
        lCtx.scale(-1, 1);
        lCtx.drawImage(videoRef.current, 0, 0, width, height);
        if (!showCleanFullOccluderRef.current) {
          lCtx.drawImage(canvasRef.current, 0, 0, width, height);
        }
        lCtx.restore();

        if (showCleanFullOccluderRef.current) {
          lCtx.drawImage(canvasRef.current, 0, 0, width, height);
        }
      }

      if (isRecordingRef.current && recordingCanvasRef.current) {
        const rCtx = recordingCanvasRef.current.getContext('2d');
        rCtx.clearRect(0, 0, width, height);
        rCtx.save();
        rCtx.translate(width, 0);
        rCtx.scale(-1, 1);
        rCtx.drawImage(videoRef.current, 0, 0, width, height);
        if (!showCleanFullOccluderRef.current) {
          rCtx.drawImage(canvasRef.current, 0, 0, width, height);
        }
        rCtx.restore();

        if (showCleanFullOccluderRef.current) {
          rCtx.drawImage(canvasRef.current, 0, 0, width, height);
        }
      }
    }

    if (isAROpenRef.current && !capturedImageRef.current && !recordedVideoUrlRef.current) {
      requestRef.current = requestAnimationFrame(predictWebcam);
    }
  };

  // ==========================================
  // 6. CAMERA & CAPTURE LOGIC
  // ==========================================
  const startCamera = () => {
    setCapturedImage(null); setRecordedVideoUrl(null); recordedBlobRef.current = null;
    capturedImageRef.current = null; recordedVideoUrlRef.current = null;
    isAROpenRef.current = true;
    setShowGlassesMenu(false); setShowArDiopterControl(false);
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    if (isRecording) stopRecording();
    isAROpenRef.current = false;
    setCapturedImage(null); capturedImageRef.current = null;
    setRecordedVideoUrl(null); recordedVideoUrlRef.current = null;
    recordedBlobRef.current = null;
    clearInterval(timerIntervalRef.current);
    if (onClose) onClose();
  };

  useEffect(() => {
    // Tự động khởi chạy camera khi component được mount
    startCamera();
    
    if (videoRef.current) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true })
        .then((stream) => {
          if (!videoRef.current) return;
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            if (!videoRef.current) return;
            videoRef.current.play();
            const w = videoRef.current.videoWidth;
            const h = videoRef.current.videoHeight;

            canvasRef.current.width = w; canvasRef.current.height = h;

            if (liveCanvasRef.current) {
              liveCanvasRef.current.width = w;
              liveCanvasRef.current.height = h;
            }

            const recCanvas = document.createElement('canvas');
            recCanvas.width = w; recCanvas.height = h;
            recordingCanvasRef.current = recCanvas;

            initThreeJS(w, h);
            loadGlassesModel(activeARProduct);
            requestRef.current = requestAnimationFrame(predictWebcam);
          };
        })
        .catch((err) => {
          addLog("❌ Lỗi truy cập Camera/Microphone:", err.message);
          showToast("Không thể mở Camera. Vui lòng cấp quyền!", "error");
        });
    }

    return () => {
      isAROpenRef.current = false;
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      clearInterval(timerIntervalRef.current);
    };
  }, [activeARProduct]);

  const capturePhoto = () => {
    if (!liveCanvasRef.current) return;
    const dataUrl = liveCanvasRef.current.toDataURL('image/jpeg', 0.95);
    setCapturedImage(dataUrl);
    capturedImageRef.current = dataUrl;
    showToast('Đã chụp ảnh!', 'success');
  };

  const startRecording = () => {
    if (!recordingCanvasRef.current) return;
    chunksRef.current = [];
    recordedBlobRef.current = null;
    
    const stream = recordingCanvasRef.current.captureStream(30);

    if (videoRef.current?.srcObject) {
      const audioTracks = videoRef.current.srcObject.getAudioTracks();
      if (audioTracks.length > 0) {
        stream.addTrack(audioTracks[0].clone());
      }
    }

    const options = { mimeType: 'video/webm;codecs=vp9,opus' };
    try {
      mediaRecorderRef.current = new MediaRecorder(stream, options);
    } catch (e) {
      try {
        mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
      } catch (e2) {
        mediaRecorderRef.current = new MediaRecorder(stream);
      }
    }

    mediaRecorderRef.current.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    mediaRecorderRef.current.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      recordedBlobRef.current = blob;
      const url = URL.createObjectURL(blob);
      setRecordedVideoUrl(url);
      recordedVideoUrlRef.current = url;
    };

    mediaRecorderRef.current.start(10);
    setIsRecording(true);
    isRecordingRef.current = true;
    setRecordingTime(0);

    timerIntervalRef.current = setInterval(() => {
      setRecordingTime(prev => {
        if (prev >= 15) {
          stopRecording();
          return 15;
        }
        return prev + 1;
      });
    }, 1000);

    showToast('Đang quay video...', 'success');
  };

  const stopRecording = () => {
    if (!isRecordingRef.current) return;
    clearInterval(timerIntervalRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    isRecordingRef.current = false;
    showToast('Đã dừng quay!', 'success');
  };

  const handleDownloadTikTokStyle = async () => {
    if (capturedImage) {
      setIsDownloading(true);
      setDownloadProgress(20);
      const interval = setInterval(() => setDownloadProgress(p => p < 90 ? p + 15 : p), 200);

      try {
        const link = document.createElement('a');
        link.href = capturedImage;
        link.download = `anh-ar-${activeARProduct?._id}.jpg`;
        link.click();
        
        clearInterval(interval);
        setDownloadProgress(100);
        setTimeout(() => {
          setIsDownloading(false);
          showToast('Đã tải ảnh về thiết bị', 'success');
        }, 500);
      } catch (error) {
        clearInterval(interval);
        setIsDownloading(false);
        showToast('Lỗi tải ảnh!', 'error');
      }
    } else if (recordedVideoUrl && recordedBlobRef.current) {
      setIsDownloading(true);
      setDownloadProgress(10);

      const progressInterval = setInterval(() => {
        setDownloadProgress(prev => (prev < 80 ? prev + 8 : prev));
      }, 500);

      try {
        const formData = new FormData();
        formData.append('video', recordedBlobRef.current);

        const response = await fetch('/api/ar/convert-video', {
          method: 'POST',
          body: formData,
        });

        clearInterval(progressInterval);
        setDownloadProgress(95);

        if (!response.ok) throw new Error('Conversion failed');

        const mp4Blob = await response.blob();
        setDownloadProgress(100);

        const a = document.createElement('a');
        a.href = URL.createObjectURL(mp4Blob);
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

  const handleArDiopterChange = (val) => {
    setArDiopter(val);
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-in fade-in duration-300">
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

      <div className="p-6 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent z-10 text-white absolute top-0 w-full">
        <span className="font-bold tracking-wide flex items-center gap-2 uppercase"><div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div> PHÒNG THỬ KÍNH 3D</span>
        <button onClick={stopCamera} className="bg-white/20 hover:bg-red-500 text-white p-2 rounded-full transition-colors"><X className="w-8 h-8" /></button>
      </div>

      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {/* BUTTON ẨN/HIỆN MESH DEBUG TRÊN DI ĐỘNG */}
        {(!capturedImage && !recordedVideoUrl) && (
          <button
            onClick={() => setShowMeshDebug(!showMeshDebug)}
            className="absolute top-24 left-6 z-[200] bg-yellow-500 hover:bg-yellow-600 text-black font-black text-[9px] px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1 active:scale-95 transition-all uppercase"
          >
            <Bug className="w-3 h-3" />
            {showMeshDebug ? "Ẩn Mesh Debug" : "Hiện Mesh Debug"}
          </button>
        )}

        {/* BẢNG DIAGNOSTIC OVERLAY CUỘN TRÊN MÀN HÌNH */}
        {(!capturedImage && !recordedVideoUrl) && showMeshDebug && meshDebugData.length > 0 && (
          <div className="absolute top-[135px] left-6 z-[190] bg-black/95 backdrop-blur-md text-white p-3 rounded-2xl border border-white/20 text-[8px] max-w-[88vw] max-h-[45vh] overflow-y-auto font-mono shadow-2xl">
            <div className="font-bold border-b border-white/20 pb-1.5 mb-1.5 uppercase text-yellow-400 flex items-center justify-between">
              <span>📊 MESH DIAGNOSTICS ({meshDebugData.length})</span>
              <span className="text-[6px] text-gray-400">Vuốt cuộn dọc/ngang</span>
            </div>

            {/* WARNING ZONE */}
            {gltfWarning && (
              <div className="bg-red-950/90 border border-red-500 text-red-200 p-2 rounded-xl text-[7.5px] font-bold animate-pulse mb-3 leading-normal">
                ⚠️ {gltfWarning}
              </div>
            )}

            {/* 🩺 ANATOMICAL FITTING CALIBRATION */}
            <div className="mb-3 p-2.5 bg-blue-950/90 rounded-xl border border-blue-500/50 animate-in fade-in duration-300">
              <div className="text-blue-400 font-bold border-b border-blue-500/30 pb-1 mb-2 uppercase text-[8px] tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                🩺 TIKTOK REALISM EYE FITTING
              </div>
              <div className="space-y-1.5 text-[7.5px] leading-relaxed font-mono">
                <div>
                  <div className="text-[6.5px] text-gray-400 uppercase font-black">Lens Top Y (World):</div>
                  <div className="pl-1 text-gray-300 font-bold">{anatomicalBridgeDiagnostics.lensTopY}</div>
                </div>

                <div>
                  <div className="text-[6.5px] text-gray-400 uppercase font-black">Lens Bottom Y (World):</div>
                  <div className="pl-1 text-gray-300 font-bold">{anatomicalBridgeDiagnostics.lensBottomY}</div>
                </div>

                <div>
                  <div className="text-[6.5px] text-gray-400 uppercase font-black">Pupil Y (World Center):</div>
                  <div className="pl-1 text-yellow-400 font-bold">{anatomicalBridgeDiagnostics.pupilY}</div>
                </div>

                <div>
                  <div className="text-[6.5px] text-gray-400 uppercase font-black">Pupil Y-Ratio inside Lens:</div>
                  <div className="pl-1 text-green-400 font-bold">{(anatomicalBridgeDiagnostics.eyeVerticalRatio * 100).toFixed(2)}%</div>
                  <div className="text-[5.5px] text-gray-400 pl-1 mt-0.5 leading-normal">• Ideal: 55% - 70% (Pupil slightly above physical lens center)</div>
                </div>

                <div className="pt-1.5 border-t border-white/10 mt-1.5">
                  <div className="text-[6.5px] text-gray-400 uppercase font-black">Anatomical Y-Drop Applied:</div>
                  <div className="pl-1 text-gray-300">{anatomicalBridgeDiagnostics.appliedDrop}</div>
                </div>

                <div>
                  <div className="text-[6.5px] text-gray-400 uppercase font-black">Required Vertical Shift:</div>
                  <div className="pl-1 text-orange-400 font-bold">{anatomicalBridgeDiagnostics.deltaWorldYReq}</div>
                </div>

                <div>
                  <div className="text-[6.5px] text-gray-400 uppercase font-black">Suggested BridgeOffsetY Adjustment:</div>
                  <div className="pl-1 text-yellow-400 font-black">Local Offset Shift = {anatomicalBridgeDiagnostics.suggestedAdjustmentLocal}</div>
                  <div className="pl-1 text-gray-400 text-[6px]">• Current bridgeOffsetY = {anatomicalBridgeDiagnostics.bridgeOffsetYNew}</div>
                  <div className="pl-1 text-green-400 font-bold">• Optimal bridgeOffsetY = {parseFloat(anatomicalBridgeDiagnostics.suggestedBridgeOffsetY).toFixed(6)}</div>
                </div>
              </div>
            </div>

            {/* 📏 GLTF MODEL BOUNDING BOX DETAILS */}
            <div className="mb-3 p-2.5 bg-gray-900/90 rounded-xl border border-white/10">
              <div className="text-gray-300 font-bold border-b border-white/10 pb-1 mb-2 uppercase text-[8px] tracking-wider">
                📏 GLTF Box3 Measurements
              </div>
              <div className="space-y-1 text-[7.5px] leading-relaxed font-mono">
                <div><span className="text-gray-500">1. Original GLTF size:</span> <span className="text-gray-300 font-bold">{fittingDiagnostics.rawModelSize}</span></div>
                <div><span className="text-gray-500">2. Original Size (Excluding Temples):</span> <span className="text-yellow-500 font-bold">{fittingDiagnostics.rawSizeExcludingTemples}</span></div>
                <div className="text-[6px] text-gray-400 pl-1 leading-normal">• In-depth details:</div>
                <div className="text-[5.5px] text-gray-400 pl-2 leading-tight">- Included: {box3Diagnostics.includedExcludingTemples}</div>
                <div className="text-[5.5px] text-gray-400 pl-2 leading-tight">- Excluded (Temples): {box3Diagnostics.excludedExcludingTemples}</div>
                <div className="pt-1.5 border-t border-white/5 mt-1">
                  <div><span className="text-gray-500">- Object_5 size:</span> {box3Diagnostics.sizeObj5}</div>
                  <div><span className="text-gray-500">- Object_7 size:</span> {box3Diagnostics.sizeObj7}</div>
                  <div><span className="text-gray-500">- Object_9 size:</span> {box3Diagnostics.sizeObj9}</div>
                  <div><span className="text-gray-500">- Combined 5+9 (Frame):</span> {box3Diagnostics.size59}</div>
                  <div><span className="text-gray-500">- Combined 5+7+9:</span> {box3Diagnostics.size579}</div>
                </div>
              </div>
            </div>

            {/* 🧬 AR ANCHOR WEIGHT DETAILS */}
            <div className="mb-3 p-2.5 bg-purple-950/90 rounded-xl border border-purple-500/50">
              <div className="text-purple-400 font-bold border-b border-purple-500/30 pb-1 mb-2 uppercase text-[8px] tracking-wider">
                🧬 Anchor Blending Weights
              </div>
              <div className="space-y-1 text-[7.5px] leading-relaxed font-mono">
                <div><span className="text-gray-500">Formula:</span> <span className="text-purple-300">{anchorWeightAnalysis.formula}</span></div>
                <div><span className="text-gray-500">Weight 197 (NoseBridge):</span> <span className="text-gray-300">0.70</span></div>
                <div><span className="text-gray-500">Weight 168 (Nose Tip):</span> <span className="text-gray-300">0.25</span></div>
                <div><span className="text-gray-500">Weight EyeCenter:</span> <span className="text-gray-300">0.05</span></div>
                <div className="pt-1 border-t border-white/5 mt-1">
                  <div><span className="text-gray-400 font-bold">Anchor Root:</span> {anchorDiagnostics.glassesAnchorPos}</div>
                </div>
              </div>
            </div>

            {/* 📍 REALTIME POSITION BREAKDOWN */}
            <div className="mb-3 p-2.5 bg-gray-900/90 rounded-xl border border-white/10">
              <div className="text-gray-300 font-bold border-b border-white/10 pb-1 mb-2 uppercase text-[8px] tracking-wider">
                📍 Realtime Position Breakdown
              </div>
              <div className="space-y-1 text-[7.5px] leading-relaxed font-mono">
                <div><span className="text-gray-500">1. Blended Anchor:</span> {positionBreakdown.rawAnchor}</div>
                <div><span className="text-gray-500">2. Nose Fit Offset (Z):</span> {positionBreakdown.afterDepthOffset}</div>
                <div><span className="text-gray-500">3. Head Yaw Offset:</span> {positionBreakdown.afterNoseOffset}</div>
                <div><span className="text-gray-500">4. Pitch Offset (Y/Z):</span> {positionBreakdown.afterVerticalOffset}</div>
                <div className="pt-1 border-t border-white/5 mt-1">
                  <div className="text-green-400 font-bold">5. Target Pos: {positionBreakdown.afterSmoothing}</div>
                  <div className="text-yellow-400 font-bold">6. Smooth Lerp: {positionBreakdown.finalPosition}</div>
                </div>
              </div>
            </div>

            {/* 📈 REAL-TIME TRACKING METRICS */}
            <div className="mb-3 p-2.5 bg-gray-900/90 rounded-xl border border-white/10">
              <div className="text-gray-300 font-bold border-b border-white/10 pb-1 mb-2 uppercase text-[8px] tracking-wider">
                📈 Tracking responsiveness
              </div>
              <div className="space-y-1 text-[7.5px] leading-relaxed font-mono">
                <div><span className="text-gray-500">posDeltaX:</span> {anatomicalBridgeDiagnostics.posDeltaX} <span className="text-gray-500">| LERP_X:</span> <span className="text-yellow-400">{anatomicalBridgeDiagnostics.lerpX}</span></div>
                <div><span className="text-gray-500">posDeltaY:</span> {anatomicalBridgeDiagnostics.posDeltaY} <span className="text-gray-500">| LERP_Y:</span> <span className="text-yellow-400">{anatomicalBridgeDiagnostics.lerpY}</span></div>
                <div><span className="text-gray-500">posDeltaZ:</span> {anatomicalBridgeDiagnostics.posDeltaZ} <span className="text-gray-500">| LERP_Z:</span> <span className="text-yellow-400">{anatomicalBridgeDiagnostics.lerpZ}</span></div>
                <div><span className="text-gray-500">rotDelta:</span> {anatomicalBridgeDiagnostics.rotDelta} <span className="text-gray-500">| SLERP:</span> <span className="text-cyan-400">{anatomicalBridgeDiagnostics.slerpRot}</span></div>
              </div>
            </div>

            {/* 🛡️ OCCLUSIONS PASSES DIAGNOSTICS */}
            <div className="mb-3 p-2.5 bg-gray-900/90 rounded-xl border border-white/10">
              <div className="text-gray-300 font-bold border-b border-white/10 pb-1 mb-2 uppercase text-[8px] tracking-wider">
                🛡️ Occlusion Rendering Passes
              </div>
              <div className="space-y-1 text-[7.5px] leading-relaxed font-mono">
                <div><span className="text-gray-500">Main Occluder Visible:</span> <span className="text-gray-300">{anatomicalBridgeDiagnostics.occluderVisible}</span></div>
                <div><span className="text-gray-500">Full Occluder Visible:</span> <span className="text-gray-300">{anatomicalBridgeDiagnostics.fullOccluderVisible}</span></div>
                <div><span className="text-gray-500">renderOrder:</span> Main={anatomicalBridgeDiagnostics.occluderRenderOrder} Full={anatomicalBridgeDiagnostics.fullOccluderRenderOrder}</div>
                <div><span className="text-gray-500">depthWrite:</span> Main={anatomicalBridgeDiagnostics.occluderDepthWrite}</div>
                <div><span className="text-gray-500">colorWrite:</span> Main={anatomicalBridgeDiagnostics.occluderColorWrite}</div>
                <div className="pt-1 mt-1 border-t border-white/5"><span className="text-gray-500">Mode:</span> <span className="text-green-400 font-bold">{anatomicalBridgeDiagnostics.occluderMode}</span></div>
                <div><span className="text-gray-500">Near Side:</span> <span className="text-cyan-400 font-bold">{anatomicalBridgeDiagnostics.nearSide}</span></div>
                <div><span className="text-gray-500">Far Side:</span> <span className="text-orange-400 font-bold">{anatomicalBridgeDiagnostics.farSide}</span></div>
                <div><span className="text-gray-500">Visible Left:</span> {anatomicalBridgeDiagnostics.visibleTempleLengthLeft} <span className="text-gray-500">| Right:</span> {anatomicalBridgeDiagnostics.visibleTempleLengthRight}</div>
              </div>
            </div>

            {/* 🦻 TEMPLE / HANDLES STRUCTURE */}
            <div className="mb-3 p-2.5 bg-gray-900/90 rounded-xl border border-white/10">
              <div className="text-gray-300 font-bold border-b border-white/10 pb-1 mb-2 uppercase text-[8px] tracking-wider">
                🦻 Temple Mesh Detections
              </div>
              <div className="space-y-1 text-[7.5px] leading-relaxed font-mono">
                <div><span className="text-gray-500">Left Temple Mesh:</span> <span className="text-gray-300">{anatomicalBridgeDiagnostics.leftTempleMeshes}</span></div>
                <div><span className="text-gray-500">Right Temple Mesh:</span> <span className="text-gray-300">{anatomicalBridgeDiagnostics.rightTempleMeshes}</span></div>
                <div><span className="text-gray-500">Both Temples Mesh:</span> <span className="text-gray-300">{anatomicalBridgeDiagnostics.bothTempleMeshes}</span></div>
                <div className="text-[6px] text-gray-500 border-t border-white/5 pt-1 mt-1 leading-normal">
                  Detailed diagnostics: {anatomicalBridgeDiagnostics.templeDiagnosticsText}
                </div>
              </div>
            </div>

            {/* 🧭 ADAPTIVE SMOOTHING TARGETS */}
            <div className="mb-3 p-2.5 bg-gray-900/90 rounded-xl border border-white/10">
              <div className="text-gray-300 font-bold border-b border-white/10 pb-1 mb-2 uppercase text-[8px] tracking-wider">
                🧭 Adaptive Smoothing Targets
              </div>
              <div className="space-y-1 text-[7.5px] leading-relaxed font-mono">
                <div className="pt-1 pb-1 border-b border-white/5 text-red-300 font-bold uppercase">Temple Anchor Debug: {showTempleAnchorDebug ? "ON" : "OFF"}</div>
                <div><span className="text-gray-500">faceWidth:</span> <span className="text-yellow-400">{templeAnchorDiagnostics.faceWidth}</span></div>
                <div><span className="text-gray-500">yawDegrees:</span> <span className="text-yellow-400">{templeAnchorDiagnostics.yawDegrees}</span></div>
                <div><span className="text-gray-500">leftApprox:</span> <span className="text-red-400">{templeAnchorDiagnostics.leftTempleApprox}</span></div>
                <div><span className="text-gray-500">rightApprox:</span> <span className="text-blue-400">{templeAnchorDiagnostics.rightTempleApprox}</span></div>
                <div><span className="text-gray-500">sideOffset:</span> {templeAnchorDiagnostics.sideOffset} <span className="text-gray-500">| backOffset:</span> {templeAnchorDiagnostics.backOffset}</div>
                <div><span className="text-gray-500">Target Lerp X:</span> {anatomicalBridgeDiagnostics.targetLerpX}</div>
                <div><span className="text-gray-500">Target Lerp Y:</span> {anatomicalBridgeDiagnostics.targetLerpY}</div>
                <div><span className="text-gray-500">Target Lerp Z:</span> {anatomicalBridgeDiagnostics.targetLerpZ}</div>
                <div><span className="text-gray-500">Target Slerp:</span> {anatomicalBridgeDiagnostics.targetSlerp}</div>
              </div>
            </div>

            {/* 👂 TEMPLE FADE & LOCAL CLIPPING */}
            <div className="p-2.5 bg-gray-900/90 rounded-xl border border-white/10">
              <div className="text-gray-300 font-bold border-b border-white/10 pb-1 mb-2 uppercase text-[8px] tracking-wider">
                👂 Temple Fade & Hiding
              </div>
              <div className="space-y-1 text-[7.5px] leading-relaxed font-mono">
                <div><span className="text-gray-500">Head Yaw:</span> <span className="text-yellow-400 font-bold">{anatomicalBridgeDiagnostics.yawDegrees}°</span></div>
                <div><span className="text-gray-500">Temple Fade Factor:</span> <span className="text-green-400 font-bold">{anatomicalBridgeDiagnostics.templeFadeFactor}</span></div>
                <div><span className="text-gray-500">Object_7 Opacity:</span> <span className="text-cyan-400 font-bold">{anatomicalBridgeDiagnostics.object7Opacity}</span></div>
                <div><span className="text-gray-500">Object_7 Forced Hidden:</span> <span className="text-red-500 font-bold">false</span></div>
                <div className="text-[6.5px] text-gray-400 mt-1 border-t border-white/5 pt-1 leading-normal">Legacy temple fade is disabled in clean render mode.</div>
                <div className="text-[6.5px] text-gray-400 leading-normal">• Object_7 Local Clipping: DISABLED (using full handles length)</div>
                <div className="pt-1.5 border-t border-white/5 mt-1 text-yellow-400 font-bold">🛠️ DEPTH CALIBRATION DETAILS:</div>
                <div><span className="text-gray-500">Video Mirrored:</span> <span className="text-green-400 font-bold">TRUE (CSS ScaleX)</span></div>
                <div><span className="text-gray-500">Canvas Mirrored:</span> <span className="text-green-400 font-bold">TRUE (CSS ScaleX)</span></div>
                <div><span className="text-gray-500">Left Temple Expected:</span> <span className="text-cyan-400 font-bold">{parseFloat(anatomicalBridgeDiagnostics.yawDegrees) > 0 ? "Hidden (False)" : "Visible (True)"}</span></div>
                <div><span className="text-gray-500">Right Temple Expected:</span> <span className="text-cyan-400 font-bold">{parseFloat(anatomicalBridgeDiagnostics.yawDegrees) > 0 ? "Visible (True)" : "Hidden (False)"}</span></div>
              </div>
            </div>

            {/* GLTF TREE */}
            <div className="mt-3 p-2 bg-black/60 rounded-lg border border-white/10 font-mono text-[7px] text-green-400 leading-tight overflow-x-auto whitespace-pre">
              <div className="font-bold border-b border-green-500/30 pb-0.5 mb-1 text-[7.5px] text-green-300 uppercase">🌳 GLTF Hierarchical Tree</div>
              {gltfTree}
            </div>

            {/* DIAGNOSTIC SCREENSHOT DATA */}
            <div className="mt-3 p-2.5 bg-blue-950/40 rounded-xl border border-blue-500/30 text-[7px] space-y-1.5 select-all">
              <div className="text-blue-300 font-bold uppercase text-[7.5px] border-b border-blue-500/20 pb-0.5 mb-1 flex items-center justify-between">
                <span>📸 SCREENSHOT DATA</span>
                <span className="text-gray-400 text-[6px]">Sao chép chụp màn hình</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-gray-300">
                <div>Scale: {glassesModelRef.current ? glassesModelRef.current.scale.x.toFixed(6) : 'N/A'}</div>
                <div>Pos: {glassesModelRef.current ? `${glassesModelRef.current.position.x.toFixed(3)}, ${glassesModelRef.current.position.y.toFixed(3)}, ${glassesModelRef.current.position.z.toFixed(3)}` : 'N/A'}</div>
                <div>Yaw: {anatomicalBridgeDiagnostics.yawDegrees}°</div>
                <div>Obj7 Opacity: {anatomicalBridgeDiagnostics.object7Opacity}</div>
              </div>
            </div>
          </div>
        )}

        {/* CẦU NỐI WEB CAM FEED VÀ ba CANVAS */}
        {/* video: Nhận luồng webcam thô (ẨN) */}
        <video ref={videoRef} playsInline muted style={{ display: 'none' }} />
        {/* canvas: ThreeJS render 3D (ẨN) */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        {/* liveCanvas: Hiển thị giao diện thực tế (Composite của video + 3D, lật gương) */}
        <canvas ref={liveCanvasRef} className="w-full h-full object-cover select-none" />

        {faceFitHint && !capturedImage && !recordedVideoUrl && !isAiLoading && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 max-w-[82vw] rounded-full bg-black/70 px-4 py-2 text-center text-[11px] font-black uppercase tracking-wide text-white shadow-xl border border-white/15 backdrop-blur-md">
            {faceFitHint}
          </div>
        )}

        {/* THANH TRẠNG THÁI LOADING MODEL BAN ĐẦU */}
        {isAiLoading && (
          <div className="absolute inset-0 bg-black flex flex-col items-center justify-center gap-4 z-[99]">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
            <span className="text-white text-xs font-black tracking-widest uppercase">ĐANG TẢI AI FACE TRACKER...</span>
          </div>
        )}

        {/* NÚT THOÁT ĐĂNG KÝ HÀM QUAY/CHỤP */}
        {isRecording && (
          <div className="absolute top-24 right-6 bg-red-600/90 text-white font-black text-[10px] px-4 py-2 rounded-full shadow-lg flex items-center gap-1.5 animate-pulse uppercase tracking-wider z-20">
            <div className="w-2.5 h-2.5 bg-white rounded-full animate-ping"></div>
            <span>REC • {formatTime(recordingTime)} / 00:15</span>
          </div>
        )}

        {/* SLIDER ĐIỀU CHỈNH ĐỘ CẬN TẠM THỜI TẠI RUNTIME */}
        {showArDiopterControl && (
          <div className="absolute bottom-36 left-1/2 transform -translate-x-1/2 bg-black/80 backdrop-blur-md px-6 py-4 rounded-[32px] border border-white/20 z-40 flex flex-col items-center w-48 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <button onClick={() => setShowArDiopterControl(false)} className="absolute top-4 right-4 text-white/50 hover:text-white transition"><X className="w-4 h-4" /></button>
            <p className="text-[10px] font-black tracking-widest opacity-60 mb-2 mt-2 uppercase flex items-center gap-1"><Sparkles className="w-3 h-3 text-blue-400" /> Độ Cận</p>
            <p className="font-black text-blue-400 text-3xl mb-4 leading-none">{arDiopter > 0 ? `-${arDiopter.toFixed(2)}` : '0.00'}</p>
            <input type="range" min="0" max="10" step="0.25" value={arDiopter} onChange={(e) => handleArDiopterChange(parseFloat(e.target.value))} className="w-28 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500 mb-3" />
            <div className="w-full h-px bg-white/10 mb-2"></div>
            <p className="text-[9px] font-bold opacity-50 uppercase tracking-widest">MỜ: <span className="text-yellow-400">{arDiopter * 2}PX</span></p>
          </div>
        )}

        {/* MÀN HÌNH PREVIEW SAU KHI CHỤP/QUAY */}
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

        {/* 📐 EXPERIMENT 1 UI PANEL */}
        {(!capturedImage && !recordedVideoUrl) && (
          <div className="absolute top-24 right-6 z-[200] flex flex-col gap-2 max-w-[170px] bg-black/80 backdrop-blur-md p-2 rounded-2xl border border-white/10">
            <div className="text-[7px] text-gray-400 font-bold uppercase border-b border-white/10 pb-0.5 mb-1">🧪 EXPERIMENTS</div>
            
            <button
              onClick={() => {
                const nextVal = !showFullGlbTest;
                setShowFullGlbTest(nextVal);
                if (nextVal) {
                  setActiveTest("NONE");
                  setShowOccluderDebug(false);
                  setShowTempleOccluderDebug(false);
                  setShowCleanFullOccluder(false);
                  setShowProduction2Pass(false);
                  setShowPass1MeshAudit(false);
                  setShowPass2Interference(false);
                  setShowOccluderWireframe(false);
                  showToast("Kích hoạt EXPERIMENT 1!", "warning");
                } else {
                  showToast("Đã tắt EXPERIMENT 1!", "success");
                }
              }}
              className={`py-1 rounded text-[7px] font-bold uppercase transition-all ${
                showFullGlbTest
                  ? "bg-orange-600 text-white shadow-md shadow-orange-500/20"
                  : "bg-white/5 text-gray-300 hover:bg-white/10"
              }`}
            >
              FULL GLB TEST: {showFullGlbTest ? "ON" : "OFF"}
            </button>

            <button
              onClick={() => {
                const nextVal = !showCleanFullOccluder;
                setShowCleanFullOccluder(nextVal);
                if (nextVal) {
                  setShowFullGlbTest(false);
                  setShowProduction2Pass(false);
                  setShowPass1MeshAudit(false);
                  setShowPass2Interference(false);
                  setShowOccluderWireframe(false);
                  setActiveTest("NONE");
                  setShowOccluderDebug(false);
                  setShowTempleOccluderDebug(false);
                  showToast("Kích hoạt CLEAN FULL OCCLUDER!", "warning");
                } else {
                  showToast("Đã tắt CLEAN FULL OCCLUDER!", "success");
                }
              }}
              className={`py-1 rounded text-[7px] font-bold uppercase transition-all ${
                showCleanFullOccluder
                  ? "bg-purple-600 text-white shadow-md shadow-purple-500/20"
                  : "bg-white/5 text-gray-300 hover:bg-white/10"
              }`}
            >
              CLEAN FULL OCCLUDER: {showCleanFullOccluder ? "ON" : "OFF"}
            </button>

            <button
              onClick={() => {
                const nextVal = !showProduction2Pass;
                setShowProduction2Pass(nextVal);
                if (nextVal) {
                  setShowCleanFullOccluder(false);
                  setShowFullGlbTest(false);
                  setShowPass1MeshAudit(false);
                  setShowPass2Interference(false);
                  setShowOccluderWireframe(false);
                  setActiveTest("NONE");
                  setShowOccluderDebug(false);
                  setShowTempleOccluderDebug(false);
                  showToast("Kích hoạt PRODUCTION 2-PASS!", "warning");
                } else {
                  showToast("Đã tắt PRODUCTION 2-PASS!", "success");
                }
              }}
              className={`py-1 rounded text-[7px] font-bold uppercase transition-all ${
                showProduction2Pass
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                  : "bg-white/5 text-gray-300 hover:bg-white/10"
              }`}
            >
              PRODUCTION 2-PASS: {showProduction2Pass ? "ON" : "OFF"}
            </button>

            <button
              onClick={() => {
                const nextVal = !showPass1MeshAudit;
                setShowPass1MeshAudit(nextVal);
                if (nextVal) {
                  setShowCleanFullOccluder(false);
                  setShowFullGlbTest(false);
                  setShowProduction2Pass(false);
                  setShowPass2Interference(false);
                  setShowOccluderWireframe(false);
                  setActiveTest("NONE");
                  setShowOccluderDebug(false);
                  setShowTempleOccluderDebug(false);
                  showToast("Kích hoạt PASS 1 MESH AUDIT!", "warning");
                } else {
                  showToast("Đã tắt PASS 1 MESH AUDIT!", "success");
                }
              }}
              className={`py-1 rounded text-[7px] font-bold uppercase transition-all ${
                showPass1MeshAudit
                  ? "bg-cyan-600 text-white shadow-md shadow-cyan-500/20"
                  : "bg-white/5 text-gray-300 hover:bg-white/10"
              }`}
            >
              PASS1 MESH AUDIT: {showPass1MeshAudit ? "ON" : "OFF"}
            </button>

            <button
              onClick={() => {
                const nextVal = !showPass2Interference;
                setShowPass2Interference(nextVal);
                if (nextVal) {
                  setShowCleanFullOccluder(false);
                  setShowFullGlbTest(false);
                  setShowProduction2Pass(false);
                  setShowPass1MeshAudit(false);
                  setShowOccluderWireframe(false);
                  setActiveTest("NONE");
                  setShowOccluderDebug(false);
                  setShowTempleOccluderDebug(false);
                  showToast("Kích hoạt PASS 2 INTERFERENCE AUDIT!", "warning");
                } else {
                  showToast("Đã tắt PASS 2 INTERFERENCE AUDIT!", "success");
                }
              }}
              className={`py-1 rounded text-[7px] font-bold uppercase transition-all ${
                showPass2Interference
                  ? "bg-red-600 text-white shadow-md shadow-red-500/20"
                  : "bg-white/5 text-gray-300 hover:bg-white/10"
              }`}
            >
              PASS2 INTERFERENCE: {showPass2Interference ? "ON" : "OFF"}
            </button>

            {showPass2Interference && (
              <div className="flex flex-col gap-1 pl-2 border-l border-red-500/30">
                <button
                  onClick={() => {
                    const nextVal = !pass1OnlyFreeze;
                    setPass1OnlyFreeze(nextVal);
                    if (nextVal) {
                      setPass1ThenPass2NoClear(false);
                      showToast("FREEZE PASS 1 active!", "warning");
                    }
                  }}
                  className={`py-0.5 rounded text-[6px] font-bold uppercase transition-all ${
                    pass1OnlyFreeze
                      ? "bg-orange-600 text-white"
                      : "bg-white/10 text-gray-400 hover:bg-white/20"
                  }`}
                >
                  PASS1 FREEZE: {pass1OnlyFreeze ? "ON" : "OFF"}
                </button>

                <button
                  onClick={() => {
                    const nextVal = !pass1ThenPass2NoClear;
                    setPass1ThenPass2NoClear(nextVal);
                    if (nextVal) {
                      setPass1OnlyFreeze(false);
                      showToast("NO CLEAR DEPTH active!", "warning");
                    }
                  }}
                  className={`py-0.5 rounded text-[6px] font-bold uppercase transition-all ${
                    pass1ThenPass2NoClear
                      ? "bg-yellow-600 text-white"
                      : "bg-white/10 text-gray-400 hover:bg-white/20"
                  }`}
                >
                  NO CLEAR DEPTH: {pass1ThenPass2NoClear ? "ON" : "OFF"}
                </button>
              </div>
            )}

            <button
              onClick={() => {
                const nextVal = !showTempleOccluderDebug;
                setShowTempleOccluderDebug(nextVal);
                if (nextVal) {
                  setActiveTest("NONE");
                  setShowOccluderDebug(false);
                  setShowFullGlbTest(false);
                  setShowCleanFullOccluder(false);
                  setShowProduction2Pass(false);
                  setShowPass1MeshAudit(false);
                  setShowPass2Interference(false);
                  setShowOccluderWireframe(false);
                  showToast("Kích hoạt thí nghiệm occluder!", "warning");
                } else {
                  showToast("Đã tắt thí nghiệm!", "success");
                }
              }}
              className={`py-1 rounded text-[7px] font-bold uppercase transition-all ${
                showTempleOccluderDebug
                  ? "bg-green-600 text-white shadow-md shadow-green-500/20"
                  : "bg-white/5 text-gray-300 hover:bg-white/10"
              }`}
            >
              TEMPLE DET {showTempleOccluderDebug ? "ON" : "OFF"}
            </button>

            <button
              onClick={() => {
                const nextVal = !showTempleAnchorDebug;
                setShowTempleAnchorDebug(nextVal);
                showToast(nextVal ? "TEMPLE ANCHOR DEBUG ON" : "TEMPLE ANCHOR DEBUG OFF", nextVal ? "warning" : "success");
              }}
              className={`py-1 rounded text-[7px] font-bold uppercase transition-all ${
                showTempleAnchorDebug
                  ? "bg-red-600 text-white shadow-md shadow-red-500/20"
                  : "bg-white/5 text-gray-300 hover:bg-white/10"
              }`}
            >
              SHOW TEMPLE ANCHORS: {showTempleAnchorDebug ? "ON" : "OFF"}
            </button>

            <button
              onClick={() => {
                const nextVal = !showFullOccluderDebug;
                setShowFullOccluderDebug(nextVal);
                if (nextVal) {
                  setActiveTest("NONE");
                  setShowFullGlbTest(false);
                  setShowCleanFullOccluder(false);
                  setShowProduction2Pass(false);
                  setShowPass1MeshAudit(false);
                  setShowPass2Interference(false);
                  setShowOccluderWireframe(false);
                }
                showToast(nextVal ? "SHOW FULL OCCLUDER ON" : "SHOW FULL OCCLUDER OFF", nextVal ? "warning" : "success");
              }}
              className={`py-1 rounded text-[7px] font-bold uppercase transition-all ${
                showFullOccluderDebug
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                  : "bg-white/5 text-gray-300 hover:bg-white/10"
              }`}
            >
              SHOW FULL OCCLUDER: {showFullOccluderDebug ? "ON" : "OFF"}
            </button>

            <button
              onClick={() => {
                const nextVal = !showSideOccluderDebug;
                setShowSideOccluderDebug(nextVal);
                if (nextVal) {
                  setActiveTest("NONE");
                  setShowFullGlbTest(false);
                  setShowCleanFullOccluder(false);
                  setShowProduction2Pass(false);
                  setShowPass1MeshAudit(false);
                  setShowPass2Interference(false);
                  setShowOccluderWireframe(false);
                }
                showToast(nextVal ? "SHOW SIDE OCCLUDER ON" : "SHOW SIDE OCCLUDER OFF", nextVal ? "warning" : "success");
              }}
              className={`py-1 rounded text-[7px] font-bold uppercase transition-all ${
                showSideOccluderDebug
                  ? "bg-red-600 text-white shadow-md shadow-red-500/20"
                  : "bg-white/5 text-gray-300 hover:bg-white/10"
              }`}
            >
              SHOW SIDE OCCLUDER: {showSideOccluderDebug ? "ON" : "OFF"}
            </button>

            <button
              onClick={() => {
                const nextVal = !showNarrowOccluderDebug;
                setShowNarrowOccluderDebug(nextVal);
                if (nextVal) {
                  setActiveTest("NONE");
                  setShowFullGlbTest(false);
                  setShowCleanFullOccluder(false);
                  setShowProduction2Pass(false);
                  setShowPass1MeshAudit(false);
                  setShowPass2Interference(false);
                  setShowOccluderWireframe(false);
                }
                showToast(nextVal ? "SHOW NARROW OCCLUDER ON" : "SHOW NARROW OCCLUDER OFF", nextVal ? "warning" : "success");
              }}
              className={`py-1 rounded text-[7px] font-bold uppercase transition-all ${
                showNarrowOccluderDebug
                  ? "bg-green-600 text-white shadow-md shadow-green-500/20"
                  : "bg-white/5 text-gray-300 hover:bg-white/10"
              }`}
            >
              SHOW NARROW OCCLUDER: {showNarrowOccluderDebug ? "ON" : "OFF"}
            </button>

            <button
              onClick={() => {
                const nextVal = !showOccluderDebug;
                setShowOccluderDebug(nextVal);
                if (nextVal) {
                  setActiveTest("NONE");
                  setShowTempleOccluderDebug(false);
                  setShowFullGlbTest(false);
                  setShowCleanFullOccluder(false);
                  setShowProduction2Pass(false);
                  setShowPass1MeshAudit(false);
                  setShowPass2Interference(false);
                  setShowOccluderWireframe(false);
                  showToast("Kích hoạt trực quan hóa occluder!", "warning");
                } else {
                  showToast("Đã tắt trực quan hóa!", "success");
                }
              }}
              className={`py-1 rounded text-[7px] font-bold uppercase transition-all ${
                showOccluderDebug
                  ? "bg-pink-600 text-white shadow-md shadow-pink-500/20"
                  : "bg-white/5 text-gray-300 hover:bg-white/10"
              }`}
            >
              SHOW OCC {showOccluderDebug ? "ON" : "OFF"}
            </button>

            <button
              onClick={() => {
                const nextVal = !showOccluderWireframe;
                setShowOccluderWireframe(nextVal);
                if (nextVal) {
                  setShowOccluderDebug(false);
                  setShowTempleOccluderDebug(false);
                  showToast("Kích hoạt lưới Occluder Wireframe!", "warning");
                } else {
                  showToast("Đã tắt lưới Occluder Wireframe!", "success");
                }
              }}
              className={`py-1 rounded text-[7px] font-bold uppercase transition-all ${
                showOccluderWireframe
                  ? "bg-green-500 text-white shadow-md shadow-green-500/20"
                  : "bg-white/5 text-gray-300 hover:bg-white/10"
              }`}
            >
              OCC WIREFRAME: {showOccluderWireframe ? "ON" : "OFF"}
            </button>

            <button
              onClick={handleCopyCalibration}
              className="py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[7px] font-bold uppercase transition-all flex items-center justify-center gap-0.5 active:scale-95"
            >
              <Copy className="w-2.5 h-2.5" /> COPY DATA
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Thêm CheckCircle2 vào component do Lucide-react không tự động export
function CheckCircle2(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
