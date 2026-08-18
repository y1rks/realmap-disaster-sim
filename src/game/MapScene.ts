import Phaser from 'phaser';
import { touchInput } from '../input-state';
import type { Point, PolygonFeature, WorldData } from '../map-types';

const SCALE = 2.15;
const PLAYER_RADIUS_METERS = 3.2;
const WALK_SPEED_METERS = 10;
const QUAKE_DELAY_SECONDS = 7;

interface DangerZone extends Point {
  radius: number;
}

export class MapScene extends Phaser.Scene {
  private worldData!: WorldData;
  private player!: Phaser.GameObjects.Container;
  private playerBody!: Phaser.GameObjects.Arc;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private blockers: PolygonFeature[] = [];
  private dangerZones: DangerZone[] = [];
  private target!: Point;
  private targetMarker!: Phaser.GameObjects.Container;
  private elapsed = 0;
  private quakeStarted = false;
  private completed = false;
  private initialDistance = 1;
  private lastHudSecond = -1;

  constructor() {
    super('map');
  }

  preload(): void {
    this.load.json('world', './data/processed/world.json');
  }

  create(): void {
    this.worldData = this.cache.json.get('world') as WorldData;
    this.blockers = this.worldData.polygons.filter((feature) =>
      ['building', 'water', 'barrier'].includes(feature.type),
    );

    const worldWidth = this.worldData.width * SCALE;
    const worldHeight = this.worldData.height * SCALE;
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    this.cameras.main.setBackgroundColor('#dce7dc');

    this.drawMap();
    const start = this.findOpenPoint(this.worldData.start);
    this.target = this.chooseTarget(start);
    this.targetMarker = this.createTargetMarker(this.target);
    this.targetMarker.setVisible(false);
    this.player = this.createPlayer(start);

    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setZoom(this.getResponsiveZoom());

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as typeof this.wasd;
    this.scale.on('resize', () => this.cameras.main.setZoom(this.getResponsiveZoom()));
    this.game.events.emit('simulation-ready', this.worldData.metadata);
  }

  update(_time: number, delta: number): void {
    if (this.completed) return;
    this.elapsed += delta / 1000;

    if (!this.quakeStarted && this.elapsed >= QUAKE_DELAY_SECONDS) this.startQuake();
    this.movePlayer(delta / 1000);

    const seconds = Math.floor(this.elapsed);
    if (seconds !== this.lastHudSecond) {
      this.lastHudSecond = seconds;
      this.game.events.emit('clock', seconds);
    }

    if (this.quakeStarted) {
      const current = this.toMeters(this.player.x, this.player.y);
      const distance = Phaser.Math.Distance.Between(current.x, current.y, this.target.x, this.target.y);
      const progress = Phaser.Math.Clamp(1 - distance / this.initialDistance, 0, 1);
      this.game.events.emit('progress', { progress, distance: Math.round(distance) });
      if (distance < 10) this.completeScenario();
    }
  }

  private drawMap(): void {
    const background = this.add.graphics();
    background.fillStyle(0xe5e7db, 1).fillRect(0, 0, this.worldData.width * SCALE, this.worldData.height * SCALE);

    const drawPolygons = (type: PolygonFeature['type'], color: number, stroke: number, alpha = 1) => {
      const graphics = this.add.graphics();
      graphics.fillStyle(color, alpha).lineStyle(0.7 * SCALE, stroke, 0.7);
      for (const feature of this.worldData.polygons.filter((item) => item.type === type)) {
        const points = feature.points.map((point) => new Phaser.Math.Vector2(point.x * SCALE, point.y * SCALE));
        if (points.length > 2) graphics.fillPoints(points, true).strokePoints(points, true);
      }
    };

    drawPolygons('landuse', 0xd9decf, 0xcbd3c4);
    drawPolygons('park', 0xbdd6ae, 0x90b780);
    drawPolygons('water', 0x9bc9dc, 0x72abc4);

    const roads = this.add.graphics();
    for (const road of [...this.worldData.roads].sort((a, b) => b.width - a.width)) {
      const path = road.points.map((point) => ({ x: point.x * SCALE, y: point.y * SCALE }));
      roads.lineStyle((road.width + 1.8) * SCALE, 0xc7c2b6, 1);
      this.strokePath(roads, path);
      roads.lineStyle(road.width * SCALE, this.roadColor(road.kind), 1);
      this.strokePath(roads, path);
    }

    drawPolygons('railway', 0x74766f, 0x5b5e58, 0.85);
    drawPolygons('building', 0xc3b8aa, 0x9b8d7d);
    drawPolygons('barrier', 0x777a70, 0x55584f);

    this.drawFacilities();
    this.drawLabels();
    this.drawMapFurniture();
  }

  private strokePath(graphics: Phaser.GameObjects.Graphics, points: Point[]): void {
    if (points.length < 2) return;
    graphics.beginPath().moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => graphics.lineTo(point.x, point.y));
    graphics.strokePath();
  }

  private roadColor(kind: string): number {
    if (['primary', 'secondary'].includes(kind)) return 0xf4d48b;
    if (['footway', 'path', 'steps', 'cycleway'].includes(kind)) return 0xe8ddc3;
    return 0xf6f1e6;
  }

  private drawFacilities(): void {
    const important = this.worldData.facilities.filter((facility) =>
      ['townhall', 'school', 'community_centre', 'library', 'hospital', 'clinic'].includes(facility.kind),
    );
    for (const facility of important) {
      const marker = this.add.container(facility.x * SCALE, facility.y * SCALE);
      const circle = this.add.circle(0, 0, 3.6 * SCALE, facility.kind === 'townhall' ? 0x245e75 : 0xffffff, 1)
        .setStrokeStyle(1.4 * SCALE, 0x245e75);
      const dot = this.add.circle(0, 0, 1.2 * SCALE, facility.kind === 'townhall' ? 0xffffff : 0x245e75);
      marker.add([circle, dot]).setDepth(5);
    }
  }

  private drawLabels(): void {
    const seen = new Set<string>();
    const labels = this.worldData.labels
      .filter((label) => label.name.length < 22 && !seen.has(label.name) && seen.add(label.name))
      .slice(0, 32);

    for (const label of labels) {
      const isBuilding = label.type === 'building';
      this.add.text(label.x * SCALE, label.y * SCALE, label.name, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: isBuilding ? '9px' : '8px',
        color: isBuilding ? '#5d554c' : '#777063',
        backgroundColor: '#f7f5ecbb',
        padding: { x: 2, y: 1 },
      }).setOrigin(0.5).setDepth(6).setResolution(2);
    }
  }

  private drawMapFurniture(): void {
    const scaleBarX = 20 * SCALE;
    const scaleBarY = (this.worldData.height - 18) * SCALE;
    const graphics = this.add.graphics().setDepth(7);
    graphics.lineStyle(2, 0x33403b, 1)
      .beginPath().moveTo(scaleBarX, scaleBarY).lineTo(scaleBarX + 50 * SCALE, scaleBarY).strokePath();
    graphics.lineBetween(scaleBarX, scaleBarY - 4, scaleBarX, scaleBarY + 4);
    graphics.lineBetween(scaleBarX + 50 * SCALE, scaleBarY - 4, scaleBarX + 50 * SCALE, scaleBarY + 4);
    this.add.text(scaleBarX, scaleBarY - 17, '50 m', { fontFamily: 'system-ui', fontSize: '10px', color: '#33403b' }).setDepth(7);
  }

  private createPlayer(point: Point): Phaser.GameObjects.Container {
    const container = this.add.container(point.x * SCALE, point.y * SCALE).setDepth(20);
    const shadow = this.add.ellipse(1, 3.5 * SCALE, 7 * SCALE, 4 * SCALE, 0x142a25, 0.22);
    this.playerBody = this.add.circle(0, 0, PLAYER_RADIUS_METERS * SCALE, 0xf26b4b, 1)
      .setStrokeStyle(1.1 * SCALE, 0xffffff, 1);
    const facing = this.add.triangle(0, -4.6 * SCALE, 0, 3 * SCALE, -1.8 * SCALE, 6 * SCALE, 1.8 * SCALE, 6 * SCALE, 0xffffff);
    container.add([shadow, this.playerBody, facing]);
    return container;
  }

  private movePlayer(deltaSeconds: number): void {
    let dx = 0;
    let dy = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown || touchInput.left) dx -= 1;
    if (this.cursors.right.isDown || this.wasd.D.isDown || touchInput.right) dx += 1;
    if (this.cursors.up.isDown || this.wasd.W.isDown || touchInput.up) dy -= 1;
    if (this.cursors.down.isDown || this.wasd.S.isDown || touchInput.down) dy += 1;
    if (!dx && !dy) return;

    const length = Math.hypot(dx, dy);
    const distance = WALK_SPEED_METERS * deltaSeconds;
    dx = (dx / length) * distance;
    dy = (dy / length) * distance;
    const current = this.toMeters(this.player.x, this.player.y);
    const nextX = { x: current.x + dx, y: current.y };
    const nextY = { x: current.x, y: current.y + dy };
    if (!this.isBlocked(nextX)) this.player.x = nextX.x * SCALE;
    if (!this.isBlocked(nextY)) this.player.y = nextY.y * SCALE;
  }

  private isBlocked(point: Point): boolean {
    if (
      point.x < PLAYER_RADIUS_METERS || point.y < PLAYER_RADIUS_METERS ||
      point.x > this.worldData.width - PLAYER_RADIUS_METERS ||
      point.y > this.worldData.height - PLAYER_RADIUS_METERS
    ) return true;

    const samples = [point];
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      samples.push({
        x: point.x + Math.cos(angle) * PLAYER_RADIUS_METERS,
        y: point.y + Math.sin(angle) * PLAYER_RADIUS_METERS,
      });
    }

    if (this.blockers.some((polygon) => samples.some((sample) => this.pointInPolygon(sample, polygon.points)))) return true;
    return this.quakeStarted && this.dangerZones.some((zone) =>
      Phaser.Math.Distance.Between(point.x, point.y, zone.x, zone.y) < zone.radius + PLAYER_RADIUS_METERS,
    );
  }

  private pointInPolygon(point: Point, polygon: Point[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i];
      const b = polygon[j];
      const intersects = a.y > point.y !== b.y > point.y &&
        point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || Number.EPSILON) + a.x;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  private findOpenPoint(preferred: Point): Point {
    if (!this.isBlockedBeforeQuake(preferred)) return preferred;
    for (let radius = 8; radius <= 90; radius += 5) {
      for (let index = 0; index < 24; index += 1) {
        const angle = (index / 24) * Math.PI * 2;
        const candidate = { x: preferred.x + Math.cos(angle) * radius, y: preferred.y + Math.sin(angle) * radius };
        if (!this.isBlockedBeforeQuake(candidate)) return candidate;
      }
    }
    return { x: this.worldData.width / 2, y: this.worldData.height / 2 };
  }

  private isBlockedBeforeQuake(point: Point): boolean {
    if (point.x < 4 || point.y < 4 || point.x > this.worldData.width - 4 || point.y > this.worldData.height - 4) return true;
    return this.blockers.some((polygon) => this.pointInPolygon(point, polygon.points));
  }

  private chooseTarget(start: Point): Point {
    const parks = this.worldData.polygons.filter((polygon) => polygon.type === 'park');
    const candidates = parks.map((park) => this.centroid(park.points))
      .filter((point) => Phaser.Math.Distance.Between(start.x, start.y, point.x, point.y) > 150)
      .sort((a, b) => Phaser.Math.Distance.Between(start.x, start.y, b.x, b.y) - Phaser.Math.Distance.Between(start.x, start.y, a.x, a.y));
    if (candidates[0]) return this.findOpenPoint(candidates[0]);
    return this.findOpenPoint({ x: this.worldData.width * 0.82, y: this.worldData.height * 0.2 });
  }

  private centroid(points: Point[]): Point {
    const result = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
    return { x: result.x / points.length, y: result.y / points.length };
  }

  private createTargetMarker(point: Point): Phaser.GameObjects.Container {
    const marker = this.add.container(point.x * SCALE, point.y * SCALE).setDepth(15);
    const pulse = this.add.circle(0, 0, 12 * SCALE, 0x2fb477, 0.2).setStrokeStyle(1, 0x2fb477, 0.7);
    const core = this.add.circle(0, 0, 6 * SCALE, 0x2fb477, 1).setStrokeStyle(2, 0xffffff, 1);
    const icon = this.add.text(0, 0, '避', { fontFamily: 'system-ui', fontSize: '11px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
    const label = this.add.text(0, -15 * SCALE, '一時避難地点', {
      fontFamily: 'system-ui', fontSize: '11px', fontStyle: 'bold', color: '#174b39',
      backgroundColor: '#edfff7dd', padding: { x: 5, y: 3 },
    }).setOrigin(0.5).setResolution(2);
    marker.add([pulse, core, icon, label]);
    this.tweens.add({ targets: pulse, scale: 1.7, alpha: 0, duration: 1300, repeat: -1 });
    return marker;
  }

  private startQuake(): void {
    this.quakeStarted = true;
    this.targetMarker.setVisible(true);
    const playerPosition = this.toMeters(this.player.x, this.player.y);
    this.initialDistance = Phaser.Math.Distance.Between(playerPosition.x, playerPosition.y, this.target.x, this.target.y);
    this.dangerZones = [
      { x: this.worldData.width * 0.48, y: this.worldData.height * 0.34, radius: 18 },
      { x: this.worldData.width * 0.68, y: this.worldData.height * 0.63, radius: 22 },
    ].filter((zone) => Phaser.Math.Distance.Between(zone.x, zone.y, this.target.x, this.target.y) > zone.radius + 20);

    const dangerGraphics = this.add.graphics().setDepth(12);
    for (const zone of this.dangerZones) {
      dangerGraphics.fillStyle(0xc83c43, 0.35).fillCircle(zone.x * SCALE, zone.y * SCALE, zone.radius * SCALE);
      dangerGraphics.lineStyle(1.3 * SCALE, 0xa92631, 0.85).strokeCircle(zone.x * SCALE, zone.y * SCALE, zone.radius * SCALE);
      this.add.text(zone.x * SCALE, zone.y * SCALE, '危険', {
        fontFamily: 'system-ui', fontSize: '10px', fontStyle: 'bold', color: '#8c1723',
      }).setOrigin(0.5).setDepth(13).setResolution(2);
    }

    this.cameras.main.shake(650, 0.009);
    this.game.events.emit('quake');
  }

  private completeScenario(): void {
    this.completed = true;
    this.playerBody.setFillStyle(0x2fb477);
    this.game.events.emit('complete', Math.floor(this.elapsed));
  }

  private toMeters(x: number, y: number): Point {
    return { x: x / SCALE, y: y / SCALE };
  }

  private getResponsiveZoom(): number {
    return this.scale.width < 700 ? 1.25 : 1.55;
  }
}
