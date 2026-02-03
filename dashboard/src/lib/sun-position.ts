/**
 * Sun/Moon position calculator for timeline visualization
 * Simplified calculation based on Beijing location (39.9°N, 116.4°E)
 */

/**
 * Calculate approximate sun altitude for a given hour
 * Returns a value from -1 (below horizon) to 1 (highest point)
 * 
 * This is a simplified sinusoidal approximation:
 * - Sunrise around 6:00, sunset around 18:00 (simplified)
 * - Peak at solar noon (12:00)
 * 
 * For more accuracy, we could use actual astronomical calculations,
 * but this provides a good visual approximation.
 */
export function getSunAltitude(hour: number, minute: number = 0): number {
  const time = hour + minute / 60;
  
  // Simplified model: sun rises at 6, peaks at 12, sets at 18
  // Using cosine wave shifted to match this pattern
  // cos((t - 12) * π / 12) gives us peak at 12:00
  const altitude = Math.cos((time - 12) * Math.PI / 12);
  
  return altitude;
}

/**
 * Check if sun is above horizon
 */
export function isSunUp(hour: number, minute: number = 0): boolean {
  return getSunAltitude(hour, minute) > 0;
}

/**
 * Get sun/moon icon for a given time
 */
export function getCelestialIcon(hour: number): string {
  return isSunUp(hour) ? "☀️" : "🌙";
}

/**
 * Calculate the horizontal position (0-100%) for the sun curve
 * 0% = leftmost (below horizon), 50% = center, 100% = rightmost (peak)
 * 
 * We map altitude (-1 to 1) to position (0 to 100)
 */
export function getSunCurvePosition(hour: number, minute: number = 0): number {
  const altitude = getSunAltitude(hour, minute);
  // Map from [-1, 1] to [0, 100]
  return (altitude + 1) * 50;
}

/**
 * Get the color for the sky gradient based on sun position
 */
export function getSkyColor(hour: number): string {
  const altitude = getSunAltitude(hour);
  
  if (altitude > 0.5) {
    // High sun - bright sky
    return "rgb(135, 206, 250)"; // light sky blue
  } else if (altitude > 0) {
    // Low sun - golden hour
    return "rgb(255, 218, 185)"; // peach
  } else if (altitude > -0.3) {
    // Twilight
    return "rgb(138, 123, 169)"; // dusk purple
  } else {
    // Night
    return "rgb(25, 25, 112)"; // midnight blue
  }
}
