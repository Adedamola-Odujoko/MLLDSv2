// FILE: src/PathVisualizer.js

import {
  Group,
  Mesh,
  MeshBasicMaterial,
  Shape,
  ShapeGeometry,
  Vector2,
  Color,
} from "three";

const Y_OFFSET = 0.05; // Slightly above the pitch

export class PathVisualizer {
  constructor(scene) {
    this.scene = scene;
    this.group = new Group();
    this.group.visible = false;
    this.scene.add(this.group);

    this.coneMaterial = new MeshBasicMaterial({
      transparent: true,
      side: 2,
    });

    this.coneMesh = new Mesh(new ShapeGeometry(), this.coneMaterial);
    this.coneMesh.position.set(0, Y_OFFSET, 0);
    this.coneMesh.rotation.x = -Math.PI / 2;
    this.group.add(this.coneMesh);

    this.highFeasibilityColor = new Color(0x00ff00);
    this.midFeasibilityColor = new Color(0xffa500);
    this.lowFeasibilityColor = new Color(0xff4136);
  }

  update(startPoint, sortedConeCorners, pathScore) {
    if (!startPoint || !sortedConeCorners || sortedConeCorners.length < 2) {
      this.setVisible(false);
      return;
    }
    this.setVisible(true);

    // --- THE DEFINITIVE FIX ---
    // To counteract the scene's rotation (where shape's Y becomes world's -Z),
    // we must provide the NEGATIVE of our world Z coordinate as the shape's Y coordinate.
    const shapePoints = [
      new Vector2(startPoint.x, -startPoint.z),
      new Vector2(sortedConeCorners[0].x, -sortedConeCorners[0].z), // Bottom corner
      new Vector2(sortedConeCorners[1].x, -sortedConeCorners[1].z), // Top corner
    ];
    const coneShape = new Shape(shapePoints);

    this.coneMesh.geometry.dispose();
    this.coneMesh.geometry = new ShapeGeometry(coneShape);

    let color = new Color();
    if (pathScore > 0.7) {
      color.copy(this.highFeasibilityColor);
    } else if (pathScore > 0.4) {
      color.copy(this.midFeasibilityColor);
    } else {
      color.copy(this.lowFeasibilityColor);
    }
    this.coneMaterial.color.set(color);
    this.coneMaterial.opacity = 0.2 + pathScore * 0.3;
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  destroy() {
    this.group.clear();
    this.scene.remove(this.group);
  }
}
