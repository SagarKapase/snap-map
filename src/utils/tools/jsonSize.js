/**
 * Where the bytes in a JSON payload actually go.
 *
 * "The response is 400 KB" is not useful. "Three quarters of it is one array
 * of audit records nobody reads, and the key names alone are 40 KB" is
 * something you can act on. This walks the document once, costing every
 * subtree in the bytes it would take on the wire, and reports the worst
 * offenders with a share of the total.
 *
 * Key names are counted separately from values on purpose: in a deep list of
 * small records, the field names really can outweigh the data, and the fix
 * for that is a different fix.
 */

/** UTF-8 length without allocating a buffer for every string in the document. */
export const utf8Length = (text) => {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      // A surrogate pair is one character in four bytes.
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
};

const isContainer = (node) => node.kind === "object" || node.kind === "array";

/**
 * Cost a document.
 *
 * Returns the total in minified bytes, how that splits between key names,
 * values and punctuation, and the heaviest paths in order.
 */
export const profileJson = (root, { top = 24 } = {}) => {
  if (!root) return null;

  const entries = [];
  let keyBytes = 0;
  let valueBytes = 0;
  let structureBytes = 0;
  let strings = 0;
  let numbers = 0;

  /** Bytes for this node and everything under it, recorded on the way back up. */
  const cost = (node, path, depth) => {
    if (node.kind === "object") {
      // Braces, and a comma between each pair.
      let bytes = 2 + Math.max(0, node.members.length - 1);
      structureBytes += 2 + Math.max(0, node.members.length - 1);
      node.members.forEach((member) => {
        const keySize = utf8Length(member.key.out);
        keyBytes += keySize;
        structureBytes += 1; // the colon
        bytes += keySize + 1 + cost(member.value, `${path}.${member.key.value}`, depth + 1);
      });
      entries.push({ path, bytes, kind: "object", count: node.members.length, depth });
      return bytes;
    }

    if (node.kind === "array") {
      let bytes = 2 + Math.max(0, node.items.length - 1);
      structureBytes += 2 + Math.max(0, node.items.length - 1);
      node.items.forEach((item, index) => {
        bytes += cost(item, `${path}[${index}]`, depth + 1);
      });
      entries.push({ path, bytes, kind: "array", count: node.items.length, depth });
      return bytes;
    }

    const bytes = utf8Length(node.out);
    valueBytes += bytes;
    if (node.kind === "string") strings += 1;
    if (node.kind === "number") numbers += 1;
    // Only a scalar big enough to matter is worth listing on its own.
    if (bytes >= 256) entries.push({ path, bytes, kind: node.kind, count: 1, depth });
    return bytes;
  };

  const total = cost(root, "$", 0);

  const heaviest = entries
    .filter((entry) => entry.path !== "$")
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, top)
    .map((entry) => ({ ...entry, share: total ? entry.bytes / total : 0 }));

  return {
    bytes: total,
    keyBytes,
    valueBytes,
    structureBytes,
    strings,
    numbers,
    heaviest,
    // The one line that usually decides what to do next.
    keyShare: total ? keyBytes / total : 0,
  };
};

/**
 * Children of a path, costed — so the page can be walked into rather than
 * only showing a flat list of the worst offenders.
 */
export const breakdownOf = (node, path = "$") => {
  if (!node || !isContainer(node)) return [];
  const rows = [];
  const measure = (child) => profileJson(child)?.bytes ?? 0;

  if (node.kind === "object") {
    node.members.forEach((member) => {
      rows.push({
        path: `${path}.${member.key.value}`,
        label: member.key.value,
        bytes: utf8Length(member.key.out) + 1 + measure(member.value),
        kind: member.value.kind,
        node: member.value,
      });
    });
  } else {
    node.items.forEach((item, index) => {
      rows.push({ path: `${path}[${index}]`, label: `[${index}]`, bytes: measure(item), kind: item.kind, node: item });
    });
  }

  const total = rows.reduce((sum, row) => sum + row.bytes, 0) || 1;
  return rows.map((row) => ({ ...row, share: row.bytes / total })).sort((a, b) => b.bytes - a.bytes);
};

/**
 * What it would weigh gzipped, measured rather than guessed — the browser has
 * a real gzip in it. Resolves to null where it does not.
 */
export const gzipSize = async (text) => {
  try {
    if (typeof CompressionStream === "undefined") return null;
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
    const buffer = await new Response(stream).arrayBuffer();
    return buffer.byteLength;
  } catch {
    return null;
  }
};

/** A share as a percentage, without pretending to precision it does not have. */
export const asPercent = (share) => {
  const percent = share * 100;
  if (percent >= 10) return `${Math.round(percent)}%`;
  if (percent >= 1) return `${percent.toFixed(1)}%`;
  return percent > 0 ? "<1%" : "0%";
};
