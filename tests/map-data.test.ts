import { describe, expect, it } from 'vitest';
import world from '../public/data/processed/world.json';

describe('processed map data', () => {
  it('contains a playable local world', () => {
    expect(world.width).toBeGreaterThan(500);
    expect(world.height).toBeGreaterThan(500);
    expect(world.roads.length).toBeGreaterThan(10);
    expect(world.polygons.length).toBeGreaterThan(10);
  });

  it('keeps the start point inside the map bounds', () => {
    expect(world.start.x).toBeGreaterThan(0);
    expect(world.start.x).toBeLessThan(world.width);
    expect(world.start.y).toBeGreaterThan(0);
    expect(world.start.y).toBeLessThan(world.height);
  });
});
