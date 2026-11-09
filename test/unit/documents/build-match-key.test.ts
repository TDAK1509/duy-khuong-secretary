import { describe, expect, it } from 'vitest';
import { buildMatchKey } from '../../../src/app/documents/build-match-key.ts';

describe('buildMatchKey', () => {
  it('keeps only lowercase letters and digits, without accents', () => {
    const key = buildMatchKey('Công ty TNHH Cheng Loong Bình Dương Paper');

    expect(key).toBe('congtytnhhchengloongbinhduongpaper');
  });

  it('drops the dots, dashes and spaces of a printed name and turns đ into d', () => {
    expect(buildMatchKey('C.Ty CHẢNH-DƯƠNG Đồng 2')).toBe('ctychanhduongdong2');
  });
});
