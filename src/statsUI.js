function createStatsUI() {
  const container = document.createElement("div");
  container.id = "stats-overlay";
  container.style.position = "absolute";
  container.style.top = "50px"; // Position above playback controls
  container.style.left = "14px";
  container.style.padding = "8px 12px";
  container.style.background = "rgba(0,0,0,0.45)";
  container.style.borderRadius = "8px";
  container.style.color = "#ddd";
  container.style.fontFamily = "sans-serif";
  container.style.fontSize = "12px";
  container.style.minWidth = "200px";
  container.style.zIndex = "997";
  container.style.lineHeight = "1.6";
  container.innerHTML = "No players being tracked.";

  document.body.appendChild(container);
  return container;
}

function updateStats(container, trackedPlayersData) {
  if (!container) return;

  if (trackedPlayersData.length === 0) {
    container.innerHTML = "No players being tracked.";
    return;
  }

  let html = "";
  for (const data of trackedPlayersData) {
    const distKm = (data.distance / 1000).toFixed(2); // meters to km
    const speedKmh = (data.speed * 3.6).toFixed(1); // m/s to km/h

    html += `
        <div style="margin-bottom: 5px; border-bottom: 1px solid #444; padding-bottom: 5px;">
          <strong>${data.name}</strong><br/>
          Distance: ${distKm} km<br/>
          Speed: ${speedKmh} km/h
        </div>
      `;
  }
  container.innerHTML = html;
}

export { createStatsUI, updateStats };
