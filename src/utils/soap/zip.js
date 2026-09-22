/**
 * A store-only ZIP writer, so a scaffold of twenty files downloads as one.
 *
 * No compression: the archives are a few hundred kilobytes of source at
 * most, and a dependency-free writer is fifty lines. UTF-8 file names
 * (general-purpose bit 11), DOS timestamps, CRC-32 per entry.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const encoder = new TextEncoder();

const dosDateTime = (date) => {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date(2000, 0, 1);
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const day = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, day };
};

const u16 = (view, at, value) => view.setUint16(at, value & 0xffff, true);
const u32 = (view, at, value) => view.setUint32(at, value >>> 0, true);

const cleanPath = (path) => {
  const parts = [];
  String(path || "file")
    .replace(/\\/g, "/")
    .split("/")
    .forEach((segment) => {
      if (!segment || segment === ".") return;
      if (segment === "..") parts.pop();
      else parts.push(segment);
    });
  return parts.join("/") || "file";
};

/**
 * Build a ZIP from `[{ path, content }]`; `content` may be a string or a
 * Uint8Array. Returns a Uint8Array. Throws on an empty file list.
 */
export const createZip = (files, { date = new Date() } = {}) => {
  const list = (files || []).filter((f) => f && f.path);
  if (!list.length) throw new Error("Nothing to zip.");
  const seen = new Set();
  const entries = list.map((file) => {
    let name = cleanPath(file.path);
    let n = 2;
    while (seen.has(name)) name = name.replace(/(\.[^./]+)?$/, `-${n++}$1`);
    seen.add(name);
    const nameBytes = encoder.encode(name);
    const data = typeof file.content === "string" ? encoder.encode(file.content) : file.content instanceof Uint8Array ? file.content : encoder.encode(String(file.content ?? ""));
    return { nameBytes, data, crc: crc32(data) };
  });
  const { time, day } = dosDateTime(date);

  let size = 0;
  entries.forEach((e) => {
    size += 30 + e.nameBytes.length + e.data.length + 46 + e.nameBytes.length;
  });
  size += 22;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let at = 0;
  const offsets = [];

  entries.forEach((e) => {
    offsets.push(at);
    u32(view, at, 0x04034b50);
    u16(view, at + 4, 20);
    u16(view, at + 6, 0x0800);
    u16(view, at + 8, 0);
    u16(view, at + 10, time);
    u16(view, at + 12, day);
    u32(view, at + 14, e.crc);
    u32(view, at + 18, e.data.length);
    u32(view, at + 22, e.data.length);
    u16(view, at + 26, e.nameBytes.length);
    u16(view, at + 28, 0);
    out.set(e.nameBytes, at + 30);
    out.set(e.data, at + 30 + e.nameBytes.length);
    at += 30 + e.nameBytes.length + e.data.length;
  });

  const centralStart = at;
  entries.forEach((e, i) => {
    u32(view, at, 0x02014b50);
    u16(view, at + 4, 20);
    u16(view, at + 6, 20);
    u16(view, at + 8, 0x0800);
    u16(view, at + 10, 0);
    u16(view, at + 12, time);
    u16(view, at + 14, day);
    u32(view, at + 16, e.crc);
    u32(view, at + 20, e.data.length);
    u32(view, at + 24, e.data.length);
    u16(view, at + 28, e.nameBytes.length);
    u16(view, at + 30, 0);
    u16(view, at + 32, 0);
    u16(view, at + 34, 0);
    u16(view, at + 36, 0);
    u32(view, at + 38, 0);
    u32(view, at + 42, offsets[i]);
    out.set(e.nameBytes, at + 46);
    at += 46 + e.nameBytes.length;
  });
  const centralSize = at - centralStart;

  u32(view, at, 0x06054b50);
  u16(view, at + 4, 0);
  u16(view, at + 6, 0);
  u16(view, at + 8, entries.length);
  u16(view, at + 10, entries.length);
  u32(view, at + 12, centralSize);
  u32(view, at + 16, centralStart);
  u16(view, at + 20, 0);
  return out;
};

/** Read a store-only ZIP back into `[{ path, content }]` (used by the tests and the import path). */
export const readZip = (bytes) => {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const decoder = new TextDecoder();
  let end = -1;
  for (let i = data.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end === -1) throw new Error("Not a ZIP file.");
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error("Corrupt central directory.");
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    const path = decoder.decode(data.subarray(at + 46, at + 46 + nameLength));
    if (method !== 0) throw new Error(`${path} is compressed; only stored entries are read.`);
    const localName = view.getUint16(offset + 26, true);
    const localExtra = view.getUint16(offset + 28, true);
    const start = offset + 30 + localName + localExtra;
    files.push({ path, content: decoder.decode(data.subarray(start, start + size)) });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
};
