import { describe, expect, it } from 'vitest';
import { readConfirmReply } from '../../../src/app/schedules/confirm-reply.ts';

describe('readConfirmReply', () => {
  it.each(['1', 'luu', 'Lưu', 'LƯU LỊCH', ' lưu   lịch. ', 'Lưu lịch!'])('reads %j as save', (text) => {
    expect(readConfirmReply(text)).toBe('save');
  });

  it.each(['2', 'huy', 'Hủy', 'hủy lịch', 'Hủy lịch.'])('reads %j as cancel', (text) => {
    expect(readConfirmReply(text)).toBe('cancel');
  });

  it.each(['3', 'chào', 'lưu lịch này giúp tôi', '', '11', '1 2'])('reads %j as neither', (text) => {
    expect(readConfirmReply(text)).toBeNull();
  });
});
