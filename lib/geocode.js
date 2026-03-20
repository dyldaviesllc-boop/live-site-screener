// Geocode an address → {lat, lng} using Nominatim (free, no key needed)
const geocodeCache = new Map();

async function geocodeAddress(address) {
  if (geocodeCache.has(address)) return geocodeCache.get(address);
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(address)}`,
      { headers: { "User-Agent": "SiteScreener/1.0" } }
    );
    const data = await resp.json();
    if (data.length) {
      const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      geocodeCache.set(address, result);
      return result;
    }
  } catch (e) { console.warn(`Geocode failed for ${address}:`, e.message); }
  geocodeCache.set(address, null);
  return null;
}

export { geocodeAddress };
