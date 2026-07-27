import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { reportHTML } from "../src/index.js";

const data = {
  right: {
    air: [
      { freq: 250, level: 15 },
      { freq: 500, level: 20 },
      { freq: 1000, level: 25 },
      { freq: 2000, level: 30 },
      { freq: 4000, level: 40 },
      { freq: 8000, level: 45 },
    ],
  },
  left: {
    air: [
      { freq: 250, level: 10 },
      { freq: 500, level: 15 },
      { freq: 1000, level: 20 },
      { freq: 2000, level: 25 },
      { freq: 4000, level: 30 },
      { freq: 8000, level: 35 },
    ],
  },
};

const output = resolve("open-audiogram-report.html");
const html = reportHTML(data, {
  patientName: "Example patient",
  patientId: "OA-001",
  clinician: "Example clinician",
  clinic: "Community hearing program",
  notes: "Example data generated from Node.js.",
});

await writeFile(output, html, "utf8");
console.log(`Report written to ${output}`);
