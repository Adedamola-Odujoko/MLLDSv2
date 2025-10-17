// DataExporterUI.js (Complete, Scoreboard Version with Full Python Integration)

import { Vector3 } from "three";
import { calculatePolygonArea } from "./utils.js"; // Assuming you have this helper

// --- 1. Global state for UI and data ---
let collectedEntries = [];
let labelCounts = {
  LQ_CC: 0,
  LQ_noCC: 0,
  LQ_no_pass: 0,
  negative: 0,
};
let stagedPacket = null;

// --- 2. Communication with Python Feature Extractor ---
async function getFeaturesFromPython(payload) {
  try {
    const response = await fetch("http://127.0.0.1:5100/extract_features", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json(); // Always try to get JSON for error details

    if (!response.ok) {
      console.error("Feature extraction failed on server:", result.error);
      alert(`Python Server Error: ${result.error}`);
      return null;
    }

    if (result.success) {
      return result.features;
    } else {
      console.error("Feature extraction failed:", result.error);
      alert(`Feature Extraction Failed: ${result.error}`);
      return null;
    }
  } catch (error) {
    console.error("Could not connect to feature extractor server:", error);
    alert(
      "Error: Could not connect to the Python feature extractor. Is `feature_extractor.py` running in a separate terminal?"
    );
    return null;
  }
}

// --- 3. Main Data Processing Logic ---
async function processStagedPacket(packet, labelType) {
  // Note: This function is now async
  const {
    timestamp,
    lq_zone,
    playerManager,
    attackingTeamName,
    attackingDirection,
    goal,
  } = packet;

  // --- THIS IS THE FIX ---
  // Determine the defending team's name based on the attacking team.
  const homeTeamName = playerManager.metadata.home_team.name;
  const awayTeamName = playerManager.metadata.away_team.name;
  const defendingTeamName =
    attackingTeamName === homeTeamName ? awayTeamName : homeTeamName;
  // --- END OF FIX ---

  // --- 1. Assemble the payload for the Python server ---
  const pythonPayload = {
    player_data: Array.from(playerManager.playerMap.values())
      .filter((p) => p.playerData.team !== "Referee")
      .map((p) => ({
        id: p.playerData.id,
        team: p.playerData.team,
        role: p.playerData.role,
        x: p.mesh.position.x,
        z: p.mesh.position.z,
        vx: p.velocity.x,
        vz: p.velocity.z,
      })),
    metadata: {
      attacking_team_name: attackingTeamName,
      defending_team_name: defendingTeamName, // Now this variable exists
      attacking_direction: attackingDirection,
      carrier_id: playerManager.playerInPossession
        ? playerManager.playerInPossession.playerData.id
        : null,
    },
    lq_data: null,
  };

  let lq_box_for_saving = null;

  if (labelType !== "negative") {
    const center = lq_zone.position;
    const width = lq_zone.scale.x;
    const height = lq_zone.scale.y;

    lq_box_for_saving = {
      center_x: center.x,
      center_z: center.z,
      width: width,
      height: height,
    };

    const corners = [
      new Vector3(center.x - width / 2, 0, center.z - height / 2),
      new Vector3(center.x + width / 2, 0, center.z - height / 2),
      new Vector3(center.x + width / 2, 0, center.z + height / 2),
      new Vector3(center.x - width / 2, 0, center.z + height / 2),
    ];
    const area = calculatePolygonArea(corners);

    pythonPayload.lq_data = {
      center_x: center.x,
      center_z: center.z,
      area: area,
      width: width,
      height: height,
    };
  }

  // --- 2. Call the Python server and get all numerical features ---
  const allNumericalFeatures = await getFeaturesFromPython(pythonPayload);

  if (!allNumericalFeatures) return null; // Stop if feature extraction failed

  // --- 3. Assemble the final, universal data packet ---
  const finalDataObject = {
    metadata: {
      timestamp_ms: timestamp,
      label_type: labelType,
      attacking_team_name: attackingTeamName,
    },
    ground_truth_labels: {
      has_leakage: labelType !== "negative",
      lq_box: lq_box_for_saving,
      chance_created:
        labelType === "LQ_CC" ? 1 : labelType === "LQ_noCC" ? 0 : null,
    },
    input_features: {
      numerical_features: allNumericalFeatures,
      player_data: pythonPayload.player_data,
    },
  };

  return finalDataObject;
}

// --- 4. UI Creation and Management ---
export function createDataExporterUI() {
  const container = document.createElement("div");
  container.id = "data-exporter-container";
  container.style.position = "absolute";
  container.style.bottom = "80px";
  container.style.left = "14px";
  container.style.width = "250px";
  container.style.background = "rgba(0,0,0,0.6)";
  container.style.borderRadius = "8px";
  container.style.zIndex = "998";
  container.style.color = "#ddd";
  container.style.fontFamily = "sans-serif";
  container.style.fontSize = "12px";
  container.style.display = "flex";
  container.style.flexDirection = "column";

  const header = document.createElement("div");
  header.style.padding = "8px 12px";
  header.style.background = "rgba(0,0,0,0.5)";
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";

  const title = document.createElement("h4");
  title.innerText = "Data Collection Status";
  title.style.margin = "0";

  const exportButton = document.createElement("button");
  exportButton.innerText = "Export Full JSONL";
  exportButton.style.padding = "4px 8px";
  exportButton.style.border = "1px solid #555";
  exportButton.style.background = "#2a2a2a";
  exportButton.style.color = "#ddd";
  exportButton.style.borderRadius = "4px";
  exportButton.style.cursor = "pointer";

  header.appendChild(title);
  header.appendChild(exportButton);
  container.appendChild(header);

  const scoreboardBody = document.createElement("div");
  scoreboardBody.style.padding = "12px";
  scoreboardBody.style.display = "grid";
  scoreboardBody.style.gridTemplateColumns = "1fr auto";
  scoreboardBody.style.gap = "6px 12px";
  scoreboardBody.style.alignItems = "center";

  const createScoreRow = (labelText, id) => {
    const label = document.createElement("span");
    label.innerText = labelText;
    const count = document.createElement("span");
    count.id = `count-${id}`;
    count.innerText = "0";
    count.style.fontWeight = "bold";
    count.style.color = "#a0e9ff";
    count.style.textAlign = "right";
    scoreboardBody.appendChild(label);
    scoreboardBody.appendChild(count);
  };

  createScoreRow("LQ (Chance Created):", "lq_cc");
  createScoreRow("LQ (No Chance):", "lq_nocc");
  createScoreRow("LQ (Ignored):", "lq_ignored");
  createScoreRow("Negative (No LQ):", "negative");

  const separator = document.createElement("hr");
  separator.style.gridColumn = "1 / -1";
  separator.style.border = "none";
  separator.style.borderTop = "1px solid #444";
  separator.style.margin = "4px 0";
  scoreboardBody.appendChild(separator);

  const totalLabel = document.createElement("span");
  totalLabel.innerText = "Total Samples:";
  totalLabel.style.fontWeight = "bold";
  const totalCount = document.createElement("span");
  totalCount.id = "count-total";
  totalCount.innerText = "0";
  totalCount.style.fontWeight = "bold";
  totalCount.style.color = "#4CAF50";
  totalCount.style.textAlign = "right";
  scoreboardBody.appendChild(totalLabel);
  scoreboardBody.appendChild(totalCount);
  container.appendChild(scoreboardBody);

  const stagingContainer = document.createElement("div");
  stagingContainer.id = "staging-container";
  stagingContainer.style.padding = "8px 12px";
  stagingContainer.style.background = "rgba(80, 80, 0, 0.3)";
  stagingContainer.style.borderTop = "1px solid #555";
  stagingContainer.style.display = "none";

  const stagingText = document.createElement("div");
  stagingText.innerText = "Staged event. Please classify:";
  stagingText.style.marginBottom = "8px";

  const buttonContainer = document.createElement("div");
  buttonContainer.style.display = "grid";
  buttonContainer.style.gridTemplateColumns = "1fr 1fr";
  buttonContainer.style.gap = "6px";

  const createButton = (text, title, color) => {
    const btn = document.createElement("button");
    btn.innerText = text;
    btn.title = title;
    btn.style.background = color;
    btn.style.color = "white";
    btn.style.border = "none";
    btn.style.padding = "6px 8px";
    btn.style.borderRadius = "4px";
    btn.style.cursor = "pointer";
    btn.style.fontSize = "11px";
    return btn;
  };

  const btn_cc = createButton(
    "LQ (Chance)",
    "Save as a Leakage Quadrant that led to a chance",
    "#006400"
  );
  const btn_nocc = createButton(
    "LQ (No Chance)",
    "Save as an exploited LQ that did NOT lead to a chance",
    "#8B4513"
  );
  const btn_ignored = createButton(
    "LQ (Ignored)",
    "Save as a valid LQ that was not passed to",
    "#4682B4"
  );
  const btn_negative = createButton(
    "No LQ Here",
    "Save this frame as a negative example with no leakage",
    "#6A0DAD"
  );
  const btn_cancel = createButton(
    "Cancel",
    "Cancel and clear staging",
    "#800000"
  );
  btn_cancel.style.gridColumn = "1 / -1";

  buttonContainer.appendChild(btn_cc);
  buttonContainer.appendChild(btn_nocc);
  buttonContainer.appendChild(btn_ignored);
  buttonContainer.appendChild(btn_negative);
  buttonContainer.appendChild(btn_cancel);

  stagingContainer.appendChild(stagingText);
  stagingContainer.appendChild(buttonContainer);
  container.appendChild(stagingContainer);

  document.body.appendChild(container);

  exportButton.onclick = exportToJsonl;

  async function handleSave(labelType) {
    if (stagedPacket) {
      stagingText.innerText = "Processing...";
      const finalDataObject = await processStagedPacket(
        stagedPacket,
        labelType
      );
      if (finalDataObject) {
        addEntryAndUpdateCounts(finalDataObject);
      }
      clearStagingArea();
    }
  }

  btn_cc.onclick = () => handleSave("LQ_CC");
  btn_nocc.onclick = () => handleSave("LQ_noCC");
  btn_ignored.onclick = () => handleSave("LQ_no_pass");
  btn_negative.onclick = () => handleSave("negative");
  btn_cancel.onclick = clearStagingArea;
}

function addEntryAndUpdateCounts(entry) {
  collectedEntries.push(entry);
  const labelType = entry.metadata.label_type;
  if (labelCounts.hasOwnProperty(labelType)) {
    labelCounts[labelType]++;
  }

  document.getElementById("count-lq_cc").innerText = labelCounts["LQ_CC"];
  document.getElementById("count-lq_nocc").innerText = labelCounts["LQ_noCC"];
  document.getElementById("count-lq_ignored").innerText =
    labelCounts["LQ_no_pass"];
  document.getElementById("count-negative").innerText = labelCounts["negative"];
  document.getElementById("count-total").innerText = collectedEntries.length;
}

export function stageEntry(fullDataPacket) {
  if (stagedPacket) clearStagingArea();
  stagedPacket = fullDataPacket;
  const stagingContainer = document.getElementById("staging-container");
  if (stagingContainer) {
    stagingContainer.style.display = "block";
    stagingContainer.querySelector("div").innerText =
      "Staged event. Please classify:";
  }
}

function clearStagingArea() {
  stagedPacket = null;
  const stagingContainer = document.getElementById("staging-container");
  if (stagingContainer) stagingContainer.style.display = "none";
}

function exportToJsonl() {
  if (collectedEntries.length === 0) {
    alert("No data collected to export.");
    return;
  }
  const jsonlString = collectedEntries
    .map((entry) => JSON.stringify(entry))
    .join("\n");
  const blob = new Blob([jsonlString], {
    type: "application/jsonl+json;charset=utf-8;",
  });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    `mlds_data_v2_${new Date().toISOString()}.jsonl`
  );
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
