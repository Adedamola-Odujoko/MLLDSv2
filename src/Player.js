// FILE: src/Player.js

import {
  Vector3,
  SphereGeometry,
  MeshStandardMaterial,
  Mesh,
  Color,
  ConeGeometry,
  MeshBasicMaterial,
  Line,
  BufferGeometry,
  LineDashedMaterial,
  TorusGeometry,
} from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const MIN_TRACK_DISTANCE = 0.5;

export class Player {
  constructor(scene, playerData, initialColor, playerManager) {
    this.playerData = playerData;
    this.playerManager = playerManager;
    this.isHighlighted = false;
    this.isBeingTracked = false;
    this.trackPoints = [];
    this.trackLine = null;
    this.distanceCovered = 0;
    this.currentSpeed = 0;
    this.lastPosition = new Vector3();
    this.isInterceptor = false;
    this.isInferred = false;
    this.velocity = new Vector3();
    this.previousVelocity = new Vector3();

    const playerMaterial = new MeshStandardMaterial({
      color: initialColor,
      metalness: 0.2,
      roughness: 0.6,
      transparent: true,
    });

    if (this.playerData.name === "Ball") {
      const ballRadius = 0.22;
      const ballGeometry = new SphereGeometry(ballRadius, 16, 16);
      this.mesh = new Mesh(ballGeometry, playerMaterial);
      this.mesh.position.y = ballRadius;
    } else {
      const height = 1.8;
      const width = 0.4;
      const roundingRadius = 0.2;
      const playerGeometry = new RoundedBoxGeometry(
        width,
        height,
        width,
        4,
        roundingRadius
      );
      this.mesh = new Mesh(playerGeometry, playerMaterial);
      this.mesh.position.y = height / 2;

      const labelDiv = document.createElement("div");
      labelDiv.className = "player-label";
      labelDiv.textContent = this.playerData.name;
      labelDiv.style.fontSize = "8px";
      labelDiv.style.textShadow = "1px 1px 2px rgba(0,0,0,0.8)";
      labelDiv.style.color = "white";
      labelDiv.style.padding = "2px 4px";
      labelDiv.style.backgroundColor = "rgba(0,0,0,0.5)";
      labelDiv.style.borderRadius = "3px";

      this.label = new CSS2DObject(labelDiv);
      this.label.position.set(0, height / 2 + 0.3, 0);
      this.mesh.add(this.label);

      const highlightGeo = new ConeGeometry(0.4, 0.8, 16);
      const highlightMat = new MeshBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.8,
      });
      this.highlight = new Mesh(highlightGeo, highlightMat);
      this.highlight.position.y = height + 0.8;
      this.highlight.visible = false;
      this.mesh.add(this.highlight);

      const interceptGeo = new ConeGeometry(0.5, 0.6, 16);
      const interceptMat = new MeshBasicMaterial({
        color: 0xff4136,
        transparent: true,
        opacity: 0.85,
      });
      this.interceptionHighlight = new Mesh(interceptGeo, interceptMat);
      this.interceptionHighlight.position.y = height + 0.7;
      this.interceptionHighlight.visible = false;
      this.mesh.add(this.interceptionHighlight);

      const possessionGeo = new TorusGeometry(0.6, 0.06, 16, 48);
      const possessionMat = new MeshBasicMaterial({ color: 0xffffff });
      this.possessionHighlight = new Mesh(possessionGeo, possessionMat);
      this.possessionHighlight.rotation.x = -Math.PI / 2;
      this.possessionHighlight.position.y = -height / 2 + 0.05;
      this.possessionHighlight.visible = false;
      this.mesh.add(this.possessionHighlight);
    }

    this.mesh.userData.player = this;
    scene.add(this.mesh);
    this.targetRoot = new Vector3();
    this.targetRoot.copy(this.mesh.position);
    this.currentColor = initialColor;
  }

  showPossessionHighlight() {
    if (!this.possessionHighlight) return;
    this.possessionHighlight.visible = true;
  }

  hidePossessionHighlight() {
    if (!this.possessionHighlight) return;
    this.possessionHighlight.visible = false;
  }

  setInferred(isInferred) {
    if (this.isInferred === isInferred) return;
    this.isInferred = isInferred;
    this.mesh.material.opacity = isInferred ? 0.4 : 1.0;
    if (this.label) {
      this.label.element.style.opacity = isInferred ? 0.4 : 1.0;
    }
  }

  updateTarget(targetPosition, newColor) {
    this.targetRoot.set(
      targetPosition.x,
      this.mesh.position.y,
      targetPosition.z
    );
    if (newColor && !this.currentColor.equals(newColor)) {
      this.currentColor = newColor;
      this.mesh.material.color.set(newColor);
    }
  }

  smooth(alpha, dt) {
    this.previousVelocity.copy(this.velocity);
    const prevPos = this.mesh.position.clone();

    this.velocity
      .copy(this.targetRoot)
      .sub(this.mesh.position)
      .divideScalar(alpha);

    this.mesh.position.lerp(this.targetRoot, alpha);

    if (this.isBeingTracked && this.trackLine) {
      const distSinceLastPoint = this.mesh.position.distanceTo(
        this.lastPosition
      );

      if (distSinceLastPoint > MIN_TRACK_DISTANCE) {
        this.trackPoints.push(this.mesh.position.clone());
        this.lastPosition.copy(this.mesh.position);
        this.trackLine.geometry.dispose();
        this.trackLine.geometry = new BufferGeometry().setFromPoints(
          this.trackPoints
        );
        this.trackLine.computeLineDistances();
      }

      const distThisFrame = this.mesh.position.distanceTo(prevPos);
      this.distanceCovered += distThisFrame;

      if (dt > 0) {
        this.currentSpeed = distThisFrame / (dt / 1000);
      }
    }

    if (this.isHighlighted) {
      this.highlight.rotation.y += 0.03;
    }
    if (this.isInterceptor) {
      this.interceptionHighlight.rotation.y -= 0.05;
    }

    if (this.playerData.name !== "Ball" && this.playerManager.ball) {
      const ballPosition = this.playerManager.ball.mesh.position.clone();
      ballPosition.y = this.mesh.position.y;
      this.mesh.lookAt(ballPosition);
    }
  }

  showInterceptorHighlight() {
    if (!this.interceptionHighlight) return;
    this.isInterceptor = true;
    this.interceptionHighlight.visible = true;
  }
  hideInterceptorHighlight() {
    if (!this.interceptionHighlight) return;
    this.isInterceptor = false;
    this.interceptionHighlight.visible = false;
  }
  startTracking(scene) {
    if (this.isBeingTracked || this.playerData.name === "Ball") return;
    this.isBeingTracked = true;
    this.distanceCovered = 0;
    this.trackPoints = [this.mesh.position.clone()];
    this.lastPosition.copy(this.mesh.position);
    const material = new LineDashedMaterial({
      color: 0xaaaaaa,
      linewidth: 1,
      scale: 1,
      dashSize: 0.5,
      gapSize: 0.5,
    });
    const geometry = new BufferGeometry().setFromPoints(this.trackPoints);
    this.trackLine = new Line(geometry, material);
    scene.add(this.trackLine);
  }
  stopTracking(scene) {
    if (!this.isBeingTracked) return;
    this.isBeingTracked = false;
    this.currentSpeed = 0;
    if (this.trackLine) {
      scene.remove(this.trackLine);
      this.trackLine.geometry.dispose();
      this.trackLine.material.dispose();
      this.trackLine = null;
    }
  }
  clearTrackLine() {
    if (!this.isBeingTracked || !this.trackLine) return;
    this.distanceCovered = 0;
    this.trackPoints = [this.mesh.position.clone()];
    this.lastPosition.copy(this.mesh.position);
    this.trackLine.geometry.dispose();
    this.trackLine.geometry = new BufferGeometry().setFromPoints(
      this.trackPoints
    );
    this.trackLine.computeLineDistances();
  }
  showHighlight() {
    if (!this.highlight) return;
    this.isHighlighted = true;
    this.highlight.visible = true;
  }
  hideHighlight() {
    if (!this.highlight) return;
    this.isHighlighted = false;
    this.highlight.visible = false;
  }
  destroy(scene) {
    if (this.label && this.label.element) {
      this.label.element.remove();
    }
    if (this.highlight) {
      this.highlight.geometry.dispose();
      this.highlight.material.dispose();
    }
    if (this.interceptionHighlight) {
      this.interceptionHighlight.geometry.dispose();
      this.interceptionHighlight.material.dispose();
    }
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
