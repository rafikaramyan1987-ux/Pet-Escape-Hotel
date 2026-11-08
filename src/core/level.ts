/**
 * Room format. Rooms are hand-made ASCII grids (x = column, y = row, y grows towards the camera).
 *
 *   #  wall                      .  floor               _  (unused)
 *   F  fence      (dog digs)     H  shelf / furniture (cat jumps, hidden on top, blocks sight)
 *   h  hamster hole in a wall    1-9 pipe ends, same digit = connected (hamster)
 *   B  pet bed  P  plant  C  pet carrier   (hiding spots: a pet on them cannot be seen)
 *   E  EXIT   o  bone (3 per room)   ~  squeaky floor (noise)   x  paw button   X  gate (open while a button is held)
 *   k  hotel key (the EXIT stays locked until a pet picks it up)
 *   d c m  start of Biscuit (dog), Miso (cat), Peanut (hamster) — their kennels are hiding spots
 *
 * Angles are in degrees: 0 = east (+x), 90 = south (+y, towards the camera), 180 = west, 270 = north.
 */
export type PetKind = 'dog' | 'cat' | 'hamster';
export const PET_KINDS: readonly PetKind[] = ['dog', 'cat', 'hamster'];
export type StaffSkin = 'porter' | 'chef' | 'maid' | 'gardener' | 'guard';
export type Theme = 'lobby' | 'dining' | 'spa' | 'garden' | 'rooftop';
export type XY = [number, number];

export interface GuardDef {
  /** Patrol waypoints (walkable tiles). One point = stands still (optionally sweeping with `turn`). */
  path: XY[];
  /** Ping-pong instead of looping back to the first point. */
  pingpong?: boolean;
  /** Pause at each waypoint (s). */
  wait?: number;
  /** Walk speed (tiles/s). */
  speed?: number;
  /** Flashlight range (tiles). */
  range?: number;
  /** Starts asleep (cone off) — noise wakes them. */
  sleep?: boolean;
  /** Facing when standing still / asleep (deg). */
  face?: number;
  /** Stationary sweep between two angles (deg). */
  turn?: [number, number];
  skin?: StaffSkin;
}

export interface CamDef {
  x: number;
  y: number;
  /** Sweep between two angles (deg). */
  from: number;
  to: number;
  period?: number;
  range?: number;
}

/** One waypoint of the reference solution (used by the playtest bot and by hints). */
export interface PlanStep {
  pet: PetKind;
  to: XY;
}

export interface LevelDef {
  id: string;
  floor: number;
  room: number;
  name: { en: string; fr: string };
  map: string[];
  guards: GuardDef[];
  cams?: CamDef[];
  /** Pets that must reach the EXIT (default: every pet in the room). */
  required?: PetKind[];
  plan: PlanStep[];
}

export interface Level {
  def: LevelDef;
  id: string;
  w: number;
  h: number;
  /** Base tiles (starts become 'K' kennels, bones/key become floor). */
  tiles: string[][];
  starts: Partial<Record<PetKind, XY>>;
  pets: PetKind[];
  required: PetKind[];
  bones: XY[];
  key: XY | null;
  exits: XY[];
  pipes: Map<number, XY>;
  theme: Theme;
}

export const THEMES: Theme[] = ['lobby', 'dining', 'spa', 'garden', 'rooftop'];

export const key = (x: number, y: number): number => y * 64 + x;

export function parseLevel(def: LevelDef): Level {
  const h = def.map.length;
  const w = Math.max(...def.map.map((r) => r.length));
  const tiles: string[][] = [];
  const starts: Partial<Record<PetKind, XY>> = {};
  const bones: XY[] = [];
  const exits: XY[] = [];
  let keyPos: XY | null = null;
  const pipeEnds = new Map<string, XY[]>();
  for (let y = 0; y < h; y++) {
    const row: string[] = [];
    for (let x = 0; x < w; x++) {
      let ch = def.map[y][x] ?? '#';
      if (ch === 'd' || ch === 'c' || ch === 'm') {
        starts[ch === 'd' ? 'dog' : ch === 'c' ? 'cat' : 'hamster'] = [x, y];
        ch = 'K';
      } else if (ch === 'o') {
        bones.push([x, y]);
        ch = '.';
      } else if (ch === 'k') {
        keyPos = [x, y];
        ch = '.';
      } else if (ch === 'E') {
        exits.push([x, y]);
      } else if (ch >= '1' && ch <= '9') {
        const l = pipeEnds.get(ch) ?? [];
        l.push([x, y]);
        pipeEnds.set(ch, l);
      }
      row.push(ch);
    }
    tiles.push(row);
  }
  const pipes = new Map<number, XY>();
  for (const [d, ends] of pipeEnds) {
    if (ends.length !== 2) throw new Error(`${def.id}: pipe ${d} needs exactly 2 ends`);
    pipes.set(key(...ends[0]), ends[1]);
    pipes.set(key(...ends[1]), ends[0]);
  }
  const pets = (['dog', 'cat', 'hamster'] as const).filter((p) => starts[p]);
  return {
    def,
    id: def.id,
    w,
    h,
    tiles,
    starts,
    pets,
    required: def.required ?? pets,
    bones,
    key: keyPos,
    exits,
    pipes,
    theme: THEMES[def.floor - 1] ?? 'lobby',
  };
}

export const isHideTile = (ch: string): boolean => ch === 'B' || ch === 'P' || ch === 'C' || ch === 'K';
export const isPipe = (ch: string): boolean => ch >= '1' && ch <= '9';
/** Tiles that stop a flashlight (closed gates are handled by the sim). */
export const blocksSight = (ch: string): boolean => ch === '#' || ch === 'h' || ch === 'H' || ch === '_';

export function petCanEnter(kind: PetKind, ch: string, gateOpen: boolean): boolean {
  switch (ch) {
    case '#':
    case '_':
      return false;
    case 'h':
      return kind === 'hamster';
    case 'F':
      return kind === 'dog';
    case 'H':
      return kind === 'cat';
    case 'X':
      return gateOpen;
    default:
      return true;
  }
}

export function guardCanEnter(ch: string, gateOpen: boolean): boolean {
  if (ch === 'X') return gateOpen;
  return ch === '.' || ch === '~' || ch === 'x' || isPipe(ch);
}
