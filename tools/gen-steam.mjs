import { readFileSync, writeFileSync } from "node:fs";

const [nativeMethods, implemented, output] = process.argv.slice(2);
const done = new Set([...readFileSync(implemented, "utf8").matchAll(/^\s*(\w+)\s*:\s*function/gm)].map((match) => match[1]));
const pattern = /\[DllImport\(([^\]]*)\)\]\s*(?:\[[^\]]*\]\s*)*public static extern (\S+) (\w+)\(/g;

const entries = new Map();
for (const [, attribute, returnType, method] of readFileSync(nativeMethods, "utf8").matchAll(pattern)) {
  const entry = /EntryPoint\s*=\s*"(\w+)"/.exec(attribute)?.[1] ?? method;
  if (done.has(entry) || entries.has(entry)) continue;
  const value = returnType === "ulong" || returnType === "long" ? "0n" : "0";
  entries.set(entry, `  ${entry}: function () { Module.steamMissing("${entry}"); return ${value}; },`);
}

writeFileSync(output, `mergeInto(LibraryManager.library, {\n${[...entries.values()].join("\n")}\n});\n`);
console.log(`Steam layer: ${done.size} implemented, ${entries.size} logged as missing`);
