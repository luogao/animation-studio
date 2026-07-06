// ============================================================
// gifEncoder.ts — 最小 GIF89a 动画编码器
//
// 支持：
// - 全局调色板（最多 256 色，中位切分量化）
// - 多帧动画（每帧独立 Graphic Control Extension）
// - LZW 可变长编码（min 2 → max 12 bits）
// - Netscape 2.0 循环扩展
// ============================================================

export interface GifFrame {
  data: ImageData;
  delayCs: number; // 延迟，百分之一秒
}

// ------------------------------------------------------------
// 颜色量化：中位切分（median cut）
// ------------------------------------------------------------

interface ColorBox {
  pixels: Array<[number, number, number]>;
  rRange: [number, number];
  gRange: [number, number];
  bRange: [number, number];
}

function medianCut(
  pixels: Array<[number, number, number]>,
  maxColors: number
): Array<[number, number, number]> {
  if (pixels.length === 0) return [[0, 0, 0]];

  const boxes: ColorBox[] = [
    {
      pixels,
      rRange: [0, 255],
      gRange: [0, 255],
      bRange: [0, 255],
    },
  ];

  while (boxes.length < maxColors) {
    // 找体积最大的盒子来切
    let bestIdx = 0;
    let bestVol = 0;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      const vol =
        (b.rRange[1] - b.rRange[0]) *
        (b.gRange[1] - b.gRange[0]) *
        (b.bRange[1] - b.bRange[0]);
      if (vol > bestVol && b.pixels.length > 1) {
        bestVol = vol;
        bestIdx = i;
      }
    }
    if (bestVol === 0) break;

    const box = boxes[bestIdx];
    // 沿最宽的通道排序
    const rW = box.rRange[1] - box.rRange[0];
    const gW = box.gRange[1] - box.gRange[0];
    const bW = box.bRange[1] - box.bRange[0];

    let channel: "0" | "1" | "2" = "0";
    if (gW >= rW && gW >= bW) channel = "1";
    if (bW >= rW && bW >= gW) channel = "2";

    box.pixels.sort((a, b) => a[Number(channel)] - b[Number(channel)]);

    const mid = Math.floor(box.pixels.length / 2);
    const left = box.pixels.slice(0, mid);
    const right = box.pixels.slice(mid);

    function range(p: Array<[number, number, number]>, c: number): [number, number] {
      let min = 255, max = 0;
      for (const px of p) {
        if (px[c] < min) min = px[c];
        if (px[c] > max) max = px[c];
      }
      return [min, max];
    }

    boxes[bestIdx] = {
      pixels: left,
      rRange: range(left, 0),
      gRange: range(left, 1),
      bRange: range(right, 2),
    };
    boxes.push({
      pixels: right,
      rRange: range(right, 0),
      gRange: range(right, 1),
      bRange: range(right, 2),
    });
  }

  // 每个盒子的平均色 → 调色板
  return boxes
    .filter((b) => b.pixels.length > 0)
    .map((b) => {
      let r = 0, g = 0, bl = 0;
      for (const px of b.pixels) {
        r += px[0];
        g += px[1];
        bl += px[2];
      }
      const n = b.pixels.length;
      return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)] as [
        number,
        number,
        number,
      ];
    });
}

// ------------------------------------------------------------
// LZW 编码
// ------------------------------------------------------------

function lzwEncode(data: Uint8Array, minCodeSize: number): Uint8Array {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let maxCode = 1 << codeSize;

  const dict = new Map<string, number>();
  for (let i = 0; i < clearCode; i++) {
    dict.set(String.fromCharCode(i), i);
  }
  dict.set("CLR", clearCode);
  dict.set("EOI", eoiCode);

  const output: number[] = [];
  const bitBuf: number[] = [];

  function writeCode(code: number): void {
    for (let i = 0; i < codeSize; i++) {
      bitBuf.push((code >> i) & 1);
    }
    while (bitBuf.length >= 8) {
      let byte = 0;
      for (let i = 0; i < 8; i++) byte |= (bitBuf.shift() ?? 0) << i;
      output.push(byte);
    }
    if (dict.size >= maxCode && codeSize < 12) {
      codeSize++;
      maxCode = 1 << codeSize;
    }
  }

  writeCode(clearCode);

  let w = "";
  for (let i = 0; i < data.length; i++) {
    const c = String.fromCharCode(data[i]);
    const wc = w + c;
    if (dict.has(wc)) {
      w = wc;
    } else {
      writeCode(dict.get(w)!);
      if (dict.size < 4096) dict.set(wc, dict.size);
      w = c;
    }
  }
  if (w !== "") writeCode(dict.get(w)!);
  writeCode(eoiCode);

  // flush remaining bits
  while (bitBuf.length > 0) {
    let byte = 0;
    for (let i = 0; i < 8; i++) byte |= (bitBuf.shift() ?? 0) << i;
    output.push(byte);
  }

  return new Uint8Array(output);
}

// ------------------------------------------------------------
// 字节写入工具
// ------------------------------------------------------------

class ByteWriter {
  private chunks: Uint8Array[] = [];

  u8(v: number): void {
    this.chunks.push(new Uint8Array([v & 0xff]));
  }

  u16(v: number): void {
    this.chunks.push(new Uint8Array([v & 0xff, (v >> 8) & 0xff]));
  }

  bytes(b: Uint8Array): void {
    this.chunks.push(b);
  }

  build(): Uint8Array {
    const total = this.chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of this.chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }
}

// ------------------------------------------------------------
// 主入口：多帧 GIF 编码
// ------------------------------------------------------------

export function encodeGif(
  frames: GifFrame[],
  width: number,
  height: number
): Uint8Array {
  if (frames.length === 0) throw new Error("no frames");

  // 1. 收集所有像素用于量化调色板
  const samplePixels: Array<[number, number, number]> = [];
  for (const frame of frames) {
    const d = frame.data.data;
    // 采样（每 4 像素取 1，减少计算量）
    for (let i = 0; i < d.length; i += 16) {
      samplePixels.push([d[i], d[i + 1], d[i + 2]]);
    }
  }

  // 去重
  const seen = new Set<string>();
  const unique: Array<[number, number, number]> = [];
  for (const p of samplePixels) {
    const k = `${p[0]},${p[1]},${p[2]}`;
    if (!seen.has(k)) {
      seen.add(k);
      unique.push(p);
    }
  }

  const palette =
    unique.length <= 256
      ? unique
      : medianCut(unique, 256);

  // 补齐到 256 色（不足时填黑）
  while (palette.length < 256) {
    palette.push([0, 0, 0]);
  }

  // 建立颜色 → 索引映射
  const colorToIdx = new Map<string, number>();
  for (let i = 0; i < palette.length; i++) {
    colorToIdx.set(`${palette[i][0]},${palette[i][1]},${palette[i][2]}`, i);
  }

  function nearestColor(r: number, g: number, b: number): number {
    const k = `${r},${g},${b}`;
    const exact = colorToIdx.get(k);
    if (exact !== undefined) return exact;

    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const dr = r - palette[i][0];
      const dg = g - palette[i][1];
      const db = b - palette[i][2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
        if (dist === 0) break;
      }
    }
    return best;
  }

  const w = new ByteWriter();

  // ── Header ──
  w.bytes(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])); // GIF89a

  // ── Logical Screen Descriptor ──
  w.u16(width);
  w.u16(height);
  // Packed: global color table flag=1, color res=7, sort=0, size=256
  w.u8(0xf7); // 1_111_0_111 → 256 colors (2^(7+1) = 256)
  w.u8(0); // background color index
  w.u8(0); // pixel aspect ratio

  // ── Global Color Table ──
  for (const [r, g, b] of palette) {
    w.u8(r);
    w.u8(g);
    w.u8(b);
  }

  // ── Netscape Extension (loop) ──
  w.u8(0x21); // extension introducer
  w.u8(0xff); // application extension
  w.u8(11); // block size
  w.bytes(
    new Uint8Array([
      0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30,
    ])
  ); // "NETSCAPE2.0"
  w.u8(3); // sub-block size
  w.u8(1); // sub-block data
  w.u16(0); // loop count (0 = infinite)
  w.u8(0); // block terminator

  // ── Frames ──
  for (const frame of frames) {
    const d = frame.data.data;

    // Graphic Control Extension
    w.u8(0x21); // extension introducer
    w.u8(0xf9); // graphic control label
    w.u8(4); // block size
    w.u8(0x04); // disposal method (restore to background) | no transparency
    w.u16(frame.delayCs); // delay time
    w.u8(0); // transparent color index
    w.u8(0); // block terminator

    // Image Descriptor
    w.u8(0x2c); // image separator
    w.u16(0); // left
    w.u16(0); // top
    w.u16(width);
    w.u16(height);
    w.u8(0); // no local color table

    // Image Data (LZW compressed)
    const indices = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const off = i * 4;
      indices[i] = nearestColor(d[off], d[off + 1], d[off + 2]);
    }

    const minCodeSize = 8;
    const lzwData = lzwEncode(indices, minCodeSize);
    w.u8(minCodeSize);

    // Write LZW data in 255-byte sub-blocks
    for (let i = 0; i < lzwData.length; i += 255) {
      const chunk = lzwData.slice(i, Math.min(i + 255, lzwData.length));
      w.u8(chunk.length);
      w.bytes(chunk);
    }
    w.u8(0); // block terminator
  }

  // ── Trailer ──
  w.u8(0x3b);

  return w.build();
}
