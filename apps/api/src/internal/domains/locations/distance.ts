const EARTH_RADIUS_KM = 6371;

/**
 * SQL for the great-circle distance in kilometers from the point bound to `$latParam`/`$lngParam`
 * to a row's coordinates. The cosine is clamped to [-1, 1] because rounding can push it just past 1
 * for identical points and just past -1 for antipodal points, and `acos` of either raises a
 * Postgres error instead of returning 0 or half the Earth's circumference.
 */
export function distanceKmSql(latParam: string, lngParam: string, latColumn: string, lngColumn: string): string {
  return `(${EARTH_RADIUS_KM} * acos(GREATEST(-1.0, LEAST(1.0,
    cos(radians(${latParam})) * cos(radians(${latColumn})) * cos(radians(${lngColumn}) - radians(${lngParam}))
    + sin(radians(${latParam})) * sin(radians(${latColumn}))
  ))))`;
}
