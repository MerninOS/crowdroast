import { customAlphabet } from "nanoid";

// 10 chars from a 36-char alphabet ≈ 51 bits of entropy. The alphabet excludes
// `_` and `-` so the link reads cleanly when typed in plain text channels
// (SMS, in-person), and excludes uppercase to avoid case-mismatch confusion
// when read aloud.
const INVITE_CODE_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
export const INVITE_CODE_LENGTH = 10;

const generate = customAlphabet(INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH);

export function generateInviteCode(): string {
  return generate();
}

export function isValidInviteCodeShape(code: string): boolean {
  if (code.length !== INVITE_CODE_LENGTH) return false;
  for (const ch of code) {
    if (!INVITE_CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}
