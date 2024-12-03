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

// PLAYER MANAGEMENT CLASS
class PlayerManager {
  private row: number;
  private col: number;
  private movementPath: [number, number][];
  private coins: string[];

  constructor(
    initialRow: number,
    initialCol: number,
    initialLatLng: [number, number],
  ) {
    this.row = initialRow;
    this.col = initialCol;
    this.movementPath = [initialLatLng];
    this.coins = [];
  }

  // ** State Getters **
  public getRow(): number {
    return this.row;
  }
  public getCol(): number {
    return this.col;
  }
  public getCurrentLatLng(): [number, number] {
    return [this.row * TILE_DEGREES, this.col * TILE_DEGREES];
  }
  public getMovementPath(): [number, number][] {
    return [...this.movementPath];
  }
  public getCoins(): string[] {
    return [...this.coins];
  }

  // ** State Updaters **
  public updatePosition(deltaRow: number, deltaCol: number) {
    this.row += deltaRow;
    this.col += deltaCol;
    this.movementPath.push(this.getCurrentLatLng());
  }

  public addCoin(coinId: string) {
    this.coins.push(coinId);
  }
  public clearCoins() {
    this.coins = [];
  }
  public reset(
    initialRow: number,
    initialCol: number,
    initialLatLng: [number, number],
  ) {
    this.row = initialRow;
    this.col = initialCol;
    this.movementPath = [initialLatLng];
    this.coins = [];
  }
}

// Initialize PlayerManager
const playerManager = new PlayerManager(
  Math.round(OAKES_CLASSROOM.lat / TILE_DEGREES),
  Math.round(OAKES_CLASSROOM.lng / TILE_DEGREES),
  [OAKES_CLASSROOM.lat, OAKES_CLASSROOM.lng],
);

// Load player and cache data from localStorage if available
const savedData = localStorage.getItem("gameData");
if (savedData) {
  try {
    const parsedData = JSON.parse(savedData);

    // Use PlayerManager to load coins and movement path
    playerManager.clearCoins();
    parsedData.coins?.forEach((coinId: string) =>
      playerManager.addCoin(coinId)
    );
    parsedData.movementPath?.forEach((latLng: [number, number]) =>
      playerManager.updatePosition(
        latLng[0] / TILE_DEGREES - playerManager.getRow(),
        latLng[1] / TILE_DEGREES - playerManager.getCol(),
      )
    );

    cacheStates = parsedData.cacheStates || {};
  } catch (e) {
    console.error("Failed to load saved data:", e);
  }
}

// Create the map
const map = leaflet.map(document.getElementById("map")!, {
  center: leaflet.latLng(playerManager.getCurrentLatLng()),
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

// Map Layer and the Player's Marker
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

const playerMarker = leaflet
  .marker(playerManager.getCurrentLatLng())
  .bindTooltip("Player")
  .addTo(map);

const movementPolyline = leaflet
  .polyline(playerManager.getMovementPath(), { color: "red" })
  .addTo(map);

const cacheIcon = new leaflet.DivIcon({
  className: "custom-cache-icon",
  html: "🎁",
  iconSize: [50, 50],
  iconAnchor: [25, 25],
});

// Utility Functions
function updateInventoryUI() {
  const inventoryElement = document.getElementById("collected-coins");
  if (!inventoryElement) return;

  inventoryElement.innerHTML = ""; // Clear inventory list
  playerManager.getCoins().forEach((coinId) => {
    const listItem = document.createElement("li");
    listItem.textContent = coinId;
    inventoryElement.appendChild(listItem);
  });
}

// Geolocation ID for dynamic tracking
let geoWatchId: number | null = null;

// Function to start geolocation tracking
function startGeolocationTracking() {
  if (!navigator.geolocation) {
    console.error("Geolocation is not supported by this browser.");
    return;
  }

  geoWatchId = navigator.geolocation.watchPosition(
    (position) => {
      const coords = position.coords;

      // Convert latitude/longitude to grid tile coordinates
      const newRow = Math.round(coords.latitude / TILE_DEGREES);
      const newCol = Math.round(coords.longitude / TILE_DEGREES);

      // Compute movement deltas
      const deltaRow = newRow - playerManager.getRow();
      const deltaCol = newCol - playerManager.getCol();

      // Update PlayerManager with the new position
      playerManager.updatePosition(deltaRow, deltaCol);

      // Update the player's marker and movement visualization on the map
      playerMarker.setLatLng(playerManager.getCurrentLatLng());
      movementPolyline.setLatLngs(playerManager.getMovementPath());
      map.setView(playerManager.getCurrentLatLng(), GAMEPLAY_ZOOM_LEVEL);

      // Refresh the map's cache view and save the updated state to localStorage
      updateMapView();
      saveGameData();
    },
    (error) => {
      console.error("Failed to retrieve geolocation:", error.message);
    },
    {
      enableHighAccuracy: true, // Use GPS if available
    },
  );

  console.log("Geolocation tracking started.");
}

// Function to stop geolocation tracking
function stopGeolocationTracking() {
  if (geoWatchId !== null) {
    navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId = null;
    console.log("Geolocation tracking stopped.");
  }
}

// Function to toggle geolocation tracking (on/off)
function toggleGeolocation() {
  if (geoWatchId !== null) {
    stopGeolocationTracking();
  } else {
    startGeolocationTracking();
  }
}

function saveGameData() {
  const gameData = {
    row: playerManager.getRow(),
    col: playerManager.getCol(),
    coins: playerManager.getCoins(),
    cacheStates,
    movementPath: playerManager.getMovementPath(),
  };
  localStorage.setItem("gameData", JSON.stringify(gameData));
}

function movePlayer(deltaX: number, deltaY: number) {
  playerManager.updatePosition(deltaY, deltaX);
  playerMarker.setLatLng(playerManager.getCurrentLatLng());
  movementPolyline.setLatLngs(playerManager.getMovementPath());
  updateMapView();
  saveGameData();
}

function resetGameState() {
  if (
    confirm(
      "Are you sure you want to reset your game state? This will return all coins to their home caches and erase your location history.",
    )
  ) {
    playerManager.reset(
      Math.round(OAKES_CLASSROOM.lat / TILE_DEGREES),
      Math.round(OAKES_CLASSROOM.lng / TILE_DEGREES),
      [OAKES_CLASSROOM.lat, OAKES_CLASSROOM.lng],
    );
    cacheStates = {};
    map.setView(OAKES_CLASSROOM, GAMEPLAY_ZOOM_LEVEL);
    movementPolyline.setLatLngs([]);
    updateMapView();
    updateInventoryUI();
    saveGameData();
  }
}

function createPopupContent(cell: CacheCell): HTMLElement {
  // Copy the cell's coins for manipulation
  const remainingCoinIds = [...cell.coinIds];

  // Create a container element for the popup
  const popupContent = document.createElement("div");

  // Define a function to refresh the popup content after interactions
  const refreshContent = () => {
    // Update the inner HTML of the popup
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

    // Add event listeners for "Collect" buttons
    remainingCoinIds.forEach((coinId, index) => {
      popupContent
        .querySelector(`#collect-${cell.i}-${cell.j}-${index}`)
        ?.addEventListener("click", () => {
          // Collect the coin by adding it to the player's inventory
          playerManager.addCoin(coinId);
          remainingCoinIds.splice(index, 1); // Remove from cache

          // Update cache state and save the game
          cacheStates[`${cell.i},${cell.j}`] = createCacheState(
            cell,
            remainingCoinIds,
          );
          saveGameData(); // Persist the state
          updateInventoryUI(); // Update inventory display
          console.log(
            `Collected: ${coinId}. Player now has ${playerManager.getCoins().length} coins.`,
          );

          refreshContent(); // Re-render the popup content
        });

      // Add a listener to center the map view on the coin's cache when clicked
      popupContent
        .querySelector(`.coin-id[data-coin="${coinId}"]`)
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

    // Add event listener for "Deposit" button
    popupContent.querySelector("#deposit")?.addEventListener("click", () => {
      if (playerManager.getCoins().length > 0) {
        // Move all player's coins to the cache
        remainingCoinIds.push(...playerManager.getCoins());
        playerManager.clearCoins();

        // Update cache state and save the game
        cacheStates[`${cell.i},${cell.j}`] = createCacheState(
          cell,
          remainingCoinIds,
        );
        saveGameData(); // Persist the state
        updateInventoryUI(); // Update inventory display
        console.log(
          `Deposited coins. Cache now has: ${remainingCoinIds.length} coins.`,
        );

        refreshContent(); // Re-render the popup content
      }
    });
  };

  // Initialize the content when the popup is first created
  refreshContent();

  return popupContent;
}

// Define the cached state as a string helper
function createCacheState(cell: CacheCell, remainingCoinIds: string[]): string {
  return JSON.stringify({ i: cell.i, j: cell.j, coinIds: remainingCoinIds });
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
      const newRow = playerManager.getRow() + rowOffset;
      const newCol = playerManager.getCol() + colOffset;

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

// Attach event listeners
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
document.getElementById("sensor")?.addEventListener("click", toggleGeolocation);

// Initialize the map and inventory
updateMapView();
updateInventoryUI();
