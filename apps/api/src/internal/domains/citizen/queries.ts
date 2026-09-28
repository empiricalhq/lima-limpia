export const CitizenProfileQueries = {
  upsertLocation: `
    INSERT INTO citizen_profile (user_id, lat, lng, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      updated_at = NOW()
  `,
  findLocation: 'SELECT lat, lng FROM citizen_profile WHERE user_id = $1',
} as const;
