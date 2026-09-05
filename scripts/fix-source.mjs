import { readFile, writeFile } from "node:fs/promises";

const file = new URL("../app/novera-game.tsx", import.meta.url);
let source = await readFile(file, "utf8");
let changed = false;

const brokenMobile = "</button></div></div></div>}";
const fixedMobile = "</button></div></div>}";
if (source.includes(brokenMobile)) {
  source = source.replace(brokenMobile, fixedMobile);
  changed = true;
}

if (!source.includes("const building = (")) {
  const helperAnchor = "  for (let i = 0; i < MAP_SIZE; i += 1) {";
  const helper = `  const building = (x1: number, y1: number, x2: number, y2: number, type: string, doors: Array<[number, number]> = []) => {\n    for (let x = x1; x <= x2; x += 1) { wall(x, y1, type); wall(x, y2, type); }\n    for (let y = y1; y <= y2; y += 1) { wall(x1, y, type); wall(x2, y, type); }\n    for (const [dx, dy] of doors) wall(dx, dy, \"0\");\n  };\n  const line = (x1: number, y1: number, x2: number, y2: number, type: string, openings: Array<[number, number]> = []) => {\n    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));\n    for (let i = 0; i <= steps; i += 1) {\n      const x = Math.round(x1 + (x2 - x1) * (i / Math.max(1, steps)));\n      const y = Math.round(y1 + (y2 - y1) * (i / Math.max(1, steps)));\n      wall(x, y, type);\n    }\n    for (const [ox, oy] of openings) wall(ox, oy, \"0\");\n  };\n\n`;
  if (!source.includes(helperAnchor)) throw new Error("City-map helper anchor not found.");
  source = source.replace(helperAnchor, helper + helperAnchor);
  changed = true;
}

const oldLayout = `  block(3, 3, 8, 9, "2");\n  block(11, 3, 17, 7, "3");\n  block(21, 3, 27, 8, "1");\n  block(31, 3, 36, 10, "2");\n  block(12, 9, 16, 10, "4");\n  block(3, 13, 8, 19, "1");\n  block(11, 12, 16, 17, "2");\n  block(3, 22, 8, 27, "3");\n  block(29, 13, 35, 18, "3");\n  block(31, 21, 36, 26, "1");\n  for (let y = 14; y <= 18; y += 1) wall(26, y, y % 2 ? "4" : "1");\n  block(3, 31, 9, 36, "2");\n  block(12, 27, 17, 35, "1");\n  block(22, 29, 27, 36, "3");\n  block(31, 30, 36, 36, "2");\n  block(20, 19, 21, 20, "4");\n  wall(18, 15, "4"); wall(23, 15, "4");\n  wall(18, 24, "4"); wall(24, 24, "4");\n  wall(10, 22, "4"); wall(10, 24, "4");\n  wall(28, 22, "4"); wall(28, 24, "4");\n  wall(19, 10, "4"); wall(20, 10, "4");\n  wall(24, 27, "4"); wall(25, 27, "4");\n  wall(9, 28, "4"); wall(30, 11, "4");`;

const newLayout = `  // CIDADE V2: construções ocas e utilizáveis.\n  // Bairro norte.\n  building(3, 3, 8, 9, "2", [[5, 9], [8, 6]]);\n  line(5, 4, 5, 8, "2", [[5, 6]]);\n  building(11, 3, 17, 7, "3", [[14, 7], [11, 5]]);\n  line(12, 5, 16, 5, "3", [[14, 5]]);\n  building(21, 3, 27, 8, "1", [[24, 8], [21, 5]]);\n  line(24, 4, 24, 7, "1", [[24, 6]]);\n  building(31, 3, 36, 10, "2", [[31, 6], [34, 10]]);\n  line(32, 7, 35, 7, "2", [[34, 7]]);\n  block(12, 9, 16, 10, "4");\n\n  // Centro: casas, corredores e entradas de flanco.\n  building(3, 13, 8, 19, "1", [[6, 19], [8, 16]]);\n  line(5, 14, 5, 18, "1", [[5, 16]]);\n  building(11, 12, 16, 17, "2", [[13, 17], [16, 14]]);\n  line(12, 14, 15, 14, "2", [[14, 14]]);\n  building(3, 22, 8, 27, "3", [[6, 22], [8, 25]]);\n  line(4, 25, 7, 25, "3", [[6, 25]]);\n  building(29, 13, 35, 18, "3", [[29, 16], [32, 18]]);\n  line(32, 14, 32, 17, "3", [[32, 16]]);\n  building(31, 21, 36, 26, "1", [[31, 23], [34, 26]]);\n  line(32, 23, 35, 23, "1", [[34, 23]]);\n\n  // Mercado central: fica logo à frente do spawn e pode ser atravessado.\n  building(18, 18, 24, 23, "3", [[21, 23], [18, 20], [24, 20]]);\n  line(21, 19, 21, 22, "3", [[21, 21]]);\n  line(19, 20, 23, 20, "3", [[21, 20]]);\n\n  for (let y = 14; y <= 17; y += 1) wall(26, y, y % 2 ? "4" : "1");\n\n  // Bairro sul.\n  building(3, 31, 9, 36, "2", [[6, 31], [9, 34]]);\n  line(6, 32, 6, 35, "2", [[6, 34]]);\n  building(12, 27, 17, 35, "1", [[14, 27], [17, 31]]);\n  line(13, 31, 16, 31, "1", [[15, 31]]);\n  building(22, 29, 27, 36, "3", [[24, 29], [27, 33]]);\n  line(23, 33, 26, 33, "3", [[25, 33]]);\n  building(31, 30, 36, 36, "2", [[31, 33], [34, 30]]);\n  line(32, 33, 35, 33, "2", [[34, 33]]);\n\n  // Caixas e coberturas táticas.\n  wall(18, 15, "4"); wall(23, 15, "4");\n  wall(18, 25, "4"); wall(24, 25, "4");\n  wall(10, 22, "4"); wall(10, 24, "4");\n  wall(28, 22, "4"); wall(28, 24, "4");\n  wall(19, 10, "4"); wall(20, 10, "4");\n  wall(24, 27, "4"); wall(25, 27, "4");\n  wall(9, 28, "4"); wall(30, 11, "4");`;

if (source.includes(oldLayout)) {
  source = source.replace(oldLayout, newLayout);
  changed = true;
}

const oldTerrain = `  h = Math.max(h, plateau(x, y, 17.7, 14.3, 25.3, 24.8, 0.34, 1.8));\n  if (x > 24 && y < 13) {\n    const east = smoothStep((x - 24) / 10);\n    const north = smoothStep((13 - y) / 8);\n    h = Math.max(h, 0.95 * east * north);\n  }\n  h = Math.max(h, plateau(x, y, 9.2, 8.3, 18.2, 11.8, 0.72, 2.6));\n  if (x < 12 && y > 24) {\n    const west = smoothStep((12 - x) / 9);\n    const south = smoothStep((y - 24) / 11);\n    h = Math.max(h, 0.62 * west * south);\n  }\n  h = Math.max(h, plateau(x, y, 27.5, 27.5, 37, 37, 0.46, 2.4));`;

const newTerrain = `  // Praça central elevada: subida começa perto do spawn.\n  h = Math.max(h, plateau(x, y, 17.4, 14.0, 25.6, 24.4, 2.05, 3.7));\n  // Bairro alto nordeste: ponto forte para sniper.\n  if (x > 24 && y < 13) {\n    const east = smoothStep((x - 24) / 10);\n    const north = smoothStep((13 - y) / 8);\n    h = Math.max(h, 2.65 * east * north);\n  }\n  // Avenida norte em aclive.\n  h = Math.max(h, plateau(x, y, 9.2, 8.3, 18.2, 11.8, 1.75, 3.3));\n  // Bairro sudoeste sobre aterro.\n  if (x < 12 && y > 24) {\n    const west = smoothStep((12 - x) / 9);\n    const south = smoothStep((y - 24) / 11);\n    h = Math.max(h, 1.55 * west * south);\n  }\n  // Quadras altas do sul.\n  h = Math.max(h, plateau(x, y, 27.5, 27.5, 37, 37, 1.65, 3.0));\n  // Passarela/rampa ao sul da praça.\n  h = Math.max(h, plateau(x, y, 18.5, 24.8, 26.5, 28.5, 1.35, 2.8));`;

if (source.includes(oldTerrain)) {
  source = source.replace(oldTerrain, newTerrain);
  changed = true;
}

const oldTerrainRender = `  for (let sy = Math.max(0, Math.floor(horizon + 16)); sy < height; sy += terrainStep) { const denom = Math.max(8, sy - horizon); const distance = clamp((height * 0.46) / denom, 0.5, 22); for (let sx = 0; sx < width; sx += terrainStep) { const camera = sx / width - 0.5; const rayAngle = game.player.angle + camera * currentFov; const wx = game.player.x + Math.cos(rayAngle) * distance; const wy = game.player.y + Math.sin(rayAngle) * distance; const t = terrainHeightAt(wx, wy); if (t > 0.06) { const alpha = clamp(t * 0.17, 0.025, 0.14); context.fillStyle = \`rgba(112,154,154,\${alpha})\`; context.fillRect(sx, sy, terrainStep + 1, terrainStep + 1); } } }`;

const newTerrainRender = `  for (let sy = Math.max(0, Math.floor(horizon + 16)); sy < height; sy += terrainStep) {\n    const denom = Math.max(8, sy - horizon);\n    const distance = clamp((height * 0.46) / denom, 0.5, 22);\n    for (let sx = 0; sx < width; sx += terrainStep) {\n      const camera = sx / width - 0.5;\n      const rayAngle = game.player.angle + camera * currentFov;\n      const wx = game.player.x + Math.cos(rayAngle) * distance;\n      const wy = game.player.y + Math.sin(rayAngle) * distance;\n      const t = terrainHeightAt(wx, wy);\n      const delta = t - localGround;\n      const drawY = sy - delta * height * 0.52 / Math.max(0.75, distance);\n      const tx = terrainHeightAt(wx + 0.34, wy);\n      const ty = terrainHeightAt(wx, wy + 0.34);\n      const edge = Math.max(Math.abs(tx - t), Math.abs(ty - t));\n      if (t > 0.03 || Math.abs(delta) > 0.04) {\n        const alpha = clamp(0.09 + t * 0.19 + Math.abs(delta) * 0.11, 0.09, 0.42);\n        context.fillStyle = delta >= 0 ? \`rgba(111,166,165,\${alpha})\` : \`rgba(43,53,54,\${alpha})\`;\n        context.fillRect(sx, drawY, terrainStep + 1, terrainStep + 1);\n      }\n      if (edge > 0.07) {\n        const face = clamp(edge * height * 0.30 / Math.max(0.8, distance), 2, terrainStep * 3.2);\n        context.fillStyle = \`rgba(18,24,25,\${clamp(0.22 + edge * 0.22, 0.22, 0.65)})\`;\n        context.fillRect(sx, drawY + terrainStep, terrainStep + 1, face);\n      }\n    }\n  }`;

if (source.includes(oldTerrainRender)) {
  source = source.replace(oldTerrainRender, newTerrainRender);
  changed = true;
}

if (source.includes('<aside className="minimap-panel"><div><span>CIDADE</span>')) {
  source = source.replace('<aside className="minimap-panel"><div><span>CIDADE</span>', '<aside className="minimap-panel"><div><span>CIDADE V2</span>');
  changed = true;
}

if (source.includes('FPS • PEQUENA CIDADE • ALTO/BAIXO')) {
  source = source.replace('FPS • PEQUENA CIDADE • ALTO/BAIXO', 'FPS • CIDADE V2 • INTERIORES + ELEVAÇÕES');
  changed = true;
}

if (!changed) {
  console.log("Novera City V2 patches already present.");
} else {
  await writeFile(file, source);
  console.log("Applied Novera City V2: usable interiors, open doors and strong elevations.");
}
