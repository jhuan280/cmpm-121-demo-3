// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet, { Marker } from "leaflet";

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
let seedValue = 1234; // Initialize with a fixed seed

function nextRandom() {
  seedValue += 1;
  return seededRandom(seedValue);
}

// Player's collected coins
let playerCoins = 0;

// Location of our classroom (as identified on Google Maps)
const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

// Flyweight and FlyweightFactory

// Define a Flyweight class for the game cell grid
class GameCell {
  private serialCounter = 0; // Track serial numbers

  constructor(public i: number, public j: number) {}

  // Generate a unique serial number for each coin in this cell
  generateSerial() {
    return this.serialCounter++;
  }
}

class CellFactory {
  private cells: Map<string, GameCell> = new Map();

  // Method to get or create a Flyweight for game cells
  getCell(i: number, j: number): GameCell {
    const key = `${i},${j}`;
    if (!this.cells.has(key)) {
      this.cells.set(key, new GameCell(i, j));
    }
    return this.cells.get(key) as GameCell;
  }
}

// Create the cell factory
const cellFactory = new CellFactory();

// Create the map (element with id "map" is defined in index.html)
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
const playerMarker = leaflet.marker(OAKES_CLASSROOM);
playerMarker.bindTooltip("Player");
playerMarker.addTo(map);

// Create a custom large icon for cache spots using emoji or local image
const cacheIcon = new leaflet.DivIcon({
  className: "custom-cache-icon",
  html: "🎁", // Replace with an emoji or use an image URL
  iconSize: [50, 50], // Larger size for more visibility
  iconAnchor: [25, 25], // Center position the icon
});

// Convert player's location to grid
const playerRow = Math.round(OAKES_CLASSROOM.lat / TILE_DEGREES);
const playerCol = Math.round(OAKES_CLASSROOM.lng / TILE_DEGREES);

// Function to update popup content
function updatePopup(
  cacheMarker: Marker,
  coinOffering: number,
  coinIds: string[],
  cell: GameCell,
) {
  const popupContent = document.createElement("div");
  popupContent.innerHTML = `
    <p>Cache spot: (${cell.i}, ${cell.j})</p>
    <p>Coins: ${coinOffering}</p>
    <p>Coin IDs:<br>${coinIds.join("<br>")}</p> 
    <button id="collect">Collect</button>
    <button id="deposit">Deposit</button>
  `;

  popupContent.querySelector("#collect")?.addEventListener(
    "click",
    function () {
      if (coinOffering > 0) {
        playerCoins += coinOffering;
        coinOffering = 0;
        console.log("Collected coins. Player now has:", playerCoins);
        updatePopup(cacheMarker, coinOffering, coinIds, cell); // Refresh popup content
      }
    },
  );

  popupContent.querySelector("#deposit")?.addEventListener(
    "click",
    function () {
      if (playerCoins > 0) {
        coinOffering += playerCoins;
        playerCoins = 0;
        console.log("Deposited coins. Cache now has:", coinOffering);
        updatePopup(cacheMarker, coinOffering, coinIds, cell); // Refresh popup content
      }
    },
  );

  cacheMarker.bindPopup(popupContent).openPopup();
}

// Determine the Neighborhood
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

    // Calculate the grid cell's geographical location
    const gridCenterLat = newRow * TILE_DEGREES;
    const gridCenterLng = newCol * TILE_DEGREES;
    const gridCenter = leaflet.latLng(gridCenterLat, gridCenterLng);

    // Determine if a cache should be placed
    if (nextRandom() < CACHE_SPAWN_PROBABILITY) {
      // Generate a deterministic amount of coins for this cache
      const coinOffering = Math.floor(nextRandom() * 10 + 1);

      // Use the cell factory to manage game cells
      const cell = cellFactory.getCell(
        Math.floor(gridCenterLat * 1e4),
        Math.floor(gridCenterLng * 1e4),
      );

      // Generate unique IDs for the coins
      const coinIds = Array.from(
        { length: coinOffering },
        () => `${cell.i},${cell.j}, serial#: ${cell.generateSerial()}`,
      );

      // Place a marker (or cache) at the grid cell using the custom icon
      const cacheMarker = leaflet.marker(gridCenter, { icon: cacheIcon });

      updatePopup(cacheMarker, coinOffering, coinIds, cell); // Call function with cache info
      cacheMarker.addTo(map);
    }
  }
}
