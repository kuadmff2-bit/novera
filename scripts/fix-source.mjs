import { readFile, writeFile } from "node:fs/promises";

const file = new URL("../app/novera-game.tsx", import.meta.url);
let source = await readFile(file, "utf8");

const broken = "</button></div></div></div>}";
const fixed = "</button></div></div>}";

if (source.includes(broken)) {
  source = source.replace(broken, fixed);
  await writeFile(file, source);
  console.log("Fixed mobile controls JSX.");
} else if (source.includes(fixed)) {
  console.log("Mobile controls JSX already fixed.");
} else {
  throw new Error("Expected mobile controls JSX pattern was not found.");
}
