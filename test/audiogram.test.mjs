import assert from "node:assert/strict";
import test from "node:test";
import {
  ScreeningSession,
  audiogramSVG,
  classifyLoss,
  pureToneAverage,
  reportHTML,
} from "../src/index.js";

test("pureToneAverage calculates the three-frequency air PTA", () => {
  const ear = {
    air: [
      { freq: 250, level: 5 },
      { freq: 500, level: 20 },
      { freq: 1000, level: 25 },
      { freq: 2000, level: 35 },
      { freq: 4000, level: 60 },
    ],
  };
  assert.equal(pureToneAverage(ear), 26.7);
  assert.equal(pureToneAverage(ear.air), 26.7);
  assert.equal(pureToneAverage({ air: ear.air.slice(0, 3) }), null);
});

test("classifyLoss follows documented band boundaries", () => {
  assert.equal(classifyLoss(-10), "Normal");
  assert.equal(classifyLoss(25), "Normal");
  assert.equal(classifyLoss(26), "Mild");
  assert.equal(classifyLoss(40), "Mild");
  assert.equal(classifyLoss(41), "Moderate");
  assert.equal(classifyLoss(55), "Moderate");
  assert.equal(classifyLoss(56), "Mod-severe");
  assert.equal(classifyLoss(70), "Mod-severe");
  assert.equal(classifyLoss(71), "Severe");
  assert.equal(classifyLoss(90), "Severe");
  assert.equal(classifyLoss(91), "Profound");
  assert.equal(classifyLoss(null), "Unknown");
});

test("audiogramSVG returns valid-looking SVG with one marker group per point", () => {
  const data = {
    right: {
      air: [
        { freq: 500, level: 20 },
        { freq: 1000, level: 30, masked: true },
        { freq: 2000, level: 40, noResponse: true },
      ],
      bone: [{ freq: 1000, level: 15 }],
    },
    left: {
      air: [
        { freq: 500, level: 25 },
        { freq: 1000, level: 35 },
      ],
      bone: [{ freq: 2000, level: 20 }],
    },
  };
  const svg = audiogramSVG(data);
  const pointCount = Object.values(data).reduce(
    (count, ear) => count + ear.air.length + (ear.bone?.length ?? 0),
    0,
  );
  assert.match(svg, /^<svg\b/);
  assert.match(svg, /<\/svg>$/);
  assert.match(svg, /viewBox="0 0 760 560"/);
  assert.equal((svg.match(/class="oa-point /g) ?? []).length, pointCount);
  assert.equal((svg.match(/class="oa-no-response"/g) ?? []).length, 1);
});

test("audiogramSVG escapes titles and ignores malformed points", () => {
  const svg = audiogramSVG(
    { right: { air: [{ freq: "bad", level: 20 }] } },
    { title: '<unsafe & "title">' },
  );
  assert.match(svg, /&lt;unsafe &amp; &quot;title&quot;&gt;/);
  assert.equal((svg.match(/class="oa-point /g) ?? []).length, 0);
});

test("ScreeningSession finds the lowest level heard twice on ascent", async () => {
  const presentations = [];
  const session = new ScreeningSession({
    ears: ["right"],
    frequencies: [1000],
    startLevel: 30,
    onPresent: ({ ear, freq, level }) => {
      presentations.push({ ear, freq, level });
      return level >= 20;
    },
  });
  const result = await session.run();
  assert.deepEqual(result.right.air, [{ freq: 1000, level: 20 }]);
  assert.deepEqual(result.left.air, []);
  assert.equal(
    presentations.filter(({ level }) => level === 20).length,
    3,
  );
  assert.ok(presentations.some(({ level }) => level === 10));
  assert.ok(presentations.some(({ level }) => level === 15));
});

test("ScreeningSession marks no response at the configured maximum", async () => {
  const session = new ScreeningSession({
    ears: ["left"],
    frequencies: [2000],
    startLevel: 20,
    maxLevel: 40,
    onPresent: () => false,
  });
  const result = await session.run();
  assert.deepEqual(result.left.air, [
    { freq: 2000, level: 40, noResponse: true },
  ]);
});

test("reportHTML embeds the SVG, escaped metadata, summary, and print action", () => {
  const html = reportHTML(
    {
      right: {
        air: [
          { freq: 500, level: 20 },
          { freq: 1000, level: 25 },
          { freq: 2000, level: 30 },
        ],
      },
    },
    { patientName: "<Patient>", notes: "Follow up" },
  );
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<svg\b/);
  assert.match(html, /&lt;Patient&gt;/);
  assert.match(html, /25\.0 dB HL/);
  assert.match(html, /window\.print\(\)/);
});
