import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { Vector2, Vector3 } from "three";

const PINCH_THRESHOLD = 0.04;
const FIST_THRESHOLD = 0.2;

const PAN_SENSITIVITY = 5.0;
const ZOOM_SENSITIVITY = 1.0;
const ORBIT_SENSITIVITY = 3.5;
const GESTURE_MODE_THRESHOLD = 2.5;

export class HandController {
  constructor(videoElement, controls) {
    this.video = videoElement;
    this.controls = controls;
    this.controls.minPolarAngle = 0.1;
    this.controls.maxPolarAngle = Math.PI - 0.1;
    this.handLandmarker = null;
    this.lastVideoTime = -1;
    this.isPanning = false;
    this.panStart = new Vector2();
    this.isMultiHandGesture = false;
    this.lastPinchDistXY = 0;
    this.lastPinchDistZ = 0;
    this.lastMidPointY = 0;
    this.panDelta = new Vector3();
    this.orbitDelta = { x: 0, y: 0 };
  }

  async init() {
    console.log("HandController: Initializing...");
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `/models/hand_landmarker.task`,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 2,
    });
    console.log("✅ Hand Landmarker initialized.");
  }

  update(alpha) {
    const camera = this.controls.object;
    let needsUpdate = false;
    if (this.panDelta.lengthSq() > 1e-6) {
      const panOffset = this.panDelta.clone().multiplyScalar(alpha);
      camera.position.add(panOffset);
      this.controls.target.add(panOffset);
      this.panDelta.multiplyScalar(1 - alpha);
      needsUpdate = true;
    }
    if (Math.abs(this.orbitDelta.x) > 1e-6) {
      const phi = this.orbitDelta.x * alpha;
      const offset = new Vector3().subVectors(
        camera.position,
        this.controls.target
      );
      offset.applyAxisAngle(new Vector3(0, 1, 0), phi);
      camera.position.copy(this.controls.target).add(offset);
      this.orbitDelta.x *= 1 - alpha;
      needsUpdate = true;
    }
    if (Math.abs(this.orbitDelta.y) > 1e-6) {
      const theta = this.orbitDelta.y * alpha;
      const offset = new Vector3().subVectors(
        camera.position,
        this.controls.target
      );
      const axis = new Vector3().setFromMatrixColumn(camera.matrix, 0);
      offset.applyAxisAngle(axis, theta);
      camera.position.copy(this.controls.target).add(offset);
      this.orbitDelta.y *= 1 - alpha;
      needsUpdate = true;
    }
    if (needsUpdate) this.controls.update();
  }

  predictWebcam() {
    if (this.video.currentTime !== this.lastVideoTime && this.handLandmarker) {
      const results = this.handLandmarker.detectForVideo(
        this.video,
        Date.now()
      );
      const wasGesturing = this.isPanning || this.isMultiHandGesture;

      if (results.landmarks && results.landmarks.length > 0) {
        // --- CHANGE 1: Pass handedness data ---
        this.processGestures(results.landmarks, results.handedness);
      } else {
        this.isPanning = this.isMultiHandGesture = false;
      }
      this.lastVideoTime = this.video.currentTime;

      const isGesturing = this.isPanning || this.isMultiHandGesture;

      if (isGesturing && !wasGesturing) {
        this.controls.enabled = false;
      } else if (!isGesturing && wasGesturing) {
        this.controls.enabled = true;
      }
    }
    window.requestAnimationFrame(() => this.predictWebcam());
  }

  // --- CHANGE 2: Accept 'handedness' as an argument ---
  processGestures(landmarks, handedness) {
    // --- CHANGE 3: Check for left-hand fist first ---
    // Iterate through each detected hand
    for (let i = 0; i < landmarks.length; i++) {
      const handLandmarks = landmarks[i];
      // The handedness array from MediaPipe contains an object with the categoryName
      const handLabel = handedness[i][0].categoryName;
      const handData = this.getHandData(handLandmarks);

      // If the hand is a fist AND it's the 'Left' hand, then reset.
      if (handData.isFist && handLabel === "Left") {
        console.log("LEFT hand fist detected! Resetting camera.");
        this.controls.reset();
        this.isPanning = this.isMultiHandGesture = false;
        return; // Exit the function early to prevent other gestures
      }
    }

    // If no left-hand fist was detected, proceed with the normal pinch logic
    const hands = landmarks.map((hand) => this.getHandData(hand));
    const hand1 = hands[0];
    const hand2 = hands[1];

    if (hand1 && hand2 && hand1.isPinching && hand2.isPinching) {
      const distXY = Math.hypot(
        hand1.pinchPoint.x - hand2.pinchPoint.x,
        hand1.pinchPoint.y - hand2.pinchPoint.y
      );
      const distZ = hand1.pinchPoint.z - hand2.pinchPoint.z;
      const midY = (hand1.pinchPoint.y + hand2.pinchPoint.y) / 2;
      if (!this.isMultiHandGesture) {
        this.isMultiHandGesture = true;
        this.lastPinchDistXY = distXY;
        this.lastPinchDistZ = distZ;
        this.lastMidPointY = midY;
      } else {
        const deltaXY_abs = Math.abs(distXY - this.lastPinchDistXY);
        const deltaZ_abs = Math.abs(distZ - this.lastPinchDistZ);
        const deltaY_abs = Math.abs(midY - this.lastMidPointY);
        if (
          deltaXY_abs > deltaZ_abs * GESTURE_MODE_THRESHOLD &&
          deltaXY_abs > deltaY_abs * GESTURE_MODE_THRESHOLD
        ) {
          const zoomFactor =
            (this.lastPinchDistXY / distXY - 1) * ZOOM_SENSITIVITY + 1;
          const vec = new Vector3().subVectors(
            this.controls.object.position,
            this.controls.target
          );
          vec.multiplyScalar(zoomFactor);
          this.controls.object.position.copy(this.controls.target).add(vec);
        } else {
          if (deltaZ_abs > deltaY_abs) {
            const orbitAngle =
              (distZ - this.lastPinchDistZ) * ORBIT_SENSITIVITY * Math.PI;
            this.orbitDelta.x += orbitAngle;
          } else {
            const deltaY = midY - this.lastMidPointY;
            const orbitAngleY = deltaY * ORBIT_SENSITIVITY * Math.PI;
            this.orbitDelta.y += orbitAngleY;
          }
        }
        this.lastPinchDistXY = distXY;
        this.lastPinchDistZ = distZ;
        this.lastMidPointY = midY;
        this.controls.update();
      }
      this.isPanning = false;
    } else if (hand1 && hand1.isPinching) {
      if (!this.isPanning) {
        this.isPanning = true;
        this.panStart.copy(new Vector2(hand1.pinchPoint.x, hand1.pinchPoint.y));
      } else {
        const panEnd = new Vector2(hand1.pinchPoint.x, hand1.pinchPoint.y);
        const delta = panEnd.clone().sub(this.panStart);
        const panScaleFactor =
          PAN_SENSITIVITY *
          (this.controls.object.position.distanceTo(this.controls.target) /
            this.controls.object.zoom);

        const vX = new Vector3().setFromMatrixColumn(
          this.controls.object.matrix,
          0
        );
        const vY = new Vector3().setFromMatrixColumn(
          this.controls.object.matrix,
          1
        );

        const panOffsetX = vX.clone().multiplyScalar(delta.x * panScaleFactor);
        const panOffsetY = vY.clone().multiplyScalar(delta.y * panScaleFactor);
        const panOffset = new Vector3().add(panOffsetX).add(panOffsetY);

        this.panDelta.add(panOffset);
        this.panStart.copy(panEnd);
      }
      this.isMultiHandGesture = false;
    } else {
      this.isPanning = this.isMultiHandGesture = false;
    }
  }

  getHandData(landmarks) {
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const wrist = landmarks[0];
    const pinchPoint3D = new Vector3(
      (thumbTip.x + indexTip.x) / 2,
      (thumbTip.y + indexTip.y) / 2,
      (thumbTip.z + indexTip.z) / 2
    );
    const pinchDistXY = Math.hypot(
      thumbTip.x - indexTip.x,
      thumbTip.y - indexTip.y
    );
    const fingertips = [
      landmarks[8],
      landmarks[12],
      landmarks[16],
      landmarks[20],
    ];
    const distances = fingertips.map((tip) =>
      Math.hypot(tip.x - wrist.x, tip.y - wrist.y)
    );
    const isFist = distances.every((dist) => dist < FIST_THRESHOLD);
    return {
      pinchPoint: pinchPoint3D,
      isPinching: pinchDistXY < PINCH_THRESHOLD,
      isFist,
    };
  }
}
