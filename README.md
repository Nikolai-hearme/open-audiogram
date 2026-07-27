# OpenAudiogram

[![CI](https://github.com/Nikolai-hearme/open-audiogram/actions/workflows/ci.yml/badge.svg)](https://github.com/Nikolai-hearme/open-audiogram/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-0f8d82.svg)](LICENSE)

OpenAudiogram is a zero-dependency JavaScript toolkit for hearing screening and
audiology interfaces:

- standards-aware audiogram rendering as accessible SVG;
- browser pure-tone screening with the Web Audio API;
- self-contained, printable clinic reports.

It runs in modern browsers and Node.js as native ES modules. The library has no
runtime dependencies, framework, transpiler, or build step.

> OpenAudiogram is for screening, education, and documentation. It is not a
> medical device, does not diagnose hearing loss, and is not a substitute for a
> calibrated clinical audiometer or evaluation by a qualified professional.

## Quick start

Install from GitHub:

```sh
npm install github:Nikolai-hearme/open-audiogram
```

Or import a checked-out copy directly:

```js
import {
  audiogramSVG,
  pureToneAverage,
  reportHTML,
} from "open-audiogram";

const data = {
  right: {
    air: [
      { freq: 500, level: 20 },
      { freq: 1000, level: 25 },
      { freq: 2000, level: 30 },
    ],
  },
  left: {
    air: [
      { freq: 500, level: 15 },
      { freq: 1000, level: 20 },
      { freq: 2000, level: 25 },
    ],
  },
};

document.querySelector("#chart").innerHTML = audiogramSVG(data);
console.log(pureToneAverage(data.right)); // 25
```

Run the included demo:

```sh
git clone https://github.com/Nikolai-hearme/open-audiogram.git
cd open-audiogram
npm run dev
```

Then open the local URL printed by `serve`.

## Data model

```ts
type Point = {
  freq: number;
  level: number;
  masked?: boolean;
  noResponse?: boolean;
};

type AudiogramData = {
  right?: { air?: Point[]; bone?: Point[] };
  left?: { air?: Point[]; bone?: Point[] };
};
```

The frequency axis is logarithmic by octave from 125 Hz to 8 kHz. The hearing
level axis is inverted from -10 dB HL to 120 dB HL. The renderer uses conventional
symbols:

| Measurement | Right ear | Left ear |
| --- | --- | --- |
| Air conduction | Red `O` | Blue `X` |
| Masked air | Red triangle | Blue square |
| Bone conduction | Red `<` | Blue `>` |

No-response points include a descending arrow.

## API

| Export | Description |
| --- | --- |
| `audiogramSVG(data, options)` | Return a complete SVG string. |
| `renderAudiogram(el, data, options)` | Render SVG into a DOM element or selector. |
| `pureToneAverage(ear)` | Mean 500/1000/2000 Hz air thresholds, or `null`. |
| `classifyLoss(level)` | Return the descriptive hearing-loss band. |
| `LOSS_BANDS` | Normal, Mild, Moderate, Mod-severe, Severe, and Profound bands. |
| `OCTAVE_FREQUENCIES` | The displayed 125–8000 Hz octave frequencies. |
| `TonePlayer` | Lazy Web Audio sine-tone player with ear panning and cosine ramps. |
| `ScreeningSession` | Modified Hughson–Westlake 10-down/5-up threshold procedure. |
| `reportHTML(data, meta)` | Return a self-contained printable HTML document. |
| `openReport(data, meta)` | Open a generated report in a browser tab. |
| `summariseEar(ear)` | Return PTA, loss classification, and point count. |

### Rendering options

`audiogramSVG` and `renderAudiogram` accept `width`, `height`, `minLevel`,
`maxLevel`, `title`, `showLegend`, and `showBands`.

### Screening

`ScreeningSession` receives an asynchronous presentation function. The callback
can play a tone, collect a button or keyboard response, and return whether the
listener heard it.

```js
import { ScreeningSession, TonePlayer } from "open-audiogram";

const player = new TonePlayer();
const session = new ScreeningSession({
  onPresent: async (presentation) => {
    await player.present(presentation);
    return askListenerIfHeard();
  },
});

const data = await session.run();
```

The default test order is 1000, 2000, 4000, 8000, 500, and 250 Hz for each ear.
The procedure descends 10 dB after a response and ascends 5 dB after no response.
A threshold is the lowest ascending level heard on at least two of three
presentations.

## Calibration and safe use

Web Audio exposes digital amplitude, not calibrated dB HL. `TonePlayer` includes
conservative per-frequency *approximation anchors* so the demo can be exercised,
but those values cannot account for a listener's computer, volume control,
headphone sensitivity, fit, ambient noise, or browser signal path.

For any real screening program:

1. lock the playback device, operating-system volume, browser, and headphones;
2. measure each frequency with appropriate acoustic instrumentation;
3. supply the measured dBFS-at-0-dB-HL anchors through the `calibration` option;
4. define referral rules, retest procedures, environmental controls, and maximum
   levels with a qualified audiologist;
5. validate the complete system and maintain calibration records.

Do not use consumer speakers or headphones to diagnose hearing loss. Stop a
presentation if it is uncomfortable.

## Reports and Node

Generate a report without a DOM:

```sh
node examples/node-report.mjs
```

This writes `open-audiogram-report.html` in the current directory. To build the
single-file browser demo:

```sh
node scripts/build-standalone.mjs
```

The result is `dist/standalone.html`, with the library modules and logo inlined.

## Development

```sh
npm test
npm run build:standalone
```

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening
a pull request. The open-core product and revenue plan is documented in
[docs/BUSINESS.md](docs/BUSINESS.md).

## Clinical and regulatory disclaimer

The classifications and PTA summaries in this package are descriptive helpers.
They are not clinical interpretations. Laws, standards, medical-device
definitions, accessibility obligations, consent requirements, and data-protection
rules vary by market and intended use. Marketing or configuring a product for
diagnosis, treatment decisions, or medical claims may trigger medical-device
regulation and quality-system obligations. Obtain independent clinical,
regulatory, security, and legal review before deployment.

## License

MIT © Nikolai Schramenko 2026. See [LICENSE](LICENSE).
