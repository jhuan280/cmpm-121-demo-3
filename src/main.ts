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
const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);

// Gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

// Interface for GameCell
interface GameCell {
  i: number;
  j: number;
  serialCounter: number;
}

// Function to manage the creation and storage of game cells
function cellFactory() {
  const cells: Record<string, GameCell> = {};
  return function getCell(i: number, j: number): GameCell {
    const key = `${i},${j}`;
    if (!cells[key]) {
      cells[key] = { i, j, serialCounter: 0 };
    }
    return cells[key];
  };
}

const getCell = cellFactory();

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
const _playerMarker = leaflet.marker(OAKES_CLASSROOM).bindTooltip("Player")
  .addTo(map);

// Custom icon for cache spots
const cacheIcon = new leaflet.DivIcon({
  className: "custom-cache-icon",
  html: "🎁",
  iconSize: [50, 50],
  iconAnchor: [25, 25],
});

// Convert player's location to grid
const playerRow = Math.round(OAKES_CLASSROOM.lat / TILE_DEGREES);
const playerCol = Math.round(OAKES_CLASSROOM.lng / TILE_DEGREES);

// Function to manage popups with individual coin collection
function createPopupContent(
  cell: GameCell,
  coinIds: string[],
) {
  const remainingCoinIds = [...coinIds]; // Copy array to manipulate
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

    // Event listeners for collecting individual coins from cache
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

    // Event listener for depositing all collected coins back into the cache
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

  refreshContent(); // Initialize content

  return popupContent;
}

// Determine the neighborhood
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

    const gridCenterLat = newRow * TILE_DEGREES;
    const gridCenterLng = newCol * TILE_DEGREES;
    const gridCenter = leaflet.latLng(gridCenterLat, gridCenterLng);

    if (nextRandom() < CACHE_SPAWN_PROBABILITY) {
      const initialCoinOffering = Math.floor(nextRandom() * 10 + 1);

      const cell = getCell(
        Math.floor(gridCenterLat * 1e4),
        Math.floor(gridCenterLng * 1e4),
      );

      const coinIds = Array.from(
        { length: initialCoinOffering },
        () => `${cell.i}:${cell.j}, serial# ${cell.serialCounter++}`,
      );

      const cacheMarker = leaflet.marker(gridCenter, { icon: cacheIcon });

      const update = () => {
        const content = createPopupContent(cell, coinIds);
        cacheMarker.bindPopup(content, { closeOnClick: false }).openPopup();
      };

      update(); // Initialize popup
      cacheMarker.addTo(map);
    }
  }
}
