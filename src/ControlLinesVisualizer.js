import {
  Group,
  LineBasicMaterial,
  Line,
  BufferGeometry,
  Vector3,
  Color,
} from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";

const Y_OFFSET = 0.04;

// Helper to create a single line/label pair
function createControlLine(scene, color) {
  const group = new Group();

  const material = new LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.6,
    linewidth: 2,
  });
  const geometry = new BufferGeometry().setFromPoints([
    new Vector3(),
    new Vector3(),
  ]);
  const line = new Line(geometry, material);
  group.add(line);

  const div = document.createElement("div");
  div.style.backgroundColor = "rgba(0,0,0,0.6)";
  div.style.color = "white";
  div.style.fontSize = "10px";
  div.style.padding = "1px 4px";
  div.style.borderRadius = "3px";
  const label = new CSS2DObject(div);
  group.add(label);

  group.visible = false;
  scene.add(group);

  return { group, line, label };
}

export class ControlLinesVisualizer {
  constructor(scene) {
    this.attackerLine = createControlLine(scene, new Color(0x0074d9)); // Blue
    this.defenderLine = createControlLine(scene, new Color(0xff4136)); // Red
  }

  /**
   * Finds the fastest player and calculates their time to arrival.
   */
  findFastestPlayer(target, players) {
    let fastestPlayer = null;
    let minTime = Infinity;

    players.forEach((p) => {
      const dist = p.mesh.position.distanceTo(target);
      const effectiveSpeed = Math.max(p.currentSpeed, 4.0);
      const timeToArrival = dist / effectiveSpeed;
      if (timeToArrival < minTime) {
        minTime = timeToArrival;
        fastestPlayer = p;
      }
    });

    return { player: fastestPlayer, time: minTime };
  }

  update(lqCenter, nearbyAttackers, nearbyDefenders) {
    if (!lqCenter) {
      this.setVisible(false);
      return;
    }

    // --- Attacker Line ---
    const fastestAttacker = this.findFastestPlayer(lqCenter, nearbyAttackers);
    if (fastestAttacker.player) {
      this.updateLine(
        this.attackerLine,
        lqCenter,
        fastestAttacker.player.mesh.position,
        fastestAttacker.time
      );
    } else {
      this.attackerLine.group.visible = false;
    }

    // --- Defender Line ---
    const fastestDefender = this.findFastestPlayer(lqCenter, nearbyDefenders);
    if (fastestDefender.player) {
      this.updateLine(
        this.defenderLine,
        lqCenter,
        fastestDefender.player.mesh.position,
        fastestDefender.time
      );
    } else {
      this.defenderLine.group.visible = false;
    }
  }

  updateLine(linePackage, startPoint, endPoint, time) {
    linePackage.group.visible = true;

    // Update line geometry
    const positions = linePackage.line.geometry.attributes.position;
    positions.setXYZ(0, startPoint.x, Y_OFFSET, startPoint.z);
    positions.setXYZ(1, endPoint.x, Y_OFFSET, endPoint.z);
    positions.needsUpdate = true;

    // Update label text and position
    linePackage.label.element.textContent = `${time.toFixed(1)}s`;
    linePackage.label.position.copy(endPoint).add(new Vector3(0, 0.5, 0)); // Position above the player
  }

  setVisible(visible) {
    this.attackerLine.group.visible = visible;
    this.defenderLine.group.visible = visible;
  }
}
