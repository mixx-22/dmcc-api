import crypto from "crypto";

/**
 * Generate a secure random key/password.
 * Options:
 *  - length: total length of the result
 *  - uppercase, lowercase, numbers, symbols: booleans to include sets
 */
export const generateKey = ({
  length = 32,
  uppercase = true,
  lowercase = true,
  numbers = true,
  symbols = true,
} = {}) => {
  const sets = {
    uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    lowercase: "abcdefghijklmnopqrstuvwxyz",
    numbers: "0123456789",
    symbols: "!@#$%^&*()_+-=[]{}|;:,.<>?",
  };

  let pool = "";
  const required = [];

  if (uppercase) {
    pool += sets.uppercase;
    required.push(sets.uppercase);
  }
  if (lowercase) {
    pool += sets.lowercase;
    required.push(sets.lowercase);
  }
  if (numbers) {
    pool += sets.numbers;
    required.push(sets.numbers);
  }
  if (symbols) {
    pool += sets.symbols;
    required.push(sets.symbols);
  }

  if (!pool) {
    throw new Error("At least one character set must be enabled");
  }

  if (length < required.length) {
    throw new Error("Length too short for selected character sets");
  }

  // Use crypto.randomInt when available for uniform distribution
  const randomInt = (max) => {
    if (typeof crypto.randomInt === "function") return crypto.randomInt(0, max);
    // fallback: use randomBytes
    const rnd = crypto.randomBytes(4).readUInt32BE(0);
    return rnd % max;
  };

  const result = [];

  // Guarantee at least one char per enabled set
  for (const set of required) {
    result.push(set[randomInt(set.length)]);
  }

  // Fill remaining characters
  for (let i = result.length; i < length; i++) {
    result.push(pool[randomInt(pool.length)]);
  }

  // Fisher–Yates shuffle (unbiased)
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result.join("");
};
