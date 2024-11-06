// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

// Location of our classroom (as identified on Google Maps)
const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const COIN_SPAWN_SIZE = 0.0002; // Approximate spawn area size in degrees
const MAX_CACHES = 100; // Limit of caches to avoid clutter

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
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

// Create a custom icon for caches using a coin emoji
const coinIcon = leaflet.divIcon({
  className: "coin-icon",
  html: "🪙",
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

// Instantiate caches with explicit type
let caches: Cache[] = [];

// Time constraint for spawning
let lastSpawnTime = Date.now();
const SPAWN_COOLDOWN = 2000; // 2000 milliseconds or 2 seconds between spawns

// Function to generate random coin positions around the player's location
function generateCachesAroundPlayer(playerPos: leaflet.LatLng) {
  const currentTime = Date.now();
  if (
    caches.length < MAX_CACHES && (currentTime - lastSpawnTime) > SPAWN_COOLDOWN
  ) {
    const numCachesToAdd = Math.floor(Math.random() * 2) + 1; // More limited spawn amount
    for (let i = 0; i < numCachesToAdd; i++) {
      const lat = playerPos.lat + (Math.random() - 0.5) * COIN_SPAWN_SIZE;
      const lng = playerPos.lng + (Math.random() - 0.5) * COIN_SPAWN_SIZE;
      const cache = new Cache(
        leaflet.latLng(lat, lng),
        Math.floor(Math.random() * 5),
      );
      caches.push(cache);
    }
    lastSpawnTime = currentTime;
  }
  // Optional: Cleanup caches that are too far from the player
  caches = caches.filter((cache) =>
    map.distance(playerPos, cache.location) < 50
  );
}

// Create a class for handling cache logic
class Cache {
  constructor(public location: leaflet.LatLng, public coins: number = 0) {
    this.marker = leaflet.marker(this.location, { icon: coinIcon });
    this.marker.bindTooltip(`Coins: ${this.coins}`);
    this.marker.addTo(map);
  }

  marker: leaflet.Marker;

  addCoins(amount: number) {
    this.coins += amount;
    this.updateTooltip();
  }

  removeCoins(amount: number) {
    if (this.coins >= amount) {
      this.coins -= amount;
      this.updateTooltip();
      return amount;
    }
    return 0;
  }

  updateTooltip() {
    this.marker.setTooltipContent(`Coins: ${this.coins}`);
  }
}

// Function to check player's proximity and interact with caches
function interactWithCaches(playerPos: leaflet.LatLng) {
  caches.forEach((cache) => {
    if (map.distance(playerPos, cache.location) < 10) {
      const collectedCoins = cache.removeCoins(1);
      console.log(`Collected ${collectedCoins} coins.`);
    }
  });
}

// Update caches as player moves
map.on("move", function () {
  const playerPos = map.getCenter();
  playerMarker.setLatLng(playerPos);
  generateCachesAroundPlayer(playerPos);
  interactWithCaches(playerPos);
});
