import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import {
  X, RefreshCw, Download, Sparkles, ChevronDown, Eye, StopCircle, ImageIcon,
  Loader2, ShoppingBag
} from 'lucide-react';
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { TRIANGULATION } from "../../constants/triangulation";
import { getCartKey } from '../../utils/cartHelper';

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

const DEFAULT_MODEL_FIT_OVERRIDE = {
  verticalOffsetRatio: 0,
  scaleMultiplier: 1,
  pitchOffsetDeg: 0,
  yawOffsetDeg: 0,
  rollOffsetDeg: 0,
  splitSingleMeshByDepth: false,
  frontDepthStartRatio: 0.68,
  templeDepthEndRatio: 0.70,
  frontCenterKeepRatio: 0.23
};

const MODEL_FIT_OVERRIDES = [
  {
    id: 'meshy-ray-ban-tortoiseshell',
    match: ['meshy_ai_ray_ban_tortoiseshell', '0618144300', 'tortoiseshell'],
    verticalOffsetRatio: -0.08,
    scaleMultiplier: 0.96,
    pitchOffsetDeg: -3,
    yawOffsetDeg: 0,
    rollOffsetDeg: 0,
    splitSingleMeshByDepth: true,
    frontDepthStartRatio: 0.66,
    templeDepthEndRatio: 0.72,
    frontCenterKeepRatio: 0.24
  }
];

const getModelFitOverride = (arUrl = '') => {
  const normalizedUrl = decodeURIComponent(String(arUrl || '')).toLowerCase();
  const matched = MODEL_FIT_OVERRIDES.find((override) =>
    override.match?.some((token) => normalizedUrl.includes(token.toLowerCase()))
  );

  return {
    ...DEFAULT_MODEL_FIT_OVERRIDE,
    ...(matched || {}),
    id: matched?.id || 'default'
  };
};

const ENABLE_LEGACY_TEMPLE_FADE = false;
const YAW_SIDE_THRESHOLD_DEG = 8;
const USE_FACE_ATTACHED_2_5D_TEMPLES = true;
const NARROW_OCCLUDER_BACK_EXPAND = 0.22;
const NARROW_OCCLUDER_SIDE_EXPAND = 0.085;
const FAR_SIDE_OCCLUSION_STRENGTH = 1.3;
const FACE_ATTACHED_TEMPLE_SEGMENTS = 12;
const MIN_HINGE_VISIBLE_T = 0.10;
const FRONTAL_MAX_TEMPLE_VISIBLE_T = 0.30;
const FAR_SIDE_MIN_TEMPLE_VISIBLE_T = 0.025;
const FAR_SIDE_MAX_TEMPLE_VISIBLE_T = 0.10;
const FAR_SIDE_TEMPLE_FADE_T = 0.022;
const NEAR_SIDE_MIN_YAW_VISIBLE_T = 0.72;
const NEAR_SIDE_NORMAL_YAW_VISIBLE_T = 0.86;
const NEAR_SIDE_STRONG_YAW_VISIBLE_T = 0.98;
const NEAR_SIDE_MAX_TEMPLE_VISIBLE_T = NEAR_SIDE_STRONG_YAW_VISIBLE_T;
const NEAR_SIDE_FORBIDDEN_START_T = 0.42;
const MIXED_NEAR_MAX_TEMPLE_VISIBLE_T = 0.90;
const MIXED_FAR_MAX_TEMPLE_VISIBLE_T = 0.08;
const FACE_ATTACHED_TEMPLE_PITCH_THRESHOLD_DEG = 15;

// Final model-only pitch correction.
// Negative value currently lifts the GLB slightly upward in the production camera view.
// If the glasses tilt in the wrong direction, only change this constant to +5.
const GLASSES_PITCH_OFFSET_DEG = -5;
const applyFinalGlassesQuaternion = (model, baseQuaternion) => {
  if (!model || !baseQuaternion) return;
  const fitOverride = model.userData?.fitOverride || DEFAULT_MODEL_FIT_OVERRIDE;
  const pitchOffsetRad = THREE.MathUtils.degToRad(GLASSES_PITCH_OFFSET_DEG + (fitOverride.pitchOffsetDeg || 0));
  const yawOffsetRad = THREE.MathUtils.degToRad(fitOverride.yawOffsetDeg || 0);
  const rollOffsetRad = THREE.MathUtils.degToRad(fitOverride.rollOffsetDeg || 0);
  const modelOffsetQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(pitchOffsetRad, yawOffsetRad, rollOffsetRad, 'XYZ')
  );

  model.quaternion.copy(baseQuaternion.clone().multiply(modelOffsetQuat));
};

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

const getTempleSideState = (yawDegrees) => {
  if (yawDegrees > YAW_SIDE_THRESHOLD_DEG) {
    return {
      nearSide: 'LEFT',
      farSide: 'RIGHT',
      nearTemplePart: 'LEFT_TEMPLE',
      farTemplePart: 'RIGHT_TEMPLE'
    };
  }
  if (yawDegrees < -YAW_SIDE_THRESHOLD_DEG) {
    return {
      nearSide: 'RIGHT',
      farSide: 'LEFT',
      nearTemplePart: 'RIGHT_TEMPLE',
      farTemplePart: 'LEFT_TEMPLE'
    };
  }
  return {
    nearSide: 'BOTH',
    farSide: 'NONE',
    nearTemplePart: 'BOTH',
    farTemplePart: 'NONE'
  };
};

const estimateTempleVisibleLengths = (yawDegrees, nearSide, farSide) => {
  const yawAbs = Math.abs(yawDegrees);
  const nearLength = clamp(0.72 + Math.max(0, yawAbs - YAW_SIDE_THRESHOLD_DEG) / 58, 0.72, 1);
  const farLength = clamp(1 - Math.max(0, yawAbs - YAW_SIDE_THRESHOLD_DEG) / 42, 0, 1);

  if (farSide === 'LEFT') {
    return { left: farLength, right: nearLength };
  }
  if (farSide === 'RIGHT') {
    return { left: nearLength, right: farLength };
  }
  return { left: 1, right: 1 };
};

const TEMPLE_SEGMENT_COUNT = 16;
if (TEMPLE_SEGMENT_COUNT < 10) {
  console.warn(`[VirtualTryOn] Warning: TEMPLE_SEGMENT_COUNT is ${TEMPLE_SEGMENT_COUNT}, which is less than 10. Temple occlusion might look jagged.`);
}

const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const getTempleBasePart = (part) => {
  if (part === 'LEFT_TEMPLE' || part?.startsWith('LEFT_TEMPLE_')) return 'LEFT_TEMPLE';
  if (part === 'RIGHT_TEMPLE' || part?.startsWith('RIGHT_TEMPLE_')) return 'RIGHT_TEMPLE';
  if (part === 'BOTH_TEMPLES') return 'BOTH_TEMPLES';
  return null;
};

const getDebugColorForPartType = (partType) => {
  if (partType === 'FRONT_FRAME') return 0x00ff00; // green
  if (partType === 'LEFT_TEMPLE' || partType?.startsWith?.('LEFT_TEMPLE_')) return 0xff0000; // red
  if (partType === 'RIGHT_TEMPLE' || partType?.startsWith?.('RIGHT_TEMPLE_')) return 0x0000ff; // blue
  if (partType === 'LENS') return 0xffff00; // yellow
  return 0xffffff; // white
};

const getTempleSegment = (part) => {
  const match = part?.match(/_SEG_(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
};

const getTempleSegmentPartType = (basePart, segmentIndex) => `${basePart}_SEG_${segmentIndex}`;

const LEFT_FACE_MASK_LANDMARKS = [
  70, 63, 105, 66, 107,
  127, 162, 21,
  234, 93, 132,
  58, 172, 136,
  150, 149, 176,
  148, 152
];

const RIGHT_FACE_MASK_LANDMARKS = [
  300, 293, 334, 296, 336,
  356, 389, 251,
  454, 323, 361,
  288, 397, 365,
  379, 378, 400,
  377, 152
];

const LEFT_EYE_FORBIDDEN_LANDMARKS = [
  33, 133, 159, 145, 70, 63, 105, 66, 107
];

const RIGHT_EYE_FORBIDDEN_LANDMARKS = [
  263, 362, 386, 374, 300, 293, 334, 296, 336
];

const isPointInPolygon2D = (point, polygon) => {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if (((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
};

const distanceToPolygonEdge2D = (point, polygon) => {
  let minDist = Infinity;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = polygon[j].x, ay = polygon[j].y;
    const bx = polygon[i].x, by = polygon[i].y;
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 0.000001) continue;
    let t = ((point.x - ax) * dx + (point.y - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx, py = ay + t * dy;
    const dist = Math.sqrt((point.x - px) * (point.x - px) + (point.y - py) * (point.y - py));
    if (dist < minDist) minDist = dist;
  }
  return minDist;
};

const lineSegmentIntersection2D = (p, p2, q, q2) => {
  if (!p || !p2 || !q || !q2) {
    return { intersects: false, t: Infinity, u: Infinity, point: null };
  }

  const rx = p2.x - p.x;
  const ry = p2.y - p.y;
  const sx = q2.x - q.x;
  const sy = q2.y - q.y;
  const denom = rx * sy - ry * sx;

  if (Math.abs(denom) < 1e-8) {
    return { intersects: false, t: Infinity, u: Infinity, point: null };
  }

  const qpx = q.x - p.x;
  const qpy = q.y - p.y;
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * ry - qpy * rx) / denom;

  if (t < 0 || t > 1 || u < 0 || u > 1) {
    return { intersects: false, t, u, point: null };
  }

  return {
    intersects: true,
    t,
    u,
    point: {
      x: p.x + t * rx,
      y: p.y + t * ry
    }
  };
};

const findFirstTempleFaceIntersectionT = (templeLineStart2D, templeLineEnd2D, facePolygon2D) => {
  if (!templeLineStart2D || !templeLineEnd2D || !Array.isArray(facePolygon2D) || facePolygon2D.length < 3) {
    return { found: false, cutT: null, cutPoint: null };
  }

  let bestT = Infinity;
  let bestPoint = null;

  for (let i = 0, j = facePolygon2D.length - 1; i < facePolygon2D.length; j = i++) {
    const edgeStart = facePolygon2D[j];
    const edgeEnd = facePolygon2D[i];
    const hit = lineSegmentIntersection2D(templeLineStart2D, templeLineEnd2D, edgeStart, edgeEnd);

    // Ignore extremely early hits at the hinge because the hinge itself often sits on the face contour.
    if (hit.intersects && hit.t > 0.03 && hit.t < bestT) {
      bestT = hit.t;
      bestPoint = hit.point;
    }
  }

  if (!Number.isFinite(bestT)) {
    return { found: false, cutT: null, cutPoint: null };
  }

  return {
    found: true,
    cutT: clamp(bestT, 0, 1),
    cutPoint: bestPoint
  };
};

const findEarliestTempleBoundaryIntersectionT = (templeLineStart2D, templeLineEnd2D, polygons = []) => {
  let best = { found: false, cutT: null, cutPoint: null, polygonIndex: -1 };

  polygons.forEach((polygon, polygonIndex) => {
    if (!Array.isArray(polygon) || polygon.length < 3) return;

    const hit = findFirstTempleFaceIntersectionT(templeLineStart2D, templeLineEnd2D, polygon);
    if (!hit.found) return;

    if (!best.found || hit.cutT < best.cutT) {
      best = {
        ...hit,
        polygonIndex
      };
    }
  });

  return best;
};

const getTempleSegmentScreenState = (mesh, projectFn, hinge2D, ear2D, fallbackT) => {
  if (!mesh?.geometry || !projectFn || !hinge2D || !ear2D) {
    return { screenPoint: null, segmentT: fallbackT };
  }

  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
  if (!mesh.geometry.boundingSphere) {
    return { screenPoint: null, segmentT: fallbackT };
  }

  const center3D = mesh.geometry.boundingSphere.center.clone();
  mesh.localToWorld(center3D);
  const screenPoint = projectFn(center3D);
  if (!screenPoint) {
    return { screenPoint: null, segmentT: fallbackT };
  }

  const lineX = ear2D.x - hinge2D.x;
  const lineY = ear2D.y - hinge2D.y;
  const lineLengthSq = lineX * lineX + lineY * lineY;
  if (lineLengthSq < 1e-8) {
    return { screenPoint, segmentT: fallbackT };
  }

  const segX = screenPoint.x - hinge2D.x;
  const segY = screenPoint.y - hinge2D.y;
  const segmentT = clamp((segX * lineX + segY * lineY) / lineLengthSq, 0, 1);

  return { screenPoint, segmentT };
};

const getTempleEyeBandOpacity = (screenPoint, eyeBand) => {
  if (!screenPoint || !eyeBand) {
    return 1;
  }

  const softMargin = eyeBand.softMargin ?? 0.035;

  if (screenPoint.y < eyeBand.top) {
    const overflow = eyeBand.top - screenPoint.y;
    return clamp(1 - smoothstep(0, softMargin, overflow), 0, 1);
  }

  if (screenPoint.y > eyeBand.bottom) {
    const overflow = screenPoint.y - eyeBand.bottom;
    return clamp(1 - smoothstep(0, softMargin, overflow), 0, 1);
  }

  return 1;
};

const getTempleSegmentOpacity = (part, templeSideState, yawDegrees, templeBoundaryModel, faceMaskModel, mesh) => {
  const basePart = getTempleBasePart(part);
  const segmentIndex = getTempleSegment(part);
  if (!basePart || segmentIndex === null) return 1;

  const isLeft = basePart === 'LEFT_TEMPLE';
  const segmentFallbackT = clamp(segmentIndex / (TEMPLE_SEGMENT_COUNT - 1), 0, 1);

  const hingeApprox = isLeft ? templeBoundaryModel?.leftHingeApprox : templeBoundaryModel?.rightHingeApprox;
  const estimatedEar = isLeft ? templeBoundaryModel?.leftEstimatedEar : templeBoundaryModel?.rightEstimatedEar;
  const faceBoundary = isLeft ? templeBoundaryModel?.leftFaceBoundary : templeBoundaryModel?.rightFaceBoundary;
  const polygon = isLeft ? faceMaskModel?.leftPolygon : faceMaskModel?.rightPolygon;
  const projectFn = faceMaskModel?.projectWorldToScreen;

  let hinge2D = null;
  let ear2D = null;
  if (hingeApprox && estimatedEar && projectFn) {
    hinge2D = projectFn(hingeApprox);
    ear2D = projectFn(estimatedEar);
  }

  const { screenPoint, segmentT } = getTempleSegmentScreenState(
    mesh,
    projectFn,
    hinge2D,
    ear2D,
    segmentFallbackT
  );

  const yawAbs = Math.abs(yawDegrees);
  const yawStrength = clamp((yawAbs - 6) / 14, 0, 1);
  const pitchStrengthRaw = faceMaskModel?.pitchTempleHideStrength ?? 0;
  const eyeBandOpacityRaw = getTempleEyeBandOpacity(screenPoint, faceMaskModel?.eyeBand);
  const eyeBandStrengthRaw = 1 - eyeBandOpacityRaw;

  // Mode separation:
  // 1) YAW MODE: head is turned left/right. Protect near-side temple. Do not apply global pitch fail-safe to near side.
  // 2) FRONTAL PITCH MODE: head is roughly frontal but tilted up/down. Apply pitch/eye-band guard to both temples.
  const isYawMode =
    !!templeSideState &&
    templeSideState.nearSide !== 'BOTH' &&
    yawAbs > YAW_SIDE_THRESHOLD_DEG;

  const isFrontalPitchMode = !isYawMode;

  const isNearTempleInYawMode =
    isYawMode &&
    basePart === templeSideState.nearTemplePart;

  const isFarTempleInYawMode =
    isYawMode &&
    basePart === templeSideState.farTemplePart;

  // In yaw mode, near-side is the visible side. Keep it stable and do not let pitch guards delete it.
  if (isNearTempleInYawMode) {
    return 1;
  }

  // In yaw mode, only the far-side temple should be occluded.
  if (isYawMode && !isFarTempleInYawMode) {
    return 1;
  }

  // In frontal pitch mode, pitch/eye-band may affect both temples.
  // In yaw mode, pitch/eye-band are disabled; far side uses yaw/intersection/mask only.
  const pitchStrength = isFrontalPitchMode ? pitchStrengthRaw : 0;
  const eyeBandOpacity = isFrontalPitchMode ? eyeBandOpacityRaw : 1;
  const eyeBandStrength = isFrontalPitchMode ? eyeBandStrengthRaw : 0;

  const shouldRunTempleCut =
    isFarTempleInYawMode ||
    (isFrontalPitchMode && (pitchStrength > 0.02 || eyeBandStrength > 0.02));

  if (!shouldRunTempleCut) {
    return eyeBandOpacity;
  }

  const effectStrength = isYawMode
    ? yawStrength
    : clamp(Math.max(pitchStrength, eyeBandStrength), 0, 1);

  // If the face is extremely pitched up/down while frontal, temple placement is unreliable. Keep frame/lens only.
  if (isFrontalPitchMode && pitchStrength > 0.92) {
    return 0;
  }

  if (effectStrength <= 0.001) {
    return eyeBandOpacity;
  }

  // --- Fallback boundary opacity: old 3D hinge -> ear projection. Used when 2D intersection cannot be found. ---
  let boundaryOpacity = 1;
  if (hingeApprox && estimatedEar && faceBoundary) {
    const lineDir = new THREE.Vector3().subVectors(estimatedEar, hingeApprox);
    const lineLengthSq = lineDir.lengthSq();
    if (lineLengthSq > 0.00001) {
      const toBoundary = new THREE.Vector3().subVectors(faceBoundary, hingeApprox);
      let boundaryT = toBoundary.dot(lineDir) / lineLengthSq;
      boundaryT = clamp(boundaryT, 0.15, 0.85);
      const segmentT3D = segmentFallbackT;
      const effectiveBoundaryT = clamp(boundaryT - 0.22, 0.22, 0.58);
      boundaryOpacity = 1 - smoothstep(
        effectiveBoundaryT - 0.04,
        effectiveBoundaryT + 0.20,
        segmentT3D
      );
      boundaryOpacity = clamp(boundaryOpacity, 0, 1);
      if (effectStrength > 0.75 && segmentT3D > effectiveBoundaryT + 0.22) {
        boundaryOpacity = 0;
      }
    }
  }

  // --- Screen-space mask opacity.
  let maskOpacity = 1;
  let insideFaceMask = false;
  let edgeDist = Infinity;

  if (screenPoint && polygon && polygon.length >= 3) {
    insideFaceMask = isPointInPolygon2D(screenPoint, polygon);
    edgeDist = distanceToPolygonEdge2D(screenPoint, polygon);

    if (insideFaceMask) {
      const softEdge = 0.025;
      if (edgeDist < softEdge) {
        maskOpacity = smoothstep(0, softEdge, edgeDist) * 0.3;
      } else {
        maskOpacity = 0;
      }
    } else {
      const marginWidth = 0.015;
      if (edgeDist < marginWidth) {
        maskOpacity = smoothstep(0, marginWidth, edgeDist);
      } else {
        maskOpacity = 1;
      }
    }
  }

  // --- Intersection opacity.
  // In yaw mode, this clips the far-side temple.
  // In frontal pitch mode, this can clip both temples so they cannot hang down or point into the forehead.
  let intersectionOpacity = 1;
  let intersectionFound = false;
  let cutT = null;

  if (hinge2D && ear2D && polygon && polygon.length >= 3) {
    const intersection = findFirstTempleFaceIntersectionT(hinge2D, ear2D, polygon);
    intersectionFound = intersection.found;
    cutT = intersection.cutT;

    if (intersectionFound) {
      const fadeBefore = 0.03;
      const fadeAfter = isFrontalPitchMode && pitchStrength > 0.25 ? 0.075 : 0.12;

      if (segmentT < cutT - fadeBefore) {
        intersectionOpacity = 1;
      } else {
        intersectionOpacity = 1 - smoothstep(
          cutT - fadeBefore,
          cutT + fadeAfter,
          segmentT
        );
        intersectionOpacity = clamp(intersectionOpacity, 0, 1);
      }

      if (segmentT > cutT + fadeAfter && effectStrength > 0.45) {
        intersectionOpacity = 0;
      }

      if (segmentT > cutT + 0.06 && effectStrength > 0.35) {
        intersectionOpacity = 0;
      }
    }
  }

  // Extra fallback only for frontal pitch mode when no reliable yaw near/far side exists.
  let pitchFallbackOpacity = 1;
  if (isFrontalPitchMode && pitchStrength > 0.15 && (!intersectionFound || templeSideState?.nearSide === 'BOTH')) {
    const pitchCutT = 0.18;
    pitchFallbackOpacity = 1 - smoothstep(
      pitchCutT - 0.035,
      pitchCutT + 0.12,
      segmentT
    );
    pitchFallbackOpacity = clamp(pitchFallbackOpacity, 0, 1);

    if (segmentT > pitchCutT + 0.10 && pitchStrength > 0.35) {
      pitchFallbackOpacity = 0;
    }
  }

  const combinedOpacity = Math.min(
    intersectionFound ? intersectionOpacity : boundaryOpacity,
    maskOpacity,
    eyeBandOpacity,
    pitchFallbackOpacity
  );

  let opacity = 1 - effectStrength * (1 - combinedOpacity);

  // Global pitch temple hide is allowed only in frontal pitch mode.
  // It must not delete the near-side temple during left/right yaw.
  if (isFrontalPitchMode) {
    const globalPitchTempleOpacity = 1 - smoothstep(0.45, 0.90, pitchStrength);
    opacity = Math.min(opacity, globalPitchTempleOpacity);
  }

  if (insideFaceMask && edgeDist > 0.025 && effectStrength > 0.35) {
    opacity = 0;
  }

  if (intersectionFound && cutT !== null && segmentT > cutT + 0.10 && effectStrength > 0.45) {
    opacity = 0;
  }



  return clamp(opacity, 0, 1);
};

const isTemplePart = (part) =>
  getTempleBasePart(part) !== null;

const shouldRenderTempleInPass = (part, templeSideState, pass) => {
  const basePart = getTempleBasePart(part);
  if (!basePart) return false;
  if (!templeSideState || templeSideState.nearSide === 'BOTH') return pass === 1;
  if (basePart === 'BOTH_TEMPLES') return pass === 2;
  return pass === 1
    ? basePart === templeSideState.farTemplePart
    : basePart === templeSideState.nearTemplePart;
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

const buildTriangleSubmesh = (sourceMesh, triangleBuckets, name, partType) => {
  const sourceGeometry = sourceMesh.geometry;
  const attributeNames = Object.keys(sourceGeometry.attributes || {});
  const firstAttrName = attributeNames[0];
  const firstValues = firstAttrName ? triangleBuckets[firstAttrName] : null;

  if (!firstValues || firstValues.length === 0) return null;

  const geometry = new THREE.BufferGeometry();
  attributeNames.forEach((attrName) => {
    const sourceAttr = sourceGeometry.attributes[attrName];
    const TypedArray = sourceAttr.array.constructor;
    geometry.setAttribute(
      attrName,
      new THREE.BufferAttribute(new TypedArray(triangleBuckets[attrName]), sourceAttr.itemSize, sourceAttr.normalized)
    );
  });
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const clone = sourceMesh.clone(false);
  clone.name = name;
  clone.geometry = geometry;
  clone.material = Array.isArray(sourceMesh.material)
    ? sourceMesh.material.map((mat) => mat.clone())
    : sourceMesh.material.clone();
  clone.userData = {
    ...sourceMesh.userData,
    partType,
    splitFromSingleMesh: sourceMesh.name || 'UNNAMED'
  };
  delete clone.userData.skipProductionRender;
  delete clone.userData.skipMeshClassification;
  clone.visible = true;
  clone.frustumCulled = false;
  return clone;
};

const splitSingleMeshGlassesByDepth = (model, fitOverride) => {
  if (!model || !fitOverride?.splitSingleMeshByDepth) return null;

  const meshes = [];
  model.traverse((child) => {
    if (child.isMesh && child.geometry?.attributes?.position && !child.userData.skipProductionRender) {
      meshes.push(child);
    }
  });

  if (meshes.length !== 1) return null;

  const sourceMesh = meshes[0];
  const sourceGeometry = sourceMesh.geometry;
  const positionAttr = sourceGeometry.attributes.position;
  const indexArray = sourceGeometry.index ? sourceGeometry.index.array : null;
  const triangleCount = indexArray ? indexArray.length / 3 : Math.floor(positionAttr.count / 3);

  sourceGeometry.computeBoundingBox();
  const bbox = sourceGeometry.boundingBox;
  const size = bbox.getSize(new THREE.Vector3());
  const frontStartZ = bbox.min.z + size.z * fitOverride.frontDepthStartRatio;
  const templeEndZ = bbox.min.z + size.z * fitOverride.templeDepthEndRatio;
  const centerKeepX = size.x * fitOverride.frontCenterKeepRatio;
  const attributeNames = Object.keys(sourceGeometry.attributes || {});
  const buckets = {
    FRONT_FRAME: Object.fromEntries(attributeNames.map((name) => [name, []])),
    LEFT_TEMPLE: Object.fromEntries(attributeNames.map((name) => [name, []])),
    RIGHT_TEMPLE: Object.fromEntries(attributeNames.map((name) => [name, []]))
  };

  const pushVertex = (bucketName, vertexIndex) => {
    attributeNames.forEach((attrName) => {
      const attr = sourceGeometry.attributes[attrName];
      for (let item = 0; item < attr.itemSize; item++) {
        buckets[bucketName][attrName].push(attr.array[vertexIndex * attr.itemSize + item]);
      }
    });
  };

  let frontTriangles = 0;
  let leftTempleTriangles = 0;
  let rightTempleTriangles = 0;

  for (let tri = 0; tri < triangleCount; tri++) {
    const ia = indexArray ? indexArray[tri * 3] : tri * 3;
    const ib = indexArray ? indexArray[tri * 3 + 1] : tri * 3 + 1;
    const ic = indexArray ? indexArray[tri * 3 + 2] : tri * 3 + 2;
    const centerX = (positionAttr.getX(ia) + positionAttr.getX(ib) + positionAttr.getX(ic)) / 3;
    const centerZ = (positionAttr.getZ(ia) + positionAttr.getZ(ib) + positionAttr.getZ(ic)) / 3;
    const isFrontTriangle = centerZ >= frontStartZ || Math.abs(centerX) <= centerKeepX;
    const isTempleTriangle = centerZ <= templeEndZ && !isFrontTriangle;
    const bucketName = isFrontTriangle
      ? 'FRONT_FRAME'
      : isTempleTriangle && centerX < 0
        ? 'LEFT_TEMPLE'
        : isTempleTriangle
          ? 'RIGHT_TEMPLE'
          : 'FRONT_FRAME';

    pushVertex(bucketName, ia);
    pushVertex(bucketName, ib);
    pushVertex(bucketName, ic);

    if (bucketName === 'FRONT_FRAME') frontTriangles++;
    else if (bucketName === 'LEFT_TEMPLE') leftTempleTriangles++;
    else rightTempleTriangles++;
  }

  const splitMeshes = [
    buildTriangleSubmesh(sourceMesh, buckets.FRONT_FRAME, `${sourceMesh.name || 'mesh'}__FRONT_FRAME`, 'FRONT_FRAME'),
    buildTriangleSubmesh(sourceMesh, buckets.LEFT_TEMPLE, `${sourceMesh.name || 'mesh'}__LEFT_TEMPLE`, 'LEFT_TEMPLE'),
    buildTriangleSubmesh(sourceMesh, buckets.RIGHT_TEMPLE, `${sourceMesh.name || 'mesh'}__RIGHT_TEMPLE`, 'RIGHT_TEMPLE')
  ].filter(Boolean);

  if (splitMeshes.length < 2 || !sourceMesh.parent) return null;

  sourceMesh.visible = false;
  sourceMesh.userData.partType = 'SINGLE_MESH_SOURCE';
  sourceMesh.userData.skipProductionRender = true;
  sourceMesh.userData.skipMeshClassification = true;

  splitMeshes.forEach((mesh) => {
    sourceMesh.parent.add(mesh);
  });

  return {
    sourceMesh: sourceMesh.name || 'UNNAMED',
    sourceSize: {
      x: Number(size.x.toFixed(5)),
      y: Number(size.y.toFixed(5)),
      z: Number(size.z.toFixed(5))
    },
    frontStartZ: Number(frontStartZ.toFixed(5)),
    templeEndZ: Number(templeEndZ.toFixed(5)),
    centerKeepX: Number(centerKeepX.toFixed(5)),
    createdMeshes: splitMeshes.map((mesh) => mesh.name),
    triangles: {
      front: frontTriangles,
      leftTemple: leftTempleTriangles,
      rightTemple: rightTempleTriangles
    }
  };
};

const splitTempleMeshIntoSegments = (mesh) => {
  const sourceGeometry = mesh.geometry;
  const positionAttr = sourceGeometry?.attributes?.position;
  const basePart = getTempleBasePart(mesh.userData.partType);
  if (!positionAttr || (basePart !== 'LEFT_TEMPLE' && basePart !== 'RIGHT_TEMPLE')) return null;

  sourceGeometry.computeBoundingBox();
  const bbox = sourceGeometry.boundingBox;
  if (!bbox) return null;

  const size = new THREE.Vector3();
  bbox.getSize(size);
  const axis = size.x >= size.y && size.x >= size.z
    ? 'x'
    : size.y >= size.x && size.y >= size.z
      ? 'y'
      : 'z';
  const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const axisMin = bbox.min[axis];
  const axisMax = bbox.max[axis];
  const axisLength = axisMax - axisMin;
  if (axisLength <= 0) return null;

  const segmentIndices = Array.from({ length: TEMPLE_SEGMENT_COUNT }, (_, i) => i);
  const segmentBuckets = Object.fromEntries(
    segmentIndices.map((idx) => [idx, {}])
  );
  const attributeNames = Object.keys(sourceGeometry.attributes);
  segmentIndices.forEach((idx) => {
    attributeNames.forEach((name) => {
      segmentBuckets[idx][name] = [];
    });
  });

  const indexArray = sourceGeometry.index ? sourceGeometry.index.array : null;
  const triangleCount = indexArray ? indexArray.length / 3 : Math.floor(positionAttr.count / 3);

  const getAxisValue = (vertexIndex) => {
    if (axisIndex === 0) return positionAttr.getX(vertexIndex);
    if (axisIndex === 1) return positionAttr.getY(vertexIndex);
    return positionAttr.getZ(vertexIndex);
  };

  const getLengthProgress = (centerValue) => {
    if (axis === 'x') {
      return basePart === 'LEFT_TEMPLE'
        ? (axisMax - centerValue) / axisLength
        : (centerValue - axisMin) / axisLength;
    }
    if (axis === 'z') {
      return (axisMax - centerValue) / axisLength;
    }
    return (centerValue - axisMin) / axisLength;
  };

  const getSegmentForProgress = (progress) => {
    return clamp(Math.floor(progress * TEMPLE_SEGMENT_COUNT), 0, TEMPLE_SEGMENT_COUNT - 1);
  };

  const pushVertex = (segIndex, vertexIndex) => {
    attributeNames.forEach((name) => {
      const attr = sourceGeometry.attributes[name];
      for (let item = 0; item < attr.itemSize; item++) {
        segmentBuckets[segIndex][name].push(attr.array[vertexIndex * attr.itemSize + item]);
      }
    });
  };

  for (let tri = 0; tri < triangleCount; tri++) {
    const ia = indexArray ? indexArray[tri * 3] : tri * 3;
    const ib = indexArray ? indexArray[tri * 3 + 1] : tri * 3 + 1;
    const ic = indexArray ? indexArray[tri * 3 + 2] : tri * 3 + 2;
    const centerValue = (getAxisValue(ia) + getAxisValue(ib) + getAxisValue(ic)) / 3;
    const progress = clamp(getLengthProgress(centerValue), 0, 1);
    const segIndex = getSegmentForProgress(progress);
    pushVertex(segIndex, ia);
    pushVertex(segIndex, ib);
    pushVertex(segIndex, ic);
  }

  return segmentIndices
    .map((segIndex) => {
      const segmentPartType = getTempleSegmentPartType(basePart, segIndex);
      const firstAttrName = attributeNames[0];
      const vertexValues = firstAttrName ? segmentBuckets[segIndex][firstAttrName] : [];
      if (!vertexValues || vertexValues.length === 0) return null;

      const geometry = new THREE.BufferGeometry();
      attributeNames.forEach((name) => {
        const attr = sourceGeometry.attributes[name];
        const values = segmentBuckets[segIndex][name];
        const TypedArray = attr.array.constructor;
        geometry.setAttribute(name, new THREE.BufferAttribute(new TypedArray(values), attr.itemSize, attr.normalized));
      });
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();

      const clone = mesh.clone(false);
      clone.name = segmentPartType;
      clone.geometry = geometry;
      clone.material = Array.isArray(mesh.material)
        ? mesh.material.map((mat) => mat.clone())
        : mesh.material.clone();
      clone.userData = {
        ...mesh.userData,
        partType: segmentPartType,
        baseTemplePart: basePart,
        templeSegmentIndex: segIndex,
        splitFromTemple: mesh.name || 'UNNAMED',
        segmentAxis: axis
      };
      delete clone.userData.originalTempleTransform;
      delete clone.userData.skipProductionRender;
      clone.frustumCulled = false;
      return clone;
    })
    .filter(Boolean);
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

const getMeshMaterials = (mesh) => (Array.isArray(mesh?.material) ? mesh.material : [mesh?.material]).filter(Boolean);

const cloneMeshMaterials = (mesh) => {
  if (!mesh?.material) return;
  mesh.material = Array.isArray(mesh.material)
    ? mesh.material.map((mat) => mat?.clone?.() || mat)
    : mesh.material.clone();
};

const neutralizePhysicalGlassProps = (mat) => {
  if (!mat) return;
  if ('transmission' in mat) mat.transmission = 0;
  if ('thickness' in mat) mat.thickness = 0;
  if ('ior' in mat) mat.ior = 1.0;
  if ('envMapIntensity' in mat) mat.envMapIntensity = 0;
  if ('reflectivity' in mat) mat.reflectivity = 0;
  if ('metalness' in mat) mat.metalness = 0;
  if ('roughness' in mat) mat.roughness = 1;
  mat.needsUpdate = true;
};

const isPhysicalGlassMaterial = (mat) => {
  if (!mat) return false;
  const name = `${mat.name || ''} ${mat.map?.name || ''} ${mat.map?.image?.src || ''}`.toLowerCase();
  const hasGlassName = /glass|lens|kính|clear|transparent|crystal/.test(name);
  const hasTransmission = typeof mat.transmission === 'number' && mat.transmission > 0.01;
  const hasPhysicalProps =
    (typeof mat.thickness === 'number' && mat.thickness > 0) ||
    (typeof mat.ior === 'number' && mat.ior > 1.05) ||
    (typeof mat.opacity === 'number' && mat.opacity < 0.75) ||
    mat.transparent === true ||
    (typeof mat.alphaTest === 'number' && mat.alphaTest > 0.1);

  return hasGlassName || hasTransmission || hasPhysicalProps;
};

const isDecorativeLensOverlay = (mesh) => {
  const name = `${mesh?.name || ''} ${Array.isArray(mesh?.material)
    ? mesh.material.map((mat) => `${mat?.name || ''} ${mat?.map?.name || ''} ${mat?.map?.image?.src || ''}`).join(' ')
    : `${mesh?.material?.name || ''} ${mesh?.material?.map?.name || ''} ${mesh?.material?.map?.image?.src || ''}`}`.toLowerCase();

  return ['highlight', 'reflection', 'reflect', 'coating', 'specular', 'glare', 'shine', 'gloss', 'flare', 'overlay'].some((keyword) =>
    name.includes(keyword)
  );
};

const isTintedLensMaterial = (mat, mesh) => {
  const mapName = `${mat?.map?.name || ''} ${mat?.map?.image?.src || ''}`.toLowerCase();
  const name = `${mesh?.name || ''} ${mat?.name || ''} ${mapName}`.toLowerCase();
  const keywordTinted =
    /sunglass|sun|tint|tinted|smoke|brown|gray|grey|dark|black|blue|green|yellow|amber|polarized|gradient|mirror/.test(name);
  const color = mat?.color;
  const brightness = color
    ? (color.r + color.g + color.b) / 3
    : 1;
  const saturation = color
    ? Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b)
    : 0;
  const isDark = brightness < 0.70;
  const isStronglyColored = saturation > 0.18;

  return keywordTinted || isDark || isStronglyColored;
};

const isClearLensMaterial = (mat, mesh) => {
  if (!mat) return false;

  const mapName = `${mat?.map?.name || ''} ${mat?.map?.image?.src || ''}`.toLowerCase();
  const name = `${mesh?.name || ''} ${mat?.name || ''} ${mapName}`.toLowerCase();
  const clearKeyword =
    /clear|transparent|transparency|glass|lens|kính|trong|crystal/.test(name);
  const color = mat?.color;
  const brightness = color
    ? (color.r + color.g + color.b) / 3
    : 1;
  const saturation = color
    ? Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b)
    : 0;
  const tintedKeyword =
    /sunglass|sun|tint|tinted|smoke|brown|gray|grey|dark|black|blue|green|yellow|amber|polarized|gradient|mirror/.test(name);
  const isDark = brightness < 0.70;
  const isStronglyColored = saturation > 0.18;

  if (tintedKeyword || isDark || isStronglyColored) {
    return false;
  }

  const hasTransparentFlag = mat.transparent === true;
  const hasLowOpacity = typeof mat.opacity === 'number' && mat.opacity < 0.65;
  const hasAlphaTest = typeof mat.alphaTest === 'number' && mat.alphaTest > 0.1;
  const isBrightNeutral = brightness > 0.78 && saturation < 0.16;

  return (
    (hasTransparentFlag && hasLowOpacity) ||
    hasAlphaTest ||
    isBrightNeutral ||
    clearKeyword
  );
};

const getTintOpacityFromMaterial = (mat) => {
  const color = mat?.color;
  if (!color) return 0.18;

  const brightness = (color.r + color.g + color.b) / 3;
  return clamp(0.08 + (1 - brightness) * 0.34, 0.08, 0.38);
};

const createTintedLensMaterialFromGLB = (originalMat, opacity) => {
  const mat = new THREE.MeshPhongMaterial({
    color: originalMat?.color ? originalMat.color.clone() : new THREE.Color(0x333333),
    map: originalMat?.map || null,
    transparent: true,
    opacity,
    specular: new THREE.Color(0xffffff),
    shininess: 120,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide
  });

  mat.toneMapped = false;
  mat.needsUpdate = true;
  return mat;
};

const applyClearLensMaterial = (mesh) => {
  if (!mesh) return;

  const sourceMaterials = getMeshMaterials(mesh);
  const firstMat = sourceMaterials[0];
  const originalOpacity = firstMat?.opacity ?? 1.0;
  const targetOpacity =
    typeof originalOpacity === 'number' && originalOpacity > 0 && originalOpacity < 0.20
      ? clamp(originalOpacity, 0.04, 0.12)
      : 0.08;

  mesh.userData.skipProductionRender = false;
  mesh.userData.arLensMode = 'CLEAR_RENDERED';
  mesh.userData.clearLensOpacity = targetOpacity;

  const makeClearMat = (originalMat) => {
    const mat = new THREE.MeshPhongMaterial({
      color: originalMat?.color ? originalMat.color.clone() : new THREE.Color(0xe0f2f1), // Light blue-green tint like AR coating
      transparent: true,
      opacity: targetOpacity,
      specular: new THREE.Color(0xffffff),
      shininess: 150,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide
    });

    mat.map = null;
    mat.toneMapped = false;
    mat.needsUpdate = true;
    return mat;
  };

  mesh.material = Array.isArray(mesh.material)
    ? mesh.material.map(makeClearMat)
    : makeClearMat(mesh.material);
  mesh.visible = true;
};

const applyArLensRenderState = (mesh) => {
  if (!mesh || mesh.userData.partType !== 'LENS') return;

  if (mesh.userData.arLensMode === 'TINTED_RENDERED') {
    mesh.visible = true;
    mesh.userData.skipProductionRender = false;
    getMeshMaterials(mesh).forEach((mat) => {
      if (!mat) return;
      mat.transparent = true;
      mat.depthWrite = false;
      mat.depthTest = true;
      mat.side = THREE.DoubleSide;
      mat.toneMapped = false;
      mat.clippingPlanes = [];
      mat.needsUpdate = true;
    });
    return;
  }

  if (mesh.userData.arLensMode === 'CLEAR_RENDERED') {
    mesh.visible = true;
    mesh.userData.skipProductionRender = false;

    const targetOpacity = mesh.userData.clearLensOpacity ?? 0.08;
    getMeshMaterials(mesh).forEach((mat) => {
      if (!mat) return;
      mat.transparent = true;
      mat.opacity = targetOpacity;
      mat.depthWrite = false;
      mat.depthTest = true;
      mat.side = THREE.DoubleSide;
      mat.toneMapped = false;
      mat.clippingPlanes = [];
      mat.needsUpdate = true;
    });

    return;
  }

  mesh.visible = false;
  mesh.userData.skipProductionRender = true;
};

const auditLensMeshes = (model) => {
  const lensMeshes = [];
  const hiddenOverlayMeshes = [];
  const clearLensMeshes = [];
  const tintedLensMeshes = [];

  model?.traverse((child) => {
    if (!child.isMesh || child.userData.partType !== 'LENS') return;

    lensMeshes.push(child);
    const materials = getMeshMaterials(child);
    materials.forEach(neutralizePhysicalGlassProps);

    if (isDecorativeLensOverlay(child)) {
      child.visible = false;
      child.userData.skipProductionRender = true;
      child.userData.arLensMode = 'DECORATIVE_OVERLAY_HIDDEN';
      hiddenOverlayMeshes.push(child.name || 'UNNAMED');
      return;
    }

    const hasTintedMaterial = materials.some((mat) => isTintedLensMaterial(mat, child));
    const isClearLens = materials.every((mat) => isClearLensMaterial(mat, child));

    if (hasTintedMaterial) {
      child.visible = true;
      child.userData.skipProductionRender = false;
      child.userData.arLensMode = 'TINTED_RENDERED';
      child.material = Array.isArray(child.material)
        ? child.material.map((mat) => createTintedLensMaterialFromGLB(mat, getTintOpacityFromMaterial(mat)))
        : createTintedLensMaterialFromGLB(child.material, getTintOpacityFromMaterial(child.material));
      tintedLensMeshes.push(child.name || 'UNNAMED');
      return;
    }

    if (isClearLens) {
      applyClearLensMaterial(child);
      clearLensMeshes.push(child.name || 'UNNAMED');
      return;
    }

    applyClearLensMaterial(child);
    clearLensMeshes.push(`${child.name || 'UNNAMED'}__FALLBACK_CLEAR`);
  });

  model.userData.lensAudit = {
    totalLensCount: lensMeshes.length,
    clearLensMeshes,
    tintedLensMeshes,
    hiddenOverlayMeshes,
    lensMeshes: lensMeshes.map((mesh) => mesh.name || 'UNNAMED'),
    lensDetails: lensMeshes.map((mesh) => ({
      name: mesh.name || 'UNNAMED',
      mode: mesh.userData.arLensMode || 'UNKNOWN',
      materialNames: getMeshMaterials(mesh).map((mat) => mat.name || 'NO_MAT'),
      colors: getMeshMaterials(mesh).map((mat) =>
        mat.color ? `#${mat.color.getHexString()}` : 'NO_COLOR'
      ),
      hasMap: getMeshMaterials(mesh).map((mat) => !!mat.map)
    }))
  };

  return model.userData.lensAudit;
};

const auditArModelMeshes = (model) => {
  const fullBox = new THREE.Box3().setFromObject(model);
  const fullSize = fullBox.getSize(new THREE.Vector3());
  const rows = [];

  model?.traverse((child) => {
    if (!child.isMesh || !child.geometry?.attributes?.position) return;

    child.geometry.computeBoundingBox();
    const localBox = child.geometry.boundingBox;
    const localSize = localBox.getSize(new THREE.Vector3());
    const localCenter = localBox.getCenter(new THREE.Vector3());
    const worldBox = new THREE.Box3().setFromObject(child);
    const worldSize = worldBox.getSize(new THREE.Vector3());
    const materials = getMeshMaterials(child);
    const partType = child.userData.partType || 'UNKNOWN';

    rows.push({
      meshName: child.name || 'NO_NAME',
      materialName: materials.map((mat) => mat.name || 'NO_MAT').join(' | '),
      bboxSize: `${localSize.x.toFixed(4)}, ${localSize.y.toFixed(4)}, ${localSize.z.toFixed(4)}`,
      center: `${localCenter.x.toFixed(4)}, ${localCenter.y.toFixed(4)}, ${localCenter.z.toFixed(4)}`,
      worldSize: `${worldSize.x.toFixed(4)}, ${worldSize.y.toFixed(4)}, ${worldSize.z.toFixed(4)}`,
      partType,
      isLens: partType === 'LENS',
      isFrontFrame: partType === 'FRONT_FRAME',
      isLeftTemple: getTempleBasePart(partType) === 'LEFT_TEMPLE',
      isRightTemple: getTempleBasePart(partType) === 'RIGHT_TEMPLE',
      isBothTemples: getTempleBasePart(partType) === 'BOTH_TEMPLES',
      hiddenSource: child.userData.skipProductionRender === true,
      vertexCount: child.geometry.attributes.position.count,
      modelSize: `${fullSize.x.toFixed(4)}, ${fullSize.y.toFixed(4)}, ${fullSize.z.toFixed(4)}`
    });
  });

  return rows;
};

const createFaceAttachedTempleGeometry = () => {
  const vertexCount = (FACE_ATTACHED_TEMPLE_SEGMENTS + 1) * 2;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = [];

  for (let i = 0; i < FACE_ATTACHED_TEMPLE_SEGMENTS; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, c, b, b, c, d);
  }

  for (let i = 0; i <= FACE_ATTACHED_TEMPLE_SEGMENTS; i++) {
    const u = i / FACE_ATTACHED_TEMPLE_SEGMENTS;
    uvs[i * 4] = u;
    uvs[i * 4 + 1] = 0;
    uvs[i * 4 + 2] = u;
    uvs[i * 4 + 3] = 1;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.setDrawRange(0, FACE_ATTACHED_TEMPLE_SEGMENTS * 6);
  return geometry;
};

const getFaceAttachedTempleMaterial = (model) => {
  let sourceMaterial = null;
  const priorityPartTypes = [
    'LEFT_TEMPLE',
    'RIGHT_TEMPLE',
    'LEFT_TEMPLE_SEG_0',
    'RIGHT_TEMPLE_SEG_0',
    'BOTH_TEMPLES',
    'FRONT_FRAME'
  ];

  for (let i = 0; i < priorityPartTypes.length && !sourceMaterial; i++) {
    const partType = priorityPartTypes[i];
    model?.traverse((child) => {
      if (sourceMaterial || !child.isMesh || !child.material) return;
      if (child.userData.partType === partType || child.userData.partType?.startsWith(`${partType}_`)) {
        sourceMaterial = Array.isArray(child.material) ? child.material[0] : child.material;
      }
    });
  }

  const material = sourceMaterial
    ? sourceMaterial.clone()
    : new THREE.MeshStandardMaterial({ color: 0x202020, roughness: 0.38, metalness: 0.05 });

  material.side = THREE.DoubleSide;
  material.depthTest = true;
  material.depthWrite = true;
  material.transparent = material.transparent || false;
  material.opacity = material.opacity ?? 1.0;
  return material;
};

const getOriginalTempleMaterial = (model, side) => {
  let sourceMaterial = null;
  const sideBase = `${side}_TEMPLE`;
  const priorityMatchers = [
    (part) => part === sideBase,
    (part) => part?.startsWith(`${sideBase}_SEG_`),
    (part) => part === 'BOTH_TEMPLES',
    (part) => part === 'FRONT_FRAME'
  ];

  for (let i = 0; i < priorityMatchers.length && !sourceMaterial; i++) {
    const matches = priorityMatchers[i];
    model?.traverse((child) => {
      if (sourceMaterial || !child.isMesh || !child.material) return;
      if (matches(child.userData.partType)) {
        sourceMaterial = Array.isArray(child.material) ? child.material[0] : child.material;
      }
    });
  }

  return sourceMaterial ? sourceMaterial.clone() : null;
};

const getMaterialAuditSnapshot = (material) => {
  if (!material) return null;
  return {
    name: material.name || 'NO_MAT',
    color: material.color ? `#${material.color.getHexString()}` : 'N/A',
    hasMap: !!material.map,
    roughness: material.roughness ?? 'N/A',
    metalness: material.metalness ?? 'N/A',
    opacity: material.opacity ?? 1,
    transparent: !!material.transparent
  };
};

const collectOriginalTempleSources = (model) => {
  const sources = {
    leftSegments: [],
    rightSegments: [],
    bothTempleMeshes: [],
    leftMaterial: getOriginalTempleMaterial(model, 'LEFT'),
    rightMaterial: getOriginalTempleMaterial(model, 'RIGHT'),
    leftMaterialAudit: null,
    rightMaterialAudit: null
  };

  model?.traverse((child) => {
    if (!child.isMesh) return;
    const part = child.userData.partType;
    const basePart = getTempleBasePart(part);
    const segmentIndex = getTempleSegment(part);

    if (segmentIndex !== null && basePart === 'LEFT_TEMPLE') {
      sources.leftSegments.push(child);
    } else if (segmentIndex !== null && basePart === 'RIGHT_TEMPLE') {
      sources.rightSegments.push(child);
    } else if (basePart === 'BOTH_TEMPLES') {
      sources.bothTempleMeshes.push(child);
    }
  });

  sources.leftSegments.sort((a, b) => (a.userData.templeSegmentIndex ?? 0) - (b.userData.templeSegmentIndex ?? 0));
  sources.rightSegments.sort((a, b) => (a.userData.templeSegmentIndex ?? 0) - (b.userData.templeSegmentIndex ?? 0));
  sources.leftMaterialAudit = getMaterialAuditSnapshot(sources.leftMaterial);
  sources.rightMaterialAudit = getMaterialAuditSnapshot(sources.rightMaterial);
  model.userData.glbTempleSources = sources;

  return sources;
};

const createFaceAttachedTempleMesh = (side, material) => {
  const mesh = new THREE.Mesh(createFaceAttachedTempleGeometry(), material.clone());
  mesh.name = `${side}_FACE_ATTACHED_2_5D_TEMPLE`;
  mesh.userData.partType = `${side}_FACE_ATTACHED_TEMPLE`;
  mesh.renderOrder = 0;
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
};

const markOriginalTempleMeshesReplaced = (model) => {
  if (!model || !USE_FACE_ATTACHED_2_5D_TEMPLES) return;

  model.traverse((child) => {
    if (!child.isMesh) return;
    if (!isTemplePart(child.userData.partType)) return;
    if (getTempleSegment(child.userData.partType) !== null) return;

    child.visible = false;
    child.userData.skipProductionRender = true;
    child.userData.replacedByGlbDerivedTempleSegments = true;

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((mat) => {
      if (mat) {
        mat.transparent = true;
        mat.opacity = 0;
        mat.depthWrite = false;
      }
    });
  });
};

const setFaceAttachedTempleGroupVisible = (group, visible) => {
  if (!group) return;
  group.visible = visible;
};

const makeFaceAttachedTempleCurve = (start, middle, end, side, faceRig, faceWidth) => {
  const right = faceRig?.basis?.right || new THREE.Vector3(1, 0, 0);
  const back = faceRig?.basis?.back || new THREE.Vector3(0, 0, -1);
  const up = faceRig?.basis?.up || new THREE.Vector3(0, 1, 0);
  const sideSign = side === 'LEFT' ? -1 : 1;
  const hingeLift = faceWidth * 0.006;

  const p0 = start.clone().addScaledVector(up, hingeLift);
  const p1 = start.clone()
    .lerp(middle, 0.58)
    .addScaledVector(right, sideSign * faceWidth * 0.035)
    .addScaledVector(back, faceWidth * 0.035);
  const p2 = middle.clone()
    .lerp(end, 0.55)
    .addScaledVector(right, sideSign * faceWidth * 0.018)
    .addScaledVector(back, faceWidth * 0.018);
  const p3 = end.clone();

  return new THREE.CatmullRomCurve3([p0, p1, p2, p3], false, 'centripetal', 0.35);
};

const getFaceAttachedTempleFallbackT = (side, templeSideState, yawAbs, pitchAbs) => {
  const yawRamp = clamp((yawAbs - YAW_SIDE_THRESHOLD_DEG) / 35, 0, 1);
  const pitchRamp = clamp((pitchAbs - FACE_ATTACHED_TEMPLE_PITCH_THRESHOLD_DEG) / 22, 0, 1);
  const isYawMode = yawAbs > YAW_SIDE_THRESHOLD_DEG;
  const isMixedYawPitchMode = isYawMode && pitchAbs > FACE_ATTACHED_TEMPLE_PITCH_THRESHOLD_DEG;
  const basePart = `${side}_TEMPLE`;
  const isNearSide = templeSideState?.nearTemplePart === basePart;
  const isFarSide = templeSideState?.farTemplePart === basePart;

  if (!isYawMode) {
    return clamp(FRONTAL_MAX_TEMPLE_VISIBLE_T - pitchRamp * 0.06, MIN_HINGE_VISIBLE_T, FRONTAL_MAX_TEMPLE_VISIBLE_T);
  }

  if (isFarSide) {
    const maxT = isMixedYawPitchMode ? MIXED_FAR_MAX_TEMPLE_VISIBLE_T : FAR_SIDE_MAX_TEMPLE_VISIBLE_T;
    return clamp(0.085 - yawRamp * 0.035 - pitchRamp * 0.02, FAR_SIDE_MIN_TEMPLE_VISIBLE_T, maxT);
  }

  if (isNearSide) {
    const maxT = isMixedYawPitchMode ? MIXED_NEAR_MAX_TEMPLE_VISIBLE_T : NEAR_SIDE_MAX_TEMPLE_VISIBLE_T;
    const nearTargetT = yawRamp < 0.5
      ? THREE.MathUtils.lerp(NEAR_SIDE_MIN_YAW_VISIBLE_T, NEAR_SIDE_NORMAL_YAW_VISIBLE_T, yawRamp / 0.5)
      : THREE.MathUtils.lerp(NEAR_SIDE_NORMAL_YAW_VISIBLE_T, NEAR_SIDE_STRONG_YAW_VISIBLE_T, (yawRamp - 0.5) / 0.5);
    return clamp(nearTargetT - pitchRamp * 0.06, NEAR_SIDE_MIN_YAW_VISIBLE_T, maxT);
  }

  return FRONTAL_MAX_TEMPLE_VISIBLE_T;
};

const getNearSideTempleTargetT = (yawAbs) => {
  const yawRamp = clamp((yawAbs - YAW_SIDE_THRESHOLD_DEG) / 35, 0, 1);
  return yawRamp < 0.5
    ? THREE.MathUtils.lerp(NEAR_SIDE_MIN_YAW_VISIBLE_T, NEAR_SIDE_NORMAL_YAW_VISIBLE_T, yawRamp / 0.5)
    : THREE.MathUtils.lerp(NEAR_SIDE_NORMAL_YAW_VISIBLE_T, NEAR_SIDE_STRONG_YAW_VISIBLE_T, (yawRamp - 0.5) / 0.5);
};

const getSmoothedTempleVisibleT = (side, targetVisibleT, templeVisibleTRef, options = {}) => {
  if (!templeVisibleTRef?.current) return targetVisibleT;

  const previous = templeVisibleTRef.current[side];

  if (previous === null || previous === undefined) {
    templeVisibleTRef.current[side] = targetVisibleT;
    return targetVisibleT;
  }

  if (Math.abs(targetVisibleT - previous) < 0.025) {
    return previous;
  }

  if (options.forceFastDrop && targetVisibleT < previous) {
    templeVisibleTRef.current[side] = targetVisibleT;
    return targetVisibleT;
  }

  const alpha = targetVisibleT < previous ? 0.32 : 0.22;
  const smoothed = THREE.MathUtils.lerp(previous, targetVisibleT, alpha);

  templeVisibleTRef.current[side] = smoothed;
  return smoothed;
};

const getFaceAttachedTempleVisibleT = ({
  side,
  curve,
  templeSideState,
  yawDegrees,
  pitchDegrees,
  faceMaskModel,
  start,
  end
}) => {
  const yawAbs = Math.abs(yawDegrees);
  const pitchAbs = Math.abs(pitchDegrees);
  const basePart = `${side}_TEMPLE`;
  const isYawMode = yawAbs > YAW_SIDE_THRESHOLD_DEG;
  const isNearSide = templeSideState?.nearTemplePart === basePart;
  const isFarSide = templeSideState?.farTemplePart === basePart;
  const fallbackT = getFaceAttachedTempleFallbackT(side, templeSideState, yawAbs, pitchAbs);
  const nearTargetT = isNearSide && isYawMode ? getNearSideTempleTargetT(yawAbs) : fallbackT;
  const polygon = side === 'LEFT' ? faceMaskModel?.leftPolygon : faceMaskModel?.rightPolygon;
  const projectFn = faceMaskModel?.projectWorldToScreen;

  let visibleT = fallbackT;

  if (projectFn && start && end) {
    const start2D = projectFn(start);
    const end2D = projectFn(end);
    const boundaryPolygons = isFarSide
      ? [
        faceMaskModel?.leftPolygon,
        faceMaskModel?.rightPolygon
      ].filter((poly) => Array.isArray(poly) && poly.length >= 3)
      : [polygon].filter((poly) => Array.isArray(poly) && poly.length >= 3);
    const intersection = isFarSide
      ? findEarliestTempleBoundaryIntersectionT(start2D, end2D, boundaryPolygons)
      : findFirstTempleFaceIntersectionT(start2D, end2D, polygon);

    if (intersection.found) {
      const margin = isFarSide ? 0.20 : isNearSide ? 0.025 : 0.045;
      const minVisibleT = isFarSide ? FAR_SIDE_MIN_TEMPLE_VISIBLE_T : MIN_HINGE_VISIBLE_T;
      const cutT = clamp(intersection.cutT - margin, minVisibleT, 1);
      if (isFarSide) {
        visibleT = Math.min(visibleT, cutT);
      } else if (isNearSide && isYawMode) {
        visibleT = Math.max(visibleT, nearTargetT);
        visibleT = Math.min(visibleT, fallbackT);
      } else {
        visibleT = Math.min(visibleT, cutT);
      }
    } else if (isFarSide && isYawMode) {
      visibleT = FAR_SIDE_MIN_TEMPLE_VISIBLE_T;
    }
  }

  const sideForbiddenPolygon = side === 'LEFT'
    ? faceMaskModel?.leftEyeForbiddenPolygon
    : faceMaskModel?.rightEyeForbiddenPolygon;
  const forbiddenPolygons = [sideForbiddenPolygon].filter((poly) => Array.isArray(poly) && poly.length >= 3);
  const fallbackForbiddenPolygons = [
    faceMaskModel?.leftEyeForbiddenPolygon,
    faceMaskModel?.rightEyeForbiddenPolygon
  ].filter((poly) => Array.isArray(poly) && poly.length >= 3);
  const activeForbiddenPolygons = forbiddenPolygons.length ? forbiddenPolygons : fallbackForbiddenPolygons;

  if (projectFn && activeForbiddenPolygons.length && curve) {
    const forbiddenStartT = isNearSide && isYawMode ? NEAR_SIDE_FORBIDDEN_START_T : 0.12;
    for (let i = 2; i <= FACE_ATTACHED_TEMPLE_SEGMENTS; i++) {
      const t = (i / FACE_ATTACHED_TEMPLE_SEGMENTS) * visibleT;
      if (t < forbiddenStartT) continue;
      const pt2D = projectFn(curve.getPoint(t));
      const insideForbiddenZone = activeForbiddenPolygons.some((poly) => isPointInPolygon2D(pt2D, poly));
      if (insideForbiddenZone) {
        visibleT = Math.min(visibleT, clamp(t - 0.045, MIN_HINGE_VISIBLE_T, visibleT));
        break;
      }
    }
  }

  const maxVisibleT = !isYawMode
    ? FRONTAL_MAX_TEMPLE_VISIBLE_T
    : isFarSide
      ? FAR_SIDE_MAX_TEMPLE_VISIBLE_T
      : NEAR_SIDE_MAX_TEMPLE_VISIBLE_T;

  return clamp(visibleT, isFarSide ? FAR_SIDE_MIN_TEMPLE_VISIBLE_T : MIN_HINGE_VISIBLE_T, maxVisibleT);
};

const updateFaceAttachedTempleStrip = (mesh, curve, visibleT, faceRig, faceWidth) => {
  if (!mesh?.geometry || !curve || !faceRig) return;

  const positionAttr = mesh.geometry.attributes.position;
  const up = faceRig.basis?.up || new THREE.Vector3(0, 1, 0);
  const halfWidth = clamp(faceWidth * 0.010, 0.012, 0.036);

  for (let i = 0; i <= FACE_ATTACHED_TEMPLE_SEGMENTS; i++) {
    const segmentRatio = i / FACE_ATTACHED_TEMPLE_SEGMENTS;
    const curveT = clamp(segmentRatio * visibleT, 0, 1);
    const center = curve.getPoint(curveT);
    const taper = 1 - smoothstep(0.72, 1.0, segmentRatio) * 0.45;
    const sideOffset = up.clone().multiplyScalar(halfWidth * taper);
    const left = center.clone().add(sideOffset);
    const right = center.clone().sub(sideOffset);
    const vertexIndex = i * 2;

    positionAttr.setXYZ(vertexIndex, left.x, left.y, left.z);
    positionAttr.setXYZ(vertexIndex + 1, right.x, right.y, right.z);
  }

  positionAttr.needsUpdate = true;
  mesh.geometry.computeBoundingSphere();
  mesh.visible = visibleT >= MIN_HINGE_VISIBLE_T;
};

const updateFaceAttachedTemples = ({
  group,
  leftMesh,
  rightMesh,
  templeBoundaryModel,
  templeSideState,
  faceMaskModel,
  yawDegrees,
  pitchDegrees,
  faceRig
}) => {
  if (!USE_FACE_ATTACHED_2_5D_TEMPLES || !group || !leftMesh || !rightMesh || !templeBoundaryModel || !faceRig) {
    setFaceAttachedTempleGroupVisible(group, false);
    return;
  }

  const faceWidth = faceRig.metrics?.faceWidth3D || 1;
  const specs = [
    {
      side: 'LEFT',
      mesh: leftMesh,
      start: templeBoundaryModel.leftHingeApprox,
      middle: templeBoundaryModel.leftFaceBoundary,
      end: templeBoundaryModel.leftEstimatedEar
    },
    {
      side: 'RIGHT',
      mesh: rightMesh,
      start: templeBoundaryModel.rightHingeApprox,
      middle: templeBoundaryModel.rightFaceBoundary,
      end: templeBoundaryModel.rightEstimatedEar
    }
  ];

  specs.forEach((spec) => {
    if (!spec.start || !spec.middle || !spec.end) {
      spec.mesh.visible = false;
      return;
    }

    const curve = makeFaceAttachedTempleCurve(spec.start, spec.middle, spec.end, spec.side, faceRig, faceWidth);
    const visibleT = getFaceAttachedTempleVisibleT({
      side: spec.side,
      curve,
      templeSideState,
      yawDegrees,
      pitchDegrees,
      faceMaskModel,
      start: spec.start,
      end: spec.end
    });

    updateFaceAttachedTempleStrip(spec.mesh, curve, visibleT, faceRig, faceWidth);
    spec.mesh.userData.visibleEndT = visibleT;
    spec.mesh.userData.yawDegrees = yawDegrees;
    spec.mesh.userData.pitchDegrees = pitchDegrees;
  });

  group.visible = true;
};

const setGlbTempleSegmentMaterialState = (mesh, opacity) => {
  if (!mesh?.material) return;
  if (!mesh.userData.originalTempleMaterialState) {
    const firstMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    mesh.userData.originalTempleMaterialState = {
      transparent: !!firstMat?.transparent,
      opacity: firstMat?.opacity ?? 1,
      depthWrite: firstMat?.depthWrite ?? true
    };
  }

  const original = mesh.userData.originalTempleMaterialState;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((mat) => {
    if (!mat) return;
    mat.side = THREE.DoubleSide;
    mat.depthTest = true;
    mat.depthWrite = opacity > 0.92 ? original.depthWrite : false;
    mat.transparent = original.transparent || opacity < 0.999;
    mat.opacity = (original.opacity ?? 1) * opacity;
    mat.clippingPlanes = [];
  });
};

const getGlbTempleSegmentOpacity = (segmentT, visibleT, fadeWidth = 0.10) => {
  if (segmentT <= visibleT) return 1;
  return clamp(1 - smoothstep(visibleT, visibleT + fadeWidth, segmentT), 0, 1);
};

const updateGlbTempleSideVisibility = ({ segments, visibleT, isFarSide = false }) => {
  const visibleMeshes = [];

  segments.forEach((mesh) => {
    const segmentIndex = mesh.userData.templeSegmentIndex ?? getTempleSegment(mesh.userData.partType) ?? 0;
    const segmentT = clamp(segmentIndex / Math.max(1, TEMPLE_SEGMENT_COUNT - 1), 0, 1);
    const opacity = getGlbTempleSegmentOpacity(segmentT, visibleT, isFarSide ? FAR_SIDE_TEMPLE_FADE_T : 0.10);
    const shouldShow = opacity > (isFarSide ? 0.20 : 0.03);

    mesh.userData.glbDerivedTempleVisible = shouldShow;
    mesh.userData.glbDerivedTempleOpacity = opacity;
    mesh.userData.glbDerivedTempleSegmentT = segmentT;
    mesh.userData.skipProductionRender = false;
    mesh.visible = shouldShow;
    mesh.renderOrder = 0;
    mesh.frustumCulled = false;
    setGlbTempleSegmentMaterialState(mesh, opacity);

    if (shouldShow) {
      visibleMeshes.push(`${mesh.name || 'UNNAMED'} (${mesh.userData.partType || 'UNKNOWN'} @ ${segmentT.toFixed(3)})`);
    }
  });

  return visibleMeshes;
};

const updateGlbDerivedTempleVisibility = ({
  model,
  templeBoundaryModel,
  templeSideState,
  faceMaskModel,
  yawDegrees,
  pitchDegrees,
  faceRig,
  templeVisibleTRef
}) => {
  if (!USE_FACE_ATTACHED_2_5D_TEMPLES || !model || !templeBoundaryModel || !faceRig) return null;

  const sources = model.userData.glbTempleSources || collectOriginalTempleSources(model);
  const faceWidth = faceRig.metrics?.faceWidth3D || 1;
  const sideSpecs = [
    {
      side: 'LEFT',
      segments: sources.leftSegments,
      start: templeBoundaryModel.leftHingeApprox,
      middle: templeBoundaryModel.leftFaceBoundary,
      end: templeBoundaryModel.leftEstimatedEar
    },
    {
      side: 'RIGHT',
      segments: sources.rightSegments,
      start: templeBoundaryModel.rightHingeApprox,
      middle: templeBoundaryModel.rightFaceBoundary,
      end: templeBoundaryModel.rightEstimatedEar
    }
  ];

  const visibility = {
    mode: 'GLB_DERIVED_2_5D_TEMPLES',
    leftVisibleT: 0,
    rightVisibleT: 0,
    leftVisibleMeshes: [],
    rightVisibleMeshes: [],
    leftSegmentCount: sources.leftSegments.length,
    rightSegmentCount: sources.rightSegments.length,
    bothTempleMeshCount: sources.bothTempleMeshes.length,
    leftMaterialAudit: sources.leftMaterialAudit,
    rightMaterialAudit: sources.rightMaterialAudit
  };

  sideSpecs.forEach((spec) => {
    if (!spec.start || !spec.middle || !spec.end || !spec.segments.length) return;

    const curve = makeFaceAttachedTempleCurve(spec.start, spec.middle, spec.end, spec.side, faceRig, faceWidth);
    const targetVisibleT = getFaceAttachedTempleVisibleT({
      side: spec.side,
      curve,
      templeSideState,
      yawDegrees,
      pitchDegrees,
      faceMaskModel,
      start: spec.start,
      end: spec.end
    });
    const isFarSide = templeSideState?.farSide === spec.side;
    const visibleT = getSmoothedTempleVisibleT(spec.side, targetVisibleT, templeVisibleTRef, {
      forceFastDrop: isFarSide
    });

    const visibleMeshes = updateGlbTempleSideVisibility({
      segments: spec.segments,
      visibleT,
      isFarSide
    });

    if (spec.side === 'LEFT') {
      visibility.leftVisibleT = visibleT;
      visibility.leftVisibleMeshes = visibleMeshes;
    } else {
      visibility.rightVisibleT = visibleT;
      visibility.rightVisibleMeshes = visibleMeshes;
    }
  });

  sources.bothTempleMeshes.forEach((mesh) => {
    mesh.visible = false;
    mesh.userData.skipProductionRender = true;
    mesh.userData.glbDerivedTempleVisible = false;
  });

  model.userData.glbTempleVisibility = visibility;
  return visibility;
};

export default function VirtualTryOn({
  product,
  allArProducts,
  activeARProduct,
  setActiveARProduct,
  onClose
}) {
  const navigate = useNavigate();

  // ==========================================
  // 1. QUẢN LÝ TRẠNG THÁI (STATE)
  // ==========================================
  const [isAiLoading, setIsAiLoading] = useState(true);
  const [showGlassesMenu, setShowGlassesMenu] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [debugPanelInfo, setDebugPanelInfo] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [toast, setToast] = useState({
    show: false,
    message: '',
    type: 'success'
  });
  const [faceFitHint, setFaceFitHint] = useState('');
  const setGltfWarning = () => { };
  const setGltfTree = () => { };
  const setMeshDebugData = () => { };
  const setLiveDiagnosticSpecs = () => { };
  const setHelperStatus = () => { };
  const setTotalHelpers = () => { };
  const setFittingDiagnostics = () => { };
  const setBox3Diagnostics = () => { };
  const setAnatomicalBridgeDiagnostics = () => { };
  const setTempleAnchorDiagnostics = () => { };

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
  const debugBoxHelperGroupRef = useRef(null);
  const debugBoxHelpersRef = useRef([]);
  const occluderRef = useRef(null);
  const fullOccluderRef = useRef(null);
  const narrowOccluderRef = useRef(null);
  const faceAttachedTempleGroupRef = useRef(null);
  const leftFaceTempleRef = useRef(null);
  const rightFaceTempleRef = useRef(null);
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
  const showOccluderDebugRef = useRef(false);
  const showTempleOccluderDebugRef = useRef(false);
  const showFullGlbTestRef = useRef(false);
  const showCleanFullOccluderRef = useRef(false);
  const showProduction2PassRef = useRef(false);
  const showPass1MeshAuditRef = useRef(false);
  const showPass2InterferenceRef = useRef(false);
  const pass1OnlyFreezeRef = useRef(false);
  const pass1ThenPass2NoClearRef = useRef(false);
  const showOccluderWireframeRef = useRef(false);
  const showTempleAnchorDebugRef = useRef(false);
  const showFullOccluderDebugRef = useRef(false);
  const showSideOccluderDebugRef = useRef(false);
  const showNarrowOccluderDebugRef = useRef(false);
  const showMeshDebugRef = useRef(false);

  // SMOOTHING REFS
  const prevQuatRef = useRef(new THREE.Quaternion());
  const prevPositionRef = useRef(new THREE.Vector3());
  const prevScaleRef = useRef(1.0);
  const templeVisibleTRef = useRef({
    LEFT: null,
    RIGHT: null
  });

  useEffect(() => {
    activeARProductRef.current = activeARProduct;
  }, [activeARProduct]);

  // ==========================================
  // 3. TIỆN ÍCH LOG & TOAST
  // ==========================================
  const addLog = (...args) => {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    if (args[0]?.startsWith?.('?')) console.warn(msg);

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
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.sortObjects = true;
    renderer.autoClear = false;
    renderer.localClippingEnabled = false;
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 10;
    cameraRef.current = camera;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 6, 8);
    scene.add(directionalLight);

    const reflectionLight = new THREE.DirectionalLight(0xffffff, 0.15);
    reflectionLight.position.set(0, 5, 12);
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
      bothIndices: narrowBothTriangles,
      leftVertexSet: new Set(narrowLeftTriangles),
      rightVertexSet: new Set(narrowRightTriangles),
      expansion: null
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

    const debugBoxHelperGroup = new THREE.Group();
    debugBoxHelperGroup.renderOrder = 1000;
    scene.add(debugBoxHelperGroup);
    debugBoxHelperGroupRef.current = debugBoxHelperGroup;
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
    templeVisibleTRef.current = {
      LEFT: null,
      RIGHT: null
    };
    if (!sceneRef.current || !prod || !prod.arUrl) return;

    if (glassesModelRef.current) {
      glassesModelRef.current.traverse((child) => {
        if (child.isMesh && child.userData.debugHelper) {
          sceneRef.current.remove(child.userData.debugHelper);
          child.userData.debugHelper.dispose?.();
          child.userData.debugHelper = null;
        }
      });
      const glbTempleSources = glassesModelRef.current.userData?.glbTempleSources;
      glbTempleSources?.leftMaterial?.dispose?.();
      glbTempleSources?.rightMaterial?.dispose?.();
      sceneRef.current.remove(glassesModelRef.current);
      glassesModelRef.current = null;
    }
    if (faceAttachedTempleGroupRef.current) {
      sceneRef.current.remove(faceAttachedTempleGroupRef.current);
      faceAttachedTempleGroupRef.current.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((mat) => mat?.dispose?.());
        }
      });
      faceAttachedTempleGroupRef.current = null;
      leftFaceTempleRef.current = null;
      rightFaceTempleRef.current = null;
    }


    addLog("🚀 [AR BUILD] Version 1.0.5 - Premium Rigid Temples");
    addLog(`Đang tải file 3D: ${prod.arUrl}`);
    const loader = new GLTFLoader();

    loader.load(
      prod.arUrl,
      (gltf) => {
        const model = gltf.scene;
        const fitOverride = getModelFitOverride(prod.arUrl);
        model.userData.fitOverride = fitOverride;
        const singleMeshSplitAudit = splitSingleMeshGlassesByDepth(model, fitOverride);
        model.userData.singleMeshSplitAudit = singleMeshSplitAudit;
        if (singleMeshSplitAudit) {
          setGltfWarning(`INFO: Single-mesh GLB split into AR parts for ${fitOverride.id}: ${singleMeshSplitAudit.createdMeshes.join(', ')}`);
        }

        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());


        let meshIndex = 0;
        const diagList = [];
        const mergedTempleSplitCandidates = [];

        model.traverse((child) => {
          if (child.isMesh) {
            if (child.userData.skipMeshClassification) return;

            cloneMeshMaterials(child);
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
            const materials = getMeshMaterials(child);
            const matName = materials.map((mat) => mat.name || '').join(' ').toLowerCase();
            const preassignedPartType = child.userData.partType;
            const isLensMesh = meshName.includes('lens') || meshName.includes('glass') || meshName.includes('kính') || matName.includes('lens') || matName.includes('glass') || matName.includes('kính');
            const isTempleMesh = meshName.includes('handle') || meshName.includes('temple') || meshName.includes('càng') || meshName.includes('object_7') ||
              matName.includes('handle') || matName.includes('temple') || matName.includes('càng');

            const isNearCenter = Math.abs(childCenter.x) < 0.35 * size.x;
            const physicalGlassMaterial = materials.some(isPhysicalGlassMaterial);
            const isLikelyCenterGlass =
              isNearCenter &&
              physicalGlassMaterial &&
              childSize.x < size.x * 0.85 &&
              childSize.y < size.y * 0.85;

            if (preassignedPartType === 'FRONT_FRAME' || preassignedPartType === 'LENS' || isTemplePart(preassignedPartType)) {
              child.userData.partType = preassignedPartType;
            } else if (isLensMesh || isLikelyCenterGlass) {
              child.userData.partType = 'LENS';
            } else if (isTempleMesh) {
              if (childCenter.x < -0.01) {
                child.userData.partType = 'LEFT_TEMPLE';
              } else if (childCenter.x > 0.01) {
                child.userData.partType = 'RIGHT_TEMPLE';
              } else {
                child.userData.partType = 'BOTH_TEMPLES';
              }
              getMeshMaterials(child).forEach((mat) => {
                mat.side = THREE.DoubleSide;
                mat.depthWrite = true;
                mat.depthTest = true;
                mat.transparent = true;
                mat.opacity = 1.0;
              });
            } else if (relativeZ > 0.60 || isNearCenter) {
              child.userData.partType = 'FRONT_FRAME';
              getMeshMaterials(child).forEach((mat) => {
                mat.side = THREE.DoubleSide;
                mat.depthWrite = true;
                mat.depthTest = true;
              });
            } else {
              if (childCenter.x < 0) {
                child.userData.partType = 'LEFT_TEMPLE';
              } else {
                child.userData.partType = 'RIGHT_TEMPLE';
              }
              getMeshMaterials(child).forEach((mat) => {
                mat.side = THREE.DoubleSide;
                mat.depthWrite = true;
                mat.depthTest = true;
                mat.transparent = true;
                mat.opacity = 1.0;
              });
            }

            let vertexCount = 0;
            if (child.geometry && child.geometry.attributes && child.geometry.attributes.position) {
              vertexCount = child.geometry.attributes.position.count;
            }
            const parentName = child.parent ? child.parent.name || child.parent.type : 'None';
            const childCount = child.children ? child.children.length : 0;
            const diagMaterial = getMeshMaterials(child)[0];

            const isTemple = child.userData.partType === 'LEFT_TEMPLE' || child.userData.partType === 'RIGHT_TEMPLE';
            const tag = isTemple ? `⚠️ [${child.userData.partType}]` : `✅ [${child.userData.partType}]`;

            diagList.push({
              "Index": meshIndex,
              "Status": tag,
              "Mesh Name": child.name || 'NO_NAME',
              "Material Name": diagMaterial ? (diagMaterial.name || 'NO_MAT') : 'NO_MAT',
              "Parent Name": parentName,
              "RenderOrder": child.renderOrder,
              "Visible": child.visible.toString(),
              "DepthTest": diagMaterial ? diagMaterial.depthTest.toString() : 'false',
              "DepthWrite": diagMaterial ? diagMaterial.depthWrite.toString() : 'false',
              "Transparent": diagMaterial ? diagMaterial.transparent.toString() : 'false',
              "Opacity": diagMaterial ? diagMaterial.opacity.toString() : '1.0',
              "BBox Size X": childSize.x.toFixed(4),
              "BBox Size Y": childSize.y.toFixed(4),
              "BBox Size Z": childSize.z.toFixed(4),
              "Center X": childCenter.x.toFixed(4),
              "Center Y": childCenter.y.toFixed(4),
              "Center Z": childCenter.z.toFixed(4),
              "Relative Z": relativeZ.toFixed(4),
              "PartType": child.userData.partType,
              "Is Lens": (child.userData.partType === 'LENS').toString(),
              "Is Front Frame": (child.userData.partType === 'FRONT_FRAME').toString(),
              "Is Left Temple": (getTempleBasePart(child.userData.partType) === 'LEFT_TEMPLE').toString(),
              "Is Right Temple": (getTempleBasePart(child.userData.partType) === 'RIGHT_TEMPLE').toString(),
              "Is Both Temples": (getTempleBasePart(child.userData.partType) === 'BOTH_TEMPLES').toString(),
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

        const templeMeshesToSegment = [];
        model.traverse((child) => {
          if (child.isMesh && !child.userData.skipProductionRender) {
            const basePart = getTempleBasePart(child.userData.partType);
            if (basePart === 'LEFT_TEMPLE' || basePart === 'RIGHT_TEMPLE') {
              templeMeshesToSegment.push(child);
            }
          }
        });

        const createdTempleSegments = [];
        templeMeshesToSegment.forEach((child) => {
          const segmentMeshes = splitTempleMeshIntoSegments(child);
          if (!segmentMeshes || segmentMeshes.length === 0 || !child.parent) return;

          const originalPartType = child.userData.partType;
          child.visible = false;
          child.userData.originalPartType = originalPartType;
          child.userData.partType = 'SEGMENTED_TEMPLE_SOURCE';
          child.userData.skipProductionRender = true;

          segmentMeshes.forEach((segmentMesh) => {
            segmentMesh.renderOrder = child.renderOrder;
            if (segmentMesh.material) {
              const materials = Array.isArray(segmentMesh.material) ? segmentMesh.material : [segmentMesh.material];
              materials.forEach((mat) => {
                if (mat) {
                  mat.transparent = false;
                  mat.opacity = 1.0;
                  mat.depthWrite = true;
                  mat.depthTest = true;
                  mat.side = THREE.DoubleSide;
                }
              });
            }
            child.parent.add(segmentMesh);
            createdTempleSegments.push(segmentMesh.name || segmentMesh.userData.partType);
          });
        });

        model.userData.createdTempleSegments = createdTempleSegments;
        if (createdTempleSegments.length > 0) {
          let warningText = `INFO: Temple meshes segmented for partial side occlusion: ${createdTempleSegments.length} segments created (segmentCount = ${TEMPLE_SEGMENT_COUNT}).`;
          if (TEMPLE_SEGMENT_COUNT < 10) {
            warningText += ` WARNING: segmentCount < 10, may look jagged.`;
          }
          setGltfWarning(warningText);

        }
        if (USE_FACE_ATTACHED_2_5D_TEMPLES) {
          markOriginalTempleMeshesReplaced(model);
          setGltfWarning("INFO: Using GLB-derived temple segments controlled by face-attached 2.5D visibility.");
        }

        const lensAudit = auditLensMeshes(model);
        const modelAudit = auditArModelMeshes(model);
        if (typeof window !== 'undefined') {
          window.__arLensAudit = lensAudit;
          window.__arModelAudit = modelAudit;
          window.__arSingleMeshSplitAudit = singleMeshSplitAudit;
        }
        console.table(modelAudit);
        if (import.meta.env && import.meta.env.DEV && lensAudit?.lensDetails?.length) {
          console.table(lensAudit.lensDetails);
        }

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

        const leftFaceBoundGeo = new THREE.SphereGeometry(0.045, 16, 16);
        const leftFaceBoundMat = new THREE.MeshBasicMaterial({ color: 0xffff00, depthTest: false, depthWrite: false, transparent: false, opacity: 1.0, toneMapped: false });
        const leftFaceBoundSphere = new THREE.Mesh(leftFaceBoundGeo, leftFaceBoundMat);
        leftFaceBoundSphere.name = "leftFaceBoundarySphere";
        leftFaceBoundSphere.renderOrder = 1000;
        leftFaceBoundSphere.visible = false;
        helperGroup.add(leftFaceBoundSphere);

        const rightFaceBoundGeo = new THREE.SphereGeometry(0.045, 16, 16);
        const rightFaceBoundMat = new THREE.MeshBasicMaterial({ color: 0xffff00, depthTest: false, depthWrite: false, transparent: false, opacity: 1.0, toneMapped: false });
        const rightFaceBoundSphere = new THREE.Mesh(rightFaceBoundGeo, rightFaceBoundMat);
        rightFaceBoundSphere.name = "rightFaceBoundarySphere";
        rightFaceBoundSphere.renderOrder = 1000;
        rightFaceBoundSphere.visible = false;
        helperGroup.add(rightFaceBoundSphere);

        const leftEarGeo = new THREE.SphereGeometry(0.045, 16, 16);
        const leftEarMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, depthTest: false, depthWrite: false, transparent: false, opacity: 1.0, toneMapped: false });
        const leftEarSphere = new THREE.Mesh(leftEarGeo, leftEarMat);
        leftEarSphere.name = "leftEstimatedEarSphere";
        leftEarSphere.renderOrder = 1000;
        leftEarSphere.visible = false;
        helperGroup.add(leftEarSphere);

        const rightEarGeo = new THREE.SphereGeometry(0.045, 16, 16);
        const rightEarMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, depthTest: false, depthWrite: false, transparent: false, opacity: 1.0, toneMapped: false });
        const rightEarSphere = new THREE.Mesh(rightEarGeo, rightEarMat);
        rightEarSphere.name = "rightEstimatedEarSphere";
        rightEarSphere.renderOrder = 1000;
        rightEarSphere.visible = false;
        helperGroup.add(rightEarSphere);

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
            const isExcludedType = isTemplePart(child.userData.partType);
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
        anchorGroup.userData.originalWidth = 2 / (fitOverride.scaleMultiplier || 1);
        anchorGroup.userData.lensAudit = lensAudit;
        anchorGroup.userData.fitOverride = fitOverride;
        anchorGroup.userData.singleMeshSplitAudit = singleMeshSplitAudit;

        sceneRef.current.add(anchorGroup);
        glassesModelRef.current = anchorGroup;

        if (USE_FACE_ATTACHED_2_5D_TEMPLES) {
          anchorGroup.userData.glbTempleSources = collectOriginalTempleSources(anchorGroup);
        }

        // --- DEBUG DUMP ---
        console.group("=== GLB MESH DUMP ===");
        console.log("GLB URL:", prod.arUrl);
        const dumpTableData = [];
        model.traverse((child) => {
          if (child.isMesh) {
            child.geometry.computeBoundingBox();
            const bbox = child.geometry.boundingBox;
            const sizeVec = new THREE.Vector3();
            bbox.getSize(sizeVec);

            const vertexCount = child.geometry.attributes.position ? child.geometry.attributes.position.count : 0;
            const triangleCount = child.geometry.index ? child.geometry.index.count / 3 : vertexCount / 3;

            dumpTableData.push({
              meshName: child.name || 'UNNAMED',
              partType: child.userData.partType || 'NONE',
              vertexCount,
              triangleCount: Math.floor(triangleCount),
              bboxMin: `${bbox.min.x.toFixed(4)}, ${bbox.min.y.toFixed(4)}, ${bbox.min.z.toFixed(4)}`,
              bboxMax: `${bbox.max.x.toFixed(4)}, ${bbox.max.y.toFixed(4)}, ${bbox.max.z.toFixed(4)}`,
              bboxSize: `${sizeVec.x.toFixed(4)}, ${sizeVec.y.toFixed(4)}, ${sizeVec.z.toFixed(4)}`
            });
          }
        });
        console.table(dumpTableData);
        console.groupEnd();

        // --- CREATE BOXHELPERS ---
        anchorGroup.traverse((child) => {
          if (child.isMesh) {
            const helper = new THREE.BoxHelper(child, 0x00ffff);
            helper.visible = debugMode;
            sceneRef.current.add(helper);
            child.userData.debugHelper = helper;
          }
        });

        // --- COMPUTE DEBUG PANEL DATA ---
        let meshCount = 0;
        let frontFrameCount = 0;
        let leftTempleCount = 0;
        let rightTempleCount = 0;
        let lensCount = 0;
        let templeSegmentsCount = 0;

        anchorGroup.traverse((child) => {
          if (child.isMesh) {
            if (child.userData.skipProductionRender) return;
            meshCount++;
            const partType = child.userData.partType || '';
            if (partType === 'FRONT_FRAME') {
              frontFrameCount++;
            } else if (partType === 'LENS') {
              lensCount++;
            } else if (partType === 'LEFT_TEMPLE' || partType.startsWith('LEFT_TEMPLE_')) {
              leftTempleCount++;
              if (partType.includes('_SEG_')) {
                templeSegmentsCount++;
              }
            } else if (partType === 'RIGHT_TEMPLE' || partType.startsWith('RIGHT_TEMPLE_')) {
              rightTempleCount++;
              if (partType.includes('_SEG_')) {
                templeSegmentsCount++;
              }
            }
          }
        });

        setDebugPanelInfo({
          modelName: prod.name || prod.arUrl?.split('/').pop() || 'N/A',
          meshCount,
          frontFrameCount,
          leftTempleCount,
          rightTempleCount,
          lensCount,
          isSingleMesh: singleMeshSplitAudit ? 'YES' : 'NO',
          templeSegmentsCount
        });

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
          applyFinalGlassesQuaternion(glassesModelRef.current, prevQuatRef.current);
        } else {
          applyFinalGlassesQuaternion(glassesModelRef.current, prevQuatRef.current);
        }

        const euler = new THREE.Euler().setFromQuaternion(prevQuatRef.current, 'YXZ');
        const yaw = euler.y;
        const pitch = euler.x;
        const yawFactor = Math.abs(yaw);

        const yawAbsRad = Math.abs(yaw);
        const yawDegreesVal = yawAbsRad * 180 / Math.PI;
        debugYawDegrees = yaw * 180 / Math.PI;
        const templeSideState = getTempleSideState(debugYawDegrees);
        const templeVisibleLengths = estimateTempleVisibleLengths(
          debugYawDegrees,
          templeSideState.nearSide,
          templeSideState.farSide
        );

        glassesModelRef.current.userData.occlusionMode = OCCLUDER_MODE.NARROW_SIDE;
        glassesModelRef.current.userData.templeSideState = templeSideState;
        glassesModelRef.current.userData.occlusionSideState = {
          yawDegrees: debugYawDegrees,
          nearSide: templeSideState.nearSide,
          farSide: templeSideState.farSide,
          nearTemplePart: templeSideState.nearTemplePart,
          farTemplePart: templeSideState.farTemplePart,
          visibleTempleLengthLeft: templeVisibleLengths.left,
          visibleTempleLengthRight: templeVisibleLengths.right
        };

        let narrowOccluderActiveSide = 'BOTH';
        if (narrowOccluderRef.current) {
          const activeSide = templeSideState.farSide === 'LEFT'
            ? 'LEFT'
            : templeSideState.farSide === 'RIGHT'
              ? 'RIGHT'
              : 'BOTH';
          narrowOccluderActiveSide = activeSide;

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
        const headUpVector = new THREE.Vector3(0, 1, 0).applyQuaternion(prevQuatRef.current).normalize();
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

        // Calculate face boundaries
        const leftBoundaryIdxs = [234, 127, 162, 21, 70, 63, 105];
        const leftFaceBoundary = new THREE.Vector3(0, 0, 0);
        leftBoundaryIdxs.forEach(idx => leftFaceBoundary.add(toW(landmarks[idx])));
        leftFaceBoundary.multiplyScalar(1 / leftBoundaryIdxs.length);

        const rightBoundaryIdxs = [454, 356, 389, 251, 300, 293, 334];
        const rightFaceBoundary = new THREE.Vector3(0, 0, 0);
        rightBoundaryIdxs.forEach(idx => rightFaceBoundary.add(toW(landmarks[idx])));
        rightFaceBoundary.multiplyScalar(1 / rightBoundaryIdxs.length);

        // Hinge approximations
        const leftHingeApprox = toW(landmarks[33]).addScaledVector(headRightVector, -faceWidth3D * 0.05);
        const rightHingeApprox = toW(landmarks[263]).addScaledVector(headRightVector, faceWidth3D * 0.05);

        // Estimated ears (raw)
        const estSideOffset = faceWidth3D * 0.13;
        const estBackOffset = faceWidth3D * 0.36;
        const leftEstimatedEarRaw = leftFaceBoundary.clone()
          .addScaledVector(headRightVector, -estSideOffset)
          .addScaledVector(headBackVector, estBackOffset);
        const rightEstimatedEarRaw = rightFaceBoundary.clone()
          .addScaledVector(headRightVector, estSideOffset)
          .addScaledVector(headBackVector, estBackOffset);

        // Clamp estimated ear Y so temple line runs level or slightly downward
        const clampEstimatedEarY = (earRaw, hinge, fw3d) => {
          const clamped = earRaw.clone();
          const maxEarY = hinge.y + fw3d * 0.015;
          const minEarY = hinge.y - fw3d * 0.10;
          clamped.y = clamp(clamped.y, minEarY, maxEarY);
          return clamped;
        };

        const leftEstimatedEar = clampEstimatedEarY(leftEstimatedEarRaw, leftHingeApprox, faceWidth3D);
        const rightEstimatedEar = clampEstimatedEarY(rightEstimatedEarRaw, rightHingeApprox, faceWidth3D);

        const leftTempleLineSlopeY = leftEstimatedEar.y - leftHingeApprox.y;
        const rightTempleLineSlopeY = rightEstimatedEar.y - rightHingeApprox.y;

        // Temple lines
        const leftTempleLine = { start: leftHingeApprox.clone(), end: leftEstimatedEar.clone() };
        const rightTempleLine = { start: rightHingeApprox.clone(), end: rightEstimatedEar.clone() };

        // Near-side calculations
        const nearSide = templeSideState.nearSide;
        let nearHingePoint = null;
        let nearEstimatedEarPoint = null;
        let nearTempleDirection = null;

        if (nearSide === 'LEFT') {
          nearHingePoint = leftHingeApprox.clone();
          nearEstimatedEarPoint = leftEstimatedEar.clone();
          nearTempleDirection = new THREE.Vector3().subVectors(leftEstimatedEar, leftHingeApprox).normalize();
        } else if (nearSide === 'RIGHT') {
          nearHingePoint = rightHingeApprox.clone();
          nearEstimatedEarPoint = rightEstimatedEar.clone();
          nearTempleDirection = new THREE.Vector3().subVectors(rightEstimatedEar, rightHingeApprox).normalize();
        }

        glassesModelRef.current.userData.templeBoundaryModel = {
          leftFaceBoundary,
          rightFaceBoundary,
          leftHingeApprox,
          rightHingeApprox,
          leftEstimatedEar,
          rightEstimatedEar,
          leftEstimatedEarRaw,
          rightEstimatedEarRaw,
          leftEstimatedEarClamped: leftEstimatedEar,
          rightEstimatedEarClamped: rightEstimatedEar,
          leftTempleLineSlopeY,
          rightTempleLineSlopeY,
          leftTempleLine,
          rightTempleLine,
          nearHingePoint,
          nearEstimatedEarPoint,
          nearTempleDirection
        };

        // FACE RIG LAYER
        // This is the single source of truth that binds the 3D glasses to the scanned face.
        // The glasses fitter and occlusion systems read from this rig instead of guessing screen-only positions.
        const faceRig = {
          version: 'FACE_RIG_V1',
          center: headCenter.clone(),
          eyeCenter: eyeOuterMidW.clone(),
          noseBridge: noseBridgeW.clone(),
          leftPupil: leftPupilW.clone(),
          rightPupil: rightPupilW.clone(),
          leftFace: faceLeftW.clone(),
          rightFace: faceRightW.clone(),
          leftHingeAnchor: leftHingeApprox.clone(),
          rightHingeAnchor: rightHingeApprox.clone(),
          leftSideAnchor: leftFaceBoundary.clone(),
          rightSideAnchor: rightFaceBoundary.clone(),
          leftEstimatedEar: leftEstimatedEar.clone(),
          rightEstimatedEar: rightEstimatedEar.clone(),
          basis: {
            right: headRightVector.clone(),
            up: headUpVector.clone(),
            back: headBackVector.clone()
          },
          metrics: {
            ipd3D,
            faceWidth3D,
            templeSideOffset,
            templeBackOffset,
            yawDegrees: debugYawDegrees,
            pitchDegrees: pitch * 180 / Math.PI,
            scale: prevScaleRef.current
          },
          temple: {
            leftLine: leftTempleLine,
            rightLine: rightTempleLine,
            nearSide,
            nearHingePoint,
            nearEstimatedEarPoint,
            nearTempleDirection
          },
          glassesCalibration: {
            pitchOffsetDeg: GLASSES_PITCH_OFFSET_DEG
          }
        };

        glassesModelRef.current.userData.faceRig = faceRig;

        // Build face mask 2D polygons for screen-space occlusion
        const projectWorldToScreen = (worldPoint) => {
          const projected = worldPoint.clone().project(cameraRef.current);
          return {
            x: (projected.x + 1) / 2,
            y: (1 - projected.y) / 2
          };
        };

        const buildFaceMaskPolygon = (landmarkIndices) => {
          const poly = [];
          for (let i = 0; i < landmarkIndices.length; i++) {
            const idx = landmarkIndices[i];
            if (idx < landmarks.length) {
              const w = toW(landmarks[idx]);
              poly.push(projectWorldToScreen(w));
            }
          }
          return poly;
        };

        const leftFaceMaskPolygon = buildFaceMaskPolygon(LEFT_FACE_MASK_LANDMARKS);
        const rightFaceMaskPolygon = buildFaceMaskPolygon(RIGHT_FACE_MASK_LANDMARKS);
        const leftEyeForbiddenPolygon = buildFaceMaskPolygon(LEFT_EYE_FORBIDDEN_LANDMARKS);
        const rightEyeForbiddenPolygon = buildFaceMaskPolygon(RIGHT_EYE_FORBIDDEN_LANDMARKS);

        const buildEyeBand = () => {
          // Normalized screen Y: 0 = top, 1 = bottom.
          // Use eye/brow landmarks as the stable valid vertical region for temple rendering.
          // This is a rendering guard only; MediaPipe still tracks the full face.
          const topLandmarks = [
            70, 63, 105, 66, 107,
            300, 293, 334, 296, 336,
            33, 263
          ];
          const bottomLandmarks = [
            145, 153, 154, 155, 133,
            374, 380, 381, 382, 362,
            33, 263
          ];

          const ysFrom = (indices) => {
            const ys = [];
            indices.forEach((idx) => {
              if (idx < landmarks.length) {
                const projected = projectWorldToScreen(toW(landmarks[idx]));
                if (projected && Number.isFinite(projected.y)) {
                  ys.push(projected.y);
                }
              }
            });
            return ys;
          };

          const topYs = ysFrom(topLandmarks);
          const bottomYs = ysFrom(bottomLandmarks);

          if (!topYs.length || !bottomYs.length) {
            return null;
          }

          const rawTop = Math.min(...topYs);
          const rawBottom = Math.max(...bottomYs);

          // Allow a small area above the eyebrow and a wider area below the eye for normal temple placement,
          // but cut temples that escape far above the forehead or far below the cheek/neck.
          const topMargin = 0.025;
          const bottomMargin = 0.085;

          return {
            top: clamp(rawTop - topMargin, 0, 1),
            bottom: clamp(rawBottom + bottomMargin, 0, 1),
            rawTop,
            rawBottom,
            topMargin,
            bottomMargin,
            softMargin: 0.025
          };
        };

        const eyeBand = buildEyeBand();
        const pitchDegrees = pitch * 180 / Math.PI;
        const pitchTempleHideStrength = clamp((Math.abs(pitchDegrees) - 14) / 12, 0, 1);

        glassesModelRef.current.userData.faceMaskModel = {
          leftPolygon: leftFaceMaskPolygon,
          rightPolygon: rightFaceMaskPolygon,
          leftEyeForbiddenPolygon,
          rightEyeForbiddenPolygon,
          eyeBand,
          pitchDegrees,
          pitchTempleHideStrength,
          faceRig,
          projectWorldToScreen,
          leftLandmarkCount: leftFaceMaskPolygon.length,
          rightLandmarkCount: rightFaceMaskPolygon.length
        };



        updateGlbDerivedTempleVisibility({
          model: glassesModelRef.current,
          templeBoundaryModel: glassesModelRef.current.userData.templeBoundaryModel,
          templeSideState,
          faceMaskModel: glassesModelRef.current.userData.faceMaskModel,
          yawDegrees: debugYawDegrees,
          pitchDegrees,
          faceRig,
          templeVisibleTRef
        });

        if (narrowOccluderRef.current) {
          const occlusionRamp = templeSideState.farSide === 'NONE'
            ? 0
            : clamp((yawDegreesVal - YAW_SIDE_THRESHOLD_DEG) / 22, 0, 1);
          const occlusionStrength = FAR_SIDE_OCCLUSION_STRENGTH * (0.55 + occlusionRamp * 0.45);
          narrowOccluderRef.current.userData.expansion = {
            activeSide: narrowOccluderActiveSide,
            headRightVector: headRightVector.clone(),
            headBackVector: headBackVector.clone(),
            sideExpand: faceWidth3D * NARROW_OCCLUDER_SIDE_EXPAND * occlusionStrength,
            backExpand: faceWidth3D * NARROW_OCCLUDER_BACK_EXPAND * occlusionStrength
          };
        }

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
        const visibleTempleSide = templeSideState.nearTemplePart;
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
        const anchorY = -(lm168.y - 0.5) * visibleHeight;

        const ANATOMICAL_BRIDGE_DROP = 0.005;
        const anchorYBeforeDrop = anchorY;
        const anchorYAfterDrop = anchorY - ANATOMICAL_BRIDGE_DROP * s;

        const pitchOffsetY = pitch * 0.005 * s;
        const modelFitOverride = glassesModelRef.current.userData.fitOverride || DEFAULT_MODEL_FIT_OVERRIDE;
        const modelVerticalOffset = targetWidth * (modelFitOverride.verticalOffsetRatio || 0);
        const adjustedAnchorY = anchorYAfterDrop + pitchOffsetY + modelVerticalOffset;

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
                const isVisibleSide = visibleTempleSide === 'BOTH' || part === visibleTempleSide;
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
                    applyArLensRenderState(child);
                  } else {
                    mat.transparent = false;
                    mat.opacity = 1.0;
                    mat.side = THREE.DoubleSide;
                    mat.clippingPlanes = [];
                  }
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

          const leftFaceBoundarySphere = helperGroupRef.current.getObjectByName("leftFaceBoundarySphere");
          const rightFaceBoundarySphere = helperGroupRef.current.getObjectByName("rightFaceBoundarySphere");
          const leftEstimatedEarSphere = helperGroupRef.current.getObjectByName("leftEstimatedEarSphere");
          const rightEstimatedEarSphere = helperGroupRef.current.getObjectByName("rightEstimatedEarSphere");

          if (leftTempleAnchorSphere) {
            leftTempleAnchorSphere.visible = templeAnchorVisible;
            if (templeAnchorVisible && leftHingeApprox) leftTempleAnchorSphere.position.copy(leftHingeApprox);
          }
          if (rightTempleAnchorSphere) {
            rightTempleAnchorSphere.visible = templeAnchorVisible;
            if (templeAnchorVisible && rightHingeApprox) rightTempleAnchorSphere.position.copy(rightHingeApprox);
          }
          if (leftFaceBoundarySphere) {
            leftFaceBoundarySphere.visible = templeAnchorVisible;
            if (templeAnchorVisible && leftFaceBoundary) leftFaceBoundarySphere.position.copy(leftFaceBoundary);
          }
          if (rightFaceBoundarySphere) {
            rightFaceBoundarySphere.visible = templeAnchorVisible;
            if (templeAnchorVisible && rightFaceBoundary) rightFaceBoundarySphere.position.copy(rightFaceBoundary);
          }
          if (leftEstimatedEarSphere) {
            leftEstimatedEarSphere.visible = templeAnchorVisible;
            if (templeAnchorVisible && leftEstimatedEar) leftEstimatedEarSphere.position.copy(leftEstimatedEar);
          }
          if (rightEstimatedEarSphere) {
            rightEstimatedEarSphere.visible = templeAnchorVisible;
            if (templeAnchorVisible && rightEstimatedEar) rightEstimatedEarSphere.position.copy(rightEstimatedEar);
          }
          if (leftTempleApproxLine) {
            leftTempleApproxLine.visible = templeAnchorVisible;
            if (templeAnchorVisible && leftHingeApprox && leftEstimatedEar) {
              const linePos = leftTempleApproxLine.geometry.attributes.position;
              linePos.setXYZ(0, leftHingeApprox.x, leftHingeApprox.y, leftHingeApprox.z);
              linePos.setXYZ(1, leftEstimatedEar.x, leftEstimatedEar.y, leftEstimatedEar.z);
              linePos.needsUpdate = true;
            }
          }
          if (rightTempleApproxLine) {
            rightTempleApproxLine.visible = templeAnchorVisible;
            if (templeAnchorVisible && rightHingeApprox && rightEstimatedEar) {
              const linePos = rightTempleApproxLine.geometry.attributes.position;
              linePos.setXYZ(0, rightHingeApprox.x, rightHingeApprox.y, rightHingeApprox.z);
              linePos.setXYZ(1, rightEstimatedEar.x, rightEstimatedEar.y, rightEstimatedEar.z);
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

          const fitDiagnosticsSnapshot = {
            faceWidth: faceWidth3D.toFixed(4),
            glassesWidth: targetWidth.toFixed(4),
            finalScale: s.toFixed(4),
            finalPos: `${pos.x.toFixed(4)}, ${pos.y.toFixed(4)}, ${pos.z.toFixed(4)}`,
            finalRot: rotDeg,
            fittingBoxType: "IPD + face width blend",
            rawModelSize: rawSizeStr,
            rawSizeExcludingTemples: rawExclStr,
            modelFitOverride: glassesModelRef.current.userData.fitOverride?.id || 'default',
            verticalOffsetRatio: (glassesModelRef.current.userData.fitOverride?.verticalOffsetRatio || 0).toFixed(4),
            scaleMultiplier: (glassesModelRef.current.userData.fitOverride?.scaleMultiplier || 1).toFixed(4)
          };
          setFittingDiagnostics(fitDiagnosticsSnapshot);
          if (typeof window !== 'undefined') {
            window.__arFitDiagnostics = fitDiagnosticsSnapshot;
          }

          const templeAnchorSnapshot = {
            faceWidth: faceWidth3D.toFixed(4),
            yawDegrees: debugYawDegrees.toFixed(4),
            leftTempleApprox: `${leftHingeApprox.x.toFixed(4)}, ${leftHingeApprox.y.toFixed(4)}, ${leftHingeApprox.z.toFixed(4)}`,
            rightTempleApprox: `${rightHingeApprox.x.toFixed(4)}, ${rightHingeApprox.y.toFixed(4)}, ${rightHingeApprox.z.toFixed(4)}`,
            sideOffset: templeSideOffset.toFixed(4),
            backOffset: templeBackOffset.toFixed(4)
          };
          setTempleAnchorDiagnostics(templeAnchorSnapshot);









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
                const basePart = getTempleBasePart(part);
                if (basePart) {
                  if (basePart === 'LEFT_TEMPLE') leftTempleNames.push(child.name);
                  else if (basePart === 'RIGHT_TEMPLE') rightTempleNames.push(child.name);
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

          const bridgeDiagnosticsSnapshot = {
            anchorYBefore: anchorYBeforeDrop.toFixed(6),
            anchorYAfter: anchorYAfterDrop.toFixed(6),
            appliedDrop: (ANATOMICAL_BRIDGE_DROP * s).toFixed(6),
            modelVerticalOffset: modelVerticalOffset.toFixed(6),
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
            nearSide: templeSideState.nearSide,
            farSide: templeSideState.farSide,
            visibleTempleLengthLeft: templeVisibleLengths.left.toFixed(4),
            visibleTempleLengthRight: templeVisibleLengths.right.toFixed(4)
          };
          setAnatomicalBridgeDiagnostics(bridgeDiagnosticsSnapshot);
          if (typeof window !== 'undefined') {
            window.__arTempleDiagnostics = {
              anchor: templeAnchorSnapshot,
              temples: templeDiagnosticsList,
              bridge: bridgeDiagnosticsSnapshot,
              split: glassesModelRef.current.userData.singleMeshSplitAudit || null
            };
          }
        }

        glassesModelRef.current.traverse((child) => {
          if (child.isMesh) {
            if (child.userData.partType === 'LENS') {
              applyArLensRenderState(child);
              return;
            }

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
        const narrowUserData = narrowOccluderRef.current ? narrowOccluderRef.current.userData : null;
        const narrowExpansion = narrowUserData ? narrowUserData.expansion : null;
        const leftNarrowVertices = narrowUserData ? narrowUserData.leftVertexSet : null;
        const rightNarrowVertices = narrowUserData ? narrowUserData.rightVertexSet : null;

        for (let i = 0; i < Math.min(landmarks.length, 478); i++) {
          const w = toW(landmarks[i]);
          if (posAttr) posAttr.setXYZ(i, w.x, w.y, w.z);
          if (fullPosAttr) fullPosAttr.setXYZ(i, w.x, w.y, w.z);
          if (narrowPosAttr) {
            const isLeftVertex = leftNarrowVertices ? leftNarrowVertices.has(i) : false;
            const isRightVertex = rightNarrowVertices ? rightNarrowVertices.has(i) : false;
            const isSharedSideVertex = isLeftVertex && isRightVertex;
            const shouldExpandFarSide =
              narrowExpansion &&
              narrowExpansion.activeSide !== 'BOTH' &&
              !isSharedSideVertex &&
              (
                (narrowExpansion.activeSide === 'LEFT' && isLeftVertex) ||
                (narrowExpansion.activeSide === 'RIGHT' && isRightVertex)
              );

            if (shouldExpandFarSide) {
              const sideSign = narrowExpansion.activeSide === 'LEFT' ? -1 : 1;
              const expandedW = w.clone()
                .addScaledVector(narrowExpansion.headRightVector, sideSign * narrowExpansion.sideExpand)
                .addScaledVector(narrowExpansion.headBackVector, narrowExpansion.backExpand);
              narrowPosAttr.setXYZ(i, expandedW.x, expandedW.y, expandedW.z);
            } else {
              narrowPosAttr.setXYZ(i, w.x, w.y, w.z);
            }
          }
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



      setFaceAttachedTempleGroupVisible(faceAttachedTempleGroupRef.current, false);

      if (debugMode) {
        // --- DEBUG MODE RENDER PASS ---
        glassesModelRef.current.traverse((child) => {
          if (child.isMesh) {
            if (child.userData.debugHelper) {
              child.userData.debugHelper.visible = child.visible;
              if (child.userData.debugHelper.visible) {
                child.userData.debugHelper.update();
              }
            }
            if (!child.userData.originalMaterial) {
              child.userData.originalMaterial = child.material;
            }
            child.visible = true;

            const partType = child.userData.partType;
            const debugColor = getDebugColorForPartType(partType);
            if (!child.userData.debugMaterial) {
              child.userData.debugMaterial = new THREE.MeshBasicMaterial({
                color: debugColor,
                side: THREE.DoubleSide
              });
            }
            child.material = child.userData.debugMaterial;
          }
        });

        rendererRef.current.clear();
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      } else {
        // Restore original materials if they were overridden
        if (glassesModelRef.current) {
          glassesModelRef.current.traverse((child) => {
            if (child.isMesh) {
              if (child.userData.originalMaterial) {
                child.material = child.userData.originalMaterial;
              }
              if (child.userData.debugHelper) {
                child.userData.debugHelper.visible = false;
              }
            }
          });
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
                      applyArLensRenderState(child);
                    } else {
                      mat.transparent = false;
                      mat.opacity = 1.0;
                      mat.side = THREE.DoubleSide;
                      mat.clippingPlanes = [];
                    }
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
                        applyArLensRenderState(child);
                      } else {
                        mat.transparent = false;
                        mat.opacity = 1.0;
                        mat.side = THREE.DoubleSide;
                        mat.clippingPlanes = [];
                      }
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
                      applyArLensRenderState(child);
                    } else {
                      mat.transparent = false;
                      mat.opacity = 1.0;
                      mat.side = THREE.DoubleSide;
                      mat.clippingPlanes = [];
                    }
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
                      applyArLensRenderState(child);
                    } else {
                      mat.transparent = false;
                      mat.opacity = 1.0;
                      mat.side = THREE.DoubleSide;
                      mat.clippingPlanes = [];
                    }
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
              if (child.userData.partType === 'LENS') {
                applyArLensRenderState(child);
                return;
              }

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
              if (child.userData.partType === 'LENS') {
                applyArLensRenderState(child);
                return;
              }

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
          const productionTempleSideState = glassesModelRef.current.userData.templeSideState || getTempleSideState(0);
          const isFrontalPass = productionTempleSideState.nearSide === 'BOTH';
          const useGlbDerivedTemples = USE_FACE_ATTACHED_2_5D_TEMPLES;
          let hasSplitTempleMeshes = false;

          glassesModelRef.current.traverse((child) => {
            if (child.isMesh) {
              const basePart = getTempleBasePart(child.userData.partType);
              if (basePart === 'LEFT_TEMPLE' || basePart === 'RIGHT_TEMPLE') {
                hasSplitTempleMeshes = true;
              }
            }
          });

          const prepareProductionMesh = (child) => {
            const part = child.userData.partType;
            child.renderOrder = 0;
            child.frustumCulled = false;
            if (child.material) {
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach((mat) => {
                if (mat) {
                  if (part === 'LENS') {
                    applyArLensRenderState(child);
                    return;
                  } else if (useGlbDerivedTemples && isTemplePart(part)) {
                    const opacity = child.userData.glbDerivedTempleOpacity ?? 1;
                    mat.transparent = child.userData.originalTempleMaterialState?.transparent || opacity < 0.999;
                    mat.opacity = (child.userData.originalTempleMaterialState?.opacity ?? 1) * opacity;
                    mat.depthWrite = opacity > 0.92;
                    mat.depthTest = true;
                  } else if (isTemplePart(part)) {
                    const segmentOpacity = getTempleSegmentOpacity(
                      part,
                      productionTempleSideState,
                      debugYawDegrees,
                      glassesModelRef.current?.userData?.templeBoundaryModel,
                      glassesModelRef.current?.userData?.faceMaskModel,
                      child
                    );
                    mat.transparent = true;
                    mat.opacity = segmentOpacity;
                    mat.depthWrite = segmentOpacity > 0.85;
                    mat.depthTest = true;
                  } else {
                    mat.transparent = false;
                    mat.opacity = 1.0;
                    mat.depthTest = true;
                    mat.depthWrite = true;
                  }
                  mat.side = THREE.DoubleSide;
                  mat.clippingPlanes = [];
                }
              });
            }
          };

          const shouldRenderProductionMesh = (child, pass) => {
            const part = child.userData.partType;
            if (child.userData.skipProductionRender || part === 'MERGED_TEMPLE_SOURCE') return false;
            if (useGlbDerivedTemples && isTemplePart(part)) {
              return pass === 1 && child.userData.glbDerivedTempleVisible === true;
            }

            if (pass === 1) {
              if (isFrontalPass || part === 'BOTH_TEMPLES') return false;
              return shouldRenderTempleInPass(part, productionTempleSideState, 1);
            }

            if (part === 'FRONT_FRAME' || part === 'LENS') return true;
            if (part === 'BOTH_TEMPLES') return isFrontalPass && !hasSplitTempleMeshes;
            if (isFrontalPass) {
              const basePart = getTempleBasePart(part);
              return basePart === 'LEFT_TEMPLE' || basePart === 'RIGHT_TEMPLE';
            }
            return shouldRenderTempleInPass(part, productionTempleSideState, 2);
          };

          const setProductionPassVisibility = (pass) => {
            const visibleMeshes = [];
            glassesModelRef.current.traverse((child) => {
              if (child.isMesh) {
                const shouldShow = shouldRenderProductionMesh(child, pass);
                child.visible = shouldShow;
                prepareProductionMesh(child);
                if (shouldShow) {
                  visibleMeshes.push(`${child.name || 'UNNAMED'} (${child.userData.partType || 'UNKNOWN'})`);
                }
              }
            });
            return visibleMeshes;
          };

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

          rendererRef.current.clear();
          glassesModelRef.current.visible = true;
          setFaceAttachedTempleGroupVisible(faceAttachedTempleGroupRef.current, false);
          if (occluderRef.current) occluderRef.current.visible = false;
          if (fullOccluderRef.current) fullOccluderRef.current.visible = false;
          if (narrowOccluderRef.current) {
            narrowOccluderRef.current.visible = !isFrontalPass;
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

          const pass1VisibleMeshes = setProductionPassVisibility(1);
          if (pass1VisibleMeshes.length > 0) {
            rendererRef.current.render(sceneRef.current, cameraRef.current);
          }

          rendererRef.current.clearDepth();
          setFaceAttachedTempleGroupVisible(faceAttachedTempleGroupRef.current, false);
          if (narrowOccluderRef.current) narrowOccluderRef.current.visible = false;
          const pass2VisibleMeshes = setProductionPassVisibility(2);
          rendererRef.current.render(sceneRef.current, cameraRef.current);


        }
      }
    } else {
      setFaceAttachedTempleGroupVisible(faceAttachedTempleGroupRef.current, false);
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
  const resetCapturePreviewState = () => {
    if (recordedVideoUrlRef.current) {
      URL.revokeObjectURL(recordedVideoUrlRef.current);
    }
    setCapturedImage(null);
    setRecordedVideoUrl(null);
    setIsDownloading(false);
    setDownloadProgress(0);
    capturedImageRef.current = null;
    recordedVideoUrlRef.current = null;
    recordedBlobRef.current = null;
    chunksRef.current = [];
  };

  const startCamera = () => {
    resetCapturePreviewState();
    isAROpenRef.current = true;
    setShowGlassesMenu(false);
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    if (isRecording) stopRecording();
    isAROpenRef.current = false;
    resetCapturePreviewState();
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = null;
    }
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
            loadGlassesModel(activeARProductRef.current || activeARProduct);
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
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
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }
      clearInterval(timerIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (!sceneRef.current || !rendererRef.current || !activeARProduct) return;
    loadGlassesModel(activeARProduct);
  }, [activeARProduct]);

  useEffect(() => {
    if (!glassesModelRef.current) return;
    glassesModelRef.current.traverse((child) => {
      if (child.isMesh) {
        if (debugMode) {
          if (child.userData.debugHelper) {
            child.userData.debugHelper.visible = child.visible;
            child.userData.debugHelper.update();
          }
          if (!child.userData.originalMaterial) {
            child.userData.originalMaterial = child.material;
          }
          child.visible = true;
          const partType = child.userData.partType;
          const debugColor = getDebugColorForPartType(partType);
          if (!child.userData.debugMaterial) {
            child.userData.debugMaterial = new THREE.MeshBasicMaterial({
              color: debugColor,
              side: THREE.DoubleSide
            });
          }
          child.material = child.userData.debugMaterial;
        } else {
          if (child.userData.debugHelper) {
            child.userData.debugHelper.visible = false;
          }
          if (child.userData.originalMaterial) {
            child.material = child.userData.originalMaterial;
          }
        }
      }
    });
  }, [debugMode]);

  const capturePhoto = () => {
    if (!liveCanvasRef.current) return;
    const dataUrl = liveCanvasRef.current.toDataURL('image/jpeg', 0.95);
    setCapturedImage(dataUrl);
    capturedImageRef.current = dataUrl;
    showToast('Đã chụp ảnh!', 'success');
  };

  const handleRetake = () => {
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = null;
    }
    if (isRecordingRef.current) {
      stopRecording();
    }
    resetCapturePreviewState();
    setShowGlassesMenu(false);
    setIsRecording(false);
    isRecordingRef.current = false;
    isAROpenRef.current = true;
    requestRef.current = requestAnimationFrame(predictWebcam);
  };

  const startRecording = () => {
    if (!recordingCanvasRef.current) return;
    chunksRef.current = [];
    recordedBlobRef.current = null;

    // 1. Lấy luồng hình ảnh từ Canvas
    const canvasStream = recordingCanvasRef.current.captureStream(30);

    // 2. Lấy luồng âm thanh từ Micro
    const audioTracks = videoRef.current?.srcObject?.getAudioTracks() || [];

    // FIX 2: Trở về cách gộp Stream an toàn, KHÔNG dùng .clone() gây rè tiếng
    const combinedStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);

    // FIX 3: Ưu tiên H264 để điện thoại dùng phần cứng nén video (chống lag)
    let mimeType = 'video/webm';
    if (MediaRecorder.isTypeSupported('video/webm;codecs=h264')) mimeType = 'video/webm;codecs=h264';
    else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) mimeType = 'video/webm;codecs=vp8';
    else if (MediaRecorder.isTypeSupported('video/mp4')) mimeType = 'video/mp4';

    try {
      mediaRecorderRef.current = new MediaRecorder(combinedStream, { mimeType });
    } catch (e) {
      mediaRecorderRef.current = new MediaRecorder(combinedStream);
    }

    mediaRecorderRef.current.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    mediaRecorderRef.current.onstop = () => {
      // Đảm bảo tạo Blob đúng định dạng nén
      const blob = new Blob(chunksRef.current, { type: mimeType.split(';')[0] });
      recordedBlobRef.current = blob;
      const url = URL.createObjectURL(blob);
      setRecordedVideoUrl(url);
      recordedVideoUrlRef.current = url;
    };

    // FIX 1 CHÍ MẠNG: Xóa số 10 ở đây, để trình duyệt tự quản lý bộ đệm!
    mediaRecorderRef.current.start();

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
    } else if (recordedVideoUrl || recordedBlobRef.current) {
      const videoBlob = recordedBlobRef.current;
      if (!videoBlob || videoBlob.size === 0) {
        showToast('Chưa có video để lưu', 'error');
        return;
      }

      setIsDownloading(true);
      setDownloadProgress(10);

      const progressInterval = setInterval(() => {
        setDownloadProgress(prev => (prev < 80 ? prev + 8 : prev));
      }, 500);

      try {
        const formData = new FormData();
        formData.append('video', videoBlob, 'ar-video.webm');

        const response = await fetch('/api/ar/convert-video', {
          method: 'POST',
          body: formData,
        });

        clearInterval(progressInterval);
        setDownloadProgress(95);

        if (!response.ok) throw new Error('Conversion failed');

        const mp4Blob = await response.blob();
        if (!mp4Blob || mp4Blob.size === 0) throw new Error('Empty MP4 response');

        setDownloadProgress(100);

        downloadBlob(mp4Blob, `video-kinh-ar-${activeARProduct?._id || 'ar'}.mp4`);

        setTimeout(() => {
          setIsDownloading(false);
          showToast('Đã lưu video MP4 vào thiết bị', 'success');
        }, 500);
      } catch (error) {
        clearInterval(progressInterval);
        downloadBlob(videoBlob, `video-kinh-ar-${activeARProduct?._id || 'ar'}.webm`);
        setDownloadProgress(100);
        setTimeout(() => {
          setIsDownloading(false);
          showToast('Không thể convert MP4, đã lưu tạm video WebM', 'error');
        }, 500);
      }
    } else {
      showToast('Chưa có video để lưu', 'error');
    }
  };

  const downloadBlob = (blob, filename) => {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

  const handleCheckoutFromAR = () => {
    const selectedProduct = activeARProductRef.current || activeARProduct;
    if (!selectedProduct?._id) {
      showToast('Chưa chọn kính để thanh toán', 'error');
      return;
    }

    const cartId = `${selectedProduct._id}_std`;
    const image = Array.isArray(selectedProduct.images)
      ? selectedProduct.images[0]
      : selectedProduct.image;
    const price = selectedProduct.discountPercent > 0
      ? selectedProduct.salePrice
      : selectedProduct.price;
    const newItem = {
      cartId,
      productId: selectedProduct._id,
      name: selectedProduct.name,
      price,
      originalPrice: selectedProduct.discountPercent > 0
        ? selectedProduct.originalPrice
        : selectedProduct.price,
      discountPercent: selectedProduct.discountPercent || 0,
      salePrice: price,
      image,
      hasPrescription: false,
      od: '',
      os: '',
      od_sph: null,
      od_cyl: null,
      od_axis: null,
      os_sph: null,
      os_cyl: null,
      os_axis: null,
      pd: null,
      rxDate: null,
      rxNote: '',
      prescriptionMode: 'none',
      quantity: 1
    };

    const cartKey = getCartKey();
    const cart = JSON.parse(localStorage.getItem(cartKey)) || [];
    const existingIndex = cart.findIndex((item) => item.cartId === cartId);
    if (existingIndex !== -1) {
      cart[existingIndex] = { ...cart[existingIndex], ...newItem, quantity: cart[existingIndex].quantity || 1 };
    } else {
      cart.push(newItem);
    }

    localStorage.setItem(cartKey, JSON.stringify(cart));
    window.dispatchEvent(new Event('cartUpdated'));
    stopCamera();
    navigate('/checkout', { state: { selectedItems: [cartId] } });
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-in fade-in duration-300">
      {/* ---------------- IN-APP DEBUGGER ---------------- */}



      {/* ---------------- TOAST NOTIFICATION ---------------- */}
      <div className={`fixed top-10 left-1/2 transform -translate-x-1/2 z-[999] transition-all duration-300 ${toast.show ? 'translate-y-0 opacity-100' : '-translate-y-10 opacity-0 pointer-events-none'}`}>
        <div className={`flex items-center gap-2 px-6 py-3 rounded-full shadow-2xl font-bold text-sm ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-black/80 backdrop-blur-md text-white border border-white/20'}`}>
          {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-green-400" />}
          {toast.message}
        </div>
      </div>

      <div className="p-6 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent z-10 text-white absolute top-0 w-full gap-3">
        <div className={`min-w-0 pr-4 transition-opacity ${isRecording ? 'opacity-0' : 'opacity-100'}`}>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/55">Đang thử sản phẩm</div>
          <div className="max-w-[62vw] truncate text-sm font-black text-white drop-shadow-md">
            {(activeARProductRef.current || activeARProduct || product)?.name || 'Kinh AR'}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setDebugMode(v => !v)}
            className={`px-3 py-1.5 rounded-full font-black text-[10px] uppercase tracking-wider transition-all shadow-md ${debugMode
                ? 'bg-red-600 hover:bg-red-700 text-white border border-red-400'
                : 'bg-white/25 hover:bg-white/35 text-white border border-white/20'
              }`}
          >
            Debug Mode: {debugMode ? 'ON' : 'OFF'}
          </button>
          <button onClick={stopCamera} className="bg-white/20 hover:bg-red-500 text-white p-2 rounded-full transition-colors"><X className="w-8 h-8" /></button>
        </div>
      </div>

      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {/* BUTTON ẨN/HIỆN MESH DEBUG TRÊN DI ĐỘNG */}


        {/* BẢNG DIAGNOSTIC OVERLAY CUỘN TRÊN MÀN HÌNH */}


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


        {/* MÀN HÌNH PREVIEW SAU KHI CHỤP/QUAY */}
        {capturedImage && <div className="absolute inset-0 z-30 bg-black"><img src={capturedImage} className="w-full h-full object-cover" alt="Captured" /></div>}
        {recordedVideoUrl && <div className="absolute inset-0 z-30 bg-black"><video src={recordedVideoUrl} autoPlay loop playsInline className="w-full h-full object-cover" /></div>}

        {/* THANH ĐIỀU KHIỂN CHÍNH (Đổi mẫu, Chụp, Quay, Chỉnh độ cận) */}
        {(!capturedImage && !recordedVideoUrl) && (
          <div className="absolute w-full flex justify-center items-center px-8 z-20 transition-all duration-500 bottom-16 opacity-100">
            <button onClick={() => setShowGlassesMenu(true)} className={`flex flex-col items-center gap-1 group w-16 transition-opacity ${isRecording ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              <div className="w-14 h-14 bg-black/40 backdrop-blur-md rounded-full border border-white/30 flex items-center justify-center text-white group-hover:bg-white/20 transition-all active:scale-95"><Sparkles className="w-6 h-6 text-blue-400" /></div>
              <span className="text-white text-[10px] font-black tracking-widest uppercase mt-1 drop-shadow-md">Đổi kính</span>
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

            <button onClick={handleCheckoutFromAR} className={`flex flex-col items-center gap-1 group w-16 transition-opacity ${isRecording ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              <div className="w-14 h-14 bg-blue-600/90 backdrop-blur-md rounded-full border border-blue-300/60 flex items-center justify-center text-white group-hover:bg-blue-500 transition-all active:scale-95 shadow-xl"><ShoppingBag className="w-6 h-6" /></div>
              <span className="text-white text-[10px] font-black tracking-widest uppercase mt-1 drop-shadow-md">Mua ngay</span>
            </button>
          </div>
        )}

        {/* NGĂN KÉO CHỌN MẪU KÍNH 3D */}
        <div className={`absolute bottom-0 w-full z-30 bg-black/80 backdrop-blur-3xl rounded-t-[40px] pt-6 pb-12 transition-transform duration-500 ease-out ${showGlassesMenu ? 'translate-y-0' : 'translate-y-full'}`}>
          <div className="flex justify-between items-center px-8 mb-6">
            <span className="text-white text-xs font-black tracking-widest uppercase flex items-center gap-2"><Eye className="w-4 h-4 text-blue-400" /> Chọn kính ({allArProducts?.length || 0})</span>
            <button onClick={() => setShowGlassesMenu(false)} className="bg-white/10 p-2 rounded-full text-white"><ChevronDown className="w-5 h-5" /></button>
          </div>
          <div className="flex gap-4 overflow-x-auto px-8 pb-4" style={{ scrollbarWidth: 'none' }}>
            {(allArProducts || []).map((item) => (
              <button key={item._id} onClick={() => { setActiveARProduct(item); setShowGlassesMenu(false); }} className={`relative flex-shrink-0 w-32 h-32 rounded-[32px] border-2 transition-all duration-300 ${activeARProduct?._id === item._id ? 'bg-white/10 border-blue-500 scale-105 shadow-2xl' : 'bg-black/20 border-white/5 opacity-70 hover:opacity-100'}`}>
                <img src={item.images?.[0] || item.image} className="w-full h-full object-cover p-2 rounded-[30px]" alt={item.name} />
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
            <button onClick={handleRetake} className="bg-white/20 backdrop-blur-md text-white py-4 rounded-[24px] font-black flex items-center justify-center gap-2 border border-white/30 hover:bg-white/30 transition-all active:scale-95">
              <RefreshCw className="w-5 h-5" /> LÀM LẠI
            </button>
            <button onClick={handleDownloadTikTokStyle} className="bg-blue-600 text-white py-4 rounded-[24px] font-black flex items-center justify-center gap-2 shadow-xl hover:bg-blue-700 transition-all active:scale-95">
              <Download className="w-5 h-5" /> LƯU VỀ MÁY
            </button>
          </div>
        )}

        {/* 📐 EXPERIMENT 1 UI PANEL */}

        {debugMode && debugPanelInfo && (
          <div className="fixed bottom-4 right-4 z-[999] bg-black/85 backdrop-blur-md border border-white/10 rounded-xl p-4 text-xs font-mono text-white shadow-2xl min-w-[240px] pointer-events-none">
            <div className="font-bold text-yellow-400 mb-2 border-b border-white/15 pb-1">AR GLB DEBUG PANEL</div>
            <div className="flex justify-between gap-4 py-0.5">
              <span className="text-white/60">Model Name:</span>
              <span className="font-semibold text-right max-w-[120px] truncate">{debugPanelInfo.modelName}</span>
            </div>
            <div className="flex justify-between gap-4 py-0.5">
              <span className="text-white/60">Mesh Count:</span>
              <span className="font-semibold text-green-400">{debugPanelInfo.meshCount}</span>
            </div>
            <div className="flex justify-between gap-4 py-0.5">
              <span className="text-white/60">FRONT_FRAME Count:</span>
              <span className="font-semibold text-emerald-400">{debugPanelInfo.frontFrameCount}</span>
            </div>
            <div className="flex justify-between gap-4 py-0.5">
              <span className="text-white/60">LEFT_TEMPLE Count:</span>
              <span className="font-semibold text-red-400">{debugPanelInfo.leftTempleCount}</span>
            </div>
            <div className="flex justify-between gap-4 py-0.5">
              <span className="text-white/60">RIGHT_TEMPLE Count:</span>
              <span className="font-semibold text-blue-400">{debugPanelInfo.rightTempleCount}</span>
            </div>
            <div className="flex justify-between gap-4 py-0.5">
              <span className="text-white/60">LENS Count:</span>
              <span className="font-semibold text-yellow-300">{debugPanelInfo.lensCount}</span>
            </div>
            <div className="flex justify-between gap-4 py-0.5">
              <span className="text-white/60">Single Mesh:</span>
              <span className={`font-semibold ${debugPanelInfo.isSingleMesh === 'YES' ? 'text-orange-400' : 'text-gray-400'}`}>{debugPanelInfo.isSingleMesh}</span>
            </div>
            <div className="flex justify-between gap-4 py-0.5">
              <span className="text-white/60">Temple Segments Count:</span>
              <span className="font-semibold text-purple-400">{debugPanelInfo.templeSegmentsCount}</span>
            </div>
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
