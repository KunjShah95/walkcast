const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const cookies = new Map();
function header() {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
async function get(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", Cookie: header() },
  });
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const c of raw) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    if (i > 0) cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
  return res;
}
await get("https://trends.google.com/trends/");
const req = {
  comparisonItem: [
    { keyword: "website walkthrough video", geo: "", time: "today 12-m" },
    { keyword: "product demo video", geo: "", time: "today 12-m" },
  ],
  category: 0,
  property: "",
};
const res = await get(
  `https://trends.google.com/trends/api/explore?hl=en-US&tz=-480&req=${encodeURIComponent(JSON.stringify(req))}`,
);
console.log("explore status", res.status);
const text = await res.text();
const json = JSON.parse(text.slice(text.indexOf("{")));
console.log("widgets:", json.widgets.map((w) => ({ id: w.id, token: !!w.token })));
const ts = json.widgets.find((w) => w.id === "TIMESERIES");
console.log("TIMESERIES keys:", Object.keys(ts));
console.log("TIMESERIES.request:", JSON.stringify(ts.request));
console.log("token:", ts.token);

for (const candidate of [
  ts.request,
  { ...ts.request, token: ts.token },
]) {
  const url = `https://trends.google.com/trends/api/widgetdata/multiline?hl=en-US&tz=-480&req=${encodeURIComponent(
    JSON.stringify(candidate),
  )}&token=${ts.token}`;
  const r = await get(url);
  console.log("multiline try:", r.status, (await r.text()).slice(0, 200));
}
