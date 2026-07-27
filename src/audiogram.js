/**
 * Frequencies conventionally displayed on a diagnostic audiogram.
 * @type {readonly number[]}
 */
export const OCTAVE_FREQUENCIES = Object.freeze([
  125, 250, 500, 1000, 2000, 4000, 8000,
]);

/**
 * Hearing-loss classifications used by this package.
 *
 * These descriptive bands are for communication and screening summaries only;
 * they do not establish a diagnosis.
 */
export const LOSS_BANDS = Object.freeze([
  Object.freeze({ name: "Normal", min: -10, max: 25, color: "#e8f7f2" }),
  Object.freeze({ name: "Mild", min: 26, max: 40, color: "#f3f8df" }),
  Object.freeze({ name: "Moderate", min: 41, max: 55, color: "#fff4cc" }),
  Object.freeze({ name: "Mod-severe", min: 56, max: 70, color: "#ffe4bf" }),
  Object.freeze({ name: "Severe", min: 71, max: 90, color: "#ffd6cf" }),
  Object.freeze({ name: "Profound", min: 91, max: 120, color: "#efc8d4" }),
]);

const DEFAULTS = Object.freeze({
  width: 760,
  height: 560,
  minLevel: -10,
  maxLevel: 120,
  title: "Pure-tone audiogram",
  showLegend: true,
  showBands: true,
});

const NS = "http://www.w3.org/2000/svg";
const MARGIN = Object.freeze({ top: 58, right: 116, bottom: 66, left: 72 });
const EAR_STYLE = Object.freeze({
  right: Object.freeze({ color: "#d62f3f", label: "Right ear" }),
  left: Object.freeze({ color: "#1769aa", label: "Left ear" }),
});

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function escapeXML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizeOptions(options = {}) {
  const minLevel = number(options.minLevel, DEFAULTS.minLevel);
  const maxLevel = Math.max(minLevel + 10, number(options.maxLevel, DEFAULTS.maxLevel));
  return {
    ...DEFAULTS,
    ...options,
    width: Math.max(420, number(options.width, DEFAULTS.width)),
    height: Math.max(360, number(options.height, DEFAULTS.height)),
    minLevel,
    maxLevel,
    title: options.title == null ? DEFAULTS.title : String(options.title),
  };
}

function plotGeometry(options) {
  return {
    left: MARGIN.left,
    top: MARGIN.top,
    width: options.width - MARGIN.left - MARGIN.right,
    height: options.height - MARGIN.top - MARGIN.bottom,
  };
}

function xForFrequency(freq, plot) {
  const octaves = Math.log2(freq / OCTAVE_FREQUENCIES[0]);
  return plot.left + (octaves / (OCTAVE_FREQUENCIES.length - 1)) * plot.width;
}

function yForLevel(level, plot, options) {
  return (
    plot.top +
    ((level - options.minLevel) / (options.maxLevel - options.minLevel)) *
      plot.height
  );
}

function isPoint(point) {
  const freq = Number(point?.freq);
  const level = Number(point?.level);
  return (
    Number.isFinite(freq) &&
    Number.isFinite(level) &&
    freq >= OCTAVE_FREQUENCIES[0] &&
    freq <= OCTAVE_FREQUENCIES.at(-1)
  );
}

function pointsFor(data, ear, conduction) {
  const points = data?.[ear]?.[conduction];
  if (!Array.isArray(points)) return [];
  return points
    .filter(isPoint)
    .map((point) => ({
      freq: Number(point.freq),
      level: Number(point.level),
      masked: Boolean(point.masked),
      noResponse: Boolean(point.noResponse),
    }))
    .sort((a, b) => a.freq - b.freq);
}

function markerMarkup(ear, conduction, point, x, y) {
  const color = EAR_STYLE[ear].color;
  const masked = point.masked;
  const common = `class="oa-marker" fill="white" stroke="${color}" stroke-width="3" vector-effect="non-scaling-stroke"`;
  let marker;

  if (conduction === "bone") {
    const direction = ear === "right" ? -1 : 1;
    const a = x + direction * 8;
    const b = x - direction * 5;
    marker = `<polyline ${common} fill="none" points="${a},${y - 9} ${b},${y} ${a},${y + 9}"/>`;
  } else if (masked && ear === "right") {
    marker = `<polygon ${common} points="${x},${y - 10} ${x - 10},${y + 8} ${x + 10},${y + 8}"/>`;
  } else if (masked) {
    marker = `<rect ${common} x="${x - 8}" y="${y - 8}" width="16" height="16"/>`;
  } else if (ear === "right") {
    marker = `<circle ${common} cx="${x}" cy="${y}" r="8"/>`;
  } else {
    marker = `<path class="oa-marker" d="M ${x - 8} ${y - 8} L ${x + 8} ${y + 8} M ${x + 8} ${y - 8} L ${x - 8} ${y + 8}" fill="none" stroke="${color}" stroke-width="3" vector-effect="non-scaling-stroke"/>`;
  }

  const arrow = point.noResponse
    ? `<path class="oa-no-response" d="M ${x + 9} ${y + 8} L ${x + 20} ${y + 19} M ${x + 20} ${y + 19} L ${x + 12} ${y + 18} M ${x + 20} ${y + 19} L ${x + 19} ${y + 11}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`
    : "";

  return `${marker}${arrow}`;
}

function lineMarkup(ear, conduction, points, plot, options) {
  if (points.length < 2) return "";
  const color = EAR_STYLE[ear].color;
  const dash = conduction === "bone" ? ' stroke-dasharray="5 5"' : "";
  const coordinates = points
    .map(
      (point) =>
        `${xForFrequency(point.freq, plot).toFixed(2)},${yForLevel(
          point.level,
          plot,
          options,
        ).toFixed(2)}`,
    )
    .join(" ");
  return `<polyline class="oa-threshold-line oa-${ear}-${conduction}" points="${coordinates}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"${dash}/>`;
}

function bandMarkup(plot, options) {
  if (!options.showBands) return "";
  return LOSS_BANDS.map((band) => {
    const start = Math.max(options.minLevel, band.min);
    const end = Math.min(options.maxLevel, band.max);
    if (start > end) return "";
    const y = yForLevel(start, plot, options);
    const bottom = yForLevel(end, plot, options);
    return `<rect x="${plot.left}" y="${y.toFixed(2)}" width="${plot.width}" height="${Math.max(0, bottom - y).toFixed(2)}" fill="${band.color}"/>`;
  }).join("");
}

function gridMarkup(plot, options) {
  const horizontal = [];
  for (let level = Math.ceil(options.minLevel / 10) * 10; level <= options.maxLevel; level += 10) {
    const y = yForLevel(level, plot, options);
    horizontal.push(
      `<line x1="${plot.left}" y1="${y.toFixed(2)}" x2="${plot.left + plot.width}" y2="${y.toFixed(2)}" class="oa-grid"/>`,
      `<text x="${plot.left - 12}" y="${(y + 4).toFixed(2)}" class="oa-axis-label" text-anchor="end">${level}</text>`,
    );
  }

  const vertical = OCTAVE_FREQUENCIES.flatMap((freq) => {
    const x = xForFrequency(freq, plot);
    const label = freq >= 1000 ? `${freq / 1000}k` : String(freq);
    return [
      `<line x1="${x.toFixed(2)}" y1="${plot.top}" x2="${x.toFixed(2)}" y2="${plot.top + plot.height}" class="oa-grid"/>`,
      `<text x="${x.toFixed(2)}" y="${plot.top + plot.height + 25}" class="oa-axis-label" text-anchor="middle">${label}</text>`,
    ];
  });

  return [...horizontal, ...vertical].join("");
}

function legendMarkup(options) {
  if (!options.showLegend) return "";
  const x = options.width - MARGIN.right + 20;
  const entries = [
    ["#d62f3f", "O", "Right air"],
    ["#1769aa", "X", "Left air"],
    ["#d62f3f", "△", "Right masked"],
    ["#1769aa", "□", "Left masked"],
    ["#4b5563", "↘", "No response"],
  ];
  return entries
    .map(
      ([color, symbol, label], index) =>
        `<text x="${x}" y="${plotLegendY(index)}" fill="${color}" class="oa-legend-symbol">${symbol}</text><text x="${x + 26}" y="${plotLegendY(index)}" class="oa-legend-label">${label}</text>`,
    )
    .join("");
}

function plotLegendY(index) {
  return MARGIN.top + 18 + index * 27;
}

/**
 * Calculate the three-frequency pure-tone average for one ear.
 *
 * @param {Array<{freq:number, level:number}>|{air:Array<{freq:number, level:number}>}} ear
 *   Air-conduction points, or an ear object containing an `air` array.
 * @returns {number|null} Mean threshold at 500, 1000 and 2000 Hz, rounded to one
 *   decimal place. Returns `null` if any required frequency is absent.
 */
export function pureToneAverage(ear) {
  const points = Array.isArray(ear) ? ear : ear?.air;
  if (!Array.isArray(points)) return null;
  const levels = [500, 1000, 2000].map((freq) => {
    const point = points.find(
      (candidate) =>
        Number(candidate?.freq) === freq &&
        Number.isFinite(Number(candidate?.level)),
    );
    return point ? Number(point.level) : null;
  });
  if (levels.includes(null)) return null;
  return Math.round((levels.reduce((sum, level) => sum + level, 0) / 3) * 10) / 10;
}

/**
 * Classify a hearing level using the exported descriptive loss bands.
 *
 * @param {number|null|undefined} level Hearing level in dB HL.
 * @returns {string} Band name, or `"Unknown"` for a missing/non-numeric value.
 */
export function classifyLoss(level) {
  if (level === null || level === undefined || level === "") return "Unknown";
  const numeric = Number(level);
  if (!Number.isFinite(numeric)) return "Unknown";
  if (numeric <= 25) return "Normal";
  if (numeric <= 40) return "Mild";
  if (numeric <= 55) return "Moderate";
  if (numeric <= 70) return "Mod-severe";
  if (numeric <= 90) return "Severe";
  return "Profound";
}

/**
 * Create a standards-aware audiogram as an SVG string.
 *
 * The chart uses an octave/logarithmic frequency axis and an inverted dB HL
 * axis. Symbols follow common audiology conventions. Consumers remain
 * responsible for validating data and clinical use in their jurisdiction.
 *
 * @param {{right?: {air?: Array, bone?: Array}, left?: {air?: Array, bone?: Array}}} data
 * @param {{width?:number, height?:number, minLevel?:number, maxLevel?:number, title?:string, showLegend?:boolean, showBands?:boolean}} [options]
 * @returns {string} Complete, accessible SVG markup.
 */
export function audiogramSVG(data = {}, options = {}) {
  const settings = normalizeOptions(options);
  const plot = plotGeometry(settings);
  const series = [
    ["right", "air"],
    ["left", "air"],
    ["right", "bone"],
    ["left", "bone"],
  ];
  const normalized = new Map(
    series.map(([ear, conduction]) => [
      `${ear}:${conduction}`,
      pointsFor(data, ear, conduction),
    ]),
  );

  const lines = series
    .map(([ear, conduction]) =>
      lineMarkup(
        ear,
        conduction,
        normalized.get(`${ear}:${conduction}`),
        plot,
        settings,
      ),
    )
    .join("");

  const markers = series
    .flatMap(([ear, conduction]) =>
      normalized.get(`${ear}:${conduction}`).map((point) => {
        const x = xForFrequency(point.freq, plot);
        const y = yForLevel(point.level, plot, settings);
        const label = `${EAR_STYLE[ear].label}, ${conduction} conduction, ${point.freq} Hz, ${point.level} dB HL${point.masked ? ", masked" : ""}${point.noResponse ? ", no response" : ""}`;
        return `<g class="oa-point oa-${ear} oa-${conduction}" data-ear="${ear}" data-conduction="${conduction}" data-frequency="${point.freq}" data-level="${point.level}" role="img" aria-label="${escapeXML(label)}">${markerMarkup(ear, conduction, point, x, y)}</g>`;
      }),
    )
    .join("");

  const title = escapeXML(settings.title);
  return `<svg xmlns="${NS}" viewBox="0 0 ${settings.width} ${settings.height}" width="${settings.width}" height="${settings.height}" role="img" aria-labelledby="oa-title oa-description" class="open-audiogram">
  <title id="oa-title">${title}</title>
  <desc id="oa-description">Audiogram plotting frequency in hertz against hearing level in decibels HL.</desc>
  <style>
    .open-audiogram{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fff}
    .oa-grid{stroke:#8fa3ad;stroke-width:1;stroke-opacity:.42;shape-rendering:crispEdges}
    .oa-border{fill:none;stroke:#52656e;stroke-width:1.3}
    .oa-axis-label,.oa-legend-label{fill:#30454e;font-size:13px}
    .oa-axis-title{fill:#1d333c;font-size:14px;font-weight:650}
    .oa-chart-title{fill:#102f3a;font-size:19px;font-weight:700}
    .oa-legend-symbol{font-size:20px;font-weight:700}
    .oa-legend-label{font-size:12px}
    .oa-point{pointer-events:none}
  </style>
  <rect width="100%" height="100%" fill="white"/>
  <text id="oa-visible-title" x="${settings.width / 2}" y="29" text-anchor="middle" class="oa-chart-title">${title}</text>
  ${bandMarkup(plot, settings)}
  ${gridMarkup(plot, settings)}
  <rect x="${plot.left}" y="${plot.top}" width="${plot.width}" height="${plot.height}" class="oa-border"/>
  <text x="${plot.left + plot.width / 2}" y="${settings.height - 16}" text-anchor="middle" class="oa-axis-title">Frequency (Hz)</text>
  <text x="19" y="${plot.top + plot.height / 2}" text-anchor="middle" transform="rotate(-90 19 ${plot.top + plot.height / 2})" class="oa-axis-title">Hearing level (dB HL)</text>
  ${lines}
  ${markers}
  ${legendMarkup(settings)}
</svg>`;
}

/**
 * Render an audiogram into a browser DOM element.
 *
 * @param {Element|string} el Element or CSS selector.
 * @param {object} data Audiogram data.
 * @param {object} [options] Rendering options accepted by {@link audiogramSVG}.
 * @returns {Element} The target element.
 */
export function renderAudiogram(el, data, options) {
  if (typeof document === "undefined") {
    throw new Error("renderAudiogram() requires a browser DOM.");
  }
  const target = typeof el === "string" ? document.querySelector(el) : el;
  if (!target || typeof target.replaceChildren !== "function") {
    throw new TypeError("renderAudiogram() requires a valid DOM element or selector.");
  }
  const template = document.createElement("template");
  template.innerHTML = audiogramSVG(data, options).trim();
  target.replaceChildren(template.content.firstElementChild);
  return target;
}
