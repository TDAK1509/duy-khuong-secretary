import { isIP } from 'node:net';

const UNKNOWN_CLIENT_ADDRESS = 'unknown';

export function readClientAddress(connectingIpHeader: string | string[] | undefined): string {
  return typeof connectingIpHeader === 'string' && isIP(connectingIpHeader) !== 0 ? connectingIpHeader : UNKNOWN_CLIENT_ADDRESS;
}
