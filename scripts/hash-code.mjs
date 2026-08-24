#!/usr/bin/env node
/**
 * Turn access codes into the SHA-256 hashes that VITE_ACCESS_CODE_HASHES wants.
 *
 *   npm run hash-code QRTX-8M2P
 *   npm run hash-code QRTX-8M2P KJ9D-LP4W
 *
 * Normalization here MUST match normalizeCode() in src/lib/accessCode.ts, or
 * codes configured from this output will never match what the app computes.
 */
import { createHash } from 'node:crypto';

/** Mirror of normalizeCode() in src/lib/accessCode.ts. */
function normalizeCode(raw) {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

function hashCode(raw) {
  return createHash('sha256').update(normalizeCode(raw)).digest('hex');
}

const codes = process.argv.slice(2);

if (codes.length === 0) {
  console.error('Usage: npm run hash-code <CODE> [CODE...]');
  console.error('Example: npm run hash-code QRTX-8M2P');
  process.exit(1);
}

for (const code of codes) {
  console.log(`${code}  ->  ${hashCode(code)}`);
}

if (codes.length > 1) {
  console.log('\nComma-separated, for VITE_ACCESS_CODE_HASHES:');
  console.log(codes.map(hashCode).join(','));
}
