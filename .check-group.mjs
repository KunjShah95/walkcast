import fs from "node:fs";
const h = fs.readFileSync("./dashboard/dist/index.html", "utf8");
const names = [
  "group-hover\\:opacity-100", "opacity-0", "group-focus-within\\:opacity-100",
  "pointer-events-none", "bottom-full", "group\\:relative",
];
for (const n of names) {
  const re = new RegExp("\\." + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?::[a-z-]+(?:\\([^)]*\\))?)?\\s*[,{]");
  const m = h.match(re);
  console.log(n.padEnd(30), m ? "FOUND " + JSON.stringify(m[0]) : "ABSENT");
}
const i = h.indexOf("group-hover");
while (i !== -1 && i < h.length) {
  const seg = h.slice(i - 30, i + 90);
  if (seg.includes("{")) { console.log("  ctx:", JSON.stringify(seg)); }
  const next = h.indexOf("group-hover", i + 1);
  if (next === i) break;
  i = next;
  if (i > 800000) break;
}
