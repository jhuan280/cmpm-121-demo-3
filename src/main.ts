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
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

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

// Helper function to create random choice based on a probability
function randomChoice(probability: number): boolean {
  return Math.random() < probability;
}

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
    if (randomChoice(CACHE_SPAWN_PROBABILITY)) {
      // Place a marker (or cache) at the grid cell using the custom icon
      const cacheMarker = leaflet.marker(gridCenter, { icon: cacheIcon });
      cacheMarker.bindTooltip("Cache spot!");
      cacheMarker.addTo(map);
    }
  }
}
