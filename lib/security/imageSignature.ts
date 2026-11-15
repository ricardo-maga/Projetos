export type AllowedImageType = 'image/png' | 'image/jpeg' | 'image/webp';

export function hasImageSignature(bytes: Uint8Array, type: string): type is AllowedImageType {
  if (type === 'image/png') return bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (type === 'image/jpeg') return bytes.length >= 3 &&
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/webp') return bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  return false;
}
