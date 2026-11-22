// Tiny stack VM - two-pass validated interpreter (ISA v1, Node 22, TS-erasable).
// Lapis 1: pre-pass memindai TIAP alamat byte program -> tabel validasi per alamat
// (opcode dikenal? panjang immediate? immediate terpotong?). Lapis 2: loop eksekusi
// memakai tabel itu untuk trap 5/9 yang cepat, TAPI tetap memeriksa ulang semua
// kondisi dinamis saat eksekusi (underflow/overflow, bagi-nol, alamat memori, call
// depth, RET kosong, batas langkah, batas output). Pre-pass per alamat byte, bukan
// per instruksi berurutan: lompat ke tengah immediate tetap dieksekusi dari byte
// itu apa adanya, persis seperti VM referensi.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// [byte, imm, pops, pushes] tiap opcode ISA v1.
const OPS = [
  [0, 0, 0, 0], [1, 1, 0, 1], [2, 4, 0, 1], [3, 0, 1, 0], [4, 0, 1, 2],
  [5, 0, 2, 2], [6, 0, 2, 3], [7, 0, 3, 3],
  [16, 0, 2, 1], [17, 0, 2, 1], [18, 0, 2, 1], [19, 0, 2, 1], [20, 0, 2, 1],
  [21, 0, 2, 1], [22, 0, 2, 1], [23, 0, 1, 1], [24, 0, 2, 1], [25, 0, 2, 1],
  [26, 0, 2, 1], [27, 0, 1, 1], [28, 0, 2, 1], [29, 0, 2, 1], [30, 0, 2, 1],
  [32, 0, 2, 1], [33, 0, 2, 1], [34, 0, 2, 1],
  [48, 2, 0, 0], [49, 2, 1, 0], [50, 2, 1, 0], [51, 2, 0, 0], [52, 0, 0, 0],
  [64, 0, 1, 1], [65, 0, 2, 0],
  [80, 0, 1, 0], [81, 0, 1, 0], [82, 0, 0, 1], [83, 0, 1, 0],
];
const IMM = new Uint8Array(256), POPS = new Uint8Array(256), PUSH = new Uint8Array(256), KNOWN = new Uint8Array(256);
for (const [b, im, po, pu] of OPS) { IMM[b] = im; POPS[b] = po; PUSH[b] = pu; KNOWN[b] = 1; }

const enc = new TextEncoder();

// Batas eksekusi: langkah maksimum per program dan kapasitas buffer output.
const MAX_STEPS = 1000000;

function run(prog, input) {
  const n = prog.length;
  // Lapis 1 - validasi per alamat byte: 0 = opcode tak dikenal, 1..5 = imm+1 dan
  // muat sebelum ujung program, 6 = immediate terpotong (trap 9).
  const code = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const b = prog[i];
    if (!KNOWN[b]) continue;
    const im = IMM[b];
    code[i] = i + im >= n ? 6 : im + 1;
  }
  const D = new Int32Array(256);
  let sp = 0;
  const C = new Int32Array(64);
  let csp = 0;
  const M = new Int32Array(256);
  const out = new Uint8Array(65536);
  let olen = 0, inPos = 0, pc = 0, steps = 0;
  const fin = (exit) => [out.slice(0, olen), exit];
  for (;;) {
    if (steps === MAX_STEPS) return fin(10); // lapis 2: batas langkah
    if (pc < 0 || pc >= n) return fin(9); // lapis 2: pc di luar program
    const c = code[pc]; // lapis 1: tabel validasi
    if (c === 0) return fin(5); // opcode tak dikenal
    if (c === 6) return fin(9); // immediate terpotong
    const im = c - 1, nx = pc + 1 + im, op = prog[pc];
    steps++;
    if (sp < POPS[op]) return fin(2); // lapis 2: stack underflow
    if (sp - POPS[op] + PUSH[op] > 256) return fin(3); // lapis 2: overflow
    pc = nx;
    switch (op) {
      case 0: return fin(0);
      case 1: D[sp++] = (prog[nx - 1] << 24) >> 24; break;
      case 2: D[sp++] = prog[nx - 4] | (prog[nx - 3] << 8) | (prog[nx - 2] << 16) | (prog[nx - 1] << 24); break;
      case 3: sp--; break;
      case 4: D[sp] = D[sp - 1]; sp++; break;
      case 5: { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; break; }
      case 6: D[sp] = D[sp - 2]; sp++; break;
      case 7: { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; }
      case 23: D[sp - 1] = -D[sp - 1] | 0; break;
      case 27: D[sp - 1] = ~D[sp - 1]; break;
      case 48: case 49: case 50: {
        const rel = ((prog[nx - 2] | (prog[nx - 1] << 8)) << 16) >> 16;
        let take = true;
        if (op !== 48) { const v = D[--sp]; take = op === 49 ? v === 0 : v !== 0; }
        if (take) pc = nx + rel;
        break;
      }
      case 51:
        if (csp === 64) return fin(7);
        C[csp++] = nx;
        pc = prog[nx - 2] | (prog[nx - 1] << 8);
        break;
      case 52:
        if (csp === 0) return fin(8);
        pc = C[--csp];
        break;
      case 64: {
        const a = D[sp - 1];
        if (a < 0 || a >= 256) return fin(6);
        D[sp - 1] = M[a];
        break;
      }
      case 65: {
        const a = D[sp - 1], v = D[sp - 2];
        if (a < 0 || a >= 256) return fin(6);
        sp -= 2; M[a] = v;
        break;
      }
      case 80: {
        const s = enc.encode(String(D[sp - 1]));
        if (olen + s.length > 65536) return fin(11);
        sp--; out.set(s, olen); olen += s.length;
        break;
      }
      case 81:
        if (olen + 1 > 65536) return fin(11);
        out[olen++] = D[--sp] & 255;
        break;
      case 82: D[sp++] = inPos < input.length ? input[inPos++] : -1; break;
      case 83: return fin(D[--sp] & 255);
      default: {
        const b = D[sp - 1], a = D[sp - 2];
        let r;
        if (op === 16) r = (a + b) | 0;
        else if (op === 17) r = (a - b) | 0;
        else if (op === 18) r = Math.imul(a, b);
        else if (op === 19) { if (b === 0) return fin(4); r = a === -2147483648 && b === -1 ? a : (a / b) | 0; }
        else if (op === 20) { if (b === 0) return fin(4); r = b === -1 ? 0 : (a % b) | 0; }
        else if (op === 21) { if (b === 0) return fin(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; }
        else if (op === 22) { if (b === 0) return fin(4); r = ((a >>> 0) % (b >>> 0)) | 0; }
        else if (op === 24) r = a & b;
        else if (op === 25) r = a | b;
        else if (op === 26) r = a ^ b;
        else if (op === 28) r = a << (b & 31);
        else if (op === 29) r = a >> (b & 31);
        else if (op === 30) r = (a >>> (b & 31)) | 0;
        else if (op === 32) r = a === b ? 1 : 0;
        else if (op === 33) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp -= 2; D[sp++] = r;
      }
    }
  }
}

for (const id of readdirSync(I).sort()) {
  let prog, input;
  try { prog = readFileSync(join(I, id, 'program.bin')); } catch { continue; }
  try { input = readFileSync(join(I, id, 'input.bin')); } catch { input = Buffer.alloc(0); }
  const [stdout, exit] = run(prog, input);
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), stdout);
  writeFileSync(join(O, id, 'exit.txt'), exit + '\n');
}
