// FILE: src/DebugPanel.js

let UIElements = {};

function createSection(title) {
  const container = document.createElement("div");
  container.style.marginBottom = "8px";
  const header = document.createElement("h5");
  header.innerText = title;
  header.style.margin = "0 0 4px 0";
  header.style.color = "#fff";
  header.style.borderBottom = "1px solid #555";
  header.style.paddingBottom = "2px";
  container.appendChild(header);
  return container;
}

function createRow(container, label, id) {
  const p = document.createElement("p");
  p.style.margin = "2px 0";
  p.style.display = "flex";
  p.style.justifyContent = "space-between";
  const labelSpan = document.createElement("span");
  labelSpan.innerText = label;
  const valueSpan = document.createElement("span");
  valueSpan.id = `dbg-${id}`;
  valueSpan.style.fontWeight = "bold";
  valueSpan.style.color = "#a0e9ff";
  valueSpan.innerText = "0.00";
  UIElements[id] = valueSpan;
  p.appendChild(labelSpan);
  p.appendChild(valueSpan);
  container.appendChild(p);
}

export function initDebugPanel() {
  const panel = document.createElement("div");
  panel.id = "ls-debug-panel";
  panel.style.position = "absolute";
  panel.style.top = "14px";
  panel.style.right = "190px"; // Position it next to the main toolbar
  panel.style.width = "160px";
  panel.style.background = "rgba(0,0,0,0.6)";
  panel.style.borderRadius = "8px";
  panel.style.padding = "8px";
  panel.style.fontFamily = "sans-serif";
  panel.style.fontSize = "11px";
  panel.style.color = "#ddd";
  panel.style.zIndex = "998";
  panel.style.display = "none"; // Initially hidden

  const title = document.createElement("h4");
  title.innerText = "LS Breakdown";
  title.style.margin = "0 0 8px 0";
  title.style.textAlign = "center";
  panel.appendChild(title);

  const threatSection = createSection("Threat Potential");
  createRow(threatSection, "Proximity:", "threat-prox");
  createRow(threatSection, "Strategic:", "threat-strat");
  createRow(threatSection, "Combined:", "threat-comb");
  createRow(threatSection, "Angle Factor:", "threat-angle");
  createRow(threatSection, "Area Amplifier:", "threat-area");
  panel.appendChild(threatSection);

  const exploitSection = createSection("Exploitation");
  createRow(exploitSection, "Def. Recovery:", "exploit-def-rec");
  createRow(exploitSection, "Def. Swarm:", "exploit-def-swarm");
  createRow(exploitSection, "Def. Control:", "exploit-def-ctrl");
  createRow(exploitSection, "Att. Support:", "exploit-att-supp");
  createRow(exploitSection, "Overload Factor:", "exploit-overload");
  createRow(exploitSection, "Speed Bonus:", "exploit-speed");
  panel.appendChild(exploitSection);

  const feasySection = createSection("Feasibility");
  createRow(feasySection, "Pressure Factor:", "feasy-press");
  createRow(feasySection, "Obstruction:", "feasy-obs");
  createRow(feasySection, "Pass Distance:", "feasy-dist");
  panel.appendChild(feasySection);

  const finalSection = createSection("Final Calculation");
  createRow(finalSection, "Situation Value:", "final-sit");
  createRow(finalSection, "Raw LS:", "final-raw");
  panel.appendChild(finalSection);

  document.body.appendChild(panel);
}

export function updateDebugPanel(scores) {
  if (!scores || !scores.details) return;
  const { threat, exploit, feasy, final } = scores.details;
  UIElements["threat-prox"].textContent = threat.proximityThreat.toFixed(2);
  UIElements["threat-strat"].textContent = threat.strategicThreat.toFixed(2);
  UIElements["threat-comb"].textContent =
    threat.combinedProximityScore.toFixed(2);
  UIElements["threat-angle"].textContent = threat.goalAngleFactor.toFixed(2);
  UIElements["threat-area"].textContent = threat.areaAmplifier.toFixed(2);

  UIElements["exploit-def-rec"].textContent =
    exploit.defRecoveryScore.toFixed(2);
  UIElements["exploit-def-swarm"].textContent =
    exploit.defSwarmScore.toFixed(2);
  UIElements["exploit-def-ctrl"].textContent =
    exploit.defensiveControl.toFixed(2);
  UIElements["exploit-att-supp"].textContent =
    exploit.attSupportScore.toFixed(2);
  UIElements["exploit-overload"].textContent =
    exploit.overloadFactor.toFixed(2);
  UIElements["exploit-speed"].textContent = exploit.speedBonus.toFixed(2);

  UIElements["feasy-press"].textContent = feasy.pressureFactor.toFixed(2);
  UIElements["feasy-obs"].textContent = feasy.obstructionFactor.toFixed(2);
  UIElements["feasy-dist"].textContent = feasy.passDistFactor.toFixed(2);

  UIElements["final-sit"].textContent = final.situationValue.toFixed(2);
  UIElements["final-raw"].textContent = final.raw_ls.toFixed(2);
}

export function toggleDebugPanel(visible) {
  const panel = document.getElementById("ls-debug-panel");
  if (panel) panel.style.display = visible ? "block" : "none";
}
