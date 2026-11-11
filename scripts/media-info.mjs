// Dimensions of a JPEG (its SOF marker) and of an MP4 (ffprobe) for the submission checks.
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

/** { w, h, bytes } of a baseline / progressive JPEG, or null if it is not a JPEG */
export function jpegInfo(file) {
  const b = readFileSync(file);
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5), bytes: b.length };
    i += 2 + len;
  }
  return null;
}

/** { w, h, seconds, codec, bytes } of a video (ffprobe) */
export function videoInfo(file) {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,codec_name:format=duration', '-of', 'json', file], { encoding: 'utf8' }));
  const s = j.streams[0];
  return { w: s.width, h: s.height, codec: s.codec_name, seconds: Number(j.format.duration), bytes: statSync(file).size };
}

/** the external URLs of an HTML bundle (XML namespaces are not requests) */
const NAMESPACES = new Set(['http://www.w3.org/1999/xhtml', 'http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xlink', 'http://www.w3.org/1998/Math/MathML']);
export const externalUrls = (html) => [...new Set(html.match(/https?:\/\/[^\s"'`<>)\\]+/gi) ?? [])].filter((u) => !NAMESPACES.has(u));

/** strings of the other portals' SDKs; none may appear in a GameMonetize / Y8 bundle */
export const OTHER_SDKS = {
  crazygames: 'crazygames',
  gamedistribution: 'gamedistribution',
  gdsdk: 'gdsdk',
  gamepix: 'gamepix',
  playgama: 'playgama-bridge',
  gamemonetize: 'gamemonetize',
  y8: 'cdn.y8.com',
  googleads: 'googlesyndication',
  ima: 'imasdk',
};
