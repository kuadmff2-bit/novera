"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { Slider } from "@/components/ui/slider";

const MAP_SIZE = 40;
const TAU = Math.PI * 2;
const BASE_FOV = Math.PI / 3;
const GRAVITY = 12.5;
const JUMP_SPEED = 4.9;

type GameMode = "menu" | "playing" | "paused" | "gameover";
type WeaponId = "nvr7" | "brk4" | "vanta";
type EnemyKind = "scout" | "soldier" | "brute";

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

type Player = {
  x: number;
  y: number;
  z: number;
  vz: number;
  grounded: boolean;
  angle: number;
  pitch: number;
  health: number;
};

type Enemy = {
  id: number;
  x: number;
  y: number;
  z: number;
  hp: number;
  maxHp: number;
  speed: number;
  attackAt: number;
  aimUntil: number;
  fireUntil: number;
  hitUntil: number;
  deadAt: number;
  phase: number;
  kind: EnemyKind;
};

type TargetBox = {
  enemy: Enemy;
  x: number;
  y: number;
  width: number;
  height: number;
  distance: number;
};

type Game = {
  mode: GameMode;
  player: Player;
  enemies: Enemy[];
  targets: TargetBox[];
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
  lastShot: number;
  reloadStarted: number;
  reloadUntil: number;
  switchUntil: number;
  score: number;
  wave: number;
  nextWaveAt: number;
  enemySequence: number;
  recoil: number;
  shake: number;
  bob: number;
  walkCycle: number;
  damageFlash: number;
  hitUntil: number;
  killUntil: number;
  muzzleUntil: number;
  banner: string;
  bannerUntil: number;
  lastFrame: number;
  lastHud: number;
  best: number;
  muted: boolean;
  audio: AudioContext | null;
};

type Hud = {
  health: number;
  ammo: number;
  reserve: number;
  score: number;
  wave: number;
  enemies: number;
  weapon: WeaponId;
  weaponName: string;
  weaponCategory: string;
  sensitivity: number;
  reloading: boolean;
  reloadProgress: number;
  banner: string;
  best: number;
  elevation: number;
};

const WEAPON_ORDER: WeaponId[] = ["nvr7", "brk4", "vanta"];
const WEAPONS: Record<WeaponId, WeaponConfig> = {
  nvr7: { id: "nvr7", name: "NVR–7", category: "FUZIL AUTOMÁTICO", magazine: 30, reserve: 150, damage: 30, headDamage: 82, shotDelay: 96, reloadTime: 1420, spread: 12, zoom: 0.31, automatic: true },
  brk4: { id: "brk4", name: "BRK–4", category: "FUZIL DE BATALHA", magazine: 20, reserve: 100, damage: 47, headDamage: 125, shotDelay: 176, reloadTime: 1660, spread: 8, zoom: 0.40, automatic: true },
  vanta: { id: "vanta", name: "VANTA .50", category: "SNIPER", magazine: 5, reserve: 30, damage: 128, headDamage: 280, shotDelay: 900, reloadTime: 2180, spread: 2.5, zoom: 0.70, automatic: false },
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle: number) {
  while (angle > Math.PI) angle -= TAU;
  while (angle < -Math.PI) angle += TAU;
  return angle;
}

function smoothStep(t: number) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function buildCityMap() {
  const grid = Array.from({ length: MAP_SIZE }, () => Array.from({ length: MAP_SIZE }, () => "0"));
  const wall = (x: number, y: number, type = "1") => {
    if (x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE) grid[y][x] = type;
  };
  const block = (x1: number, y1: number, x2: number, y2: number, type: string) => {
    for (let y = y1; y <= y2; y += 1) {
      for (let x = x1; x <= x2; x += 1) wall(x, y, type);
    }
  };

  for (let i = 0; i < MAP_SIZE; i += 1) {
    wall(i, 0, "1"); wall(i, MAP_SIZE - 1, "1"); wall(0, i, "1"); wall(MAP_SIZE - 1, i, "1");
  }

  block(3, 3, 8, 9, "2");
  block(11, 3, 17, 7, "3");
  block(21, 3, 27, 8, "1");
  block(31, 3, 36, 10, "2");
  block(12, 9, 16, 10, "4");
  block(3, 13, 8, 19, "1");
  block(11, 12, 16, 17, "2");
  block(3, 22, 8, 27, "3");
  block(29, 13, 35, 18, "3");
  block(31, 21, 36, 26, "1");
  for (let y = 14; y <= 18; y += 1) wall(26, y, y % 2 ? "4" : "1");
  block(3, 31, 9, 36, "2");
  block(12, 27, 17, 35, "1");
  block(22, 29, 27, 36, "3");
  block(31, 30, 36, 36, "2");
  block(20, 19, 21, 20, "4");
  wall(18, 15, "4"); wall(23, 15, "4");
  wall(18, 24, "4"); wall(24, 24, "4");
  wall(10, 22, "4"); wall(10, 24, "4");
  wall(28, 22, "4"); wall(28, 24, "4");
  wall(19, 10, "4"); wall(20, 10, "4");
  wall(24, 27, "4"); wall(25, 27, "4");
  wall(9, 28, "4"); wall(30, 11, "4");
  return grid.map((row) => row.join(""));
}

const MAP = buildCityMap();

const SPAWNS = [
  [2.5, 2.5], [9.5, 2.5], [19.5, 2.5], [29.5, 2.5], [37.5, 2.5],
  [9.5, 11.5], [18.5, 11.5], [28.5, 10.5], [37.5, 12.5],
  [2.5, 20.5], [9.5, 20.5], [17.5, 20.5], [25.5, 20.5], [37.5, 20.5],
  [2.5, 28.5], [10.5, 28.5], [19.5, 27.5], [28.5, 28.5], [37.5, 28.5],
  [10.5, 37.5], [19.5, 37.5], [29.5, 37.5], [37.5, 37.5],
] as const;

function plateau(x: number, y: number, x1: number, y1: number, x2: number, y2: number, height: number, ramp: number) {
  const dx = x < x1 ? x1 - x : x > x2 ? x - x2 : 0;
  const dy = y < y1 ? y1 - y : y > y2 ? y - y2 : 0;
  const d = Math.max(dx, dy);
  if (d >= ramp) return 0;
  return height * smoothStep(1 - d / ramp);
}

function terrainHeightAt(x: number, y: number) {
  let h = 0;
  h = Math.max(h, plateau(x, y, 17.7, 14.3, 25.3, 24.8, 0.34, 1.8));
  if (x > 24 && y < 13) {
    const east = smoothStep((x - 24) / 10);
    const north = smoothStep((13 - y) / 8);
    h = Math.max(h, 0.95 * east * north);
  }
  h = Math.max(h, plateau(x, y, 9.2, 8.3, 18.2, 11.8, 0.72, 2.6));
  if (x < 12 && y > 24) {
    const west = smoothStep((12 - x) / 9);
    const south = smoothStep((y - 24) / 11);
    h = Math.max(h, 0.62 * west * south);
  }
  h = Math.max(h, plateau(x, y, 27.5, 27.5, 37, 37, 0.46, 2.4));
  return h;
}

function wallAt(x: number, y: number) {
  const cell = MAP[Math.floor(y)]?.[Math.floor(x)];
  return !cell || cell !== "0";
}

function canOccupy(x: number, y: number, radius = 0.24) {
  return !wallAt(x - radius, y - radius) && !wallAt(x + radius, y - radius) && !wallAt(x - radius, y + radius) && !wallAt(x + radius, y + radius);
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
  const x = 19.5;
  const y = 26.2;
  const z = terrainHeightAt(x, y);
  return {
    mode: "menu",
    player: { x, y, z, vz: 0, grounded: true, angle: -Math.PI / 2, pitch: 0, health: 100 },
    enemies: [], targets: [], keys: new Set(), moveX: 0, moveY: 0, velocityX: 0, velocityY: 0,
    firing: false, triggerLocked: false, aiming: false, aimProgress: 0, sensitivity,
    weapon: "nvr7", ammo: { nvr7: 30, brk4: 20, vanta: 5 }, reserve: { nvr7: 150, brk4: 100, vanta: 30 },
    lastShot: 0, reloadStarted: 0, reloadUntil: 0, switchUntil: 0,
    score: 0, wave: 1, nextWaveAt: 0, enemySequence: 0,
    recoil: 0, shake: 0, bob: 0, walkCycle: 0, damageFlash: 0, hitUntil: 0, killUntil: 0, muzzleUntil: 0,
    banner: "", bannerUntil: 0, lastFrame: performance.now(), lastHud: 0,
    best, muted: false, audio: null,
  };
}

function ensureAudio(game: Game) {
  if (game.audio) {
    if (game.audio.state === "suspended") void game.audio.resume();
    return;
  }
  try { game.audio = new AudioContext(); } catch { game.audio = null; }
}

function tone(game: Game, kind: "shot" | "hit" | "kill" | "hurt" | "reload" | "empty" | "jump") {
  const audio = game.audio;
  if (!audio || game.muted) return;
  const now = audio.currentTime;
  const gain = audio.createGain();
  const oscillator = audio.createOscillator();
  oscillator.connect(gain); gain.connect(audio.destination);
  const frequency = kind === "shot" ? (game.weapon === "vanta" ? 95 : game.weapon === "brk4" ? 125 : 155) : kind === "hit" ? 520 : kind === "kill" ? 190 : kind === "hurt" ? 80 : kind === "reload" ? 260 : kind === "jump" ? 180 : 110;
  oscillator.type = kind === "shot" || kind === "hurt" ? "sawtooth" : "square";
  oscillator.frequency.setValueAtTime(frequency, now);
  const duration = kind === "shot" ? 0.08 : kind === "kill" ? 0.16 : kind === "hurt" ? 0.12 : 0.055;
  gain.gain.setValueAtTime(kind === "shot" ? 0.08 : 0.045, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.start(now); oscillator.stop(now + duration);
}

function switchWeapon(game: Game, weapon: WeaponId, now: number) {
  if (game.weapon === weapon || game.mode !== "playing") return;
  game.weapon = weapon; game.aiming = false; game.firing = false; game.triggerLocked = false; game.reloadStarted = 0; game.reloadUntil = 0; game.switchUntil = now + 420;
  game.banner = `${WEAPONS[weapon].name} // ${WEAPONS[weapon].category}`; game.bannerUntil = now + 720;
}

function startReload(game: Game, now: number) {
  const weapon = WEAPONS[game.weapon];
  if (game.mode !== "playing" || game.reloadUntil > now || game.ammo[game.weapon] >= weapon.magazine || game.reserve[game.weapon] <= 0) return;
  game.firing = false; game.aiming = false; game.reloadStarted = now; game.reloadUntil = now + weapon.reloadTime; tone(game, "reload");
}

function finishReload(game: Game) {
  const weapon = WEAPONS[game.weapon];
  const needed = weapon.magazine - game.ammo[game.weapon];
  const loaded = Math.min(needed, game.reserve[game.weapon]);
  game.ammo[game.weapon] += loaded; game.reserve[game.weapon] -= loaded; game.reloadStarted = 0; game.reloadUntil = 0;
}

function tryJump(game: Game) {
  if (game.mode !== "playing" || !game.player.grounded) return;
  game.player.grounded = false; game.player.vz = JUMP_SPEED; game.bob = 0; tone(game, "jump");
}

function spawnWave(game: Game, now: number) {
  const count = Math.min(4 + Math.ceil(game.wave * 1.15), 16);
  const available = [...SPAWNS].filter(([x, y]) => !wallAt(x, y) && Math.hypot(x - game.player.x, y - game.player.y) > 8).sort(() => Math.random() - 0.5);
  game.enemies = [];
  for (let i = 0; i < count; i += 1) {
    const base = available[i % Math.max(1, available.length)] || SPAWNS[0];
    const roll = Math.random();
    const kind: EnemyKind = game.wave >= 4 && roll > 0.84 ? "brute" : roll < 0.32 ? "scout" : "soldier";
    const maxHp = kind === "brute" ? 105 + game.wave * 8 : kind === "scout" ? 42 + game.wave * 4 : 64 + game.wave * 6;
    const speed = kind === "brute" ? 0.64 : kind === "scout" ? 0.96 : 0.79;
    const x = base[0]; const y = base[1];
    game.enemies.push({ id: ++game.enemySequence, x, y, z: terrainHeightAt(x, y), hp: maxHp, maxHp, speed: Math.min(1.13, speed + game.wave * 0.012 + Math.random() * 0.08), attackAt: now + 1400 + Math.random() * 1200, aimUntil: 0, fireUntil: 0, hitUntil: 0, deadAt: 0, phase: Math.random() * TAU, kind });
  }
  game.nextWaveAt = 0; game.banner = `ONDA ${game.wave} // CENTRO DA CIDADE`; game.bannerUntil = now + 1450;
}

function resetGame(game: Game, now: number) {
  const x = 19.5; const y = 26.2;
  game.player = { x, y, z: terrainHeightAt(x, y), vz: 0, grounded: true, angle: -Math.PI / 2, pitch: 0, health: 100 };
  game.enemies = []; game.targets = []; game.keys.clear(); game.moveX = 0; game.moveY = 0; game.velocityX = 0; game.velocityY = 0;
  game.firing = false; game.triggerLocked = false; game.aiming = false; game.aimProgress = 0; game.weapon = "nvr7";
  game.ammo = { nvr7: 30, brk4: 20, vanta: 5 }; game.reserve = { nvr7: 150, brk4: 100, vanta: 30 };
  game.lastShot = 0; game.reloadStarted = 0; game.reloadUntil = 0; game.switchUntil = 0; game.score = 0; game.wave = 1; game.nextWaveAt = 0;
  game.recoil = 0; game.shake = 0; game.bob = 0; game.walkCycle = 0; game.damageFlash = 0; game.hitUntil = 0; game.killUntil = 0; game.muzzleUntil = 0; game.lastFrame = now;
  spawnWave(game, now);
}

function moveWithCollision(entity: { x: number; y: number }, dx: number, dy: number, radius: number) {
  if (canOccupy(entity.x + dx, entity.y, radius)) entity.x += dx;
  if (canOccupy(entity.x, entity.y + dy, radius)) entity.y += dy;
}

function fireWeapon(game: Game, now: number) {
  const weapon = WEAPONS[game.weapon];
  if (game.mode !== "playing" || game.reloadUntil > now || game.switchUntil > now || now - game.lastShot < weapon.shotDelay || (!weapon.automatic && game.triggerLocked)) return;
  game.lastShot = now; if (!weapon.automatic) game.triggerLocked = true;
  if (game.ammo[game.weapon] <= 0) { tone(game, "empty"); startReload(game, now); return; }
  game.ammo[game.weapon] -= 1; game.muzzleUntil = now + (game.weapon === "vanta" ? 80 : 46);
  game.recoil = Math.min(1, game.recoil + (game.weapon === "vanta" ? 0.9 : game.weapon === "brk4" ? 0.58 : 0.4));
  game.shake = Math.min(1, game.shake + (game.weapon === "vanta" ? 0.4 : 0.13)); tone(game, "shot");
  const moving = Math.min(1, Math.hypot(game.velocityX, game.velocityY) / 4.7);
  const airPenalty = game.player.grounded ? 0 : 1.1;
  const spread = weapon.spread * (1 - game.aimProgress * 0.80) * (1 + moving * 0.62 + airPenalty + game.recoil * 0.5);
  const sx = window.innerWidth / 2 + (Math.random() - 0.5) * spread * 2;
  const sy = window.innerHeight / 2 + (Math.random() - 0.5) * spread * 2;
  const target = game.targets.filter(({ enemy, x, y, width, height }) => !enemy.deadAt && sx >= x && sx <= x + width && sy >= y && sy <= y + height).sort((a, b) => a.distance - b.distance)[0];
  if (target) {
    const headshot = sy < target.y + target.height * 0.31;
    target.enemy.hp -= headshot ? weapon.headDamage : weapon.damage; target.enemy.hitUntil = now + 90; game.hitUntil = now + 120; tone(game, "hit");
    if (target.enemy.hp <= 0) { target.enemy.deadAt = now; target.enemy.aimUntil = 0; game.score += headshot ? 175 : 100; game.killUntil = now + 230; game.banner = headshot ? "HEADSHOT" : "ALVO ELIMINADO"; game.bannerUntil = now + 620; tone(game, "kill"); }
    else game.score += headshot ? 35 : 15;
  }
  if (game.ammo[game.weapon] === 0) startReload(game, now + 110);
}

function updateGame(game: Game, dt: number, now: number) {
  const player = game.player;
  game.aimProgress += ((game.aiming && game.reloadUntil <= now ? 1 : 0) - game.aimProgress) * (1 - Math.exp(-15 * dt));
  const keyForward = (game.keys.has("KeyW") || game.keys.has("ArrowUp") ? 1 : 0) - (game.keys.has("KeyS") || game.keys.has("ArrowDown") ? 1 : 0);
  const keyStrafe = (game.keys.has("KeyD") || game.keys.has("ArrowRight") ? 1 : 0) - (game.keys.has("KeyA") || game.keys.has("ArrowLeft") ? 1 : 0);
  let forward = clamp(keyForward - game.moveY, -1, 1); let strafe = clamp(keyStrafe + game.moveX, -1, 1);
  const input = Math.hypot(forward, strafe); if (input > 1) { forward /= input; strafe /= input; }
  const running = (game.keys.has("ShiftLeft") || game.keys.has("ShiftRight")) && !game.aiming;
  const speed = (running ? 4.9 : 3.25) * (game.aiming ? 0.64 : 1) * (player.grounded ? 1 : 0.92);
  const targetVX = (Math.cos(player.angle) * forward + Math.cos(player.angle + Math.PI / 2) * strafe) * speed;
  const targetVY = (Math.sin(player.angle) * forward + Math.sin(player.angle + Math.PI / 2) * strafe) * speed;
  const accel = 1 - Math.exp(-(input > 0.03 ? (player.grounded ? 13 : 4.3) : 9) * dt);
  game.velocityX += (targetVX - game.velocityX) * accel; game.velocityY += (targetVY - game.velocityY) * accel;
  moveWithCollision(player, game.velocityX * dt, game.velocityY * dt, 0.23);
  const ground = terrainHeightAt(player.x, player.y);
  if (player.grounded) { player.z += (ground - player.z) * Math.min(1, dt * 18); player.vz = 0; }
  else { player.vz -= GRAVITY * dt; player.z += player.vz * dt; if (player.z <= ground) { player.z = ground; player.vz = 0; player.grounded = true; } }
  if (input > 0.05 && player.grounded) { game.walkCycle += dt * (running ? 13 : 9); game.bob = Math.sin(game.walkCycle) * (running ? 1.25 : 0.72); } else game.bob *= Math.pow(0.025, dt);
  if (game.firing) fireWeapon(game, now); else game.triggerLocked = false;
  if (game.reloadUntil && now >= game.reloadUntil) finishReload(game);
  let activeAim = game.enemies.reduce((n, enemy) => n + (!enemy.deadAt && enemy.aimUntil > now ? 1 : 0), 0);
  const aimLimit = game.wave >= 7 ? 3 : 2;
  for (const enemy of game.enemies) {
    if (enemy.deadAt) continue;
    const ex = player.x - enemy.x; const ey = player.y - enemy.y; const distance = Math.max(0.001, Math.hypot(ex, ey));
    const sees = distance < 16 && hasLineOfSight(enemy.x, enemy.y, player.x, player.y);
    if (distance > 4.3 || !sees || distance < 2.7) {
      const direction = distance < 2.7 && sees ? -1 : 1; const dx = ex / distance * direction; const dy = ey / distance * direction;
      const strafeAmount = sees ? Math.sin(now * 0.001 + enemy.phase) * 0.24 : 0;
      moveWithCollision(enemy, (dx - dy * strafeAmount) * enemy.speed * dt, (dy + dx * strafeAmount) * enemy.speed * dt, 0.28);
      enemy.z += (terrainHeightAt(enemy.x, enemy.y) - enemy.z) * Math.min(1, dt * 12);
    }
    if (!sees && enemy.aimUntil) { enemy.aimUntil = 0; activeAim = Math.max(0, activeAim - 1); }
    else if (enemy.aimUntil && now >= enemy.aimUntil) {
      enemy.aimUntil = 0; enemy.fireUntil = now + 110; activeAim = Math.max(0, activeAim - 1);
      const heightAdvantage = clamp((enemy.z - player.z) * 0.08, -0.08, 0.08);
      const hitChance = clamp(0.55 - distance * 0.025 + heightAdvantage, 0.20, 0.49);
      enemy.attackAt = now + Math.max(1150, 1860 - game.wave * 24) + Math.random() * 760;
      if (Math.random() < hitChance) { const typeDamage = enemy.kind === "brute" ? 2 : enemy.kind === "scout" ? -0.5 : 0; const damage = Math.min(9, 2.5 + game.wave * 0.34 + typeDamage); player.health = Math.max(0, player.health - damage); game.damageFlash = Math.min(1, game.damageFlash + 0.58); game.shake = Math.min(1, game.shake + 0.45); tone(game, "hurt"); }
    } else if (!enemy.aimUntil && sees && distance < 12 && now >= enemy.attackAt && activeAim < aimLimit) { const aimTime = enemy.kind === "scout" ? 820 : enemy.kind === "brute" ? 980 : 900; enemy.aimUntil = now + aimTime + Math.random() * 260; activeAim += 1; }
  }
  game.enemies = game.enemies.filter((enemy) => !enemy.deadAt || now - enemy.deadAt < 600);
  const alive = game.enemies.filter((enemy) => !enemy.deadAt).length;
  if (alive === 0 && !game.nextWaveAt) { game.nextWaveAt = now + 2200; game.banner = "SETOR LIMPO"; game.bannerUntil = now + 1600; player.health = Math.min(100, player.health + 12); game.reserve.nvr7 = Math.min(300, game.reserve.nvr7 + 34); game.reserve.brk4 = Math.min(200, game.reserve.brk4 + 22); game.reserve.vanta = Math.min(60, game.reserve.vanta + 5); }
  if (game.nextWaveAt && now >= game.nextWaveAt) { game.wave += 1; spawnWave(game, now); }
  game.damageFlash *= Math.pow(0.055, dt); game.recoil *= Math.pow(0.003, dt); game.shake *= Math.pow(0.012, dt);
}

function castRay(px: number, py: number, angle: number) {
  const rayX = Math.cos(angle); const rayY = Math.sin(angle); let mapX = Math.floor(px); let mapY = Math.floor(py);
  const deltaX = Math.abs(1 / (rayX || 0.000001)); const deltaY = Math.abs(1 / (rayY || 0.000001));
  const stepX = rayX < 0 ? -1 : 1; const stepY = rayY < 0 ? -1 : 1;
  let sideX = rayX < 0 ? (px - mapX) * deltaX : (mapX + 1 - px) * deltaX; let sideY = rayY < 0 ? (py - mapY) * deltaY : (mapY + 1 - py) * deltaY;
  let side = 0; let wall = "1";
  for (let i = 0; i < 70; i += 1) { if (sideX < sideY) { sideX += deltaX; mapX += stepX; side = 0; } else { sideY += deltaY; mapY += stepY; side = 1; } wall = MAP[mapY]?.[mapX] || "1"; if (wall !== "0") break; }
  const distance = side === 0 ? sideX - deltaX : sideY - deltaY; const hit = side === 0 ? py + distance * rayY : px + distance * rayX;
  return { distance, side, wall, texture: hit - Math.floor(hit), ground: terrainHeightAt(mapX + 0.5, mapY + 0.5) };
}

function drawEnemy(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, enemy: Enemy, now: number) {
  const dead = enemy.deadAt ? clamp((now - enemy.deadAt) / 520, 0, 1) : 0;
  context.save(); context.translate(x + width / 2, y + height / 2); context.rotate(dead * 1.15); context.scale(width, height * (1 - dead * 0.35)); context.translate(-0.5, -0.5); context.globalAlpha = 1 - dead * 0.75;
  context.fillStyle = "rgba(0,0,0,.35)"; context.beginPath(); context.ellipse(0.5, 0.95, 0.36, 0.055, 0, 0, TAU); context.fill();
  context.strokeStyle = "#111718"; context.lineWidth = 0.08; context.lineCap = "round"; context.beginPath(); context.moveTo(0.4, 0.62); context.lineTo(0.34, 0.92); context.moveTo(0.6, 0.62); context.lineTo(0.66, 0.92); context.stroke();
  const body = enemy.kind === "brute" ? "#7749a8" : enemy.kind === "scout" ? "#b9842c" : "#b94c2c";
  context.fillStyle = enemy.hitUntil > now ? "#fff0c0" : body; context.fillRect(0.28, 0.30, 0.44, 0.39);
  context.fillStyle = "#1d2527"; context.fillRect(0.32, 0.12, 0.36, 0.20); context.fillStyle = enemy.aimUntil > now ? "#ffe25d" : "#ff5a2b"; context.fillRect(0.35, 0.20, 0.30, 0.045);
  context.strokeStyle = "#2a3436"; context.lineWidth = 0.055; context.beginPath(); context.moveTo(0.28, 0.38); context.lineTo(0.12, 0.67); context.moveTo(0.72, 0.38); context.lineTo(0.88, 0.67); context.stroke();
  if (enemy.hp < enemy.maxHp && !enemy.deadAt) { context.fillStyle = "rgba(0,0,0,.65)"; context.fillRect(0.18, 0.03, 0.64, 0.035); context.fillStyle = "#ff6a31"; context.fillRect(0.18, 0.03, 0.64 * clamp(enemy.hp / enemy.maxHp, 0, 1), 0.035); }
  context.restore();
}

function drawWeapon(context: CanvasRenderingContext2D, width: number, height: number, game: Game, now: number) {
  const scale = Math.min(width, height) / 760; const aim = game.aimProgress;
  const reloadProgress = game.reloadUntil > now ? clamp((now - game.reloadStarted) / Math.max(1, game.reloadUntil - game.reloadStarted), 0, 1) : 0;
  const reloadArc = Math.sin(reloadProgress * Math.PI); const accent = game.weapon === "vanta" ? "#55b2b7" : game.weapon === "brk4" ? "#d8a04c" : "#ff6432"; const length = game.weapon === "vanta" ? 405 : game.weapon === "brk4" ? 350 : 325; const jumpDrop = game.player.grounded ? 0 : clamp(game.player.vz * 2.2, -18, 18);
  context.save(); context.translate(width * (0.55 - aim * 0.05) + Math.sin(game.walkCycle * 0.5) * 6 * scale * (1 - aim * 0.85), height + game.recoil * 30 * scale + reloadArc * 68 * scale + jumpDrop * scale - aim * 16 * scale); context.rotate(-0.045 + reloadArc * 0.22); context.scale(scale * (game.weapon === "vanta" ? 0.92 : 1), scale * (game.weapon === "vanta" ? 0.92 : 1));
  context.fillStyle = "#0a0e0f"; context.fillRect(-19, -length, 28, length - 245); context.fillStyle = accent; context.fillRect(-22, -length + 72, 34, 11);
  context.fillStyle = "#252d2f"; context.beginPath(); context.moveTo(-88, -220); context.lineTo(64, -220); context.lineTo(125, -95); context.lineTo(69, -45); context.lineTo(-70, -82); context.closePath(); context.fill(); context.strokeStyle = "#596365"; context.lineWidth = 3; context.stroke(); context.fillStyle = accent; context.fillRect(-60, -188, 86, 9);
  if (game.weapon === "vanta") { context.fillStyle = "#090d0e"; context.fillRect(-55, -272, 104, 22); context.strokeStyle = accent; context.strokeRect(-55, -272, 104, 22); } else { context.fillStyle = "#090d0e"; context.fillRect(-13, -264, 26, 28); context.strokeStyle = accent; context.strokeRect(-13, -264, 26, 28); }
  context.fillStyle = "#111617"; context.fillRect(-30, -92, 58, 92); context.fillStyle = "#1a2021"; context.beginPath(); context.moveTo(45, -92); context.lineTo(150, -50); context.lineTo(190, 20); context.lineTo(82, 7); context.closePath(); context.fill();
  if (game.muzzleUntil > now) { context.fillStyle = "#ffe69b"; context.beginPath(); context.moveTo(-6, -length - 52); context.lineTo(22, -length - 8); context.lineTo(48, -length - 23); context.lineTo(18, -length + 4); context.lineTo(37, -length + 37); context.lineTo(-5, -length + 17); context.lineTo(-28, -length + 48); context.lineTo(-18, -length + 5); context.lineTo(-49, -length + 18); context.closePath(); context.fill(); }
  context.restore();
}

function renderScene(canvas: HTMLCanvasElement, game: Game, now: number) {
  const context = canvas.getContext("2d", { alpha: false }); if (!context) return;
  const width = canvas.width; const height = canvas.height; const scaleX = width / window.innerWidth; const scaleY = height / window.innerHeight; const weapon = WEAPONS[game.weapon]; const currentFov = BASE_FOV * (1 - game.aimProgress * weapon.zoom);
  const localGround = terrainHeightAt(game.player.x, game.player.y); const jumpHeight = Math.max(0, game.player.z - localGround); const shakeX = (Math.random() - 0.5) * game.shake * 10; const shakeY = (Math.random() - 0.5) * game.shake * 7;
  const horizon = height * 0.5 - game.player.pitch * height * 0.86 + game.bob * scaleY + jumpHeight * height * 0.11 + shakeY;
  const sky = context.createLinearGradient(0, 0, 0, horizon); sky.addColorStop(0, "#071117"); sky.addColorStop(0.55, "#18303a"); sky.addColorStop(1, "#718084"); context.fillStyle = sky; context.fillRect(0, 0, width, Math.max(0, horizon));
  context.fillStyle = "rgba(17,27,31,.72)"; for (let i = 0; i < 18; i += 1) { const bx = ((i * 137 - game.player.angle * 280) % (width + 160)) - 80; const bw = 28 + (i % 4) * 13; const bh = 24 + (i % 5) * 17; context.fillRect(bx, horizon - bh, bw, bh); }
  const floor = context.createLinearGradient(0, horizon, 0, height); floor.addColorStop(0, "#4b5150"); floor.addColorStop(0.38, "#202625"); floor.addColorStop(1, "#070909"); context.fillStyle = floor; context.fillRect(0, Math.max(0, horizon), width, height - horizon);
  const terrainStep = Math.max(8, Math.round(width / 160));
  for (let sy = Math.max(0, Math.floor(horizon + 16)); sy < height; sy += terrainStep) { const denom = Math.max(8, sy - horizon); const distance = clamp((height * 0.46) / denom, 0.5, 22); for (let sx = 0; sx < width; sx += terrainStep) { const camera = sx / width - 0.5; const rayAngle = game.player.angle + camera * currentFov; const wx = game.player.x + Math.cos(rayAngle) * distance; const wy = game.player.y + Math.sin(rayAngle) * distance; const t = terrainHeightAt(wx, wy); if (t > 0.06) { const alpha = clamp(t * 0.17, 0.025, 0.14); context.fillStyle = `rgba(112,154,154,${alpha})`; context.fillRect(sx, sy, terrainStep + 1, terrainStep + 1); } } }
  context.strokeStyle = "rgba(220,232,226,.07)"; context.lineWidth = 1; for (let y = horizon + 25; y < height; y += Math.max(22, (y - horizon) * 0.18)) { context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
  const rayStep = Math.max(2, Math.round(width / 720)); const depth: number[] = []; const colors: Record<string, [number, number, number]> = { "1": [112, 116, 113], "2": [154, 91, 58], "3": [67, 95, 101], "4": [122, 112, 78] };
  for (let screenX = 0, rayIndex = 0; screenX < width; screenX += rayStep, rayIndex += 1) { const camera = screenX / width - 0.5; const rayAngle = game.player.angle + camera * currentFov; const hit = castRay(game.player.x, game.player.y, rayAngle); const corrected = Math.max(0.02, hit.distance * Math.cos(rayAngle - game.player.angle)); depth[rayIndex] = corrected; const wallHeight = Math.min(height * 3.2, (height * 0.92) / corrected); const elevationShift = (game.player.z - hit.ground) * height * 0.38 / corrected; const center = horizon + elevationShift; const top = center - wallHeight / 2; const base = colors[hit.wall] || colors["1"]; const distanceShade = clamp(1 - corrected / 27, 0.18, 1); const sideShade = hit.side ? 0.72 : 1; const seam = Math.floor(hit.texture * 10) % 4 === 0 ? 0.82 : 1; const light = distanceShade * sideShade * seam; context.fillStyle = `rgb(${Math.floor(base[0] * light)},${Math.floor(base[1] * light)},${Math.floor(base[2] * light)})`; context.fillRect(screenX + shakeX, top, rayStep + 1, wallHeight); if (hit.wall !== "4" && corrected < 14 && Math.floor(hit.texture * 14) % 5 === 1) { context.fillStyle = `rgba(170,207,202,${0.16 * distanceShade})`; context.fillRect(screenX + shakeX, top + wallHeight * 0.28, rayStep + 1, wallHeight * 0.11); } }
  game.targets = [];
  const sorted = [...game.enemies].sort((a, b) => Math.hypot(b.x - game.player.x, b.y - game.player.y) - Math.hypot(a.x - game.player.x, a.y - game.player.y));
  for (const enemy of sorted) { const dx = enemy.x - game.player.x; const dy = enemy.y - game.player.y; const rawDistance = Math.hypot(dx, dy); const relative = normalizeAngle(Math.atan2(dy, dx) - game.player.angle); if (Math.abs(relative) > currentFov * 0.69 || rawDistance < 0.28) continue; const corrected = Math.max(0.1, rawDistance * Math.cos(relative)); const unit = (height * 0.76) / corrected; const spriteHeight = unit * 1.34; const spriteWidth = unit * 0.58; const centerX = width * (0.5 + relative / currentFov) + shakeX; const elevationShift = (game.player.z - enemy.z) * height * 0.40 / corrected; const top = horizon + elevationShift - spriteHeight * 0.62; const left = centerX - spriteWidth / 2; const first = Math.floor(Math.max(0, left) / rayStep); const last = Math.ceil(Math.min(width, left + spriteWidth) / rayStep); let visible = false; for (let stripe = first; stripe <= last; stripe += 1) { if (corrected < (depth[stripe] ?? Infinity) + 0.08) { visible = true; break; } } if (!visible) continue; drawEnemy(context, left, top, spriteWidth, spriteHeight, enemy, now); if (!enemy.deadAt) game.targets.push({ enemy, x: left / scaleX, y: top / scaleY, width: spriteWidth / scaleX, height: spriteHeight / scaleY, distance: corrected }); }
  for (const enemy of game.enemies) { if (enemy.deadAt || enemy.fireUntil <= now) continue; const dx = enemy.x - game.player.x; const dy = enemy.y - game.player.y; const distance = Math.hypot(dx, dy); const relative = normalizeAngle(Math.atan2(dy, dx) - game.player.angle); if (Math.abs(relative) > currentFov * 0.7) continue; const sx = width * (0.5 + relative / currentFov); const sy = horizon + (game.player.z - enemy.z) * height * 0.36 / Math.max(0.5, distance) - (height * 0.22) / Math.max(0.6, distance); context.strokeStyle = `rgba(255,126,45,${clamp((enemy.fireUntil - now) / 110, 0, 1) * 0.76})`; context.lineWidth = Math.max(1, 1.6 * scaleX); context.beginPath(); context.moveTo(sx, sy); context.lineTo(width / 2, height / 2); context.stroke(); }
  drawWeapon(context, width, height, game, now);
  const cx = width / 2; const cy = height / 2; const spread = (weapon.spread * (1 - game.aimProgress * 0.80) + game.recoil * 14 + (game.player.grounded ? 0 : 12)) * Math.min(scaleX, scaleY);
  context.strokeStyle = game.hitUntil > now ? "#fff5dc" : "rgba(242,248,245,.9)"; context.lineWidth = Math.max(1.4, 2 * scaleX); context.beginPath(); context.moveTo(cx - spread - 8 * scaleX, cy); context.lineTo(cx - spread, cy); context.moveTo(cx + spread, cy); context.lineTo(cx + spread + 8 * scaleX, cy); context.moveTo(cx, cy - spread - 8 * scaleY); context.lineTo(cx, cy - spread); context.moveTo(cx, cy + spread); context.lineTo(cx, cy + spread + 8 * scaleY); context.stroke(); context.fillStyle = "rgba(242,248,245,.86)"; context.fillRect(cx - scaleX, cy - scaleY, scaleX * 2, scaleY * 2);
  if (game.weapon === "vanta" && game.aimProgress > 0.52) { const alpha = clamp((game.aimProgress - 0.52) / 0.48, 0, 1); const radius = Math.min(width, height) * 0.43; context.save(); context.fillStyle = `rgba(0,0,0,${alpha * 0.985})`; context.beginPath(); context.rect(0, 0, width, height); context.arc(cx, cy, radius, 0, TAU, true); context.fill("evenodd"); context.strokeStyle = `rgba(221,245,240,${alpha * 0.78})`; context.lineWidth = Math.max(1, scaleX); context.beginPath(); context.moveTo(cx - radius, cy); context.lineTo(cx + radius, cy); context.moveTo(cx, cy - radius); context.lineTo(cx, cy + radius); context.stroke(); context.restore(); }
  if (game.hitUntil > now || game.killUntil > now) { const marker = 15 * Math.min(scaleX, scaleY); context.strokeStyle = game.killUntil > now ? "#ff5a22" : "#f6fbf9"; context.lineWidth = 2.5 * scaleX; context.beginPath(); context.moveTo(cx - marker, cy - marker); context.lineTo(cx - marker * 0.42, cy - marker * 0.42); context.moveTo(cx + marker, cy - marker); context.lineTo(cx + marker * 0.42, cy - marker * 0.42); context.moveTo(cx - marker, cy + marker); context.lineTo(cx - marker * 0.42, cy + marker * 0.42); context.moveTo(cx + marker, cy + marker); context.lineTo(cx + marker * 0.42, cy + marker * 0.42); context.stroke(); }
  if (game.damageFlash > 0.015) { const vignette = context.createRadialGradient(cx, cy, height * 0.12, cx, cy, height * 0.76); vignette.addColorStop(0, "rgba(130,0,0,0)"); vignette.addColorStop(1, `rgba(255,26,0,${game.damageFlash * 0.68})`); context.fillStyle = vignette; context.fillRect(0, 0, width, height); }
}

function renderMinimap(canvas: HTMLCanvasElement, game: Game, now: number) {
  const context = canvas.getContext("2d"); if (!context) return; const size = canvas.width; const padding = 8; const cell = (size - padding * 2) / MAP_SIZE;
  context.clearRect(0, 0, size, size); context.fillStyle = "rgba(3,8,9,.94)"; context.fillRect(0, 0, size, size);
  for (let y = 0; y < MAP_SIZE; y += 1) { for (let x = 0; x < MAP_SIZE; x += 1) { const type = MAP[y][x]; if (type === "0") { const h = terrainHeightAt(x + 0.5, y + 0.5); if (h > 0.08) { context.fillStyle = `rgba(92,154,155,${0.12 + h * 0.2})`; context.fillRect(padding + x * cell, padding + y * cell, cell + 0.3, cell + 0.3); } continue; } context.fillStyle = type === "2" ? "#6f3e2c" : type === "3" ? "#29494d" : type === "4" ? "#655c3f" : "#4a5555"; context.fillRect(padding + x * cell, padding + y * cell, cell + 0.3, cell + 0.3); } }
  for (const enemy of game.enemies) { if (enemy.deadAt) continue; const pulse = enemy.aimUntil > now ? 2.4 + Math.sin(now * 0.02) * 0.8 : 1.8; context.fillStyle = enemy.aimUntil > now ? "#ffe35a" : "#ff5a2b"; context.beginPath(); context.arc(padding + enemy.x * cell, padding + enemy.y * cell, pulse, 0, TAU); context.fill(); }
  context.save(); context.translate(padding + game.player.x * cell, padding + game.player.y * cell); context.rotate(game.player.angle); context.fillStyle = game.player.grounded ? "#effffb" : "#dfff42"; context.beginPath(); context.moveTo(6, 0); context.lineTo(-4, -3.5); context.lineTo(-2.5, 0); context.lineTo(-4, 3.5); context.closePath(); context.fill(); context.restore(); context.strokeStyle = "rgba(226,245,240,.24)"; context.strokeRect(0.5, 0.5, size - 1, size - 1);
}

const initialHud: Hud = { health: 100, ammo: 30, reserve: 150, score: 0, wave: 1, enemies: 0, weapon: "nvr7", weaponName: "NVR–7", weaponCategory: "FUZIL AUTOMÁTICO", sensitivity: 1, reloading: false, reloadProgress: 0, banner: "", best: 0, elevation: 0 };

export default function NoveraGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null); const mapCanvasRef = useRef<HTMLCanvasElement>(null); const gameRef = useRef<Game | null>(null); const lookPointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const [mode, setMode] = useState<GameMode>("menu"); const [hud, setHud] = useState<Hud>(initialHud); const [muted, setMuted] = useState(false); const [touchDevice, setTouchDevice] = useState(false); const [stick, setStick] = useState({ x: 0, y: 0 }); const [sensitivity, setSensitivity] = useState(1);
  const syncHud = useCallback((game: Game, now: number) => { const reloadProgress = game.reloadUntil > now ? clamp((now - game.reloadStarted) / Math.max(1, game.reloadUntil - game.reloadStarted), 0, 1) : 0; setHud({ health: Math.ceil(game.player.health), ammo: game.ammo[game.weapon], reserve: game.reserve[game.weapon], score: game.score, wave: game.wave, enemies: game.enemies.filter((e) => !e.deadAt).length, weapon: game.weapon, weaponName: WEAPONS[game.weapon].name, weaponCategory: WEAPONS[game.weapon].category, sensitivity: game.sensitivity, reloading: game.reloadUntil > now, reloadProgress, banner: game.bannerUntil > now ? game.banner : "", best: game.best, elevation: game.player.z }); }, []);
  const changeSensitivity = useCallback((values: number[]) => { const next = clamp(values[0] ?? 1, 0.4, 2); setSensitivity(next); if (gameRef.current) gameRef.current.sensitivity = next; try { window.localStorage.setItem("novera-sensitivity", String(next)); } catch {} }, []);
  const start = useCallback(() => { const game = gameRef.current; const canvas = canvasRef.current; if (!game || !canvas) return; const now = performance.now(); ensureAudio(game); resetGame(game, now); game.mode = "playing"; setMode("playing"); syncHud(game, now); canvas.focus(); if (window.matchMedia("(pointer: fine)").matches) void canvas.requestPointerLock?.(); }, [syncHud]);
  const resume = useCallback(() => { const game = gameRef.current; const canvas = canvasRef.current; if (!game || !canvas) return; ensureAudio(game); game.mode = "playing"; game.lastFrame = performance.now(); setMode("playing"); if (window.matchMedia("(pointer: fine)").matches) void canvas.requestPointerLock?.(); }, []);
  const pause = useCallback(() => { const game = gameRef.current; if (!game || game.mode !== "playing") return; game.mode = "paused"; game.firing = false; game.aiming = false; game.triggerLocked = false; setMode("paused"); if (document.pointerLockElement) void document.exitPointerLock(); }, []);
  const toggleSound = useCallback(() => { setMuted((current) => { const next = !current; if (gameRef.current) gameRef.current.muted = next; return next; }); }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return; const game = createGame(); gameRef.current = game; setSensitivity(game.sensitivity); setHud((h) => ({ ...h, best: game.best, sensitivity: game.sensitivity }));
    const coarse = window.matchMedia("(pointer: coarse)"); const updateTouch = () => setTouchDevice(coarse.matches); updateTouch(); coarse.addEventListener?.("change", updateTouch);
    const resize = () => { const ratio = Math.min(window.devicePixelRatio || 1, 1.45); canvas.width = Math.min(1600, Math.max(640, Math.floor(window.innerWidth * ratio))); canvas.height = Math.min(1000, Math.max(360, Math.floor(window.innerHeight * ratio))); }; resize();
    const onKeyDown = (event: KeyboardEvent) => { game.keys.add(event.code); if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault(); if (event.code === "Space" && !event.repeat) tryJump(game); if (event.code === "KeyR") startReload(game, performance.now()); if (event.code === "Digit1") switchWeapon(game, "nvr7", performance.now()); if (event.code === "Digit2") switchWeapon(game, "brk4", performance.now()); if (event.code === "Digit3") switchWeapon(game, "vanta", performance.now()); if (event.code === "KeyQ" && !event.repeat) { const index = WEAPON_ORDER.indexOf(game.weapon); switchWeapon(game, WEAPON_ORDER[(index + 1) % WEAPON_ORDER.length], performance.now()); } if (event.code === "Enter" && (game.mode === "menu" || game.mode === "gameover")) start(); };
    const onKeyUp = (event: KeyboardEvent) => game.keys.delete(event.code);
    const onMouseMove = (event: MouseEvent) => { if (document.pointerLockElement !== canvas || game.mode !== "playing") return; const aimControl = game.aiming ? (game.weapon === "vanta" ? 0.92 : 0.82) : 1; game.player.angle = normalizeAngle(game.player.angle + event.movementX * 0.00225 * game.sensitivity * aimControl); game.player.pitch = clamp(game.player.pitch + event.movementY * 0.00155 * game.sensitivity * aimControl, -0.34, 0.34); };
    const onMouseDown = (event: MouseEvent) => { if (game.mode !== "playing" || document.pointerLockElement !== canvas) return; if (event.button === 0) game.firing = true; if (event.button === 2 && game.reloadUntil <= performance.now()) game.aiming = true; };
    const onMouseUp = (event: MouseEvent) => { if (event.button === 0) { game.firing = false; game.triggerLocked = false; } if (event.button === 2) game.aiming = false; };
    const onPointerLock = () => { if (!document.pointerLockElement && game.mode === "playing" && window.matchMedia("(pointer: fine)").matches) { game.mode = "paused"; game.firing = false; game.aiming = false; setMode("paused"); } };
    const onVisibility = () => { if (document.hidden && game.mode === "playing") pause(); }; const onContextMenu = (event: MouseEvent) => event.preventDefault();
    window.addEventListener("resize", resize); window.addEventListener("keydown", onKeyDown, { passive: false }); window.addEventListener("keyup", onKeyUp); window.addEventListener("mousemove", onMouseMove); window.addEventListener("mousedown", onMouseDown); window.addEventListener("mouseup", onMouseUp); document.addEventListener("pointerlockchange", onPointerLock); document.addEventListener("visibilitychange", onVisibility); canvas.addEventListener("contextmenu", onContextMenu);
    let frameId = 0; const frame = (now: number) => { const dt = Math.min(0.034, Math.max(0.001, (now - game.lastFrame) / 1000)); game.lastFrame = now; if (game.mode === "playing") { updateGame(game, dt, now); if (game.player.health <= 0) { game.mode = "gameover"; game.firing = false; game.best = Math.max(game.best, game.score); try { window.localStorage.setItem("novera-best", String(game.best)); } catch {} setMode("gameover"); if (document.pointerLockElement) void document.exitPointerLock(); } } else if (game.mode === "menu") game.player.angle = normalizeAngle(game.player.angle + dt * 0.05); renderScene(canvas, game, now); if (mapCanvasRef.current) renderMinimap(mapCanvasRef.current, game, now); if (now - game.lastHud > 75) { syncHud(game, now); game.lastHud = now; } frameId = requestAnimationFrame(frame); }; frameId = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(frameId); window.removeEventListener("resize", resize); window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mousedown", onMouseDown); window.removeEventListener("mouseup", onMouseUp); document.removeEventListener("pointerlockchange", onPointerLock); document.removeEventListener("visibilitychange", onVisibility); canvas.removeEventListener("contextmenu", onContextMenu); coarse.removeEventListener?.("change", updateTouch); if (game.audio) void game.audio.close(); };
  }, [pause, start, syncHud]);

  const handleCanvasClick = () => { const game = gameRef.current; const canvas = canvasRef.current; if (!game || !canvas || game.mode !== "playing") return; if (window.matchMedia("(pointer: fine)").matches && document.pointerLockElement !== canvas) void canvas.requestPointerLock?.(); };
  const handleLookDown = (event: React.PointerEvent<HTMLCanvasElement>) => { if (event.pointerType === "mouse" || mode !== "playing" || event.clientX < window.innerWidth * 0.42) return; lookPointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); };
  const handleLookMove = (event: React.PointerEvent<HTMLCanvasElement>) => { const game = gameRef.current; const look = lookPointer.current; if (!game || !look || look.id !== event.pointerId || game.mode !== "playing") return; const aimControl = game.aiming ? (game.weapon === "vanta" ? 0.94 : 0.84) : 1; game.player.angle = normalizeAngle(game.player.angle + (event.clientX - look.x) * 0.0062 * game.sensitivity * aimControl); game.player.pitch = clamp(game.player.pitch + (event.clientY - look.y) * 0.004 * game.sensitivity * aimControl, -0.34, 0.34); look.x = event.clientX; look.y = event.clientY; };
  const handleLookUp = (event: React.PointerEvent<HTMLCanvasElement>) => { if (lookPointer.current?.id === event.pointerId) lookPointer.current = null; };
  const updateMovePad = (event: React.PointerEvent<HTMLDivElement>) => { const game = gameRef.current; if (!game) return; const rect = event.currentTarget.getBoundingClientRect(); const x = clamp((event.clientX - (rect.left + rect.width / 2)) / (rect.width * 0.36), -1, 1); const y = clamp((event.clientY - (rect.top + rect.height / 2)) / (rect.height * 0.36), -1, 1); game.moveX = x; game.moveY = y; setStick({ x, y }); };
  const moveDown = (event: React.PointerEvent<HTMLDivElement>) => { event.currentTarget.setPointerCapture(event.pointerId); updateMovePad(event); }; const moveUp = () => { if (gameRef.current) { gameRef.current.moveX = 0; gameRef.current.moveY = 0; } setStick({ x: 0, y: 0 }); };
  const shootDown = (event: React.PointerEvent<HTMLButtonElement>) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); const game = gameRef.current; if (game) { ensureAudio(game); game.firing = true; fireWeapon(game, performance.now()); } }; const shootUp = () => { if (gameRef.current) { gameRef.current.firing = false; gameRef.current.triggerLocked = false; } };
  const aimDown = (event: React.PointerEvent<HTMLButtonElement>) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); if (gameRef.current && gameRef.current.reloadUntil <= performance.now()) gameRef.current.aiming = true; }; const aimUp = () => { if (gameRef.current) gameRef.current.aiming = false; };
  const cycleWeapon = () => { const game = gameRef.current; if (!game) return; const index = WEAPON_ORDER.indexOf(game.weapon); switchWeapon(game, WEAPON_ORDER[(index + 1) % WEAPON_ORDER.length], performance.now()); };
  const healthTone = hud.health <= 25 ? "critical" : hud.health <= 55 ? "warning" : "healthy";

  return <main className="game-shell">
    <canvas ref={canvasRef} className="game-canvas" tabIndex={0} aria-label="Novera, FPS em uma pequena cidade" onClick={handleCanvasClick} onPointerDown={handleLookDown} onPointerMove={handleLookMove} onPointerUp={handleLookUp} onPointerCancel={handleLookUp} />
    <div className={`hud ${mode === "playing" ? "is-visible" : ""}`} aria-hidden={mode !== "playing"}>
      <section className="hud-cluster health-cluster"><span className="hud-label">INTEGRIDADE</span><div className="health-readout"><strong className={healthTone}>{hud.health}</strong><div className="health-track"><i className={healthTone} style={{ width: `${hud.health}%` }} /></div></div></section>
      <section className="mission-cluster"><span>ONDA <b>{String(hud.wave).padStart(2, "0")}</b></span><i /><span>ALVOS <b>{String(hud.enemies).padStart(2, "0")}</b></span><i /><span>ALT <b>{hud.elevation.toFixed(1)}m</b></span><i /><span>PONTOS <b>{String(hud.score).padStart(5, "0")}</b></span></section>
      <aside className="minimap-panel"><div><span>CIDADE</span><b>{MAP_SIZE}×{MAP_SIZE}</b></div><canvas ref={mapCanvasRef} width={220} height={220} /><small><i /> INIMIGOS • ÁREAS CLARAS = ELEVAÇÃO</small></aside>
      <section className="hud-cluster ammo-cluster"><span className="hud-label">{hud.weaponName} · {hud.weaponCategory}</span><div className="ammo-readout"><strong className={hud.ammo <= 6 ? "low" : ""}>{String(hud.ammo).padStart(2, "0")}</strong><span>/ {hud.reserve}</span></div></section>
      <div className="weapon-rack">{WEAPON_ORDER.map((weapon, index) => <button key={weapon} type="button" className={hud.weapon === weapon ? "is-active" : ""} onClick={() => gameRef.current && switchWeapon(gameRef.current, weapon, performance.now())}><span>{index + 1}</span><b>{WEAPONS[weapon].name}</b></button>)}</div>
      <div className={`reload-indicator ${hud.reloading ? "is-active" : ""}`}><span>RECARREGANDO</span><i><b style={{ width: `${hud.reloadProgress * 100}%` }} /></i></div><div className={`combat-banner ${hud.banner ? "is-active" : ""}`}>{hud.banner}</div>
      <div className="hud-actions"><button type="button" className="icon-button" onClick={toggleSound}>{muted ? <VolumeX /> : <Volume2 />}</button><button type="button" className="icon-button" onClick={pause}><Pause /></button></div>
    </div>
    {touchDevice && mode === "playing" && <div className="mobile-controls"><div className="move-pad" onPointerDown={moveDown} onPointerMove={(event) => event.currentTarget.hasPointerCapture(event.pointerId) && updateMovePad(event)} onPointerUp={moveUp} onPointerCancel={moveUp}><div className="move-pad-ring" /><div className="move-pad-knob" style={{ transform: `translate(${stick.x * 35}px, ${stick.y * 35}px)` }} /></div><div className="mobile-actions"><button type="button" className="weapon-button" onPointerDown={(event) => { event.preventDefault(); cycleWeapon(); }}>{hud.weapon === "vanta" ? "S" : hud.weapon === "brk4" ? "B" : "A"}</button><button type="button" className="reload-button" onPointerDown={(event) => { event.preventDefault(); if (gameRef.current) tryJump(gameRef.current); }}>↑</button><button type="button" className="reload-button" onPointerDown={(event) => { event.preventDefault(); if (gameRef.current) startReload(gameRef.current, performance.now()); }}>R</button><button type="button" className={`aim-button ${hud.weapon === "vanta" ? "is-scope" : ""}`} onPointerDown={aimDown} onPointerUp={aimUp} onPointerCancel={aimUp}><Crosshair /></button><button type="button" className="fire-button" onPointerDown={shootDown} onPointerUp={shootUp} onPointerCancel={shootUp}><span /></button></div></div></div>}
    {mode === "menu" && <section className="game-overlay start-overlay"><div className="brand-mark"><i /><span>N</span></div><div className="title-lockup"><p>OPERAÇÃO // BAIRRO ZERO</p><h1>NOVERA</h1><div className="title-rule"><i /><span>FPS • PEQUENA CIDADE • ALTO/BAIXO</span></div></div><button type="button" className="primary-action" onClick={start}><span>ENTRAR NA CIDADE</span><b>→</b></button><div className="desktop-instructions controls-grid"><div><kbd>W A S D</kbd><span>MOVER</span></div><div><kbd>MOUSE</kbd><span>MIRAR</span></div><div><kbd>CLIQUE</kbd><span>ATIRAR</span></div><div><kbd>BOTÃO DIR.</kbd><span>ABRIR MIRA</span></div><div><kbd>ESPAÇO</kbd><span>PULAR</span></div><div><kbd>SHIFT</kbd><span>CORRER</span></div><div><kbd>1 2 3 / Q</kbd><span>ARMAS</span></div></div><div className="touch-instructions controls-grid"><div><kbd>◉</kbd><span>MOVER</span></div><div><kbd>ARRASTE</kbd><span>MIRAR</span></div><div><kbd>↑</kbd><span>PULAR</span></div><div><kbd>⊕</kbd><span>MIRA</span></div></div><div className="sensitivity-control menu-sensitivity"><div><span>SENSIBILIDADE DA MIRA</span><output>{sensitivity.toFixed(1)}×</output></div><Slider value={[sensitivity]} min={0.4} max={2} step={0.1} onValueChange={changeSensitivity} /></div><button type="button" className="menu-sound" onClick={toggleSound}>{muted ? <VolumeX /> : <Volume2 />}<span>{muted ? "SOM DESATIVADO" : "SOM ATIVADO"}</span></button><p className="record-line">RECORDE LOCAL <strong>{String(hud.best).padStart(5, "0")}</strong></p></section>}
    {mode === "paused" && <section className="game-overlay compact-overlay"><p className="overlay-code">OPERAÇÃO INTERROMPIDA</p><h2>PAUSADO</h2><button type="button" className="primary-action" onClick={resume}><Play /><span>CONTINUAR</span></button><button type="button" className="secondary-action" onClick={start}><RotateCcw /><span>REINICIAR</span></button><div className="sensitivity-control pause-sensitivity"><div><span>SENSIBILIDADE DA MIRA</span><output>{sensitivity.toFixed(1)}×</output></div><Slider value={[sensitivity]} min={0.4} max={2} step={0.1} onValueChange={changeSensitivity} /></div><p className="pause-tip">ESPAÇO pula • SHIFT corre • botão direito abre mira • a mira continua móvel com ADS</p></section>}
    {mode === "gameover" && <section className="game-overlay compact-overlay gameover-overlay"><p className="overlay-code">OPERADOR FORA DE COMBATE</p><h2>FIM DA OPERAÇÃO</h2><div className="result-grid"><div><span>PONTUAÇÃO</span><strong>{String(hud.score).padStart(5, "0")}</strong></div><div><span>ONDA</span><strong>{String(hud.wave).padStart(2, "0")}</strong></div><div><span>RECORDE</span><strong>{String(hud.best).padStart(5, "0")}</strong></div></div><button type="button" className="primary-action" onClick={start}><RotateCcw /><span>TENTAR NOVAMENTE</span></button></section>}
    <div className="portrait-warning"><span>↻</span> GIRE O CELULAR PARA JOGAR</div><div className="noise-layer" aria-hidden="true" />
  </main>;
}
