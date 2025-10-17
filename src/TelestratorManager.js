// FILE: src/TelestratorManager.js (COMPLETE FILE FOR REPLACEMENT)

import {
  Raycaster,
  Vector2,
  Line,
  BufferGeometry,
  LineBasicMaterial,
  Vector3,
  Group,
  Mesh,
  ConeGeometry,
  TorusGeometry,
  MeshBasicMaterial,
  ArcCurve,
  PlaneGeometry,
  CircleGeometry,
} from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { XgVisualizer } from "./XgVisualizer.js";
import { calculateXg } from "./XgCalculator.js";
import { LsVisualizer } from "./LsVisualizer.js";
import { calculateLs } from "./LsCalculator.js";
import { PathVisualizer } from "./PathVisualizer.js";
import { calculateAllMetrics } from "./MetricCalculator.js";
import { stageEntry } from "./DataExporterUI.js";
import {
  isPointInTriangle,
  calculatePolygonArea,
  getPassingCone,
} from "./utils.js";
import { ControlLinesVisualizer } from "./ControlLinesVisualizer.js";
import { ControlRingVisualizer } from "./ControlRingVisualizer.js";
import { updateDebugPanel, toggleDebugPanel } from "./DebugPanel.js";
import { calculateGlobalFeatures } from "./FeatureCalculator.js";

const Y_OFFSET = 0.02;
const INTERCEPTION_RADIUS = 1.5;

function computeConvexHull2D(points) {
  const pts = points
    .map((p) => ({ x: p.x, z: p.z, original: p }))
    .sort((a, b) => a.x - b.x || a.z - b.z);
  const cross = (o, a, b) =>
    (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    )
      lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    )
      upper.pop();
    upper.push(p);
  }
  return lower
    .slice(0, -1)
    .concat(upper.slice(0, -1))
    .map((p) => p.original);
}

function distanceToLineSegment(p, v, w) {
  const l2 = v.distanceToSquared(w);
  if (l2 === 0) return p.distanceTo(v);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.z - v.z) * (w.z - v.z)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projection = new Vector3(
    v.x + t * (w.x - v.x),
    0,
    v.z + t * (w.z - v.z)
  );
  return p.distanceTo(projection);
}

export class TelestratorManager {
  constructor(
    scene,
    camera,
    groundPlane,
    playerManager,
    labelRenderer,
    { onDrawStart },
    xTGridData
  ) {
    this.scene = scene;
    this.camera = camera;
    this.groundPlane = groundPlane;
    this.playerManager = playerManager;
    this.labelRenderer = labelRenderer;
    this.onDrawStart = onDrawStart;
    this.raycaster = new Raycaster();
    this.mouse = new Vector2();
    this.currentTool = "cursor";
    this.currentColor = "#ffff00";
    this.isDrawing = false;
    this.currentDrawing = null;
    this.annotations = new Group();
    this.scene.add(this.annotations);
    this.highlights = new Map();
    this.highlightedPlayerIds = new Set();
    this.isTrackMode = false;
    this.formationShapes = new Group();
    this.scene.add(this.formationShapes);
    this.formationLabels = new Group();
    this.scene.add(this.formationLabels);
    this.formationToolState = { home: new Set(), away: new Set() };
    this.passingLaneState = "idle";
    this.passer = null;
    this.activeLanes = [];
    this.passingLanesGroup = new Group();
    this.scene.add(this.passingLanesGroup);
    this.isXgMode = false;
    this.xgVisualizer = new XgVisualizer(scene);
    this.isLsMode = false;
    this.lsVisualizer = new LsVisualizer(scene);
    this.pathVisualizer = new PathVisualizer(scene);
    this.previousPathInterceptors = new Set();
    this.previousPressuringDefenders = new Set();
    this.pitchLength = 105;
    this.pitchWidth = 68;
    this.playbackClockRef = { value: 0 };
    this.captureRequest = null;
    this.xTGridData = xTGridData;
    this.controlLinesVisualizer = new ControlLinesVisualizer(scene);
    this.controlRingVisualizer = new ControlRingVisualizer(scene); // Flag for requesting data capture
  }

  getXtValue(position) {
    if (!this.xTGridData || !this.xTGridData.data) {
      return 0.0; // Return a neutral value if data isn't loaded
    }

    const [gridRows, gridCols] = this.xTGridData.grid_size;

    // xT grids are defined for a non-inverted pitch (attacking +X).
    // Our app's coordinates are inverted. We must re-invert the lookup
    // position to match the grid's coordinate system.
    const lookupX = -position.x;

    // Convert world coordinates to a 0-1 percentage
    const x_percent = (lookupX + this.pitchLength / 2) / this.pitchLength;
    const z_percent = (position.z + this.pitchWidth / 2) / this.pitchWidth;

    // Convert percentage to grid index
    const rowIndex = Math.floor(x_percent * gridRows);
    const colIndex = Math.floor(z_percent * gridCols);

    // Clamp values to be within the grid bounds
    const clampedRow = Math.max(0, Math.min(gridRows - 1, rowIndex));
    const clampedCol = Math.max(0, Math.min(gridCols - 1, colIndex));

    const index = clampedRow * gridCols + clampedCol;

    // Normalize the xT value (our mock data max is ~0.3)
    const rawXt = this.xTGridData.data[index] || 0.0;
    return Math.min(1.0, rawXt / 0.4); // Normalize to a ~0-1 range for our calculator
  }

  setPlaybackClockRef(clockRef) {
    this.playbackClockRef = clockRef;
  }

  handleMouseUp() {
    if (this.isDrawing && this.currentTool.startsWith("zone")) {
      const capturedLQZone =
        this.annotations.children[this.annotations.children.length - 1];

      const carrier = this.playerManager.playerInPossession;
      if (carrier) {
        // --- We need to recalculate the goal and direction here to pass it ---
        const PITCH_LENGTH = 105;
        const HALFTIME_MS = 2700000;
        const homeTeamName = this.playerManager.metadata.home_team.name;
        const isCarrierHomeTeam = carrier.playerData.team === homeTeamName;
        const isSecondHalf = this.playbackClockRef.value > HALFTIME_MS;
        let attackingDirection;
        if (isCarrierHomeTeam) {
          attackingDirection = isSecondHalf ? -1 : 1;
        } else {
          attackingDirection = isSecondHalf ? 1 : -1;
        }
        const goalX = (attackingDirection * PITCH_LENGTH) / 2;
        const goal = {
          position: new Vector3(goalX, 0, 0),
          post1: new Vector3(goalX, 0, 7.32 / 2),
          post2: new Vector3(goalX, 0, -7.32 / 2),
        };
        // --- End recalculation ---

        const fullDataPacket = {
          timestamp: this.playbackClockRef.value,
          lq_zone: capturedLQZone, // This is the Mesh
          playerManager: this.playerManager,
          attackingTeamName: carrier.playerData.team,
          attackingDirection: attackingDirection,
          goal: goal, // Pass the goal object
        };

        stageEntry(fullDataPacket);
      }
    }
    this.isDrawing = false;
  }

  setTool(tool) {
    this.currentTool = tool;
    this.passer = null;
    this.passingLaneState = "idle";
    if (tool !== "connect-highlighted") {
      this.formationToolState.home.clear();
      this.formationToolState.away.clear();
    }
  }

  updateFormationTool(teamId, tool, isEnabled) {
    this.currentTool = "none";
    if (tool === "clear-all") {
      this.formationToolState[teamId].clear();
      return;
    }
    if (isEnabled) {
      this.formationToolState[teamId].add(tool);
    } else {
      this.formationToolState[teamId].delete(tool);
    }
  }

  setColor(color) {
    this.currentColor = color;
  }

  setTrackMode(enabled) {
    this.isTrackMode = enabled;
    for (const player of this.playerManager.playerMap.values()) {
      if (this.highlightedPlayerIds.has(player.playerData.id) && enabled) {
        player.startTracking(this.scene);
      } else {
        player.stopTracking(this.scene);
      }
    }
  }

  setXgMode(enabled) {
    this.isXgMode = enabled;
    if (!enabled) {
      this.xgVisualizer.setVisible(false);
      this.previousPressuringDefenders.forEach((p) =>
        p.hideInterceptorHighlight()
      );
      this.previousPressuringDefenders.clear();
    }
  }

  setLsMode(enabled) {
    this.isLsMode = enabled;
    if (!enabled) {
      this.lsVisualizer.setVisible(false);
      this.pathVisualizer.setVisible(false);
      this.controlLinesVisualizer.setVisible(false);
      this.controlRingVisualizer.setVisible(false);
      this.previousPathInterceptors.forEach((p) =>
        p.hideInterceptorHighlight()
      );
      this.previousPathInterceptors.clear();
      toggleDebugPanel(enabled);
    }
  }

  getIntersectionPoint(event) {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObject(this.groundPlane);
    return intersects.length > 0 ? intersects[0].point : null;
  }

  getZones() {
    return this.annotations.children.filter((child) => child.userData.isZone);
  }

  handleMouseDown(event) {
    if (event.button !== 0) return;
    if (this.currentTool === "none") return;

    if (this.currentTool === "passing-lane") {
      const playerMeshes = this.playerManager.getPlayerMeshes();
      this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(playerMeshes);
      if (intersects.length > 0) {
        const clickedPlayer = intersects[0].object.userData.player;
        if (this.passingLaneState === "idle") {
          this.passer = clickedPlayer;
          this.passingLaneState = "awaiting_receiver";
        } else if (this.passingLaneState === "awaiting_receiver") {
          if (clickedPlayer !== this.passer) {
            this.createPassingLane(this.passer, clickedPlayer);
          }
          this.passer = null;
          this.passingLaneState = "idle";
        }
      } else {
        this.passer = null;
        this.passingLaneState = "idle";
      }
      return;
    }

    if (this.currentTool === "erase") {
      this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(
        [...this.annotations.children, ...this.passingLanesGroup.children],
        true
      );
      if (intersects.length > 0) {
        let objectToErase = intersects[0].object;
        while (
          objectToErase.parent &&
          !objectToErase.userData.isHighlight &&
          objectToErase.parent !== this.annotations &&
          objectToErase.parent !== this.passingLanesGroup
        ) {
          objectToErase = objectToErase.parent;
        }
        if (objectToErase.userData.isHighlight) {
          const playerIdToRemove = [...this.highlights.entries()].find(
            ([id, mesh]) => mesh === objectToErase
          )?.[0];
          if (playerIdToRemove) {
            this.highlights.delete(playerIdToRemove);
            this.highlightedPlayerIds.delete(playerIdToRemove);
            const player = this.playerManager.playerMap.get(playerIdToRemove);
            if (player) player.stopTracking(this.scene);
          }
        }
        this.annotations.remove(objectToErase);
        this.passingLanesGroup.remove(objectToErase);
      }
      return;
    }

    if (this.currentTool === "highlight") {
      this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const playerMeshes = this.playerManager.getPlayerMeshes();
      const intersects = this.raycaster.intersectObjects(playerMeshes);
      if (intersects.length > 0) {
        const clickedPlayer = intersects[0].object.userData.player;
        const playerId = clickedPlayer.playerData.id;
        if (this.highlightedPlayerIds.has(playerId)) {
          this.highlightedPlayerIds.delete(playerId);
          const highlightMesh = this.highlights.get(playerId);
          if (highlightMesh) {
            this.annotations.remove(highlightMesh);
            this.highlights.delete(playerId);
          }
          clickedPlayer.stopTracking(this.scene);
        } else {
          this.highlightedPlayerIds.add(playerId);
          const geometry = new TorusGeometry(0.7, 0.08, 16, 48);
          const material = new MeshBasicMaterial({ color: this.currentColor });
          const highlightMesh = new Mesh(geometry, material);
          highlightMesh.rotation.x = -Math.PI / 2;
          highlightMesh.userData.isHighlight = true;
          this.highlights.set(playerId, highlightMesh);
          this.annotations.add(highlightMesh);
          if (this.isTrackMode) {
            clickedPlayer.startTracking(this.scene);
          }
        }
      }
      return;
    }

    if (
      this.currentTool === "cursor" ||
      this.currentTool === "connect-highlighted"
    )
      return;

    const startPoint = this.getIntersectionPoint(event);
    if (!startPoint) return;
    if (this.onDrawStart) this.onDrawStart();
    this.isDrawing = true;

    if (this.currentTool.startsWith("zone")) {
      const zoneMaterial = new MeshBasicMaterial({
        color: 0xff4136,
        opacity: 0.4,
        transparent: true,
      });
      if (this.currentTool === "zone-box") {
        const geometry = new PlaneGeometry(1, 1);
        this.currentDrawing = new Mesh(geometry, zoneMaterial);
        this.currentDrawing.rotation.x = -Math.PI / 2;
        this.currentDrawing.position.copy(startPoint);
        this.currentDrawing.userData = {
          isZone: true,
          type: "box",
          startPoint,
        };
      } else if (this.currentTool === "zone-circle") {
        const geometry = new CircleGeometry(1, 48);
        this.currentDrawing = new Mesh(geometry, zoneMaterial);
        this.currentDrawing.rotation.x = -Math.PI / 2;
        this.currentDrawing.position.copy(startPoint);
        this.currentDrawing.scale.set(0.01, 0.01, 0.01);
        this.currentDrawing.userData = {
          isZone: true,
          type: "circle",
          startPoint,
        };
      }
      if (this.currentDrawing) this.annotations.add(this.currentDrawing);
      return;
    }

    this.currentDrawing = new Group();
    this.currentDrawing.userData.startPoint = startPoint;
    const material = new LineBasicMaterial({
      color: this.currentColor,
      linewidth: 3,
    });
    if (this.currentTool === "line" || this.currentTool === "arrow") {
      const geometry = new BufferGeometry().setFromPoints([
        startPoint.clone(),
        startPoint.clone(),
      ]);
      const line = new Line(geometry, material);
      this.currentDrawing.add(line);
      if (this.currentTool === "arrow") {
        const coneGeo = new ConeGeometry(0.3, 0.8, 16);
        const coneMat = new MeshBasicMaterial({ color: this.currentColor });
        const cone = new Mesh(coneGeo, coneMat);
        this.currentDrawing.add(cone);
      }
    } else if (this.currentTool === "circle") {
      const points = new ArcCurve(0, 0, 1, 0, 2 * Math.PI, false).getPoints(64);
      const geometry = new BufferGeometry().setFromPoints(points);
      const circle = new Line(geometry, material);
      circle.position.copy(startPoint);
      circle.rotation.x = -Math.PI / 2;
      this.currentDrawing.add(circle);
    } else if (this.currentTool === "freehand") {
      const points = [startPoint];
      const geometry = new BufferGeometry().setFromPoints(points);
      const line = new Line(geometry, material);
      line.userData.points = points;
      this.currentDrawing.add(line);
    }
    if (this.currentDrawing) this.annotations.add(this.currentDrawing);
  }

  handleMouseMove(event) {
    if (!this.isDrawing || !this.currentDrawing) return;
    const movePoint = this.getIntersectionPoint(event);
    if (!movePoint) return;
    const startPoint = this.currentDrawing.userData.startPoint;
    if (this.currentDrawing.userData.isZone) {
      if (this.currentDrawing.userData.type === "box") {
        const width = Math.abs(movePoint.x - startPoint.x);
        const depth = Math.abs(movePoint.z - startPoint.z);
        this.currentDrawing.scale.set(width, depth, 1);
        this.currentDrawing.position.set(
          (startPoint.x + movePoint.x) / 2,
          Y_OFFSET,
          (startPoint.z + movePoint.z) / 2
        );
      } else if (this.currentDrawing.userData.type === "circle") {
        const radius = startPoint.distanceTo(movePoint);
        this.currentDrawing.scale.set(radius, radius, radius);
      }
      return;
    }
    if (this.currentTool === "line" || this.currentTool === "arrow") {
      const line = this.currentDrawing.children[0];
      line.geometry.attributes.position.setXYZ(
        1,
        movePoint.x,
        movePoint.y,
        movePoint.z
      );
      line.geometry.attributes.position.needsUpdate = true;
      if (this.currentTool === "arrow") {
        const cone = this.currentDrawing.children[1];
        cone.position.copy(movePoint);
        const direction = new Vector3().subVectors(movePoint, startPoint);
        if (direction.length() > 0.01) {
          direction.normalize();
          cone.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction);
        }
      }
    } else if (this.currentTool === "circle") {
      const circle = this.currentDrawing.children[0];
      const radius = startPoint.distanceTo(movePoint);
      circle.scale.set(radius, radius, radius);
    } else if (this.currentTool === "freehand") {
      const line = this.currentDrawing.children[0];
      line.userData.points.push(movePoint);
      line.geometry.dispose();
      line.geometry = new BufferGeometry().setFromPoints(line.userData.points);
    }
  }

  undoLast() {
    const children = this.annotations.children;
    if (children.length > 0) {
      const lastDrawing = children[children.length - 1];
      if (lastDrawing.userData.isHighlight) {
        const playerIdToRemove = [...this.highlights.entries()].find(
          ([id, mesh]) => mesh === lastDrawing
        )?.[0];
        if (playerIdToRemove) {
          this.highlights.delete(playerIdToRemove);
          this.highlightedPlayerIds.delete(playerIdToRemove);
          const player = this.playerManager.playerMap.get(playerIdToRemove);
          if (player) player.stopTracking(this.scene);
        }
      }
      this.annotations.remove(lastDrawing);
    }
  }

  createPassingLane(passer, receiver) {
    const laneGroup = new Group();
    laneGroup.userData = {
      passerId: passer.playerData.id,
      receiverId: receiver.playerData.id,
      previousInterceptors: new Set(),
    };
    const outerGlowMat = new LineBasicMaterial({
      color: 0x00aaff,
      transparent: true,
      opacity: 0.15,
      linewidth: 7,
    });
    const innerGlowMat = new LineBasicMaterial({
      color: 0x00aaff,
      transparent: true,
      opacity: 0.25,
      linewidth: 4,
    });
    const coreLineMat = new LineBasicMaterial({
      color: 0xeeffff,
      linewidth: 1.5,
    });
    const points = [
      passer.mesh.position.clone(),
      receiver.mesh.position.clone(),
    ];
    const geometry = new BufferGeometry().setFromPoints(points);
    const outerGlow = new Line(geometry.clone(), outerGlowMat);
    const innerGlow = new Line(geometry.clone(), innerGlowMat);
    const coreLine = new Line(geometry, coreLineMat);
    laneGroup.add(outerGlow, innerGlow, coreLine);
    this.passingLanesGroup.add(laneGroup);
    this.activeLanes.push(laneGroup);
  }

  clearAll() {
    this.annotations.clear();
    this.highlights.clear();
    this.highlightedPlayerIds.clear();
    this.formationShapes.clear();
    this.formationLabels.clear();
    this.formationToolState.home.clear();
    this.formationToolState.away.clear();
    for (const player of this.playerManager.playerMap.values()) {
      player.stopTracking(this.scene);
      player.hideInterceptorHighlight();
    }
    this.activeLanes.forEach((lane) => {
      lane.userData.previousInterceptors.forEach((player) =>
        player.hideInterceptorHighlight()
      );
    });
    this.activeLanes = [];
    this.passingLanesGroup.clear();
    this.setXgMode(false);
    this.previousPathInterceptors.forEach((p) => p.hideInterceptorHighlight());
    this.previousPathInterceptors.clear();
    this.setLsMode(false);
  }

  clearAllTrackLines() {
    if (!this.isTrackMode) return;
    for (const playerId of this.highlightedPlayerIds) {
      const player = this.playerManager.playerMap.get(playerId);
      if (player) player.clearTrackLine();
    }
  }

  createLabel(text, position) {
    const div = document.createElement("div");
    div.className = "formation-label";
    div.textContent = text;
    div.style.color = "white";
    div.style.fontSize = "14px";
    div.style.fontWeight = "bold";
    div.style.padding = "2px 5px";
    div.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    div.style.borderRadius = "4px";
    div.style.textShadow = "1px 1px 2px black";
    const label = new CSS2DObject(div);
    label.position.copy(position);
    this.formationLabels.add(label);
  }

  updateFormationShapes() {
    this.formationShapes.clear();
    this.formationLabels.clear();
    const homeTeamName = this.playerManager.metadata.home_team.name;
    const awayTeamName = this.playerManager.metadata.away_team.name;
    const teams = [
      {
        id: "home",
        name: homeTeamName,
        color: this.playerManager.teamColorMap[homeTeamName],
      },
      {
        id: "away",
        name: awayTeamName,
        color: this.playerManager.teamColorMap[awayTeamName],
      },
    ];
    for (const team of teams) {
      for (const tool of this.formationToolState[team.id]) {
        let players = [];
        let isConvex = tool === "full-team-convex";
        if (isConvex) {
          players = this.playerManager.getAllTeamPlayers(team.name);
        } else {
          players = this.playerManager.getPlayersByGroup(team.name, tool);
        }
        if (players.length < 2) continue;
        const positions = players.map((p) => p.mesh.position);
        const material = new LineBasicMaterial({
          color: team.color.clone().multiplyScalar(1.2),
          linewidth: 3,
        });
        let shapePoints = [];
        if (isConvex) {
          shapePoints = computeConvexHull2D(positions);
          if (shapePoints.length > 0) {
            const area = calculatePolygonArea(shapePoints);
            const centroid = shapePoints
              .reduce((acc, p) => acc.add(p), new Vector3())
              .divideScalar(shapePoints.length);
            centroid.y = Y_OFFSET + 0.5;
            this.createLabel(`${area.toFixed(0)} m²`, centroid);
            shapePoints.push(shapePoints[0]);
          }
        } else {
          shapePoints = positions.sort((a, b) => a.z - b.z);
          let totalDist = 0;
          for (let i = 0; i < shapePoints.length - 1; i++) {
            totalDist += shapePoints[i].distanceTo(shapePoints[i + 1]);
          }
          if (shapePoints.length > 0) {
            const midPoint = shapePoints
              .reduce((acc, p) => acc.add(p), new Vector3())
              .divideScalar(shapePoints.length);
            midPoint.y = Y_OFFSET + 0.5;
            this.createLabel(`${totalDist.toFixed(1)} m`, midPoint);
          }
        }
        if (shapePoints.length > 0) {
          const geometry = new BufferGeometry().setFromPoints(shapePoints);
          const line = new Line(geometry, material);
          line.position.y = Y_OFFSET + 0.01;
          this.formationShapes.add(line);
        }
      }
    }
    if (
      this.currentTool === "connect-highlighted" &&
      this.highlightedPlayerIds.size >= 2
    ) {
      const highlightedPlayers = [];
      this.highlightedPlayerIds.forEach((id) => {
        const player = this.playerManager.playerMap.get(id);
        if (player) highlightedPlayers.push(player);
      });
      if (highlightedPlayers.length < 2) return;
      const positions = highlightedPlayers.map((p) => p.mesh.position);
      const material = new LineBasicMaterial({
        color: this.currentColor,
        linewidth: 3,
      });
      let shapePoints = computeConvexHull2D(positions);
      if (shapePoints.length > 0) {
        const area = calculatePolygonArea(shapePoints);
        const centroid = shapePoints
          .reduce((acc, p) => acc.add(p), new Vector3())
          .divideScalar(shapePoints.length);
        centroid.y = Y_OFFSET + 0.5;
        this.createLabel(`${area.toFixed(0)} m²`, centroid);
        shapePoints.push(shapePoints[0]);
        const geometry = new BufferGeometry().setFromPoints(shapePoints);
        const line = new Line(geometry, material);
        line.position.y = Y_OFFSET + 0.01;
        this.formationShapes.add(line);
      }
    }
  }

  updatePassingLanes() {
    if (this.activeLanes.length === 0) return;
    for (const lane of this.activeLanes) {
      const passer = this.playerManager.playerMap.get(lane.userData.passerId);
      const receiver = this.playerManager.playerMap.get(
        lane.userData.receiverId
      );
      if (!passer || !receiver) {
        lane.visible = false;
        continue;
      }
      lane.visible = true;
      const passerPos = passer.mesh.position;
      const receiverPos = receiver.mesh.position;
      lane.children.forEach((line) => {
        line.geometry.attributes.position.setXYZ(
          0,
          passerPos.x,
          passerPos.y,
          passerPos.z
        );
        line.geometry.attributes.position.setXYZ(
          1,
          receiverPos.x,
          receiverPos.y,
          receiverPos.z
        );
        line.geometry.attributes.position.needsUpdate = true;
      });
      const currentInterceptors = new Set();
      const passerTeam = passer.playerData.team;
      for (const opponent of this.playerManager.playerMap.values()) {
        if (
          opponent.playerData.team !== passerTeam &&
          opponent.playerData.name !== "Ball"
        ) {
          const dist = distanceToLineSegment(
            opponent.mesh.position,
            passerPos,
            receiverPos
          );
          if (dist < INTERCEPTION_RADIUS) currentInterceptors.add(opponent);
        }
      }
      const { previousInterceptors } = lane.userData;
      for (const player of currentInterceptors) {
        if (!previousInterceptors.has(player))
          player.showInterceptorHighlight();
      }
      for (const player of previousInterceptors) {
        if (!currentInterceptors.has(player)) player.hideInterceptorHighlight();
      }
      lane.userData.previousInterceptors = currentInterceptors;
    }
  }

  updateXgVisualizer() {
    if (!this.isXgMode) return;
    const shooterId = [...this.highlightedPlayerIds].pop();
    const shooterPlayer = this.playerManager.playerMap.get(shooterId);
    if (!shooterPlayer) {
      this.xgVisualizer.setVisible(false);
      this.previousPressuringDefenders.forEach((p) =>
        p.hideInterceptorHighlight()
      );
      this.previousPressuringDefenders.clear();
      return;
    }
    const shooterPos_scene = shooterPlayer.mesh.position;
    const shooterTeam = shooterPlayer.playerData.team;
    const goalX_scene =
      shooterPos_scene.x > 0 ? -this.pitchLength / 2 : this.pitchLength / 2;
    const goalX_calc = -goalX_scene;
    const calcShooterPos = {
      x: -shooterPos_scene.x,
      y: shooterPos_scene.y,
      z: shooterPos_scene.z,
    };
    const allOpponents = [];
    let goalkeeper_calc = null;
    let minDistToGoal = Infinity;
    for (const player of this.playerManager.playerMap.values()) {
      if (
        player.playerData.team !== shooterTeam &&
        player.playerData.name !== "Ball"
      ) {
        allOpponents.push(player);
        const calcPlayerX = -player.mesh.position.x;
        const distToGoal = Math.abs(calcPlayerX - goalX_calc);
        if (distToGoal < minDistToGoal) {
          minDistToGoal = distToGoal;
          goalkeeper_calc = {
            x: -player.mesh.position.x,
            y: player.mesh.position.y,
            z: player.mesh.position.z,
          };
        }
      }
    }
    const calcOpponentPositions = allOpponents.map((p) => ({
      x: -p.mesh.position.x,
      y: p.mesh.position.y,
      z: p.mesh.position.z,
    }));
    const xgValue = calculateXg(
      calcShooterPos,
      calcOpponentPositions,
      goalkeeper_calc,
      this.pitchLength,
      this.pitchWidth
    );
    const GOAL_WIDTH = 7.32;
    const pressuringDefenders = new Set();
    for (const opponent of allOpponents) {
      if (
        isPointInTriangle(
          opponent.mesh.position,
          shooterPos_scene,
          new Vector3(goalX_scene, 0, GOAL_WIDTH / 2),
          new Vector3(goalX_scene, 0, -GOAL_WIDTH / 2)
        )
      ) {
        pressuringDefenders.add(opponent);
      }
    }
    pressuringDefenders.forEach((p) => {
      if (!this.previousPressuringDefenders.has(p))
        p.showInterceptorHighlight();
    });
    this.previousPressuringDefenders.forEach((p) => {
      if (!pressuringDefenders.has(p)) p.hideInterceptorHighlight();
    });
    this.previousPressuringDefenders = pressuringDefenders;
    const goalPosts_scene = {
      left: new Vector3(goalX_scene, Y_OFFSET, GOAL_WIDTH / 2),
      right: new Vector3(goalX_scene, Y_OFFSET, -GOAL_WIDTH / 2),
    };
    this.xgVisualizer.update(shooterPos_scene, goalPosts_scene, xgValue);
  }
  // FILE: src/TelestratorManager.js (REPLACE THE 'updateLsVisualizer' FUNCTION)
  updateLsVisualizer() {
    if (!this.isLsMode) return;
    const zones = this.getZones();
    const targetZone = zones.length > 0 ? zones[zones.length - 1] : null;
    const playerInPossession = this.playerManager.playerInPossession;

    if (!targetZone || !playerInPossession) {
      this.lsVisualizer.setVisible(false);
      this.pathVisualizer.setVisible(false);
      this.controlLinesVisualizer.setVisible(false);
      //   this.swarmVisualizer.clear();
      return;
    }

    const carrier = playerInPossession;
    const attackingTeamName = carrier.playerData.team;
    const homeTeamName = this.playerManager.metadata.home_team.name;
    const isCarrierHomeTeam = carrier.playerData.team === homeTeamName;
    const defendingTeamName = isCarrierHomeTeam
      ? this.playerManager.metadata.away_team.name
      : homeTeamName;
    const attackers = this.playerManager
      .getAllTeamPlayers(attackingTeamName)
      .filter((p) => p && p.mesh);
    const defenders = this.playerManager
      .getAllTeamPlayers(defendingTeamName)
      .filter((p) => p && p.mesh);

    // --- FOOLPROOF ATTACKING DIRECTION LOGIC ---
    const HALFTIME_MS = 2700000; // 45 minutes
    const isSecondHalf = this.playbackClockRef.value > HALFTIME_MS;
    // Assume home team attacks right (+X) in first half, away attacks left (-X)
    let attackingDirection;
    if (isCarrierHomeTeam) {
      attackingDirection = isSecondHalf ? -1 : 1;
    } else {
      // Carrier is away team
      attackingDirection = isSecondHalf ? 1 : -1;
    }

    const PITCH_LENGTH = 105;
    const goalX = (attackingDirection * PITCH_LENGTH) / 2;
    const goal = {
      position: new Vector3(goalX, 0, 0),
      post1: new Vector3(goalX, 0, 7.32 / 2),
      post2: new Vector3(goalX, 0, -7.32 / 2),
    };

    const center = targetZone.position;
    const lqCorners = [
      new Vector3(
        center.x - targetZone.scale.x / 2,
        Y_OFFSET,
        center.z - targetZone.scale.y / 2
      ),
      new Vector3(
        center.x + targetZone.scale.x / 2,
        Y_OFFSET,
        center.z - targetZone.scale.y / 2
      ),
      new Vector3(
        center.x + targetZone.scale.x / 2,
        Y_OFFSET,
        center.z + targetZone.scale.y / 2
      ),
      new Vector3(
        center.x - targetZone.scale.x / 2,
        Y_OFFSET,
        center.z + targetZone.scale.y / 2
      ),
    ];
    const lq = {
      center: center.clone(),
      corners: lqCorners,
      area: calculatePolygonArea(lqCorners),
    };

    const scores = calculateLs(
      lq,
      carrier,
      defenders,
      attackers,
      goal,
      attackingDirection
    );
    updateDebugPanel(scores);

    const { points: conePoints, corners: coneCorners } = getPassingCone(
      carrier.mesh.position,
      lq.corners
    );
    const attackersNearLq = attackers.filter(
      (p) => p.mesh.position.distanceTo(lq.center) < 20
    );
    const defendersNearLq = defenders.filter(
      (p) => p.mesh.position.distanceTo(lq.center) < 20
    );

    this.lsVisualizer.update(targetZone, scores);
    this.pathVisualizer.update(
      carrier.mesh.position,
      coneCorners,
      scores.feasibilityScore
    );
    // this.swarmVisualizer.update(attackersNearLq, defendersNearLq);
    this.controlLinesVisualizer.update(
      lq.center,
      attackersNearLq,
      defendersNearLq
    );

    const currentPathInterceptors =
      conePoints.length > 2
        ? defenders.filter((def) =>
            isPointInTriangle(def.mesh.position, ...conePoints)
          )
        : [];
    const interceptorSet = new Set(currentPathInterceptors);
    interceptorSet.forEach((p) => {
      if (!this.previousPathInterceptors.has(p)) p.showInterceptorHighlight();
    });
    this.previousPathInterceptors.forEach((p) => {
      if (!interceptorSet.has(p)) p.hideInterceptorHighlight();
    });
    this.previousPathInterceptors = interceptorSet;

    if (this.captureRequest && targetZone === this.captureRequest) {
      const metrics = calculateAllMetrics(
        lq,
        this.playerManager,
        this.playbackClockRef.value,
        scores.final_ls
      );
      if (metrics) stageEntry(metrics);
      this.captureRequest = null;
    }
  }

  update() {
    for (const [playerId, highlightMesh] of this.highlights.entries()) {
      const player = this.playerManager.playerMap.get(playerId);
      if (player && player.mesh) {
        highlightMesh.position.copy(player.mesh.position);
        highlightMesh.position.y = Y_OFFSET;
        highlightMesh.rotation.z += 0.02;
        highlightMesh.visible = true;
      } else {
        highlightMesh.visible = false;
      }
    }
    this.updateFormationShapes();
    this.updatePassingLanes();
    this.updateXgVisualizer();
    this.updateLsVisualizer();

    if (this.isLsMode && this.controlRingVisualizer.group.visible) {
      // We get the targetZone again to pass its properties to the update function
      const zones = this.getZones();
      const targetZone = zones.length > 0 ? zones[zones.length - 1] : null;
      if (targetZone) {
        // Find the last calculated score for exploitation to control the pulse
        const lastExploitationScore =
          parseFloat(this.lsVisualizer.exploitValueEl.textContent) || 0.5;
        this.controlRingVisualizer.update(targetZone, lastExploitationScore);
      }
    }
  }
}
