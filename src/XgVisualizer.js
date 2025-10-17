import {
  Group,
  Mesh,
  MeshBasicMaterial,
  Shape,
  ShapeGeometry,
  Vector2,
  Color,
} from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";

const Y_OFFSET = 0.03;

export class XgVisualizer {
  constructor(scene) {
    this.scene = scene;
    this.group = new Group();
    this.group.visible = false;
    this.scene.add(this.group);

    this.shotConeMaterial = new MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.3,
      side: 2,
    });
    // We initialize with an empty geometry
    this.shotCone = new Mesh(new ShapeGeometry(), this.shotConeMaterial);
    this.shotCone.rotation.x = -Math.PI / 2;
    this.shotCone.position.y = Y_OFFSET;
    this.group.add(this.shotCone);

    const xgLabelDiv = document.createElement("div");
    xgLabelDiv.className = "xg-label";
    xgLabelDiv.style.color = "white";
    xgLabelDiv.style.fontSize = "16px";
    xgLabelDiv.style.fontWeight = "bold";
    xgLabelDiv.style.textShadow = "1px 1px 3px rgba(0,0,0,1)";
    this.xgLabel = new CSS2DObject(xgLabelDiv);
    this.group.add(this.xgLabel);
  }

  update(shooter, goalPosts, xgValue) {
    if (!shooter) {
      this.setVisible(false);
      return;
    }
    this.setVisible(true);

    // --- THE DEFINITIVE FIX: ACCOUNT FOR ROTATION & WINDING ORDER ---

    // 1. Create 2D points for the Shape.
    //    The Shape's Y-coordinate becomes the world's -Z coordinate after rotation.
    //    So, we must provide the NEGATIVE of our world Z coordinate.
    // --- THE DEFINITIVE FIX YOU FOUND, APPLIED ---
    // To create the 2D shape, we must provide points that are
    // flipped on BOTH axes relative to the world coordinates to counteract
    // the scene's X-flip and the geometry's Z-inversion from rotation.
    const shooterPos2D = new Vector2(shooter.x, -shooter.z);
    const leftPost2D = new Vector2(-goalPosts.left.x, -goalPosts.left.z);
    const rightPost2D = new Vector2(-goalPosts.right.x, -goalPosts.right.z);

    // Define the shape in a COUNTER-CLOCKWISE order to ensure the face is visible.
    const shotShape = new Shape([shooterPos2D, rightPost2D, leftPost2D]);

    this.shotCone.geometry.dispose();
    this.shotCone.geometry = new ShapeGeometry(shotShape);

    // --- END OF FIX ---

    const highXgColor = new Color(0x00ff00);
    const midXgColor = new Color(0xffa500);
    const lowXgColor = new Color(0xff0000);

    let color = new Color();
    if (xgValue > 0.3) {
      color.lerpColors(midXgColor, highXgColor, (xgValue - 0.3) / 0.7);
    } else {
      color.lerpColors(lowXgColor, midXgColor, xgValue / 0.3);
    }
    this.shotConeMaterial.color.set(color);

    // --- LABEL POSITION FIX ---
    // The label exists in world space, so we calculate the centroid
    // of the triangle using the direct world space coordinates.
    this.xgLabel.element.textContent = `xG: ${xgValue.toFixed(3)}`;
    const textPosX = (shooter.x - goalPosts.left.x - goalPosts.right.x) / 3;
    const textPosZ = (-shooter.z - goalPosts.left.z + goalPosts.right.z) / 3;
    this.xgLabel.position.set(textPosX, Y_OFFSET, textPosZ);
  }

  destroy() {
    this.group.clear();
    this.scene.remove(this.group);
  }

  setVisible(visible) {
    this.group.visible = visible;
  }
}
