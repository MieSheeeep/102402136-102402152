'use strict';
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const groups = JSON.parse(fs.readFileSync(path.join(__dirname, 'collages.json'), 'utf8'));
const escape = value => value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
async function main() {
  const margin = 20, gap = 16, titleHeight = 58, labelHeight = 34;
  for (const group of groups) {
    const metadata = await Promise.all(group.screens.map(s => sharp(path.join(__dirname, 'screens', s.file)).metadata()));
    if (metadata.some(m => m.width !== 390 || m.height !== 844)) throw new Error('Unexpected screen dimensions: ' + group.title);
    const width = margin * 2 + metadata.reduce((n, m) => n + m.width, 0) + gap * (metadata.length - 1);
    const height = titleHeight + labelHeight + 844 + margin;
    let x = margin;
    const labels = [];
    const images = [];
    for (const screen of group.screens) {
      labels.push(`<text x="${x + 195}" y="${titleHeight + 22}" text-anchor="middle" font-size="17" fill="#303735">${escape(screen.name)}</text>`);
      images.push({ input: path.join(__dirname, 'screens', screen.file), left: x, top: titleHeight + labelHeight });
      x += 390 + gap;
    }
    const labelSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><g font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif"><text x="${margin}" y="36" font-size="25" font-weight="600" fill="#303735">${escape(group.title)}</text>${labels.join('')}</g></svg>`);
    await sharp({ create: { width, height, channels: 4, background: '#f0f1ed' } }).composite([{ input: labelSvg }, ...images]).png().toFile(path.join(__dirname, group.file));
    console.log(`${group.file}: ${group.screens.length} screens, ${width} x ${height}, no scaling`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
