export function generateOrderId() {
  const timestamp = Date.now().toString(); // current time in ms
  const random = Math.random().toString(36).slice(2, 8); // 6-char base36 random

  // Combine and encode in base36 with some salt
  const base = `${timestamp}${random}`;
  
  // Convert to base36 and shuffle for obfuscation
  const shuffled = base
    .split('')
    .sort(() => 0.5 - Math.random())
    .join('');

  return `ORD-${Buffer.from(shuffled).toString('base64').slice(0, 16)}`;
}
