export function getDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function parseCoordinate(
  value: string,
): { latitude: number; longitude: number } | undefined {
  const decimalMatch = value
    .trim()
    .match(/^([-+]?\d+(?:\.\d+)?)\s*,\s*([-+]?\d+(?:\.\d+)?)$/);

  if (decimalMatch) {
    return validateCoordinates(
      Number(decimalMatch[1]),
      Number(decimalMatch[2]),
    );
  }

  const dmsMatch = value
    .trim()
    .match(
      /^(\d{1,3})°\s*(\d{1,2})['′]\s*(\d+(?:\.\d+)?)\s*["″]\s*([NS])\s+(\d{1,3})°\s*(\d{1,2})['′]\s*(\d+(?:\.\d+)?)\s*["″]\s*([EW])$/i,
    );

  if (!dmsMatch) return undefined;

  const latitude = degreesMinutesSecondsToDecimal(
    Number(dmsMatch[1]),
    Number(dmsMatch[2]),
    Number(dmsMatch[3]),
    dmsMatch[4],
  );
  const longitude = degreesMinutesSecondsToDecimal(
    Number(dmsMatch[5]),
    Number(dmsMatch[6]),
    Number(dmsMatch[7]),
    dmsMatch[8],
  );
  return validateCoordinates(latitude, longitude);
}

function degreesMinutesSecondsToDecimal(
  degrees: number,
  minutes: number,
  seconds: number,
  direction: string,
) {
  const value = degrees + minutes / 60 + seconds / 3600;
  return /[SW]/i.test(direction) ? -value : value;
}

function validateCoordinates(
  latitude: number,
  longitude: number,
): { latitude: number; longitude: number } | undefined {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return undefined;
  }
  return { latitude, longitude };
}
