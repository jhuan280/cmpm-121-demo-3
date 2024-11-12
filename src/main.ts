// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./leafletWorkaround.ts";
//-----import statements-----

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
const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);

// Gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 5; // Adjusted for a smaller vicinity
const CACHE_SPAWN_PROBABILITY = 0.05; // Reduced probability for fewer caches

// Cache state management using memento
const cacheStates: Record<string, string> = {};

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

// Create the map
const map = leaflet.map(document.getElementById("map")!, {
  center: OAKES_CLASSROOM,
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
const playerMarker = leaflet.marker(OAKES_CLASSROOM).bindTooltip("Player")
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
      remainingCoinIds.map((coinId, index) => `
          <div>
            ${coinId}
            <button id="collect-${cell.i}-${cell.j}-${index}">Collect</button>
          </div>`).join("")
    }
      </div>
      <button id="deposit">Deposit</button>
    `;

    remainingCoinIds.forEach((coinId, index) => {
      popupContent.querySelector(`#collect-${cell.i}-${cell.j}-${index}`)
        ?.addEventListener(
          "click",
          () => {
            playerCoins.push(coinId);
            remainingCoinIds.splice(index, 1);
            console.log(
              `Collected: ${coinId}. Player now has ${playerCoins.length} coins.`,
            );
            refreshContent(); // Re-render the coin list
          },
        );
    });

    popupContent.querySelector("#deposit")?.addEventListener(
      "click",
      () => {
        if (playerCoins.length > 0) {
          remainingCoinIds.push(...playerCoins);
          console.log(
            `Deposited coins. Cache now has: ${remainingCoinIds.length} coins`,
          );
          playerCoins = [];
          refreshContent();
        }
      },
    );
  };

  refreshContent();

  return popupContent;
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
        leaflet.marker(gridCenter, { icon: cacheIcon })
          .bindPopup(createPopupContent(cacheCell), { closeOnClick: false })
          .addTo(map);

        cacheStates[cacheKey] = cacheCell.toMemento();
      }
    }
  }
}

function movePlayer(deltaX: number, deltaY: number) {
  playerRow += deltaY;
  playerCol += deltaX;
  playerMarker.setLatLng(
    leaflet.latLng(playerRow * TILE_DEGREES, playerCol * TILE_DEGREES),
  );
  updateMapView();
}

function toggleGeolocation() {
  if (geoWatchId !== null) {
    navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId = null;
    console.log("Stopped geolocation tracking.");
  } else if (navigator.geolocation) {
    geoWatchId = navigator.geolocation.watchPosition(
      (position) => {
        const coords = position.coords;
        playerRow = Math.round(coords.latitude / TILE_DEGREES);
        playerCol = Math.round(coords.longitude / TILE_DEGREES);
        const playerLatLng = leaflet.latLng(coords.latitude, coords.longitude);
        playerMarker.setLatLng(playerLatLng);
        map.setView(playerLatLng, GAMEPLAY_ZOOM_LEVEL); // Center map on player's new position
        updateMapView();
      },
      (error) => {
        console.error("Geolocation error:", error);
      },
    );
    console.log("Started geolocation tracking.");
  } else {
    console.error("Geolocation is not supported by this browser.");
  }
}

document.getElementById("north")?.addEventListener(
  "click",
  () => movePlayer(0, 1),
);
document.getElementById("south")?.addEventListener(
  "click",
  () => movePlayer(0, -1),
);
document.getElementById("east")?.addEventListener(
  "click",
  () => movePlayer(1, 0),
);
document.getElementById("west")?.addEventListener(
  "click",
  () => movePlayer(-1, 0),
);

document.getElementById("reset")?.addEventListener("click", () => {
  playerRow = Math.round(OAKES_CLASSROOM.lat / TILE_DEGREES);
  playerCol = Math.round(OAKES_CLASSROOM.lng / TILE_DEGREES);
  playerMarker.setLatLng(OAKES_CLASSROOM);
  updateMapView();
});

// Enable geolocation tracking when the 🌐 button is clicked
document.getElementById("sensor")?.addEventListener("click", toggleGeolocation);

// Initialize the map view on load
updateMapView();
