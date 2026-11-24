import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// Indexed by opcode nibbles. Bits 4+ encode immediate width, then two bits each for pops and pushes.
const layout = [
  [0, 17, 65, 4, 6, 10, 11, 15],
  [9, 9, 9, 9, 9, 9, 9, 5, 9, 9, 9, 5, 9, 9, 9],
  [9, 9, 9],
  [32, 36, 36, 32, 0],
  [5, 8],
  [4, 4, 1, 4],
];

function run(p, input) {
  const s = new Int32Array(256);
  const m = new Int32Array(256);
  const calls = new Int32Array(64);
  const out = Buffer.allocUnsafe(65536);
  let sp = 0, cp = 0, pc = 0, ip = 0, n = 0;
  const done = code => [out.subarray(0, n), code];

  for (let step = 0; step < 1000000; step++) {
    if (pc < 0 || pc >= p.length) return done(9);
    const op = p[pc++];
    const meta = layout[op >> 4]?.[op & 15];
    if (meta === undefined) return done(5);
    const imm = meta >> 4;
    if (pc + imm > p.length) return done(9);
    const base = sp - ((meta >> 2) & 3);
    if (base < 0) return done(2);
    sp = base + (meta & 3);
    if (sp > s.length) return done(3);

    const a = s[base], b = s[base + 1];
    if (op >= 0x13 && op <= 0x16 && b === 0) return done(4);
    switch (op) {
      case 0x00: return done(0);
      case 0x01: s[base] = p.readInt8(pc++); break;
      case 0x02: s[base] = p.readInt32LE(pc); pc += 4; break;
      case 0x03: break;
      case 0x04: s[base + 1] = a; break;
      case 0x05: s[base] = b; s[base + 1] = a; break;
      case 0x06: s[base + 2] = a; break;
      case 0x07:
        s[base] = b;
        s[base + 1] = s[base + 2];
        s[base + 2] = a;
        break;
      case 0x10: s[base] = a + b; break;
      case 0x11: s[base] = a - b; break;
      case 0x12: s[base] = Math.imul(a, b); break;
      case 0x13: s[base] = a / b; break;
      case 0x14: s[base] = a % b; break;
      case 0x15: s[base] = (a >>> 0) / (b >>> 0); break;
      case 0x16: s[base] = (a >>> 0) % (b >>> 0); break;
      case 0x17: s[base] = -a; break;
      case 0x18: s[base] = a & b; break;
      case 0x19: s[base] = a | b; break;
      case 0x1a: s[base] = a ^ b; break;
      case 0x1b: s[base] = ~a; break;
      case 0x1c: s[base] = a << b; break;
      case 0x1d: s[base] = a >> b; break;
      case 0x1e: s[base] = a >>> b; break;
      case 0x20: s[base] = a === b; break;
      case 0x21: s[base] = a < b; break;
      case 0x22: s[base] = (a >>> 0) < (b >>> 0); break;
      case 0x30:
      case 0x31:
      case 0x32: {
        const rel = p.readInt16LE(pc);
        pc += 2;
        if (op === 0x30 || (op === 0x31 ? a === 0 : a !== 0)) pc += rel;
        break;
      }
      case 0x33:
        if (cp === calls.length) return done(7);
        calls[cp++] = pc + 2;
        pc = p.readUInt16LE(pc);
        break;
      case 0x34:
        if (cp === 0) return done(8);
        pc = calls[--cp];
        break;
      case 0x40:
        if ((a >>> 0) >= m.length) return done(6);
        s[base] = m[a];
        break;
      case 0x41:
        if ((b >>> 0) >= m.length) return done(6);
        m[b] = a;
        break;
      case 0x50: {
        const text = String(a);
        if (n + text.length > out.length) return done(11);
        n += out.write(text, n, 'ascii');
        break;
      }
      case 0x51:
        if (n === out.length) return done(11);
        out[n++] = a;
        break;
      case 0x52: s[base] = ip < input.length ? input[ip++] : -1; break;
      case 0x53: return done(a & 255);
    }
  }
  return done(10);
}

for (let i = 1; i <= 40; i++) {
  const id = 'i' + String(i).padStart(3, '0');
  const src = '/input/' + id;
  const dst = '/output/' + id;
  const [out, code] = run(readFileSync(src + '/program.bin'), readFileSync(src + '/input.bin'));
  mkdirSync(dst, { recursive: true });
  writeFileSync(dst + '/stdout.bin', out);
  writeFileSync(dst + '/exit.txt', String(code));
}
