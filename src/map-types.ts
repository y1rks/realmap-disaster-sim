export interface Point {
  x: number;
  y: number;
}

export interface RoadFeature {
  id: string;
  kind: string;
  name?: string;
  width: number;
  points: Point[];
}

export interface PolygonFeature {
  id: string;
  type: 'building' | 'water' | 'park' | 'railway' | 'barrier' | 'landuse';
  kind: string;
  name?: string;
  points: Point[];
}

export interface Facility {
  id: string;
  name: string;
  kind: string;
  x: number;
  y: number;
}

export interface MapLabel extends Point {
  name: string;
  type: string;
}

export interface WorldData {
  metadata: {
    title: string;
    source: string;
    sourceUrl: string;
    fetchedAt: string;
    bbox: { south: number; west: number; north: number; east: number };
    center: { lat: number; lon: number };
    units: 'meters';
  };
  width: number;
  height: number;
  start: Point & { label: string };
  roads: RoadFeature[];
  polygons: PolygonFeature[];
  facilities: Facility[];
  labels: MapLabel[];
}

export type Direction = 'up' | 'down' | 'left' | 'right';
