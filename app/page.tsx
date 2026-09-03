"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";

const MAP = [
  "11111111111111111111",
  "10000000000000000001",
  "10002200000003300001",
  "10002200000003300001",
  "10000000000000000001",
  "10000111001110000001",
  "10000100000010000001",
  "10000100000010000001",
  "10000000000000000001",
  "10330000022000003301",
  "10330000022000003301",
  "10000000000000000001",
  "10000100000010000001",
  "10000100000010000001",
  "10000111001110000001",
  "10000000000000000001",
  "10003300000002200001",
  "10003300000002200001",
  "10000000000000000001",
  "11111111111111111111",
] as const;

const SPAWNS = [
  [2.5, 2.5], [10.5, 2.5], [17.5, 2.5], [4.5, 4.5], [15.5, 4.5],
  [2.5, 8.5], [8.5, 8.5], [14.5, 8.5], [17.5, 8.5], [2.5, 12.5],
  [8.5, 12.5], [14.5, 12.5], [17.5, 12.5], [4.5, 15.5], [15.5, 15.5],
  [2.5, 17.5], [9.5, 17.5], [17.5, 17.5],
] as const;

const FOV = Math.PI / 3;
const TAU = Math.PI * 2;

type GameMode = "menu" | "playing" | "paused" | "gameover";

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
  firing: boolean;
  ammo: number;
  reserve: number;
  lastShot: number;
  reloadStarted: number;
  reloadUntil: number;
  score: number;
  wave: number;
  nextWaveAt: number;
  enemySequence: number;
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
};

const initialHud: Hud = {
  health: 100,
  ammo: 30,
  reserve: 120,
  score: 0,
  wave: 1,
  enemies: 0,
  reloading: false,
  reloadProgress: 0,
  banner: "",
  best: 0,
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
  try {
    best = Number(window.localStorage.getItem("novera-best") || 0);
  } catch {
    best = 0;
  }

  return {
    mode: "menu",
    player: { x: 10.5, y: 8.5, angle: -Math.PI / 2, pitch: 0, health: 100 },
    enemies: [],
    keys: new Set(),
    moveX: 0,
    moveY: 0,
    firing: false,
    ammo: 30,
    reserve: 120,
    lastShot: 0,
    reloadStarted: 0,
    reloadUntil: 0,
    score: 0,
    wave: 1,
    nextWaveAt: 0,
    enemySequence: 0,
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

function tone(game: Game, kind: "shot" | "hit" | "kill" | "hurt" | "reload" | "empty") {
  const audio = game.audio;
  if (!audio || game.muted) return;
  const now = audio.currentTime;
  const gain = audio.createGain();
  gain.connect(audio.destination);

  if (kind === "shot") {
    const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * 0.09), audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.6);
    }
    const noise = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1800;
    noise.buffer = buffer;
    noise.connect(filter);
    filter.connect(gain);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    noise.start(now);
    return;
  }

  const oscillator = audio.createOscillator();
  oscillator.connect(gain);
  oscillator.type = kind === "hurt" ? "sawtooth" : "square";
  const frequencies = { hit: 520, kill: 180, hurt: 90, reload: 260, empty: 120 };
  const durations = { hit: 0.05, kill: 0.18, hurt: 0.13, reload: 0.07, empty: 0.04 };
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

function startReload(game: Game, now: number) {
  if (game.reloadUntil > now || game.ammo >= 30 || game.reserve <= 0 || game.mode !== "playing") return;
  game.reloadStarted = now;
  game.reloadUntil = now + 1350;
  tone(game, "reload");
}

function finishReload(game: Game) {
  const needed = 30 - game.ammo;
  const loaded = Math.min(needed, game.reserve);
  game.ammo += loaded;
  game.reserve -= loaded;
  game.reloadUntil = 0;
  game.reloadStarted = 0;
}

function spawnWave(game: Game, now: number) {
  const count = Math.min(4 + game.wave * 2, 18);
  const shuffled = [...SPAWNS].sort(() => Math.random() - 0.5);
  const available = shuffled.filter(([x, y]) => Math.hypot(x - game.player.x, y - game.player.y) > 5);
  game.enemies = [];

  for (let i = 0; i < count; i += 1) {
    const base = available[i % available.length];
    const maxHp = 55 + game.wave * 12;
    game.enemies.push({
      id: ++game.enemySequence,
      x: base[0] + (Math.random() - 0.5) * 0.18,
      y: base[1] + (Math.random() - 0.5) * 0.18,
      hp: maxHp,
      maxHp,
      speed: Math.min(1.35, 0.72 + game.wave * 0.035 + Math.random() * 0.14),
      attackAt: now + 700 + Math.random() * 1500,
      hitUntil: 0,
      deadAt: 0,
      phase: Math.random() * TAU,
    });
  }
  game.nextWaveAt = 0;
  game.banner = `ONDA ${game.wave}`;
  game.bannerUntil = now + 1500;
}

function resetGame(game: Game, now: number) {
  game.player = { x: 10.5, y: 8.5, angle: -Math.PI / 2, pitch: 0, health: 100 };
  game.enemies = [];
  game.keys.clear();
  game.moveX = 0;
  game.moveY = 0;
  game.firing = false;
  game.ammo = 30;
  game.reserve = 120;
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
  if (game.mode !== "playing" || game.reloadUntil > now || now - game.lastShot < 105) return;
  game.lastShot = now;

  if (game.ammo <= 0) {
    tone(game, "empty");
    startReload(game, now);
    return;
  }

  game.ammo -= 1;
  game.muzzleUntil = now + 48;
  game.recoil = Math.min(1, game.recoil + 0.48);
  game.shake = Math.min(1, game.shake + 0.16);
  tone(game, "shot");

  const canvasX = window.innerWidth / 2;
  const canvasY = window.innerHeight / 2;
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
    const damage = headshot ? 92 : 34;
    target.enemy.hp -= damage;
    target.enemy.hitUntil = now + 90;
    game.hitUntil = now + 115;
    tone(game, "hit");

    if (target.enemy.hp <= 0) {
      target.enemy.deadAt = now;
      game.score += headshot ? 175 : 100;
      game.killUntil = now + 240;
      game.banner = headshot ? "TIRO PERFEITO" : "ALVO ELIMINADO";
      game.bannerUntil = now + 650;
      tone(game, "kill");
    } else {
      game.score += headshot ? 35 : 15;
    }
  }

  if (game.ammo === 0) startReload(game, now + 120);
}

function moveWithCollision(entity: { x: number; y: number }, dx: number, dy: number, radius: number) {
  if (canOccupy(entity.x + dx, entity.y, radius)) entity.x += dx;
  if (canOccupy(entity.x, entity.y + dy, radius)) entity.y += dy;
}

function updateGame(game: Game, dt: number, now: number) {
  const player = game.player;
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

  const running = game.keys.has("ShiftLeft") || game.keys.has("ShiftRight");
  const speed = running ? 4.15 : 2.75;
  const dx = (Math.cos(player.angle) * forward + Math.cos(player.angle + Math.PI / 2) * strafe) * speed * dt;
  const dy = (Math.sin(player.angle) * forward + Math.sin(player.angle + Math.PI / 2) * strafe) * speed * dt;
  moveWithCollision(player, dx, dy, 0.23);

  if (inputLength > 0.05) {
    game.walkCycle += dt * (running ? 13 : 9);
    game.bob = Math.sin(game.walkCycle) * (running ? 1.4 : 0.85);
  } else {
    game.bob *= Math.pow(0.02, dt);
  }

  if (game.firing) fireWeapon(game, now);
  if (game.reloadUntil && now >= game.reloadUntil) finishReload(game);

  for (const enemy of game.enemies) {
    if (enemy.deadAt) continue;
    const ex = player.x - enemy.x;
    const ey = player.y - enemy.y;
    const distance = Math.max(0.001, Math.hypot(ex, ey));
    const seesPlayer = distance < 13 && hasLineOfSight(enemy.x, enemy.y, player.x, player.y);

    if (distance > 3.35 || !seesPlayer) {
      const directionX = ex / distance;
      const directionY = ey / distance;
      const strafeAmount = seesPlayer ? Math.sin(now * 0.0012 + enemy.phase) * 0.2 : 0;
      const enemyDx = (directionX - directionY * strafeAmount) * enemy.speed * dt;
      const enemyDy = (directionY + directionX * strafeAmount) * enemy.speed * dt;
      moveWithCollision(enemy, enemyDx, enemyDy, 0.28);
    }

    if (seesPlayer && distance < 10.5 && now >= enemy.attackAt) {
      const hitChance = clamp(0.86 - distance * 0.045, 0.36, 0.78);
      enemy.attackAt = now + Math.max(520, 1250 - game.wave * 34) + Math.random() * 550;
      if (Math.random() < hitChance) {
        const damage = Math.min(13, 4.2 + game.wave * 0.72);
        player.health = Math.max(0, player.health - damage);
        game.damageFlash = Math.min(1, game.damageFlash + 0.6);
        game.shake = Math.min(1, game.shake + 0.52);
        tone(game, "hurt");
      }
    }
  }

  game.enemies = game.enemies.filter((enemy) => !enemy.deadAt || now - enemy.deadAt < 620);
  const alive = game.enemies.reduce((total, enemy) => total + (enemy.deadAt ? 0 : 1), 0);

  if (alive === 0 && !game.nextWaveAt) {
    game.nextWaveAt = now + 2300;
    game.banner = "ÁREA LIMPA";
    game.bannerUntil = now + 1850;
    player.health = Math.min(100, player.health + 14);
    game.reserve = Math.min(240, game.reserve + 45);
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

  const bodyGradient = context.createLinearGradient(0.18, 0.25, 0.82, 0.7);
  bodyGradient.addColorStop(0, enemy.hitUntil > now ? "#fff4ca" : "#b84720");
  bodyGradient.addColorStop(0.48, enemy.hitUntil > now ? "#ffaf55" : "#69210f");
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

  context.shadowColor = "#ff4d19";
  context.shadowBlur = 0.1;
  context.fillStyle = enemy.hitUntil > now ? "#ffffff" : "#ff4d19";
  context.fillRect(0.32, 0.19, 0.36, 0.055);
  context.shadowBlur = 0;

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
  const swayX = Math.sin(game.walkCycle * 0.5) * 7 * scale;
  const swayY = Math.abs(Math.cos(game.walkCycle)) * 4 * scale;
  context.save();
  context.translate(
    width * 0.54 + swayX + (Math.random() - 0.5) * game.shake * 7,
    height + swayY + game.recoil * 33 * scale + reloadArc * 70 * scale,
  );
  context.rotate(-0.04 + reloadArc * 0.24);
  context.scale(scale, scale);

  context.fillStyle = "#252a2b";
  context.beginPath();
  context.moveTo(-31, -322);
  context.lineTo(17, -322);
  context.lineTo(35, -150);
  context.lineTo(-54, -148);
  context.closePath();
  context.fill();
  context.fillStyle = "#0b0e0f";
  context.fillRect(-22, -345, 30, 92);
  context.fillStyle = "#b94a22";
  context.fillRect(-24, -268, 35, 17);

  const receiver = context.createLinearGradient(-105, -210, 128, -62);
  receiver.addColorStop(0, "#3c4446");
  receiver.addColorStop(0.45, "#161b1c");
  receiver.addColorStop(1, "#07090a");
  context.fillStyle = receiver;
  context.beginPath();
  context.moveTo(-84, -218);
  context.lineTo(64, -220);
  context.lineTo(128, -94);
  context.lineTo(70, -45);
  context.lineTo(-68, -80);
  context.closePath();
  context.fill();
  context.strokeStyle = "#596164";
  context.lineWidth = 3;
  context.stroke();

  context.fillStyle = "#080a0b";
  context.beginPath();
  context.moveTo(-22, -88);
  context.lineTo(40, -80);
  context.lineTo(57, 9);
  context.lineTo(-5, 8);
  context.closePath();
  context.fill();
  context.fillStyle = "#c04d24";
  context.fillRect(-58, -184, 82, 10);
  context.fillStyle = "#111617";
  context.fillRect(-48, -239, 85, 22);
  context.fillStyle = "#ff6a2c";
  context.fillRect(-38, -234, 25, 4);

  context.fillStyle = "#1b2021";
  context.beginPath();
  context.moveTo(45, -92);
  context.lineTo(154, -50);
  context.lineTo(190, 22);
  context.lineTo(84, 5);
  context.closePath();
  context.fill();

  context.fillStyle = "#25201c";
  context.beginPath();
  context.ellipse(-69, -56, 50, 73, -0.35, 0, TAU);
  context.fill();
  context.fillStyle = "#101415";
  context.fillRect(-108, -89, 70, 15);

  if (game.muzzleUntil > now) {
    context.save();
    context.translate(-7, -348);
    context.shadowColor = "#ff7a21";
    context.shadowBlur = 28;
    context.fillStyle = "#fff3ad";
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

function renderScene(canvas: HTMLCanvasElement, game: Game, now: number) {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return;
  const width = canvas.width;
  const height = canvas.height;
  const scaleX = width / window.innerWidth;
  const scaleY = height / window.innerHeight;
  const shakeX = (Math.random() - 0.5) * game.shake * 11;
  const shakeY = (Math.random() - 0.5) * game.shake * 8;
  const horizon = height * 0.5 - game.player.pitch * height * 0.86 + game.bob * scaleY + shakeY;

  const sky = context.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#020608");
  sky.addColorStop(0.58, "#0b1518");
  sky.addColorStop(1, "#263338");
  context.fillStyle = sky;
  context.fillRect(0, 0, width, Math.max(0, horizon));

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
    const rayAngle = game.player.angle + camera * FOV;
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
    if (Math.abs(relative) > FOV * 0.68 || rawDistance < 0.25) continue;
    const corrected = Math.max(0.1, rawDistance * Math.cos(relative));
    const spriteUnit = (height * 0.76) / corrected;
    const spriteHeight = spriteUnit * 1.34;
    const spriteWidth = spriteUnit * 0.58;
    const centerX = width * (0.5 + relative / FOV) + shakeX;
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

  drawWeapon(context, width, height, game, now);

  const centerX = width / 2;
  const centerY = height / 2;
  const spread = (9 + game.recoil * 15) * Math.min(scaleX, scaleY);
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

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const lookPointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const [mode, setMode] = useState<GameMode>("menu");
  const [hud, setHud] = useState<Hud>(initialHud);
  const [muted, setMuted] = useState(false);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const [touchDevice, setTouchDevice] = useState(false);

  const syncHud = useCallback((game: Game, now: number) => {
    const reloadProgress = game.reloadUntil > now
      ? clamp((now - game.reloadStarted) / Math.max(1, game.reloadUntil - game.reloadStarted), 0, 1)
      : 0;
    setHud({
      health: Math.ceil(game.player.health),
      ammo: game.ammo,
      reserve: game.reserve,
      score: game.score,
      wave: game.wave,
      enemies: game.enemies.filter((enemy) => !enemy.deadAt).length,
      reloading: game.reloadUntil > now,
      reloadProgress,
      banner: game.bannerUntil > now ? game.banner : "",
      best: game.best,
    });
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
    setHud((current) => ({ ...current, best: game.best }));
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
      if (event.code === "Enter" && (game.mode === "menu" || game.mode === "gameover")) start();
      if (event.code === "Escape" && game.mode === "playing" && !document.pointerLockElement) pause();
    };
    const onKeyUp = (event: KeyboardEvent) => game.keys.delete(event.code);
    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== canvas || game.mode !== "playing") return;
      game.player.angle = normalizeAngle(game.player.angle + event.movementX * 0.00225);
      game.player.pitch = clamp(game.player.pitch + event.movementY * 0.00155, -0.3, 0.3);
    };
    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 || game.mode !== "playing") return;
      if (document.pointerLockElement === canvas) game.firing = true;
    };
    const onMouseUp = (event: MouseEvent) => {
      if (event.button === 0) game.firing = false;
    };
    const onPointerLock = () => {
      if (!document.pointerLockElement && game.mode === "playing" && window.matchMedia("(pointer: fine)").matches) {
        game.mode = "paused";
        game.firing = false;
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
    game.player.angle = normalizeAngle(game.player.angle + (event.clientX - look.x) * 0.0062);
    game.player.pitch = clamp(game.player.pitch + (event.clientY - look.y) * 0.004, -0.3, 0.3);
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
    if (gameRef.current) gameRef.current.firing = false;
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

        <section className="hud-cluster ammo-cluster" aria-label={`${hud.ammo} munições no pente e ${hud.reserve} reservas`}>
          <span className="hud-label">NVR–7</span>
          <div className="ammo-readout">
            <strong className={hud.ammo <= 6 ? "low" : ""}>{String(hud.ammo).padStart(2, "0")}</strong>
            <span>/ {hud.reserve}</span>
          </div>
        </section>

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
            <p>PROTOCOLO DE SOBREVIVÊNCIA // 01</p>
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
            <div><kbd>R</kbd><span>RECARREGAR</span></div>
          </div>
          <div className="touch-instructions controls-grid">
            <div><kbd>◉</kbd><span>MOVER</span></div>
            <div><kbd>ARRASTE</kbd><span>MIRAR</span></div>
            <div><kbd>ALVO</kbd><span>ATIRAR</span></div>
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
          <p className="pause-tip">ESC pausa • R recarrega • SHIFT corre</p>
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
