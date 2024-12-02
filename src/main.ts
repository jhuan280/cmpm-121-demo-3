// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

// Define the seeded random number generator
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// State for generating deterministic random numbers
let seedValue = 1234;

function nextRandom() {
  seedValue += 1;
  return seededRandom(seedValue);
}

// Player's collected coins as unique serial numbers
let playerCoins: string[] = [];

// Location of our classroom
const OAKES_CLASSROOM = leaflet.latLng(
  36.98949379578401,
  -122.06277128548504,
);

// Gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 5;
const CACHE_SPAWN_PROBABILITY = 0.05;

// Cache state management using memento
let cacheStates: Record<string, string> = {};

// Interface and class for CacheCell using the Memento pattern
interface Memento<T> {
  toMemento(): T;
  fromMemento(memento: T): void;
}

class CacheCell implements Memento<string> {
  i: number;
  j: number;
  coinIds: string[];

  constructor(i: number, j: number, coinIds: string[] = []) {
    this.i = i;
    this.j = j;
    this.coinIds = [...coinIds];
  }

  toMemento(): string {
    return JSON.stringify({ i: this.i, j: this.j, coinIds: this.coinIds });
  }

  fromMemento(memento: string) {
    const parsed = JSON.parse(memento);
    this.i = parsed.i;
    this.j = parsed.j;
    this.coinIds = parsed.coinIds;
  }
}

// Track player position in terms of grid coordinates
let playerRow = Math.round(OAKES_CLASSROOM.lat / TILE_DEGREES);
let playerCol = Math.round(OAKES_CLASSROOM.lng / TILE_DEGREES);

// Movement history
let movementPath: [number, number][] = [
  [playerRow * TILE_DEGREES, playerCol * TILE_DEGREES],
];

// Load player and cache data from localStorage if available
const savedData = localStorage.getItem("gameData");
if (savedData) {
  try {
    const parsedData = JSON.parse(savedData);
    playerCoins = parsedData.coins || [];
    playerRow = parsedData.row ?? playerRow;
    playerCol = parsedData.col ?? playerCol;
    cacheStates = parsedData.cacheStates || {};
    movementPath = parsedData.movementPath || movementPath;
  } catch (e) {
    console.error("Failed to load saved data:", e);
  }
}

// Create the map
const map = leaflet.map(document.getElementById("map")!, {
  center: leaflet.latLng(playerRow * TILE_DEGREES, playerCol * TILE_DEGREES),
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

// Populate the map with a background tile layer
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// Add a marker to represent the player
const playerMarker = leaflet
  .marker([playerRow * TILE_DEGREES, playerCol * TILE_DEGREES])
  .bindTooltip("Player")
  .addTo(map);

// Add a polyline for the player's movement
const movementPolyline = leaflet
  .polyline(movementPath, { color: "red" })
  .addTo(map);

// Custom icon for cache spots
const cacheIcon = new leaflet.DivIcon({
  className: "custom-cache-icon",
  html: "🎁",
  iconSize: [50, 50],
  iconAnchor: [25, 25],
});

// Geolocation tracking ID
let geoWatchId: number | null = null;

// Function to update the inventory UI
function updateInventoryUI() {
  const inventoryElement = document.getElementById("collected-coins");
  if (inventoryElement) {
    inventoryElement.innerHTML = ""; // Clear the current list

    playerCoins.forEach((coinId) => {
      const listItem = document.createElement("li");
      listItem.textContent = coinId;
      inventoryElement.appendChild(listItem);
    });
  }
}

// Function to manage popups with individual coin collection
function createPopupContent(cell: CacheCell) {
  const remainingCoinIds = [...cell.coinIds];
  const popupContent = document.createElement("div");

  const refreshContent = () => {
    popupContent.innerHTML = `
      <p>Cache spot: (${cell.i}, ${cell.j})</p>
      <p>Cache Coins: ${remainingCoinIds.length}</p>
      <div id="coins-list">
        ${
      remainingCoinIds
        .map(
          (coinId, index) => `
              <div>
                <span class="coin-id" style="cursor: pointer" data-coin="${coinId}">${coinId}</span>
                <button id="collect-${cell.i}-${cell.j}-${index}">Collect</button>
              </div>`,
        )
        .join("")
    }
      </div>
      <button id="deposit">Deposit</button>
    `;

    remainingCoinIds.forEach((coinId, index) => {
      popupContent
        .querySelector(`#collect-${cell.i}-${cell.j}-${index}`)
        ?.addEventListener("click", () => {
          playerCoins.push(coinId);
          remainingCoinIds.splice(index, 1);
          cacheStates[`${cell.i},${cell.j}`] = createCacheState(
            cell,
            remainingCoinIds,
          );
          saveGameData(); // Save updated state immediately
          updateInventoryUI(); // Update the UI here
          console.log(
            `Collected: ${coinId}. Player now has ${playerCoins.length} coins.`,
          );
          refreshContent(); // Re-render the coin list
        });

      popupContent.querySelector(`.coin-id[data-coin="${coinId}"]`)
        ?.addEventListener("click", () => {
          const [cacheI, cacheJ] = coinId.match(/([-\d]+)/g)!.map(Number);
          const cacheLatLng = leaflet.latLng(
            cacheI * TILE_DEGREES,
            cacheJ * TILE_DEGREES,
          );
          map.setView(cacheLatLng, GAMEPLAY_ZOOM_LEVEL);
          console.log(`Centered on cache at: (${cacheI}, ${cacheJ})`);
        });
    });

    popupContent.querySelector("#deposit")?.addEventListener("click", () => {
      if (playerCoins.length > 0) {
        remainingCoinIds.push(...playerCoins);
        playerCoins = [];
        cacheStates[`${cell.i},${cell.j}`] = createCacheState(
          cell,
          remainingCoinIds,
        );
        saveGameData(); // Save updated state immediately
        updateInventoryUI(); // Update the UI here
        console.log(
          `Deposited coins. Cache now has: ${remainingCoinIds.length} coins`,
        );
        refreshContent();
      }
    });
  };

  refreshContent();
  return popupContent;
}

function createCacheState(cell: CacheCell, remainingCoinIds: string[]): string {
  return JSON.stringify({ i: cell.i, j: cell.j, coinIds: remainingCoinIds });
}

function saveGameData() {
  const gameData = {
    row: playerRow,
    col: playerCol,
    coins: playerCoins,
    cacheStates: cacheStates,
    movementPath: movementPath,
  };
  localStorage.setItem("gameData", JSON.stringify(gameData));
}

function updateMapView() {
  map.eachLayer((layer) => {
    if (layer instanceof leaflet.Marker && layer !== playerMarker) {
      map.removeLayer(layer);
    }
  });

  for (
    let rowOffset = -NEIGHBORHOOD_SIZE;
    rowOffset <= NEIGHBORHOOD_SIZE;
    rowOffset++
  ) {
    for (
      let colOffset = -NEIGHBORHOOD_SIZE;
      colOffset <= NEIGHBORHOOD_SIZE;
      colOffset++
    ) {
      const newRow = playerRow + rowOffset;
      const newCol = playerCol + colOffset;

      const cacheKey = `${newRow},${newCol}`;
      const gridCenter = leaflet.latLng(
        newRow * TILE_DEGREES,
        newCol * TILE_DEGREES,
      );

      let cacheCell: CacheCell | undefined;
      if (cacheStates[cacheKey]) {
        cacheCell = new CacheCell(newRow, newCol);
        cacheCell.fromMemento(cacheStates[cacheKey]);
      } else if (nextRandom() < CACHE_SPAWN_PROBABILITY) {
        const initialCoinOffering = Math.floor(nextRandom() * 10 + 1);
        const coinIds = Array.from(
          { length: initialCoinOffering },
          (_, index) => `${newRow}:${newCol} serial# ${index}`,
        );
        cacheCell = new CacheCell(newRow, newCol, coinIds);
        cacheStates[cacheKey] = cacheCell.toMemento();
      }

      if (cacheCell) {
        leaflet
          .marker(gridCenter, { icon: cacheIcon })
          .bindPopup(createPopupContent(cacheCell), { closeOnClick: false })
          .addTo(map);
      }
    }
  }
}

function resetGameState() {
  if (
    confirm(
      "Are you sure you want to reset your game state? This will return all coins to their home caches and erase your location history.",
    )
  ) {
    // Reset player position and states
    playerRow = Math.round(OAKES_CLASSROOM.lat / TILE_DEGREES);
    playerCol = Math.round(OAKES_CLASSROOM.lng / TILE_DEGREES);
    playerCoins = [];
    cacheStates = {}; // Clear previous cache states
    movementPath = [
      [playerRow * TILE_DEGREES, playerCol * TILE_DEGREES],
    ]; // Reset movement history

    // Update player marker position and movement path
    playerMarker.setLatLng(OAKES_CLASSROOM);
    movementPolyline.setLatLngs(movementPath);

    // Center map on starting location
    map.setView(OAKES_CLASSROOM, GAMEPLAY_ZOOM_LEVEL);

    updateMapView(); // Refresh the map with reset data
    saveGameData(); // Persist reset states
    updateInventoryUI(); // Also refresh the inventory
    console.log("Game state has been reset.");
  }
}

function movePlayerPosition(deltaX: number, deltaY: number): [number, number] {
  // Update game state: playerRow, playerCol
  playerRow += deltaY;
  playerCol += deltaX;
  const newLatLng: [number, number] = [
    playerRow * TILE_DEGREES,
    playerCol * TILE_DEGREES,
  ];

  // Update movement tracking
  movementPath.push(newLatLng);

  // Return the new position so it can be used by other functions
  return newLatLng;
}

function updateUIWithPlayerPosition(latLng: [number, number]) {
  // Update visual representation of player on the map
  playerMarker.setLatLng(latLng);

  // Update movement polyline for visual feedback
  movementPolyline.setLatLngs(movementPath);
}

function movePlayer(deltaX: number, deltaY: number) {
  // Update player position and movement path
  const newLatLng = movePlayerPosition(deltaX, deltaY);

  // Update the UI with the new player position
  updateUIWithPlayerPosition(newLatLng);

  // Refresh the map and save the game state
  updateMapView();
  saveGameData();
}

function startGeolocationTracking() {
  if (!navigator.geolocation) {
    console.error("Geolocation is not supported by this browser.");
    return;
  }

  geoWatchId = navigator.geolocation.watchPosition(
    (position) => {
      const coords = position.coords;

      // Update player's row and column based on geolocation
      playerRow = Math.round(coords.latitude / TILE_DEGREES);
      playerCol = Math.round(coords.longitude / TILE_DEGREES);
      const playerLatLng: [number, number] = [
        coords.latitude,
        coords.longitude,
      ];

      // Update UI elements
      movementPath.push(playerLatLng);
      playerMarker.setLatLng(playerLatLng);
      movementPolyline.setLatLngs(movementPath);
      map.setView(playerLatLng, GAMEPLAY_ZOOM_LEVEL);

      // Refresh the map and save game state
      updateMapView();
      saveGameData();
    },
    handleGeolocationError,
  );

  console.log("Started geolocation tracking.");
}

function stopGeolocationTracking() {
  if (geoWatchId !== null) {
    navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId = null;
    console.log("Stopped geolocation tracking.");
  }
}

function handleGeolocationError(error: GeolocationPositionError) {
  console.error("Geolocation error:", error);
}

function toggleGeolocation() {
  if (geoWatchId !== null) {
    stopGeolocationTracking();
  } else {
    startGeolocationTracking();
  }
}

document
  .getElementById("north")
  ?.addEventListener("click", () => movePlayer(0, 1));
document
  .getElementById("south")
  ?.addEventListener("click", () => movePlayer(0, -1));
document
  .getElementById("east")
  ?.addEventListener("click", () => movePlayer(1, 0));
document
  .getElementById("west")
  ?.addEventListener("click", () => movePlayer(-1, 0));

document.getElementById("reset")?.addEventListener("click", resetGameState);

// Enable geolocation tracking when the 🌐 button is clicked
document
  .getElementById("sensor")
  ?.addEventListener("click", toggleGeolocation);

// Initialize the map view and inventory UI on load
updateMapView();
updateInventoryUI();
