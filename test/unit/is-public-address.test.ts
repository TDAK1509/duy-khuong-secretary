import { describe, expect, it } from 'vitest';
import { isPublicAddress } from '../../src/providers/messaging/zalo-oa-channel.ts';

describe('isPublicAddress', () => {
  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '::',
    '::1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    'not an address',
  ])('refuses %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(['8.8.8.8', '113.161.0.1', '2001:4860:4860::8888', '::ffff:8.8.8.8'])('accepts %s', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });
});
