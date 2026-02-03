/**
 * Sun/Moon position calculator for timeline visualization
 * Uses astronomical calculations based on actual latitude/longitude
 */

/** Default coordinates (Beijing) used when no location data available */
const DEFAULT_LAT = 39.9;
const DEFAULT_LON = 116.4;

/**
 * Convert degrees to radians
 */
function toRadians(deg: number): number {
  return deg * Math.PI / 180;
}

/**
 * Convert radians to degrees
 */
function toDegrees(rad: number): number {
  return rad * 180 / Math.PI;
}

/**
 * Calculate the day of year (1-365/366)
 */
function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

/**
 * Calculate solar declination angle for a given day of year
 * This determines how high the sun can get in the sky
 */
function getSolarDeclination(dayOfYear: number): number {
  // Approximate solar declination using a sinusoidal model
  // Maximum declination is about 23.44° on summer solstice (around day 172)
  return 23.44 * Math.sin(toRadians((360 / 365) * (dayOfYear - 81)));
}

/**
 * Calculate the equation of time correction (in minutes)
 * Accounts for Earth's elliptical orbit and axial tilt
 */
function getEquationOfTime(dayOfYear: number): number {
  const B = (360 / 365) * (dayOfYear - 81);
  const Brad = toRadians(B);
  return 9.87 * Math.sin(2 * Brad) - 7.53 * Math.cos(Brad) - 1.5 * Math.sin(Brad);
}

/**
 * Calculate true solar time from local time
 */
function getTrueSolarTime(hour: number, minute: number, longitude: number, dayOfYear: number): number {
  // Local standard time in minutes from midnight
  const localTime = hour * 60 + minute;
  
  // Time correction for longitude (4 minutes per degree from standard meridian)
  // Assuming UTC+8 for China (standard meridian at 120°E)
  const standardMeridian = 120; // UTC+8 zone
  const longitudeCorrection = 4 * (longitude - standardMeridian);
  
  // Equation of time correction
  const eot = getEquationOfTime(dayOfYear);
  
  // True solar time
  return localTime + longitudeCorrection + eot;
}

/**
 * Calculate sun altitude angle for a given time and location
 * 
 * @param hour - Hour of day (0-23)
 * @param minute - Minute (0-59)
 * @param date - The date for calculation
 * @param latitude - Latitude in degrees (positive = North)
 * @param longitude - Longitude in degrees (positive = East)
 * @returns Altitude in degrees (-90 to 90, positive = above horizon)
 */
export function getSunAltitudeDegrees(
  hour: number,
  minute: number = 0,
  date: Date = new Date(),
  latitude: number = DEFAULT_LAT,
  longitude: number = DEFAULT_LON
): number {
  const dayOfYear = getDayOfYear(date);
  const declination = getSolarDeclination(dayOfYear);
  
  // Get true solar time
  const trueSolarTime = getTrueSolarTime(hour, minute, longitude, dayOfYear);
  
  // Hour angle (degrees from solar noon, 15° per hour)
  // At solar noon, hour angle = 0
  const hourAngle = (trueSolarTime - 720) * 0.25; // 720 minutes = noon
  
  // Calculate altitude using the solar altitude formula
  const latRad = toRadians(latitude);
  const decRad = toRadians(declination);
  const hourRad = toRadians(hourAngle);
  
  const sinAltitude = 
    Math.sin(latRad) * Math.sin(decRad) + 
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(hourRad);
  
  return toDegrees(Math.asin(Math.max(-1, Math.min(1, sinAltitude))));
}

/**
 * Calculate normalized sun altitude for a given time and location
 * Returns a value from -1 (lowest) to 1 (highest point of the day)
 * 
 * This normalizes the altitude relative to the maximum possible altitude
 * for the given latitude and date, making it suitable for visualization.
 */
export function getSunAltitude(
  hour: number,
  minute: number = 0,
  date: Date = new Date(),
  latitude: number = DEFAULT_LAT,
  longitude: number = DEFAULT_LON
): number {
  const altitude = getSunAltitudeDegrees(hour, minute, date, latitude, longitude);
  
  // Calculate maximum possible altitude for this day and latitude
  const dayOfYear = getDayOfYear(date);
  const declination = getSolarDeclination(dayOfYear);
  const maxAltitude = 90 - Math.abs(latitude - declination);
  
  // Normalize: map altitude from [-90, maxAltitude] to approximately [-1, 1]
  // We use a simpler mapping: altitude / maxAltitude, clamped to [-1, 1]
  const normalized = altitude / maxAltitude;
  return Math.max(-1, Math.min(1, normalized));
}

/**
 * Check if sun is above horizon
 */
export function isSunUp(
  hour: number,
  minute: number = 0,
  date: Date = new Date(),
  latitude: number = DEFAULT_LAT,
  longitude: number = DEFAULT_LON
): boolean {
  return getSunAltitudeDegrees(hour, minute, date, latitude, longitude) > 0;
}

/**
 * Get sun/moon emoji for a given time
 */
export function getCelestialEmoji(
  hour: number,
  minute: number = 0,
  date: Date = new Date(),
  latitude: number = DEFAULT_LAT,
  longitude: number = DEFAULT_LON
): string {
  return isSunUp(hour, minute, date, latitude, longitude) ? "☀️" : "🌙";
}

/**
 * Calculate the horizontal position (0-100%) for the sun curve
 * 0% = leftmost (below horizon), 50% = center, 100% = rightmost (peak)
 */
export function getSunCurvePosition(
  hour: number,
  minute: number = 0,
  date: Date = new Date(),
  latitude: number = DEFAULT_LAT,
  longitude: number = DEFAULT_LON
): number {
  const altitude = getSunAltitude(hour, minute, date, latitude, longitude);
  // Map from [-1, 1] to [0, 100]
  return (altitude + 1) * 50;
}

// ============================================================================
// Legacy exports for backward compatibility (uses default location)
// ============================================================================

/**
 * @deprecated Use getSunAltitude with explicit date and location
 */
export function getCelestialIcon(hour: number): string {
  return getCelestialEmoji(hour);
}

/**
 * Get the color for the sky gradient based on sun position
 */
export function getSkyColor(hour: number): string {
  const altitude = getSunAltitudeDegrees(hour);
  
  if (altitude > 30) {
    // High sun - bright sky
    return "rgb(135, 206, 250)"; // light sky blue
  } else if (altitude > 0) {
    // Low sun - golden hour
    return "rgb(255, 218, 185)"; // peach
  } else if (altitude > -12) {
    // Twilight (civil twilight is -6°, nautical is -12°)
    return "rgb(138, 123, 169)"; // dusk purple
  } else {
    // Night
    return "rgb(25, 25, 112)"; // midnight blue
  }
}
