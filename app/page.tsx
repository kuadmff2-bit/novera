"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { Slider } from "@/components/ui/slider";

const MAP_SIZE = 32;

function buildMap() {
  const grid = Array.from({ length: MAP_SIZE }, () => Array.from({ length: MAP_SIZE }, () => "0"));
  const wall = (x: number, y: number, type = "1") => {
    if (x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE) grid[y][x] = type;
  };
  const block = (x1: number, y1: number, x2: number, y2: number, type: string) => {
    for (let y = y1; y <= y2; y += 1) for (let x = x1; x <= x2; x += 1) wall(x, y, type);
  };

  for (let i = 0; i < MAP_SIZE; i += 1) {
    wall(i, 0); wall(i, MAP_SIZE - 1); wall(0, i); wall(MAP_SIZE - 1, i);
  }

  block(4, 4, 7, 7, "2");
  block(24, 4, 27, 7, "3");
  block(4, 24, 7, 27, "3");
  block(24, 24, 27, 27, "2");

  for (let x = 11; x <= 20; x += 1) { wall(x, 11); wall(x, 20); }
  for (let y = 11; y <= 20; y += 1) { wall(11, y); wall(20, y); }
  for (const opening of [15, 16]) {
    wall(opening, 11, "0"); wall(opening, 20, "0");
    wall(11, opening, "0"); wall(20, opening, "0");
  }

  for (let x = 10; x <= 21; x += 1) {
    if (x !== 15 && x !== 16) { wall(x, 8, x % 2 ? "3" : "1"); wall(x, 23, x % 2 ? "3" : "1"); }
  }
  for (let y = 10; y <= 21; y += 1) {
    if (y !== 15 && y !== 16) { wall(8, y, y % 2 ? "2" : "1"); wall(23, y, y % 2 ? "2" : "1"); }
  }

  for (const [x, y, type] of [
    [3, 15, "3"], [6, 15, "2"], [26, 15, "2"], [29, 15, "3"],
    [15, 3, "2"], [15, 6, "3"], [15, 26, "3"], [15, 29, "2"],
    [10, 4, "1"], [21, 4, "1"], [10, 27, "1"], [21, 27, "1"],
  ] as const) wall(x, y, type);

  return grid.map((row) => row.join(""));
}

const MAP = buildMap();

const SPAWNS = [
  [2.5, 2.5], [9.5, 2.5], [21.5, 2.5], [29.5, 2.5],
  [2.5, 9.5], [9.5, 9.5], [22.5, 9.5], [29.5, 9.5],
  [2.5, 18.5], [9.5, 18.5], [22.5, 18.5], [29.5, 18.5],
  [2.5, 29.5], [9.5, 29.5], [21.5, 29.5], [29.5, 29.5],
  [15.5, 9.5], [15.5, 22.5], [9.5, 15.5], [22.5, 15.5],
] as const;

const BASE_FOV = Math.PI / 3;
const TAU = Math.PI * 2;

type GameMode = "menu" | "playing" | "paused" | "gameover";
type WeaponId = "nvr7" | "brk4" | "vanta";
type PickupKind = "ammo" | "health";

type WeaponConfig = {
  id: WeaponId;
  name: string;
  category: string;
  magazine: number;
  reserve: number;
  damage: number;
  headDamage: number;
  shotDelay: number;
  reloadTime: number;
  spread: number;
  zoom: number;
  automatic: boolean;
};

const WEAPON_ORDER: WeaponId[] = ["nvr7", "brk4", "vanta"];
const WEAPONS: Record<WeaponId, WeaponConfig> = {
  nvr7: { id: "nvr7", name: "NVR–7", category: "FUZIL AUTOMÁTICO", magazine: 30, reserve: 150, damage: 30, headDamage: 82, shotDelay: 98, reloadTime: 1420, spread: 13, zoom: 0.34, automatic: true },
  brk4: { id: "brk4", name: "BRK–4", category: "FUZIL DE BATALHA", magazine: 20, reserve: 100, damage: 47, headDamage: 125, shotDelay: 178, reloadTime: 1660, spread: 9, zoom: 0.42, automatic: true },
  vanta: { id: "vanta", name: "VANTA .50", category: "SNIPER", magazine: 5, reserve: 30, damage: 128, headDamage: 280, shotDelay: 920, reloadTime: 2180, spread: 3, zoom: 0.72, automatic: false },
};

type Enemy = {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  attackAt: number;
  hitUntil: number;
  deadAt: number;
  phase: number;
  aimUntil: number;
  fireUntil: number;
  kind: "scout" | "soldier" | "brute";
};

type Pickup = {
  id: number;
  x: number;
  y: number;
  kind: PickupKind;
  createdAt: number;
};

type TargetBox = {
  enemy: Enemy;
  x: number;
  y: number;
  width: number;
  height: number;
  distance: number;
};

type Player = {
  x: number;
  y: number;
  angle: number;
  pitch: number;
  health: number;
};

type Game = {
  mode: GameMode;
  player: Player;
  enemies: Enemy[];
  keys: Set<string>;
  moveX: number;
  moveY: number;
  velocityX: number;
  velocityY: number;
  firing: boolean;
  triggerLocked: boolean;
  aiming: boolean;
  aimProgress: number;
  sensitivity: number;
  weapon: WeaponId;
  ammo: Record<WeaponId, number>;
  reserve: Record<WeaponId, number>;
  switchUntil: number;
  lastShot: number;
  reloadStarted: number;
  reloadUntil: number;
  score: number;
  wave: number;
  nextWaveAt: number;
  enemySequence: number;
  pickupSequence: number;
  pickups: Pickup[];
  targets: TargetBox[];
  muzzleUntil: number;
  hitUntil: number;
  killUntil: number;
  damageFlash: number;
  recoil: number;
  shake: number;
  walkCycle: number;
  bob: number;
  banner: string;
  bannerUntil: number;
  lastFrame: number;
  lastHud: number;
  audio: AudioContext | null;
  muted: boolean;
  best: number;
};

type Hud = {
  health: number;
  ammo: number;
  reserve: number;
  score: number;
  wave: number;
  enemies: number;
  reloading: boolean;
  reloadProgress: number;
  banner: string;
  best: number;
  weapon: WeaponId;
  weaponName: string;
  weaponCategory: string;
  sensitivity: number;
};

const initialHud: Hud = {
  health: 100,
  ammo: 30,
  reserve: 150,
  score: 0,
  wave: 1,
  enemies: 0,
  reloading: false,
  reloadProgress: 0,
  banner: "",
  best: 0,
  weapon: "nvr7",
  weaponName: "NVR–7",
  weaponCategory: "FUZIL AUTOMÁTICO",
  sensitivity: 1,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle: number) {
  while (angle > Math.PI) angle -= TAU;
  while (angle < -Math.PI) angle += TAU;
  return angle;
}

function wallAt(x: number, y: number) {
  const cell = MAP[Math.floor(y)]?.[Math.floor(x)];
  return !cell || cell !== "0";
}

function canOccupy(x: number, y: number, radius = 0.25) {
  return !wallAt(x - radius, y - radius)
    && !wallAt(x + radius, y - radius)
    && !wallAt(x - radius, y + radius)
    && !wallAt(x + radius, y + radius);
}

function hasLineOfSight(ax: number, ay: number, bx: number, by: number) {
  const distance = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(distance / 0.12));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (wallAt(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}

function createGame(): Game {
  let best = 0;
  let sensitivity = 1;
  try {
    best = Number(window.localStorage.getItem("novera-best") || 0);
    sensitivity = clamp(Number(window.localStorage.getItem("novera-sensitivity") || 1), 0.4, 2);
  } catch {
    best = 0;
    sensitivity = 1;
  }

  return {
    mode: "menu",
    player: { x: 15.5, y: 15.5, angle: -Math.PI / 2, pitch: 0, health: 100 },
    enemies: [],
    keys: new Set(),
    moveX: 0,
    moveY: 0,
    velocityX: 0,
    velocityY: 0,
    firing: false,
    triggerLocked: false,
    aiming: false,
    aimProgress: 0,
    sensitivity,
    weapon: "nvr7",
    ammo: { nvr7: 30, brk4: 20, vanta: 5 },
    reserve: { nvr7: 150, brk4: 100, vanta: 30 },
    switchUntil: 0,
    lastShot: 0,
    reloadStarted: 0,
    reloadUntil: 0,
    score: 0,
    wave: 1,
    nextWaveAt: 0,
    enemySequence: 0,
    pickupSequence: 0,
    pickups: [],
    targets: [],
    muzzleUntil: 0,
    hitUntil: 0,
    killUntil: 0,
    damageFlash: 0,
    recoil: 0,
    shake: 0,
    walkCycle: 0,
    bob: 0,
    banner: "",
    bannerUntil: 0,
    lastFrame: performance.now(),
    lastHud: 0,
    audio: null,
    muted: false,
    best,
  };
}

function ensureAudio(game: Game) {
  if (game.audio) {
    if (game.audio.state === "suspended") void game.audio.resume();
    return;
  }
  try {
    game.audio = new AudioContext();
  } catch {
    game.audio = null;
  }
}

function tone(game: Game, kind: "shot" | "hit" | "kill" | "hurt" | "reload" | "empty" | "pickup" | "switch") {
  const audio = game.audio;
  if (!audio || game.muted) return;
  const now = audio.currentTime;
  const gain = audio.createGain();
  gain.connect(audio.destination);

  if (kind === "shot") {
    const config = WEAPONS[game.weapon];
    const duration = game.weapon === "vanta" ? 0.17 : game.weapon === "brk4" ? 0.12 : 0.09;
    const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * duration), audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.6);
    }
    const noise = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = game.weapon === "vanta" ? 950 : game.weapon === "brk4" ? 1350 : 1800;
    noise.buffer = buffer;
    noise.connect(filter);
    filter.connect(gain);
    gain.gain.setValueAtTime(config.automatic ? 0.27 : 0.38, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    noise.start(now);
    return;
  }

  const oscillator = audio.createOscillator();
  oscillator.connect(gain);
  oscillator.type = kind === "hurt" ? "sawtooth" : "square";
  const frequencies = { hit: 520, kill: 180, hurt: 90, reload: 260, empty: 120, pickup: 660, switch: 205 };
  const durations = { hit: 0.05, kill: 0.18, hurt: 0.13, reload: 0.07, empty: 0.04, pickup: 0.12, switch: 0.055 };
  const frequency = frequencies[kind];
  const duration = durations[kind];
  oscillator.frequency.setValueAtTime(frequency, now);
  if (kind === "kill") oscillator.frequency.exponentialRampToValueAtTime(720, now + duration);
  if (kind === "hurt") oscillator.frequency.exponentialRampToValueAtTime(45, now + duration);
  gain.gain.setValueAtTime(kind === "hurt" ? 0.12 : 0.07, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function switchWeapon(game: Game, weapon: WeaponId, now: number) {
  if (game.weapon === weapon || game.mode === "gameover") return;
  game.weapon = weapon;
  game.aiming = false;
  game.firing = false;
  game.triggerLocked = false;
  game.reloadStarted = 0;
  game.reloadUntil = 0;
  game.switchUntil = now + 460;
  game.banner = `${WEAPONS[weapon].name} // ${WEAPONS[weapon].category}`;
  game.bannerUntil = now + 780;
  tone(game, "switch");
}

function startReload(game: Game, now: number) {
  const config = WEAPONS[game.weapon];
  if (
    game.reloadUntil > now
    || game.ammo[game.weapon] >= config.magazine
    || game.reserve[game.weapon] <= 0
    || game.mode !== "playing"
  ) return;
  game.firing = false;
  game.aiming = false;
  game.reloadStarted = now;
  game.reloadUntil = now + config.reloadTime;
  tone(game, "reload");
}

function finishReload(game: Game) {
  const config = WEAPONS[game.weapon];
  const needed = config.magazine - game.ammo[game.weapon];
  const loaded = Math.min(needed, game.reserve[game.weapon]);
  game.ammo[game.weapon] += loaded;
  game.reserve[game.weapon] -= loaded;
  game.reloadUntil = 0;
  game.reloadStarted = 0;
}

function spawnWave(game: Game, now: number) {
  const count = Math.min(3 + Math.ceil(game.wave * 1.25), 15);
  const shuffled = [...SPAWNS].sort(() => Math.random() - 0.5);
  const available = shuffled.filter(([x, y]) => Math.hypot(x - game.player.x, y - game.player.y) > 8);
  game.enemies = [];

  for (let i = 0; i < count; i += 1) {
    const base = available[i % available.length];
    const roll = Math.random();
    const kind: Enemy["kind"] = game.wave >= 4 && roll > 0.82 ? "brute" : roll < 0.34 ? "scout" : "soldier";
    const maxHp = kind === "brute" ? 105 + game.wave * 9 : kind === "scout" ? 40 + game.wave * 5 : 62 + game.wave * 7;
    const baseSpeed = kind === "brute" ? 0.61 : kind === "scout" ? 0.93 : 0.76;
    game.enemies.push({
      id: ++game.enemySequence,
      x: base[0] + (Math.random() - 0.5) * 0.18,
      y: base[1] + (Math.random() - 0.5) * 0.18,
      hp: maxHp,
      maxHp,
      speed: Math.min(1.12, baseSpeed + game.wave * 0.012 + Math.random() * 0.1),
      attackAt: now + 1250 + Math.random() * 1500,
      hitUntil: 0,
      deadAt: 0,
      phase: Math.random() * TAU,
      aimUntil: 0,
      fireUntil: 0,
      kind,
    });
  }
  game.nextWaveAt = 0;
  game.banner = `ONDA ${game.wave}`;
  game.bannerUntil = now + 1500;
}

function resetGame(game: Game, now: number) {
  game.player = { x: 15.5, y: 15.5, angle: -Math.PI / 2, pitch: 0, health: 100 };
  game.enemies = [];
  game.pickups = [];
  game.keys.clear();
  game.moveX = 0;
  game.moveY = 0;
  game.velocityX = 0;
  game.velocityY = 0;
  game.firing = false;
  game.triggerLocked = false;
  game.aiming = false;
  game.aimProgress = 0;
  game.weapon = "nvr7";
  game.ammo = { nvr7: 30, brk4: 20, vanta: 5 };
  game.reserve = { nvr7: 150, brk4: 100, vanta: 30 };
  game.switchUntil = 0;
  game.lastShot = 0;
  game.reloadStarted = 0;
  game.reloadUntil = 0;
  game.score = 0;
  game.wave = 1;
  game.nextWaveAt = 0;
  game.targets = [];
  game.muzzleUntil = 0;
  game.hitUntil = 0;
  game.killUntil = 0;
  game.damageFlash = 0;
  game.recoil = 0;
  game.shake = 0;
  game.walkCycle = 0;
  game.bob = 0;
  game.lastFrame = now;
  spawnWave(game, now);
}

function fireWeapon(game: Game, now: number) {
  const config = WEAPONS[game.weapon];
  if (
    game.mode !== "playing"
    || game.reloadUntil > now
    || game.switchUntil > now
    || now - game.lastShot < config.shotDelay
    || (!config.automatic && game.triggerLocked)
  ) return;
  game.lastShot = now;
  if (!config.automatic) game.triggerLocked = true;

  if (game.ammo[game.weapon] <= 0) {
    tone(game, "empty");
    startReload(game, now);
    return;
  }

  game.ammo[game.weapon] -= 1;
  game.muzzleUntil = now + (game.weapon === "vanta" ? 85 : 48);
  game.recoil = Math.min(1, game.recoil + (game.weapon === "vanta" ? 0.92 : game.weapon === "brk4" ? 0.62 : 0.42));
  game.shake = Math.min(1, game.shake + (game.weapon === "vanta" ? 0.44 : 0.15));
  tone(game, "shot");

  const movementPenalty = Math.min(1, Math.hypot(game.velocityX, game.velocityY) / 4.5);
  const accuracy = 1 - game.aimProgress * 0.78;
  const spread = config.spread * accuracy * (1 + movementPenalty * 0.65 + game.recoil * 0.55);
  const canvasX = window.innerWidth / 2 + (Math.random() - 0.5) * spread * 2;
  const canvasY = window.innerHeight / 2 + (Math.random() - 0.5) * spread * 2;
  const target = game.targets
    .filter(({ x, y, width, height, enemy }) => (
      !enemy.deadAt
      && canvasX >= x
      && canvasX <= x + width
      && canvasY >= y
      && canvasY <= y + height
    ))
    .sort((a, b) => a.distance - b.distance)[0];

  if (target) {
    const headshot = canvasY < target.y + target.height * 0.32;
    const damage = headshot ? config.headDamage : config.damage;
    target.enemy.hp -= damage;
    target.enemy.hitUntil = now + 90;
    game.hitUntil = now + 115;
    tone(game, "hit");

    if (target.enemy.hp <= 0) {
      target.enemy.deadAt = now;
      target.enemy.aimUntil = 0;
      game.score += headshot ? 175 : 100;
      game.killUntil = now + 240;
      game.banner = headshot ? "TIRO PERFEITO" : "ALVO ELIMINADO";
      game.bannerUntil = now + 650;
      tone(game, "kill");
      if (Math.random() < 0.42) {
        game.pickups.push({
          id: ++game.pickupSequence,
          x: target.enemy.x,
          y: target.enemy.y,
          kind: Math.random() < 0.68 ? "ammo" : "health",
          createdAt: now,
        });
      }
    } else {
      game.score += headshot ? 35 : 15;
    }
  }

  if (game.ammo[game.weapon] === 0) startReload(game, now + 120);
}

function moveWithCollision(entity: { x: number; y: number }, dx: number, dy: number, radius: number) {
  if (canOccupy(entity.x + dx, entity.y, radius)) entity.x += dx;
  if (canOccupy(entity.x, entity.y + dy, radius)) entity.y += dy;
}

function updateGame(game: Game, dt: number, now: number) {
  const player = game.player;
  game.aimProgress += ((game.aiming && !game.reloadUntil ? 1 : 0) - game.aimProgress) * (1 - Math.exp(-14 * dt));
  const keyForward = (game.keys.has("KeyW") || game.keys.has("ArrowUp") ? 1 : 0)
    - (game.keys.has("KeyS") || game.keys.has("ArrowDown") ? 1 : 0);
  const keyStrafe = (game.keys.has("KeyD") || game.keys.has("ArrowRight") ? 1 : 0)
    - (game.keys.has("KeyA") || game.keys.has("ArrowLeft") ? 1 : 0);
  let forward = clamp(keyForward - game.moveY, -1, 1);
  let strafe = clamp(keyStrafe + game.moveX, -1, 1);
  const inputLength = Math.hypot(forward, strafe);
  if (inputLength > 1) {
    forward /= inputLength;
    strafe /= inputLength;
  }

  const running = (game.keys.has("ShiftLeft") || game.keys.has("ShiftRight")) && !game.aiming;
  const speed = (running ? 4.7 : 3.1) * (game.aiming ? 0.58 : 1);
  const targetVelocityX = (Math.cos(player.angle) * forward + Math.cos(player.angle + Math.PI / 2) * strafe) * speed;
  const targetVelocityY = (Math.sin(player.angle) * forward + Math.sin(player.angle + Math.PI / 2) * strafe) * speed;
  const acceleration = 1 - Math.exp(-(inputLength > 0.03 ? 13 : 9) * dt);
  game.velocityX += (targetVelocityX - game.velocityX) * acceleration;
  game.velocityY += (targetVelocityY - game.velocityY) * acceleration;
  const oldX = player.x;
  const oldY = player.y;
  moveWithCollision(player, game.velocityX * dt, game.velocityY * dt, 0.23);
  if (Math.abs(player.x - oldX) < 0.00001) game.velocityX *= 0.2;
  if (Math.abs(player.y - oldY) < 0.00001) game.velocityY *= 0.2;

  if (inputLength > 0.05) {
    game.walkCycle += dt * (running ? 13 : 9);
    game.bob = Math.sin(game.walkCycle) * (running ? 1.4 : 0.85);
  } else {
    game.bob *= Math.pow(0.02, dt);
  }

  if (game.firing) fireWeapon(game, now);
  else game.triggerLocked = false;
  if (game.reloadUntil && now >= game.reloadUntil) finishReload(game);

  const collected = new Set<number>();
  for (const pickup of game.pickups) {
    if (Math.hypot(pickup.x - player.x, pickup.y - player.y) > 0.72) continue;
    collected.add(pickup.id);
    if (pickup.kind === "health") {
      player.health = Math.min(100, player.health + 28);
      game.banner = "KIT MÉDICO +28";
    } else {
      game.reserve.nvr7 = Math.min(300, game.reserve.nvr7 + 42);
      game.reserve.brk4 = Math.min(200, game.reserve.brk4 + 28);
      game.reserve.vanta = Math.min(60, game.reserve.vanta + 7);
      game.banner = "MUNIÇÃO COLETADA";
    }
    game.bannerUntil = now + 720;
    tone(game, "pickup");
  }
  if (collected.size) game.pickups = game.pickups.filter((pickup) => !collected.has(pickup.id));

  let activeAim = game.enemies.reduce((total, enemy) => total + (!enemy.deadAt && enemy.aimUntil > now ? 1 : 0), 0);
  const aimLimit = game.wave >= 7 ? 3 : 2;
  for (const enemy of game.enemies) {
    if (enemy.deadAt) continue;
    const ex = player.x - enemy.x;
    const ey = player.y - enemy.y;
    const distance = Math.max(0.001, Math.hypot(ex, ey));
    const seesPlayer = distance < 15 && hasLineOfSight(enemy.x, enemy.y, player.x, player.y);

    if (distance > 4.2 || !seesPlayer || distance < 2.6) {
      const direction = distance < 2.6 && seesPlayer ? -1 : 1;
      const directionX = ex / distance * direction;
      const directionY = ey / distance * direction;
      const strafeAmount = seesPlayer ? Math.sin(now * 0.0011 + enemy.phase) * 0.28 : 0;
      const enemyDx = (directionX - directionY * strafeAmount) * enemy.speed * dt;
      const enemyDy = (directionY + directionX * strafeAmount) * enemy.speed * dt;
      moveWithCollision(enemy, enemyDx, enemyDy, 0.28);
    }

    if (!seesPlayer && enemy.aimUntil) {
      enemy.aimUntil = 0;
      activeAim = Math.max(0, activeAim - 1);
    } else if (enemy.aimUntil && now >= enemy.aimUntil) {
      enemy.aimUntil = 0;
      enemy.fireUntil = now + 120;
      activeAim = Math.max(0, activeAim - 1);
      const hitChance = clamp(0.62 - distance * 0.027, 0.24, 0.56);
      enemy.attackAt = now + Math.max(1050, 1780 - game.wave * 26) + Math.random() * 720;
      if (Math.random() < hitChance) {
        const typeDamage = enemy.kind === "brute" ? 2.2 : enemy.kind === "scout" ? -0.6 : 0;
        const damage = Math.min(9.5, 2.8 + game.wave * 0.38 + typeDamage);
        player.health = Math.max(0, player.health - damage);
        game.damageFlash = Math.min(1, game.damageFlash + 0.6);
        game.shake = Math.min(1, game.shake + 0.52);
        tone(game, "hurt");
      }
    } else if (!enemy.aimUntil && seesPlayer && distance < 11.5 && now >= enemy.attackAt && activeAim < aimLimit) {
      const aimTime = enemy.kind === "scout" ? 760 : enemy.kind === "brute" ? 900 : 820;
      enemy.aimUntil = now + aimTime + Math.random() * 260;
      activeAim += 1;
    }
  }

  game.enemies = game.enemies.filter((enemy) => !enemy.deadAt || now - enemy.deadAt < 620);
  const alive = game.enemies.reduce((total, enemy) => total + (enemy.deadAt ? 0 : 1), 0);

  if (alive === 0 && !game.nextWaveAt) {
    game.nextWaveAt = now + 2300;
    game.banner = "ÁREA LIMPA";
    game.bannerUntil = now + 1850;
    player.health = Math.min(100, player.health + 14);
    game.reserve.nvr7 = Math.min(300, game.reserve.nvr7 + 38);
    game.reserve.brk4 = Math.min(200, game.reserve.brk4 + 24);
    game.reserve.vanta = Math.min(60, game.reserve.vanta + 6);
  }

  if (game.nextWaveAt && now >= game.nextWaveAt) {
    game.wave += 1;
    spawnWave(game, now);
  }

  game.damageFlash *= Math.pow(0.055, dt);
  game.recoil *= Math.pow(0.003, dt);
  game.shake *= Math.pow(0.01, dt);
}

function castRay(px: number, py: number, angle: number) {
  const rayX = Math.cos(angle);
  const rayY = Math.sin(angle);
  let mapX = Math.floor(px);
  let mapY = Math.floor(py);
  const deltaX = Math.abs(1 / (rayX || 0.000001));
  const deltaY = Math.abs(1 / (rayY || 0.000001));
  const stepX = rayX < 0 ? -1 : 1;
  const stepY = rayY < 0 ? -1 : 1;
  let sideX = rayX < 0 ? (px - mapX) * deltaX : (mapX + 1 - px) * deltaX;
  let sideY = rayY < 0 ? (py - mapY) * deltaY : (mapY + 1 - py) * deltaY;
  let side = 0;
  let wall = "1";

  for (let i = 0; i < 48; i += 1) {
    if (sideX < sideY) {
      sideX += deltaX;
      mapX += stepX;
      side = 0;
    } else {
      sideY += deltaY;
      mapY += stepY;
      side = 1;
    }
    wall = MAP[mapY]?.[mapX] || "1";
    if (wall !== "0") break;
  }

  const distance = side === 0 ? sideX - deltaX : sideY - deltaY;
  const hit = side === 0 ? py + distance * rayY : px + distance * rayX;
  return { distance, side, wall, texture: hit - Math.floor(hit) };
}

function drawEnemy(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  enemy: Enemy,
  now: number,
) {
  const deathProgress = enemy.deadAt ? clamp((now - enemy.deadAt) / 520, 0, 1) : 0;
  const bob = Math.sin(now * 0.006 + enemy.phase) * 0.015;
  context.save();
  context.translate(x + width / 2, y + height / 2);
  context.rotate(deathProgress * 1.25);
  context.translate(deathProgress * width * 0.28, deathProgress * height * 0.31);
  context.scale(width, height * (1 - deathProgress * 0.38));
  context.translate(-0.5, -0.5 + bob);
  context.globalAlpha = 1 - deathProgress * 0.78;

  context.fillStyle = "rgba(0,0,0,.38)";
  context.beginPath();
  context.ellipse(0.5, 0.96, 0.43, 0.055, 0, 0, TAU);
  context.fill();

  context.strokeStyle = "#101416";
  context.lineWidth = 0.08;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(0.39, 0.63);
  context.lineTo(0.34, 0.91);
  context.moveTo(0.61, 0.63);
  context.lineTo(0.68, 0.91);
  context.stroke();

  context.strokeStyle = "#2b3235";
  context.lineWidth = 0.055;
  context.beginPath();
  context.moveTo(0.27, 0.38);
  context.lineTo(0.15, 0.69);
  context.moveTo(0.73, 0.38);
  context.lineTo(0.86, 0.68);
  context.stroke();

  const palette = enemy.kind === "brute"
    ? ["#7542a8", "#37214f"]
    : enemy.kind === "scout" ? ["#b27b25", "#5f3810"] : ["#b84720", "#69210f"];
  const bodyGradient = context.createLinearGradient(0.18, 0.25, 0.82, 0.7);
  bodyGradient.addColorStop(0, enemy.hitUntil > now ? "#fff4ca" : palette[0]);
  bodyGradient.addColorStop(0.48, enemy.hitUntil > now ? "#ffaf55" : palette[1]);
  bodyGradient.addColorStop(1, "#1a1716");
  context.fillStyle = bodyGradient;
  context.beginPath();
  context.moveTo(0.25, 0.32);
  context.lineTo(0.75, 0.32);
  context.lineTo(0.68, 0.7);
  context.lineTo(0.32, 0.7);
  context.closePath();
  context.fill();

  context.fillStyle = "#151a1c";
  context.fillRect(0.31, 0.43, 0.38, 0.16);
  context.fillStyle = "#ff5b22";
  context.fillRect(0.34, 0.46, 0.1, 0.025);
  context.fillStyle = "#6f7779";
  context.fillRect(0.47, 0.46, 0.18, 0.025);

  context.fillStyle = "#242a2d";
  context.beginPath();
  context.moveTo(0.31, 0.12);
  context.lineTo(0.69, 0.12);
  context.lineTo(0.73, 0.31);
  context.lineTo(0.27, 0.31);
  context.closePath();
  context.fill();
  context.strokeStyle = "#7b8588";
  context.lineWidth = 0.018;
  context.stroke();

  const isAiming = enemy.aimUntil > now;
  context.shadowColor = isAiming ? "#ffe35a" : "#ff4d19";
  context.shadowBlur = 0.1;
  context.fillStyle = enemy.hitUntil > now ? "#ffffff" : isAiming ? "#ffe35a" : "#ff4d19";
  context.fillRect(0.32, 0.19, 0.36, 0.055);
  context.shadowBlur = 0;

  if (isAiming) {
    context.strokeStyle = "rgba(255,227,90,.88)";
    context.lineWidth = 0.018;
    context.beginPath();
    context.arc(0.5, 0.23, 0.28 + Math.sin(now * 0.02) * 0.025, 0, TAU);
    context.stroke();
  }

  context.fillStyle = "#0d1011";
  context.fillRect(0.24, 0.91, 0.19, 0.055);
  context.fillRect(0.61, 0.91, 0.19, 0.055);

  if (!enemy.deadAt && enemy.hp < enemy.maxHp) {
    context.fillStyle = "rgba(5,7,8,.75)";
    context.fillRect(0.18, 0.02, 0.64, 0.035);
    context.fillStyle = "#ff6a2b";
    context.fillRect(0.18, 0.02, 0.64 * clamp(enemy.hp / enemy.maxHp, 0, 1), 0.035);
  }
  context.restore();
}

function drawWeapon(context: CanvasRenderingContext2D, width: number, height: number, game: Game, now: number) {
  const scale = Math.min(width, height) / 760;
  const reloadProgress = game.reloadUntil > now
    ? clamp((now - game.reloadStarted) / Math.max(1, game.reloadUntil - game.reloadStarted), 0, 1)
    : 0;
  const reloadArc = reloadProgress ? Math.sin(reloadProgress * Math.PI) : 0;
  const magazineDrop = reloadProgress < 0.45
    ? reloadProgress / 0.45
    : reloadProgress < 0.64 ? 1 : 1 - (reloadProgress - 0.64) / 0.36;
  const switchDrop = game.switchUntil > now ? clamp((game.switchUntil - now) / 460, 0, 1) : 0;
  const aim = game.aimProgress;
  const swayX = Math.sin(game.walkCycle * 0.5) * 7 * scale * (1 - aim * 0.85);
  const swayY = Math.abs(Math.cos(game.walkCycle)) * 4 * scale * (1 - aim * 0.82);
  const accent = game.weapon === "brk4" ? "#d39a45" : game.weapon === "vanta" ? "#49a5aa" : "#ff632d";
  const barrelLength = game.weapon === "vanta" ? 410 : game.weapon === "brk4" ? 345 : 322;
  const bodyScale = game.weapon === "vanta" ? 0.92 : 1;

  context.save();
  context.translate(
    width * (0.55 - aim * 0.05) + swayX + (Math.random() - 0.5) * game.shake * 7,
    height + swayY + game.recoil * 34 * scale + reloadArc * 72 * scale + switchDrop * 145 * scale - aim * 15 * scale,
  );
  context.rotate(-0.045 + reloadArc * 0.24 + (1 - aim) * Math.sin(game.walkCycle * 0.25) * 0.008);
  context.scale(scale * bodyScale, scale * bodyScale);

  context.fillStyle = "#242a2b";
  context.beginPath();
  context.moveTo(-30, -barrelLength + 25);
  context.lineTo(18, -barrelLength + 25);
  context.lineTo(34, -160);
  context.lineTo(-53, -154);
  context.closePath();
  context.fill();
  context.fillStyle = "#080b0c";
  context.fillRect(-20, -barrelLength, 28, barrelLength - 250);
  context.fillStyle = accent;
  context.fillRect(-23, -barrelLength + 75, 34, 13);

  const receiver = context.createLinearGradient(-105, -225, 128, -55);
  receiver.addColorStop(0, game.weapon === "brk4" ? "#514936" : "#3d4648");
  receiver.addColorStop(0.46, "#171c1d");
  receiver.addColorStop(1, "#06090a");
  context.fillStyle = receiver;
  context.beginPath();
  context.moveTo(-86, -220);
  context.lineTo(66, -222);
  context.lineTo(130, -96);
  context.lineTo(70, -43);
  context.lineTo(-69, -80);
  context.closePath();
  context.fill();
  context.strokeStyle = "#5c6668";
  context.lineWidth = 3;
  context.stroke();

  context.fillStyle = accent;
  context.fillRect(-60, -187, 86, 9);
  context.fillStyle = "#111718";
  context.fillRect(-49, -242, 89, 22);
  context.fillStyle = "rgba(255,255,255,.45)";
  context.fillRect(-38, -237, 28, 3);

  if (game.weapon === "vanta") {
    context.fillStyle = "#090d0e";
    context.fillRect(-56, -274, 102, 22);
    context.beginPath();
    context.ellipse(-43, -263, 24, 30, 0, 0, TAU);
    context.ellipse(43, -263, 27, 33, 0, 0, TAU);
    context.fill();
    context.strokeStyle = "#569ba0";
    context.lineWidth = 3;
    context.stroke();
  } else {
    context.fillStyle = "#090c0d";
    context.fillRect(-12, -269, 25, 31);
    context.strokeStyle = accent;
    context.lineWidth = 3;
    context.strokeRect(-12, -269, 25, 31);
  }

  context.save();
  context.translate(magazineDrop * -52, magazineDrop * 126);
  context.rotate(magazineDrop * -0.3);
  context.fillStyle = "#090c0d";
  context.beginPath();
  context.moveTo(-24, -94);
  context.lineTo(39, -84);
  context.lineTo(53, 8);
  context.lineTo(-7, 9);
  context.closePath();
  context.fill();
  context.strokeStyle = "#3c4546";
  context.lineWidth = 3;
  context.stroke();
  context.fillStyle = accent;
  context.fillRect(-17, -80, 54, 5);
  context.restore();

  context.fillStyle = "#1b2021";
  context.beginPath();
  context.moveTo(47, -94);
  context.lineTo(155, -52);
  context.lineTo(190, 22);
  context.lineTo(84, 5);
  context.closePath();
  context.fill();

  context.fillStyle = "#29221e";
  context.beginPath();
  context.ellipse(-70 - magazineDrop * 38, -54 + magazineDrop * 74, 49, 71, -0.35, 0, TAU);
  context.fill();
  context.fillStyle = "#101415";
  context.fillRect(-108 - magazineDrop * 30, -89 + magazineDrop * 64, 70, 15);

  if (game.muzzleUntil > now) {
    context.save();
    context.translate(-6, -barrelLength - 2);
    context.shadowColor = "#ff7a21";
    context.shadowBlur = 32;
    context.fillStyle = "#fff0a0";
    context.beginPath();
    context.moveTo(0, -52);
    context.lineTo(15, -12);
    context.lineTo(49, -22);
    context.lineTo(20, 5);
    context.lineTo(41, 36);
    context.lineTo(5, 17);
    context.lineTo(-18, 52);
    context.lineTo(-14, 12);
    context.lineTo(-50, 18);
    context.lineTo(-19, -7);
    context.closePath();
    context.fill();
    context.restore();
  }
  context.restore();
}

function drawPickup(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  pickup: Pickup,
  now: number,
) {
  const pulse = 1 + Math.sin(now * 0.006 + pickup.id) * 0.08;
  context.save();
  context.translate(x, y - size * 0.2);
  context.scale(size * pulse, size * pulse);
  context.rotate(Math.sin(now * 0.0014 + pickup.id) * 0.18);
  context.shadowColor = pickup.kind === "ammo" ? "#55cbd0" : "#dfff42";
  context.shadowBlur = 0.22;
  context.fillStyle = pickup.kind === "ammo" ? "rgba(34,116,122,.9)" : "rgba(113,143,20,.9)";
  context.strokeStyle = pickup.kind === "ammo" ? "#8bf5f7" : "#eaff7c";
  context.lineWidth = 0.055;
  context.beginPath();
  context.moveTo(0, -0.48);
  context.lineTo(0.42, -0.17);
  context.lineTo(0.42, 0.35);
  context.lineTo(0, 0.5);
  context.lineTo(-0.42, 0.35);
  context.lineTo(-0.42, -0.17);
  context.closePath();
  context.fill();
  context.stroke();
  context.fillStyle = "#effff8";
  if (pickup.kind === "health") {
    context.fillRect(-0.09, -0.28, 0.18, 0.57);
    context.fillRect(-0.27, -0.1, 0.54, 0.18);
  } else {
    context.fillRect(-0.22, -0.25, 0.12, 0.5);
    context.fillRect(-0.02, -0.25, 0.12, 0.5);
    context.fillRect(0.18, -0.25, 0.12, 0.5);
  }
  context.restore();
}

function renderScene(canvas: HTMLCanvasElement, game: Game, now: number) {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return;
  const width = canvas.width;
  const height = canvas.height;
  const scaleX = width / window.innerWidth;
  const scaleY = height / window.innerHeight;
  const weapon = WEAPONS[game.weapon];
  const currentFov = BASE_FOV * (1 - game.aimProgress * weapon.zoom);
  const shakeX = (Math.random() - 0.5) * game.shake * 11;
  const shakeY = (Math.random() - 0.5) * game.shake * 8;
  const horizon = height * 0.5 - game.player.pitch * height * 0.86 + game.bob * scaleY + shakeY;

  const sky = context.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#020608");
  sky.addColorStop(0.58, "#0b1518");
  sky.addColorStop(1, "#263338");
  context.fillStyle = sky;
  context.fillRect(0, 0, width, Math.max(0, horizon));

  context.fillStyle = "rgba(105,189,190,.13)";
  for (let i = 0; i < 9; i += 1) {
    const lightX = ((i * 271 + game.player.angle * 190) % (width + 220)) - 110;
    context.fillRect(lightX, Math.max(14, horizon * 0.23), Math.max(1, scaleX), Math.max(10, horizon * 0.33));
  }

  const floor = context.createLinearGradient(0, horizon, 0, height);
  floor.addColorStop(0, "#242928");
  floor.addColorStop(0.45, "#101413");
  floor.addColorStop(1, "#030505");
  context.fillStyle = floor;
  context.fillRect(0, Math.max(0, horizon), width, height - horizon);

  context.strokeStyle = "rgba(110,145,145,.08)";
  context.lineWidth = 1;
  for (let y = horizon + 20; y < height; y += Math.max(18, (y - horizon) * 0.16)) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  const rayStep = Math.max(2, Math.round(width / 720));
  const depth: number[] = [];
  const colors: Record<string, [number, number, number]> = {
    "1": [91, 101, 103],
    "2": [135, 63, 33],
    "3": [52, 83, 91],
  };

  for (let screenX = 0, rayIndex = 0; screenX < width; screenX += rayStep, rayIndex += 1) {
    const camera = screenX / width - 0.5;
    const rayAngle = game.player.angle + camera * currentFov;
    const hit = castRay(game.player.x, game.player.y, rayAngle);
    const corrected = Math.max(0.02, hit.distance * Math.cos(rayAngle - game.player.angle));
    depth[rayIndex] = corrected;
    const wallHeight = Math.min(height * 3.2, (height * 0.9) / corrected);
    const top = horizon - wallHeight / 2;
    const base = colors[hit.wall] || colors["1"];
    const distanceShade = clamp(1 - corrected / 25, 0.18, 1);
    const sideShade = hit.side ? 0.72 : 1;
    const seam = (Math.floor(hit.texture * 12) % 3 === 0) ? 0.78 : 1;
    const light = distanceShade * sideShade * seam;
    const red = Math.floor(base[0] * light);
    const green = Math.floor(base[1] * light);
    const blue = Math.floor(base[2] * light);
    context.fillStyle = `rgb(${red},${green},${blue})`;
    context.fillRect(screenX + shakeX, top, rayStep + 1, wallHeight);

    if (hit.wall === "2" && Math.floor(hit.texture * 8) % 4 === 0) {
      context.fillStyle = `rgba(255,99,38,${0.13 * distanceShade})`;
      context.fillRect(screenX + shakeX, top, rayStep + 1, wallHeight);
    }
  }

  game.targets = [];
  const sortedEnemies = [...game.enemies].sort((a, b) => (
    Math.hypot(b.x - game.player.x, b.y - game.player.y)
    - Math.hypot(a.x - game.player.x, a.y - game.player.y)
  ));

  for (const enemy of sortedEnemies) {
    const dx = enemy.x - game.player.x;
    const dy = enemy.y - game.player.y;
    const rawDistance = Math.hypot(dx, dy);
    const relative = normalizeAngle(Math.atan2(dy, dx) - game.player.angle);
    if (Math.abs(relative) > currentFov * 0.68 || rawDistance < 0.25) continue;
    const corrected = Math.max(0.1, rawDistance * Math.cos(relative));
    const spriteUnit = (height * 0.76) / corrected;
    const spriteHeight = spriteUnit * 1.34;
    const spriteWidth = spriteUnit * 0.58;
    const centerX = width * (0.5 + relative / currentFov) + shakeX;
    const top = horizon - spriteHeight * 0.62;
    const left = centerX - spriteWidth / 2;
    const firstStripe = Math.floor(Math.max(0, left) / rayStep);
    const lastStripe = Math.ceil(Math.min(width, left + spriteWidth) / rayStep);
    let runStart = -1;
    let drewVisible = false;

    for (let stripe = firstStripe; stripe <= lastStripe; stripe += 1) {
      const visible = corrected < (depth[stripe] ?? Infinity) + 0.08;
      if (visible && runStart < 0) runStart = stripe;
      const isLast = stripe === lastStripe;
      if (runStart >= 0 && (!visible || isLast)) {
        const endStripe = visible && isLast ? stripe + 1 : stripe;
        context.save();
        context.beginPath();
        context.rect(runStart * rayStep, top - 4, (endStripe - runStart) * rayStep + 1, spriteHeight + 8);
        context.clip();
        drawEnemy(context, left, top, spriteWidth, spriteHeight, enemy, now);
        context.restore();
        drewVisible = true;
        runStart = -1;
      }
    }

    if (drewVisible && !enemy.deadAt) {
      game.targets.push({
        enemy,
        x: left / scaleX,
        y: top / scaleY,
        width: spriteWidth / scaleX,
        height: spriteHeight / scaleY,
        distance: corrected,
      });
    }
  }

  for (const pickup of game.pickups) {
    const dx = pickup.x - game.player.x;
    const dy = pickup.y - game.player.y;
    const rawDistance = Math.hypot(dx, dy);
    const relative = normalizeAngle(Math.atan2(dy, dx) - game.player.angle);
    if (Math.abs(relative) > currentFov * 0.68 || rawDistance < 0.3) continue;
    const corrected = Math.max(0.1, rawDistance * Math.cos(relative));
    const centerX = width * (0.5 + relative / currentFov) + shakeX;
    const stripe = Math.floor(centerX / rayStep);
    if (corrected >= (depth[stripe] ?? Infinity) + 0.05) continue;
    const size = (height * 0.2) / corrected;
    drawPickup(context, centerX, horizon + size * 1.45, size, pickup, now);
  }

  for (const enemy of game.enemies) {
    if (enemy.deadAt || enemy.fireUntil <= now) continue;
    const dx = enemy.x - game.player.x;
    const dy = enemy.y - game.player.y;
    const rawDistance = Math.hypot(dx, dy);
    const relative = normalizeAngle(Math.atan2(dy, dx) - game.player.angle);
    if (Math.abs(relative) > currentFov * 0.7) continue;
    const startX = width * (0.5 + relative / currentFov);
    const startY = horizon - (height * 0.22) / Math.max(0.6, rawDistance);
    context.strokeStyle = `rgba(255,126,45,${clamp((enemy.fireUntil - now) / 120, 0, 1) * 0.8})`;
    context.lineWidth = Math.max(1, 1.7 * scaleX);
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(width / 2 + (Math.random() - 0.5) * 35 * scaleX, height / 2 + (Math.random() - 0.5) * 35 * scaleY);
    context.stroke();
  }

  drawWeapon(context, width, height, game, now);

  const centerX = width / 2;
  const centerY = height / 2;
  const spread = (weapon.spread * (1 - game.aimProgress * 0.78) + game.recoil * 15) * Math.min(scaleX, scaleY);
  context.strokeStyle = game.hitUntil > now ? "#fff4d6" : "rgba(234,244,240,.9)";
  context.lineWidth = Math.max(1.5, 2 * scaleX);
  context.beginPath();
  context.moveTo(centerX - spread - 8 * scaleX, centerY);
  context.lineTo(centerX - spread, centerY);
  context.moveTo(centerX + spread, centerY);
  context.lineTo(centerX + spread + 8 * scaleX, centerY);
  context.moveTo(centerX, centerY - spread - 8 * scaleY);
  context.lineTo(centerX, centerY - spread);
  context.moveTo(centerX, centerY + spread);
  context.lineTo(centerX, centerY + spread + 8 * scaleY);
  context.stroke();
  context.fillStyle = "rgba(234,244,240,.88)";
  context.fillRect(centerX - scaleX, centerY - scaleY, scaleX * 2, scaleY * 2);

  if (game.weapon === "vanta" && game.aimProgress > 0.55) {
    const scopeAlpha = clamp((game.aimProgress - 0.55) / 0.45, 0, 1);
    const radius = Math.min(width, height) * 0.43;
    context.save();
    context.fillStyle = `rgba(0,0,0,${scopeAlpha * 0.985})`;
    context.beginPath();
    context.rect(0, 0, width, height);
    context.arc(centerX, centerY, radius, 0, TAU, true);
    context.fill("evenodd");
    context.strokeStyle = `rgba(126,202,204,${scopeAlpha * 0.52})`;
    context.lineWidth = Math.max(2, 3 * scaleX);
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, TAU);
    context.stroke();
    context.strokeStyle = `rgba(233,250,247,${scopeAlpha * 0.82})`;
    context.lineWidth = Math.max(1, scaleX);
    context.beginPath();
    context.moveTo(centerX - radius, centerY);
    context.lineTo(centerX + radius, centerY);
    context.moveTo(centerX, centerY - radius);
    context.lineTo(centerX, centerY + radius);
    context.stroke();
    context.restore();
  }

  if (game.hitUntil > now || game.killUntil > now) {
    const marker = 15 * Math.min(scaleX, scaleY);
    context.strokeStyle = game.killUntil > now ? "#ff5a22" : "#f4f8f6";
    context.lineWidth = 2.5 * scaleX;
    context.beginPath();
    context.moveTo(centerX - marker, centerY - marker);
    context.lineTo(centerX - marker * 0.42, centerY - marker * 0.42);
    context.moveTo(centerX + marker, centerY - marker);
    context.lineTo(centerX + marker * 0.42, centerY - marker * 0.42);
    context.moveTo(centerX - marker, centerY + marker);
    context.lineTo(centerX - marker * 0.42, centerY + marker * 0.42);
    context.moveTo(centerX + marker, centerY + marker);
    context.lineTo(centerX + marker * 0.42, centerY + marker * 0.42);
    context.stroke();
  }

  if (game.damageFlash > 0.015) {
    const vignette = context.createRadialGradient(centerX, centerY, height * 0.12, centerX, centerY, height * 0.74);
    vignette.addColorStop(0, "rgba(130,0,0,0)");
    vignette.addColorStop(0.65, `rgba(145,8,0,${game.damageFlash * 0.12})`);
    vignette.addColorStop(1, `rgba(255,26,0,${game.damageFlash * 0.72})`);
    context.fillStyle = vignette;
    context.fillRect(0, 0, width, height);
  }

  context.fillStyle = "rgba(0,0,0,.035)";
  for (let y = 0; y < height; y += 4 * scaleY) context.fillRect(0, y, width, scaleY);
}

function renderMinimap(canvas: HTMLCanvasElement, game: Game, now: number) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const size = canvas.width;
  const padding = 10;
  const cell = (size - padding * 2) / MAP_SIZE;
  context.clearRect(0, 0, size, size);
  context.fillStyle = "rgba(2,7,7,.91)";
  context.fillRect(0, 0, size, size);

  for (let y = 0; y < MAP_SIZE; y += 1) {
    for (let x = 0; x < MAP_SIZE; x += 1) {
      const type = MAP[y][x];
      if (type === "0") continue;
      context.fillStyle = type === "2" ? "#74361f" : type === "3" ? "#29494d" : "#495455";
      context.fillRect(padding + x * cell, padding + y * cell, cell + 0.25, cell + 0.25);
    }
  }

  for (const pickup of game.pickups) {
    context.fillStyle = pickup.kind === "ammo" ? "#74e8ec" : "#dfff42";
    context.fillRect(padding + pickup.x * cell - 1.5, padding + pickup.y * cell - 1.5, 3, 3);
  }
  for (const enemy of game.enemies) {
    if (enemy.deadAt) continue;
    const pulse = enemy.aimUntil > now ? 2.3 + Math.sin(now * 0.02) * 0.8 : 1.8;
    context.fillStyle = enemy.aimUntil > now ? "#ffe35a" : "#ff5a2b";
    context.beginPath();
    context.arc(padding + enemy.x * cell, padding + enemy.y * cell, pulse, 0, TAU);
    context.fill();
  }

  const playerX = padding + game.player.x * cell;
  const playerY = padding + game.player.y * cell;
  context.save();
  context.translate(playerX, playerY);
  context.rotate(game.player.angle);
  context.fillStyle = "#effffb";
  context.beginPath();
  context.moveTo(6, 0);
  context.lineTo(-4, -3.5);
  context.lineTo(-2.5, 0);
  context.lineTo(-4, 3.5);
  context.closePath();
  context.fill();
  context.restore();
  context.strokeStyle = "rgba(226,245,240,.24)";
  context.strokeRect(0.5, 0.5, size - 1, size - 1);
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapCanvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const lookPointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const [mode, setMode] = useState<GameMode>("menu");
  const [hud, setHud] = useState<Hud>(initialHud);
  const [muted, setMuted] = useState(false);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const [touchDevice, setTouchDevice] = useState(false);
  const [sensitivity, setSensitivity] = useState(1);

  const syncHud = useCallback((game: Game, now: number) => {
    const reloadProgress = game.reloadUntil > now
      ? clamp((now - game.reloadStarted) / Math.max(1, game.reloadUntil - game.reloadStarted), 0, 1)
      : 0;
    setHud({
      health: Math.ceil(game.player.health),
      ammo: game.ammo[game.weapon],
      reserve: game.reserve[game.weapon],
      score: game.score,
      wave: game.wave,
      enemies: game.enemies.filter((enemy) => !enemy.deadAt).length,
      reloading: game.reloadUntil > now,
      reloadProgress,
      banner: game.bannerUntil > now ? game.banner : "",
      best: game.best,
      weapon: game.weapon,
      weaponName: WEAPONS[game.weapon].name,
      weaponCategory: WEAPONS[game.weapon].category,
      sensitivity: game.sensitivity,
    });
  }, []);

  const changeSensitivity = useCallback((values: number[]) => {
    const next = clamp(values[0] ?? 1, 0.4, 2);
    setSensitivity(next);
    if (gameRef.current) gameRef.current.sensitivity = next;
    try {
      window.localStorage.setItem("novera-sensitivity", String(next));
    } catch {
      // The setting still works for the current session.
    }
  }, []);

  const start = useCallback(() => {
    const game = gameRef.current;
    const canvas = canvasRef.current;
    if (!game || !canvas) return;
    const now = performance.now();
    ensureAudio(game);
    resetGame(game, now);
    game.mode = "playing";
    setMode("playing");
    syncHud(game, now);
    canvas.focus();
    if (window.matchMedia("(pointer: fine)").matches) void canvas.requestPointerLock?.();
  }, [syncHud]);

  const resume = useCallback(() => {
    const game = gameRef.current;
    const canvas = canvasRef.current;
    if (!game || !canvas) return;
    ensureAudio(game);
    game.mode = "playing";
    game.lastFrame = performance.now();
    setMode("playing");
    if (window.matchMedia("(pointer: fine)").matches) void canvas.requestPointerLock?.();
  }, []);

  const pause = useCallback(() => {
    const game = gameRef.current;
    if (!game || game.mode !== "playing") return;
    game.mode = "paused";
    game.firing = false;
    game.aiming = false;
    game.triggerLocked = false;
    setMode("paused");
    if (document.pointerLockElement) void document.exitPointerLock();
  }, []);

  const toggleSound = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      if (gameRef.current) gameRef.current.muted = next;
      return next;
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = createGame();
    gameRef.current = game;
    setSensitivity(game.sensitivity);
    setHud((current) => ({ ...current, best: game.best, sensitivity: game.sensitivity }));
    const coarse = window.matchMedia("(pointer: coarse)");
    const updateTouch = () => setTouchDevice(coarse.matches);
    updateTouch();
    coarse.addEventListener?.("change", updateTouch);

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.45);
      canvas.width = Math.min(1600, Math.max(640, Math.floor(window.innerWidth * ratio)));
      canvas.height = Math.min(1000, Math.max(360, Math.floor(window.innerHeight * ratio)));
    };
    resize();

    const onKeyDown = (event: KeyboardEvent) => {
      game.keys.add(event.code);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
      if (event.code === "KeyR") startReload(game, performance.now());
      if (event.code === "Digit1") switchWeapon(game, "nvr7", performance.now());
      if (event.code === "Digit2") switchWeapon(game, "brk4", performance.now());
      if (event.code === "Digit3") switchWeapon(game, "vanta", performance.now());
      if (event.code === "KeyQ" && !event.repeat) {
        const index = WEAPON_ORDER.indexOf(game.weapon);
        switchWeapon(game, WEAPON_ORDER[(index + 1) % WEAPON_ORDER.length], performance.now());
      }
      if (event.code === "Enter" && (game.mode === "menu" || game.mode === "gameover")) start();
      if (event.code === "Escape" && game.mode === "playing" && !document.pointerLockElement) pause();
    };
    const onKeyUp = (event: KeyboardEvent) => game.keys.delete(event.code);
    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== canvas || game.mode !== "playing") return;
      const aimControl = game.aiming ? 0.7 : 1;
      game.player.angle = normalizeAngle(game.player.angle + event.movementX * 0.00225 * game.sensitivity * aimControl);
      game.player.pitch = clamp(game.player.pitch + event.movementY * 0.00155 * game.sensitivity * aimControl, -0.3, 0.3);
    };
    const onMouseDown = (event: MouseEvent) => {
      if (game.mode !== "playing" || document.pointerLockElement !== canvas) return;
      if (event.button === 0) game.firing = true;
      if (event.button === 2 && !game.reloadUntil) game.aiming = true;
    };
    const onMouseUp = (event: MouseEvent) => {
      if (event.button === 0) {
        game.firing = false;
        game.triggerLocked = false;
      }
      if (event.button === 2) game.aiming = false;
    };
    const onPointerLock = () => {
      if (!document.pointerLockElement && game.mode === "playing" && window.matchMedia("(pointer: fine)").matches) {
        game.mode = "paused";
        game.firing = false;
        game.aiming = false;
        game.triggerLocked = false;
        setMode("paused");
      }
    };
    const onVisibility = () => {
      if (document.hidden && game.mode === "playing") pause();
    };
    const onContextMenu = (event: MouseEvent) => event.preventDefault();

    window.addEventListener("resize", resize);
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    document.addEventListener("pointerlockchange", onPointerLock);
    document.addEventListener("visibilitychange", onVisibility);
    canvas.addEventListener("contextmenu", onContextMenu);

    let frameId = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.034, Math.max(0.001, (now - game.lastFrame) / 1000));
      game.lastFrame = now;

      if (game.mode === "playing") {
        updateGame(game, dt, now);
        if (game.player.health <= 0) {
          game.mode = "gameover";
          game.firing = false;
          game.best = Math.max(game.best, game.score);
          try {
            window.localStorage.setItem("novera-best", String(game.best));
          } catch {
            // Local records are optional.
          }
          setMode("gameover");
          if (document.pointerLockElement) void document.exitPointerLock();
        }
      } else if (game.mode === "menu") {
        game.player.angle = normalizeAngle(game.player.angle + dt * 0.055);
      }

      renderScene(canvas, game, now);
      if (mapCanvasRef.current) renderMinimap(mapCanvasRef.current, game, now);
      if (now - game.lastHud > 70) {
        syncHud(game, now);
        game.lastHud = now;
      }
      frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("pointerlockchange", onPointerLock);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("contextmenu", onContextMenu);
      coarse.removeEventListener?.("change", updateTouch);
      if (game.audio) void game.audio.close();
    };
  }, [pause, start, syncHud]);

  const handleCanvasClick = () => {
    const game = gameRef.current;
    const canvas = canvasRef.current;
    if (!game || !canvas || game.mode !== "playing") return;
    if (window.matchMedia("(pointer: fine)").matches && document.pointerLockElement !== canvas) {
      void canvas.requestPointerLock?.();
    }
  };

  const handleLookDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "mouse" || mode !== "playing") return;
    if (event.clientX < window.innerWidth * 0.42) return;
    lookPointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleLookMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const game = gameRef.current;
    const look = lookPointer.current;
    if (!game || !look || look.id !== event.pointerId || game.mode !== "playing") return;
    const aimControl = game.aiming ? 0.7 : 1;
    game.player.angle = normalizeAngle(game.player.angle + (event.clientX - look.x) * 0.0062 * game.sensitivity * aimControl);
    game.player.pitch = clamp(game.player.pitch + (event.clientY - look.y) * 0.004 * game.sensitivity * aimControl, -0.3, 0.3);
    look.x = event.clientX;
    look.y = event.clientY;
  };

  const handleLookUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (lookPointer.current?.id === event.pointerId) lookPointer.current = null;
  };

  const updateMovePad = (event: React.PointerEvent<HTMLDivElement>) => {
    const game = gameRef.current;
    if (!game) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp((event.clientX - (rect.left + rect.width / 2)) / (rect.width * 0.36), -1, 1);
    const y = clamp((event.clientY - (rect.top + rect.height / 2)) / (rect.height * 0.36), -1, 1);
    game.moveX = x;
    game.moveY = y;
    setStick({ x, y });
  };

  const moveDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    updateMovePad(event);
  };
  const moveUp = () => {
    if (gameRef.current) {
      gameRef.current.moveX = 0;
      gameRef.current.moveY = 0;
    }
    setStick({ x: 0, y: 0 });
  };

  const shootDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const game = gameRef.current;
    if (game) {
      ensureAudio(game);
      game.firing = true;
      fireWeapon(game, performance.now());
    }
  };
  const shootUp = () => {
    if (gameRef.current) {
      gameRef.current.firing = false;
      gameRef.current.triggerLocked = false;
    }
  };

  const aimDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (gameRef.current && !gameRef.current.reloadUntil) gameRef.current.aiming = true;
  };
  const aimUp = () => {
    if (gameRef.current) gameRef.current.aiming = false;
  };

  const cycleWeapon = () => {
    const game = gameRef.current;
    if (!game) return;
    const index = WEAPON_ORDER.indexOf(game.weapon);
    switchWeapon(game, WEAPON_ORDER[(index + 1) % WEAPON_ORDER.length], performance.now());
  };

  const healthTone = hud.health <= 25 ? "critical" : hud.health <= 55 ? "warning" : "healthy";

  return (
    <main className="game-shell">
      <canvas
        ref={canvasRef}
        className="game-canvas"
        tabIndex={0}
        aria-label="Arena tridimensional do jogo Novera"
        onClick={handleCanvasClick}
        onPointerDown={handleLookDown}
        onPointerMove={handleLookMove}
        onPointerUp={handleLookUp}
        onPointerCancel={handleLookUp}
      />

      <div className={`hud ${mode === "playing" ? "is-visible" : ""}`} aria-hidden={mode !== "playing"}>
        <section className="hud-cluster health-cluster" aria-label={`Vida: ${hud.health}`}>
          <span className="hud-label">INTEGRIDADE</span>
          <div className="health-readout">
            <strong className={healthTone}>{hud.health}</strong>
            <div className="health-track">
              <i className={healthTone} style={{ width: `${hud.health}%` }} />
            </div>
          </div>
        </section>

        <section className="mission-cluster" aria-label={`Onda ${hud.wave}, ${hud.enemies} alvos restantes`}>
          <span>ONDA <b>{String(hud.wave).padStart(2, "0")}</b></span>
          <i />
          <span>ALVOS <b>{String(hud.enemies).padStart(2, "0")}</b></span>
          <i />
          <span>PONTOS <b>{String(hud.score).padStart(5, "0")}</b></span>
        </section>

        <aside className="minimap-panel" aria-label="Mapa tático mostrando inimigos e recursos">
          <div><span>RADAR</span><b>{MAP_SIZE}×{MAP_SIZE}</b></div>
          <canvas ref={mapCanvasRef} width={220} height={220} />
          <small><i /> INIMIGOS</small>
        </aside>

        <section className="hud-cluster ammo-cluster" aria-label={`${hud.ammo} munições no pente e ${hud.reserve} reservas`}>
          <span className="hud-label">{hud.weaponName} · {hud.weaponCategory}</span>
          <div className="ammo-readout">
            <strong className={hud.ammo <= 6 ? "low" : ""}>{String(hud.ammo).padStart(2, "0")}</strong>
            <span>/ {hud.reserve}</span>
          </div>
        </section>

        <div className="weapon-rack" aria-label="Selecionar arma">
          {WEAPON_ORDER.map((weapon, index) => (
            <button
              key={weapon}
              type="button"
              className={hud.weapon === weapon ? "is-active" : ""}
              onClick={() => gameRef.current && switchWeapon(gameRef.current, weapon, performance.now())}
              aria-label={`Equipar ${WEAPONS[weapon].name}`}
            >
              <span>{index + 1}</span><b>{WEAPONS[weapon].name}</b>
            </button>
          ))}
        </div>

        <div className={`reload-indicator ${hud.reloading ? "is-active" : ""}`}>
          <span>RECARREGANDO</span>
          <i><b style={{ width: `${hud.reloadProgress * 100}%` }} /></i>
        </div>

        <div className={`combat-banner ${hud.banner ? "is-active" : ""}`}>{hud.banner}</div>

        <div className="hud-actions">
          <button type="button" className="icon-button" onClick={toggleSound} aria-label={muted ? "Ativar som" : "Desativar som"} title={muted ? "Ativar som" : "Desativar som"}>
            {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
          </button>
          <button type="button" className="icon-button" onClick={pause} aria-label="Pausar jogo" title="Pausar">
            <Pause aria-hidden="true" />
          </button>
        </div>
      </div>

      {touchDevice && mode === "playing" && (
        <div className="mobile-controls" aria-label="Controles do jogo para celular">
          <div
            className="move-pad"
            onPointerDown={moveDown}
            onPointerMove={(event) => event.currentTarget.hasPointerCapture(event.pointerId) && updateMovePad(event)}
            onPointerUp={moveUp}
            onPointerCancel={moveUp}
            aria-label="Controle de movimento"
          >
            <div className="move-pad-ring" />
            <div className="move-pad-knob" style={{ transform: `translate(${stick.x * 35}px, ${stick.y * 35}px)` }} />
          </div>
          <div className="mobile-actions">
            <button
              type="button"
              className="weapon-button"
              onPointerDown={(event) => {
                event.preventDefault();
                cycleWeapon();
              }}
              aria-label="Trocar arma"
            >
              {hud.weapon === "vanta" ? "S" : hud.weapon === "brk4" ? "B" : "A"}
            </button>
            <button
              type="button"
              className="reload-button"
              onPointerDown={(event) => {
                event.preventDefault();
                if (gameRef.current) startReload(gameRef.current, performance.now());
              }}
              aria-label="Recarregar arma"
            >
              R
            </button>
            <button
              type="button"
              className={`aim-button ${hud.weapon === "vanta" ? "is-scope" : ""}`}
              onPointerDown={aimDown}
              onPointerUp={aimUp}
              onPointerCancel={aimUp}
              aria-label="Abrir mira"
            >
              <Crosshair aria-hidden="true" />
            </button>
            <button
              type="button"
              className="fire-button"
              onPointerDown={shootDown}
              onPointerUp={shootUp}
              onPointerCancel={shootUp}
              aria-label="Atirar"
            >
              <span />
            </button>
          </div>
        </div>
      )}

      {mode === "menu" && (
        <section className="game-overlay start-overlay">
          <div className="brand-mark" aria-hidden="true"><i /><span>N</span></div>
          <div className="title-lockup">
            <p>PROTOCOLO DE SOBREVIVÊNCIA // ARENA 02</p>
            <h1>NOVERA</h1>
            <div className="title-rule"><i /><span>FPS • SOBREVIVA ÀS ONDAS</span></div>
          </div>
          <button type="button" className="primary-action" onClick={start}>
            <span>INICIAR OPERAÇÃO</span><b>→</b>
          </button>
          <div className="desktop-instructions controls-grid">
            <div><kbd>W A S D</kbd><span>MOVER</span></div>
            <div><kbd>MOUSE</kbd><span>MIRAR</span></div>
            <div><kbd>CLIQUE</kbd><span>ATIRAR</span></div>
            <div><kbd>BOTÃO DIR.</kbd><span>ABRIR MIRA</span></div>
            <div><kbd>1 2 3 / Q</kbd><span>TROCAR ARMA</span></div>
            <div><kbd>R</kbd><span>RECARREGAR</span></div>
          </div>
          <div className="touch-instructions controls-grid">
            <div><kbd>◉</kbd><span>MOVER</span></div>
            <div><kbd>ARRASTE</kbd><span>MIRAR</span></div>
            <div><kbd>ALVO</kbd><span>ATIRAR</span></div>
            <div><kbd>⊕</kbd><span>ABRIR MIRA</span></div>
          </div>
          <div className="sensitivity-control menu-sensitivity">
            <div><span>SENSIBILIDADE DA MIRA</span><output>{sensitivity.toFixed(1)}×</output></div>
            <Slider value={[sensitivity]} min={0.4} max={2} step={0.1} onValueChange={changeSensitivity} aria-label="Sensibilidade da mira" />
          </div>
          <button type="button" className="menu-sound" onClick={toggleSound} aria-label={muted ? "Ativar som" : "Desativar som"}>
            {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
            <span>{muted ? "SOM DESATIVADO" : "SOM ATIVADO"}</span>
          </button>
          <p className="record-line">RECORDE LOCAL <strong>{String(hud.best).padStart(5, "0")}</strong></p>
        </section>
      )}

      {mode === "paused" && (
        <section className="game-overlay compact-overlay">
          <p className="overlay-code">OPERAÇÃO INTERROMPIDA</p>
          <h2>PAUSADO</h2>
          <button type="button" className="primary-action" onClick={resume}>
            <Play aria-hidden="true" /><span>CONTINUAR</span>
          </button>
          <button type="button" className="secondary-action" onClick={start}>
            <RotateCcw aria-hidden="true" /><span>REINICIAR OPERAÇÃO</span>
          </button>
          <div className="sensitivity-control pause-sensitivity">
            <div><span>SENSIBILIDADE DA MIRA</span><output>{sensitivity.toFixed(1)}×</output></div>
            <Slider value={[sensitivity]} min={0.4} max={2} step={0.1} onValueChange={changeSensitivity} aria-label="Sensibilidade da mira" />
          </div>
          <p className="pause-tip">1–3 troca arma • botão direito abre mira • R recarrega • SHIFT corre</p>
        </section>
      )}

      {mode === "gameover" && (
        <section className="game-overlay compact-overlay gameover-overlay">
          <p className="overlay-code">SINAL DO OPERADOR PERDIDO</p>
          <h2>FIM DA OPERAÇÃO</h2>
          <div className="result-grid">
            <div><span>PONTUAÇÃO</span><strong>{String(hud.score).padStart(5, "0")}</strong></div>
            <div><span>ONDA ALCANÇADA</span><strong>{String(hud.wave).padStart(2, "0")}</strong></div>
            <div><span>RECORDE</span><strong>{String(hud.best).padStart(5, "0")}</strong></div>
          </div>
          <button type="button" className="primary-action" onClick={start}>
            <RotateCcw aria-hidden="true" /><span>TENTAR NOVAMENTE</span>
          </button>
        </section>
      )}

      <div className="portrait-warning"><span>↻</span> GIRE O CELULAR PARA JOGAR</div>
      <div className="noise-layer" aria-hidden="true" />
    </main>
  );
}
