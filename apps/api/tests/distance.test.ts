import { afterAll, describe, expect, test } from 'bun:test';
import { distanceKmSql } from '@/internal/domains/locations/distance';
import { Database } from './helpers/database';

const HALF_EARTH_CIRCUMFERENCE_KM = 20_015.09;

const db = new Database();

afterAll(async () => {
  await db.close();
});

async function distanceKm(from: [number, number], to: [number, number]): Promise<number> {
  const rows = await db.query<{ km: number }>(`SELECT ${distanceKmSql('$1', '$2', '$3::float8', '$4::float8')} AS km`, [
    from[0],
    from[1],
    to[0],
    to[1],
  ]);
  return Number(rows[0]?.km);
}

describe('distanceKmSql', () => {
  test('identical points are 0 km apart even when rounding pushes the cosine past 1', async () => {
    const points: [number, number][] = [
      [-12.0464, -77.0428],
      [-33.3, 44.4],
      [51.5074, -0.1278],
    ];

    const distances = await Promise.all(points.map((point) => distanceKm(point, point)));

    for (const distance of distances) {
      expect(distance).toBeCloseTo(0, 3);
    }
  });

  test('antipodal points are half the Earth circumference apart even when rounding pushes the cosine past -1', async () => {
    const pairs: [[number, number], [number, number]][] = [
      [
        [0, 0],
        [0, 180],
      ],
      [
        [79.4831, -63.5712],
        [-79.4831, 116.4288],
      ],
      [
        [-50.8514, 80.7668],
        [50.8514, -99.2332],
      ],
      [
        [8.9144, 63.3492],
        [-8.9144, -116.6508],
      ],
    ];

    const distances = await Promise.all(pairs.map(([from, to]) => distanceKm(from, to)));

    for (const distance of distances) {
      expect(distance).toBeCloseTo(HALF_EARTH_CIRCUMFERENCE_KM, 1);
    }
  });
});
