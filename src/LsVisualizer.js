import { Group, Color } from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";

const Y_OFFSET = 0.1;

export class LsVisualizer {
  constructor(scene) {
    this.scene = scene;
    this.group = new Group();
    this.group.visible = false;
    this.scene.add(this.group);

    const containerDiv = document.createElement("div");
    containerDiv.style.color = "white";
    containerDiv.style.padding = "4px 8px";
    containerDiv.style.backgroundColor = "rgba(0,0,0,0.7)";
    containerDiv.style.borderRadius = "4px";
    containerDiv.style.textShadow = "1px 1px 2px black";
    containerDiv.style.fontSize = "12px";
    containerDiv.style.fontFamily = "sans-serif";
    containerDiv.style.border = "1px solid rgba(255,255,255,0.2)";

    const lsLine = document.createElement("div");
    lsLine.style.fontSize = "16px";
    lsLine.style.fontWeight = "bold";
    lsLine.appendChild(document.createTextNode("LS: "));
    this.lsValueEl = document.createElement("span");
    lsLine.appendChild(this.lsValueEl);
    containerDiv.appendChild(lsLine);

    const separator = document.createElement("hr");
    separator.style.border = "none";
    separator.style.borderTop = "1px solid #444";
    separator.style.margin = "3px 0";
    containerDiv.appendChild(separator);

    // --- THIS IS THE CORRECTED LOGIC ---
    const componentsLine = document.createElement("div");
    componentsLine.style.fontSize = "11px";
    componentsLine.style.whiteSpace = "nowrap";

    componentsLine.appendChild(document.createTextNode("T: "));
    this.threatValueEl = document.createElement("span");
    componentsLine.appendChild(this.threatValueEl);

    componentsLine.appendChild(document.createTextNode(" | E: "));
    this.exploitValueEl = document.createElement("span");
    componentsLine.appendChild(this.exploitValueEl);

    componentsLine.appendChild(document.createTextNode(" | F: "));
    this.feasyValueEl = document.createElement("span");
    componentsLine.appendChild(this.feasyValueEl);

    containerDiv.appendChild(componentsLine);
    // --- END CORRECTION ---

    this.lsLabel = new CSS2DObject(containerDiv);
    this.group.add(this.lsLabel);

    this.highLsColor = new Color(0x00ff00);
    this.midLsColor = new Color(0xffa500);
    this.lowLsColor = new Color(0xff4136);
    this.activeZone = null;
  }

  update(zone, scores) {
    if (!zone || !scores) {
      this.setVisible(false);
      return;
    }
    this.setVisible(true);
    this.activeZone = zone;

    this.lsValueEl.textContent = scores.final_ls.toFixed(2);
    this.threatValueEl.textContent = scores.threatPotentialScore.toFixed(2);
    this.exploitValueEl.textContent = scores.exploitationScore.toFixed(2);
    this.feasyValueEl.textContent = scores.feasibilityScore.toFixed(2);

    this.lsLabel.position.set(zone.position.x, Y_OFFSET, zone.position.z);

    const lsValue = scores.final_ls;
    let color = new Color();
    if (lsValue > 0.5) {
      color.lerpColors(
        this.midLsColor,
        this.highLsColor,
        (lsValue - 0.5) / 0.5
      );
    } else {
      color.lerpColors(this.lowLsColor, this.midLsColor, lsValue / 0.5);
    }
    zone.material.color.set(color);
  }

  setVisible(visible) {
    this.group.visible = visible;
    if (!visible && this.activeZone) {
      this.activeZone.material.color.set(0xff4136);
      this.activeZone = null;
    }
  }

  destroy() {
    this.group.clear();
    this.scene.remove(this.group);
  }
}
