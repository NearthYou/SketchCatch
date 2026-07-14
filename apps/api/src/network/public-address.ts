import { isIP } from "node:net";

export function isPublicAddress(address: string, family: 4 | 6): boolean {
  if (isIP(address) !== family) return false;
  return family === 4 ? isPublicIpv4(address) : isPublicIpv6(address);
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  const [first = 0, second = 0, third = 0] = octets;
  if (first === 0 || first === 10 || first === 127 || first >= 224) return false;
  if (first === 100 && second >= 64 && second <= 127) return false;
  if (first === 169 && second === 254) return false;
  if (first === 172 && second >= 16 && second <= 31) return false;
  if (first === 192 && second === 168) return false;
  if (first === 192 && second === 0 && (third === 0 || third === 2)) return false;
  if (first === 192 && second === 88 && third === 99) return false;
  if (first === 198 && (second === 18 || second === 19)) return false;
  if (first === 198 && second === 51 && third === 100) return false;
  if (first === 203 && second === 0 && third === 113) return false;
  return true;
}

function isPublicIpv6(address: string): boolean {
  const value = parseIpv6(address);
  if (value === null || !isInIpv6Range(value, 0x2000n << 112n, 3)) return false;
  if (address.includes(".")) return false;
  if (isInIpv6Range(value, parseIpv6("2001::") ?? 0n, 23)) return false;
  if (isInIpv6Range(value, parseIpv6("2001::") ?? 0n, 32)) return false;
  if (isInIpv6Range(value, parseIpv6("2001:2::") ?? 0n, 48)) return false;
  if (isInIpv6Range(value, parseIpv6("2001:10::") ?? 0n, 28)) return false;
  if (isInIpv6Range(value, parseIpv6("2001:20::") ?? 0n, 28)) return false;
  if (isInIpv6Range(value, parseIpv6("2001:db8::") ?? 0n, 32)) return false;
  if (isInIpv6Range(value, parseIpv6("2002::") ?? 0n, 16)) return false;
  if (isInIpv6Range(value, parseIpv6("3f00::") ?? 0n, 8)) return false;
  if (isInIpv6Range(value, parseIpv6("3ffe::") ?? 0n, 16)) return false;
  if (isInIpv6Range(value, parseIpv6("3fff::") ?? 0n, 20)) return false;
  return true;
}

function parseIpv6(address: string): bigint | null {
  const embeddedIpv4 = /(?:^|:)(\d+\.\d+\.\d+\.\d+)$/.exec(address)?.[1];
  let normalized = address;
  if (embeddedIpv4) {
    if (isIP(embeddedIpv4) !== 4) return null;
    const octets = embeddedIpv4.split(".").map(Number);
    normalized = `${address.slice(0, -embeddedIpv4.length)}${(
      ((octets[0] ?? 0) << 8) |
      (octets[1] ?? 0)
    ).toString(16)}:${(((octets[2] ?? 0) << 8) | (octets[3] ?? 0)).toString(16)}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0]?.split(":").filter(Boolean) ?? [];
  const right = halves[1]?.split(":").filter(Boolean) ?? [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) {
    return null;
  }
  const groups = [...left, ...Array.from({ length: Math.max(0, missing) }, () => "0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-fA-F]{1,4}$/.test(group))) {
    return null;
  }
  return groups.reduce((value, group) => (value << 16n) | BigInt(`0x${group}`), 0n);
}

function isInIpv6Range(value: bigint, base: bigint, prefixLength: number): boolean {
  const shift = BigInt(128 - prefixLength);
  return value >> shift === base >> shift;
}
