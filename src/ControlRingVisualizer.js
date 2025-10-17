import { Group, TorusGeometry, MeshBasicMaterial, Mesh, Color } from "three";

const Y_OFFSET = 0.03; // Slightly above the pitch

export class ControlRingVisualizer {
  constructor(scene) {
    this.scene = scene;
    this.group = new Group();
    this.group.visible = false;
    this.scene.add(this.group);

    // --- Define Colors ---
    this.attackerColor = new Color(0x0074d9); // Blue
    this.defenderColor = new Color(0xff4136); // Red
    this.neutralColor = new Color(0x888888); // Grey for neutral

    const ringGeometry = new TorusGeometry(1, 0.15, 16, 100);
    const ringMaterial = new MeshBasicMaterial({
      color: this.neutralColor,
      transparent: true,
      opacity: 0.7,
    });

    this.ringMesh = new Mesh(ringGeometry, ringMaterial);
    this.ringMesh.rotation.x = -Math.PI / 2;
    this.ringMesh.position.y = Y_OFFSET;
    this.group.add(this.ringMesh);

    this.pulseDirection = 1;
    this.baseScale = 1.0;
  }

  /**
   * Updates the ring's position, size, color, and pulse based on the LQ and exploitation score.
   * @param {Object} lq - The Leakage Quadrant object with center and scale info.
   * @param {number} exploitationScore - The score from 0.0 to 1.0.
   */
  update(lq, exploitationScore) {
    if (!lq || exploitationScore === null) {
      this.setVisible(false);
      return;
    }
    this.setVisible(true);

    // 1. Position and Size
    // Position the ring at the center of the LQ.
    this.ringMesh.position.x = lq.position.x;
    this.ringMesh.position.z = lq.position.z;

    // Set the radius of the ring to be slightly larger than the LQ box.
    const radius = Math.max(lq.scale.x, lq.scale.y) / 2 + 1.5;
    this.ringMesh.geometry.dispose();
    this.ringMesh.geometry = new TorusGeometry(radius, 0.15, 16, 100);

    // 2. Color
    // Interpolate color based on the score. 0.5 is the midpoint.
    let color = new Color();
    if (exploitationScore > 0.5) {
      // Lerp from Neutral Grey (at 0.5) to Attacker Blue (at 1.0)
      color.lerpColors(
        this.neutralColor,
        this.attackerColor,
        (exploitationScore - 0.5) / 0.5
      );
    } else {
      // Lerp from Defender Red (at 0.0) to Neutral Grey (at 0.5)
      color.lerpColors(
        this.defenderColor,
        this.neutralColor,
        exploitationScore / 0.5
      );
    }
    this.ringMesh.material.color.set(color);

    // 3. Pulsing Animation (called in the main animation loop)
    const pulseAmount = 0.1; // How much it grows/shrinks
    const pulseSpeed = 0.005 + Math.abs(exploitationScore - 0.5) * 0.02; // Faster pulse for decisive control

    let scale = this.ringMesh.scale.x + pulseSpeed * this.pulseDirection;
    if (
      scale > this.baseScale + pulseAmount ||
      scale < this.baseScale - pulseAmount
    ) {
      this.pulseDirection *= -1;
    }
    this.ringMesh.scale.set(scale, scale, scale);
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  destroy() {
    this.group.clear();
    this.scene.remove(this.group);
  }
}
