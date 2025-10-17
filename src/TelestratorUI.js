// FILE: src/createTelestratorUI.js

export function createTelestratorUI({
  onToolSelect,
  onColorSelect,
  onClear,
  onUndo,
  onFormationToolUpdate,
  onTrackToggle,
  onClearTracks,
  onXgToggle,
  onLsToggle,
  onDebugToggle, // <-- ADDED: Handler for the new LS checkbox
  homeTeamName,
  awayTeamName,
}) {
  const toolbar = document.createElement("div");
  toolbar.id = "telestrator-toolbar";
  toolbar.style.position = "absolute";
  toolbar.style.top = "14px";
  toolbar.style.right = "14px";
  toolbar.style.display = "flex";
  toolbar.style.flexDirection = "column";
  toolbar.style.gap = "8px";
  toolbar.style.padding = "8px";
  toolbar.style.background = "rgba(0,0,0,0.45)";
  toolbar.style.borderRadius = "8px";
  toolbar.style.zIndex = "999";
  toolbar.style.fontFamily = "sans-serif";
  toolbar.style.fontSize = "13px";
  toolbar.style.width = "160px";

  let activeToolButton = null;

  const createButton = (id, text, isTool = true) => {
    const btn = document.createElement("button");
    btn.id = `tool-${id}`;
    btn.innerText = text;
    btn.style.width = "100%";
    btn.style.padding = "6px";
    btn.style.border = "none";
    btn.style.background = "#222";
    btn.style.color = "#ddd";
    btn.style.borderRadius = "6px";
    btn.style.cursor = "pointer";
    btn.style.textAlign = "left";

    if (isTool) {
      btn.onclick = () => {
        if (activeToolButton) activeToolButton.style.background = "#222";

        // When a drawing tool is selected, reset formation checkboxes
        document
          .querySelectorAll(".formation-checkbox")
          .forEach((cb) => (cb.checked = false));
        // Also fire the event to clear the state in the manager
        onFormationToolUpdate("home", "clear-all", false);
        onFormationToolUpdate("away", "clear-all", false);

        activeToolButton = btn;
        activeToolButton.style.background = "#0074d9";
        onToolSelect(id);
      };
    }

    toolbar.appendChild(btn);
    return btn;
  };

  const createSeparator = () => {
    const sep = document.createElement("div");
    sep.style.height = "1px";
    sep.style.background = "#444";
    sep.style.margin = "4px 0";
    toolbar.appendChild(sep);
  };

  const createCheckbox = (text, onChangeCallback) => {
    const container = document.createElement("label");
    container.style.display = "flex";
    container.style.alignItems = "center";
    container.style.gap = "6px";
    container.style.fontSize = "12px";
    container.style.color = "#ddd";
    container.style.padding = "4px 0";
    container.style.cursor = "pointer";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.onchange = (e) => onChangeCallback(e.target.checked);

    container.appendChild(checkbox);
    container.appendChild(document.createTextNode(text));
    toolbar.appendChild(container);
    return checkbox;
  };

  // --- Drawing Tools ---
  const cursorBtn = createButton("cursor", "Cursor");
  createButton("line", "Line");
  createButton("arrow", "Arrow");
  createButton("freehand", "Draw");
  createSeparator();
  createButton("zone-box", "Zone (Box)");
  createButton("zone-circle", "Zone (Circle)");
  createSeparator();
  createButton("highlight", "Highlight Player");
  createButton("passing-lane", "Passing Lane");
  createButton("erase", "Erase");
  createSeparator();

  // --- Connection Tools ---
  createButton("connect-highlighted", "Connect Highlighted");
  createSeparator();

  // --- NEW MULTI-SELECT FORMATION CONTROLS ---
  const createTeamFormationMultiSelect = (teamName, teamId) => {
    const container = document.createElement("div");
    container.style.position = "relative";

    const label = document.createElement("div");
    label.innerText = teamName;
    label.style.fontWeight = "bold";
    label.style.color = "#fff";
    label.style.fontSize = "12px";
    label.style.marginBottom = "4px";
    container.appendChild(label);

    const button = document.createElement("button");
    button.innerText = "Select Lines...";
    button.style.width = "100%";
    button.style.padding = "5px";
    button.style.border = "1px solid #444";
    button.style.background = "#222";
    button.style.color = "#ddd";
    button.style.borderRadius = "4px";
    button.style.cursor = "pointer";
    button.style.textAlign = "left";
    container.appendChild(button);

    const dropdown = document.createElement("div");
    dropdown.style.display = "none";
    dropdown.style.position = "absolute";
    dropdown.style.top = "100%";
    dropdown.style.left = "0";
    dropdown.style.width = "100%";
    dropdown.style.background = "rgba(34,34,34,0.95)";
    dropdown.style.border = "1px solid #555";
    dropdown.style.borderRadius = "4px";
    dropdown.style.zIndex = "1000";
    dropdown.style.padding = "5px";
    container.appendChild(dropdown);

    const tools = [
      { value: "backline", text: "Backline" },
      { value: "midfield", text: "Midfield" },
      { value: "attack", text: "Attack" },
      { value: "spine", text: "Spine" },
      { value: "full-team-convex", text: "Full Team (Convex)" },
    ];

    tools.forEach((tool) => {
      const item = document.createElement("label");
      item.style.display = "block";
      item.style.padding = "4px 6px";
      item.style.color = "#ddd";
      item.style.fontSize = "12px";
      item.style.cursor = "pointer";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = tool.value;
      checkbox.className = "formation-checkbox";
      checkbox.dataset.team = teamId;
      checkbox.style.marginRight = "8px";

      checkbox.onchange = (e) => {
        if (activeToolButton) activeToolButton.style.background = "#222";
        activeToolButton = null;
        onFormationToolUpdate(teamId, e.target.value, e.target.checked);
      };

      item.appendChild(checkbox);
      item.appendChild(document.createTextNode(tool.text));
      dropdown.appendChild(item);
    });

    button.onclick = (e) => {
      e.stopPropagation();
      dropdown.style.display =
        dropdown.style.display === "none" ? "block" : "none";
    };

    toolbar.appendChild(container);
  };

  // Close dropdowns if clicked outside
  window.addEventListener("click", () => {
    document
      .querySelectorAll("#telestrator-toolbar > div > div")
      .forEach((dropdown) => {
        if (dropdown.style.position === "absolute") {
          dropdown.style.display = "none";
        }
      });
  });

  createTeamFormationMultiSelect(homeTeamName, "home");
  createTeamFormationMultiSelect(awayTeamName, "away");
  createSeparator();

  // --- Other Modes & Actions ---
  createCheckbox("Track", onTrackToggle);
  createCheckbox("View xG", onXgToggle);
  createCheckbox("View LS", onLsToggle);
  createCheckbox("Show Breakdown", onDebugToggle); // <-- MODIFIED: This is the new checkbox
  createSeparator();

  const undoBtn = createButton("undo", "Undo Last", false); // isTool is false
  undoBtn.onclick = onUndo;

  const clearTracksBtn = createButton("clear-tracks", "Clear Trails", false); // isTool is false
  clearTracksBtn.onclick = onClearTracks;

  const clearBtn = createButton("clear", "Clear All", false); // isTool is false
  clearBtn.onclick = onClear;

  // --- Colors ---
  const colorSection = document.createElement("div");
  colorSection.style.display = "flex";
  colorSection.style.gap = "6px";
  colorSection.style.justifyContent = "center";
  colorSection.style.paddingTop = "4px";
  toolbar.appendChild(colorSection);

  ["#ffff00", "#ff4136", "#0074d9", "#ffffff"].forEach((c) => {
    const swatch = document.createElement("div");
    swatch.style.width = "20px";
    swatch.style.height = "20px";
    swatch.style.background = c;
    swatch.style.borderRadius = "50%";
    swatch.style.border = "2px solid #fff";
    swatch.style.cursor = "pointer";
    swatch.onclick = () => onColorSelect(c);
    colorSection.appendChild(swatch);
  });

  document.body.appendChild(toolbar);
  cursorBtn.click();
}
// --- GLOBAL KEYBOARD SHORTCUTS ---
window.addEventListener("keydown", (event) => {
  // First, check if the user is typing in an input field, a textarea, etc.
  // If so, we don't want to trigger any shortcuts.
  const activeElement = document.activeElement;
  if (
    activeElement &&
    (activeElement.tagName === "INPUT" ||
      activeElement.tagName === "TEXTAREA" ||
      activeElement.isContentEditable)
  ) {
    return;
  }

  // Check which key was pressed
  switch (event.key.toLowerCase()) {
    case "c":
      // Find the cursor button and simulate a click on it.
      // The '?' is optional chaining, a safe way to avoid errors if the button isn't found.
      document.getElementById("tool-cursor")?.click();
      break;

    // You can easily add more shortcuts here in the future!
    // For example:
    // case 'd':
    //   document.getElementById('tool-freehand')?.click();
    //   break;
    // case 'e':
    //   document.getElementById('tool-erase')?.click();
    //   break;
    case "z":
      document.getElementById("tool-zone-box")?.click();
      break;
  }
});
