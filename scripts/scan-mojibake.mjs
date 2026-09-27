import fs from "node:fs";
import path from "node:path";

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx|js|jsx|json|md|html|css)$/.test(name)) acc.push(full);
  }
  return acc;
}

const roots = ["src", "docs", "public", "fixtures", "fixture", "seed"].map(
  (item) => path.resolve(process.cwd(), item),
);
const extra = ["README.md", "SECURITY.md"].map((item) =>
  path.resolve(process.cwd(), item),
);
const files = [
  ...roots.flatMap((dir) => walk(dir)),
  ...extra.filter((file) => fs.existsSync(file)),
];

const mojibake = /Ã.|Â.|�/;
const results = [];

for (const file of files) {
  const buffer = fs.readFileSync(file);
  const text = buffer.toString("utf8");
  const hasBom = buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
  const hangul = (text.match(/[\uAC00-\uD7A3]/g) || []).length;
  const hits = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (mojibake.test(line)) {
      hits.push({ line: index + 1, text: line.trim().slice(0, 180) });
    }
  });
  if (hits.length || hasBom) {
    results.push({
      file: path.relative(process.cwd(), file),
      hangul,
      hasBom,
      hits,
    });
  }
}

console.log(JSON.stringify({ scanned: files.length, results }, null, 2));
