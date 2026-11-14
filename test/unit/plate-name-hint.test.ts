import { describe, expect, it } from 'vitest';
import { classifyDisplayName } from '../../src/app/workspaces/plate-name-hint.ts';

describe('classifyDisplayName', () => {
  it('recognises a plate-looking display name and strips the Tài xế prefix', () => {
    const result = classifyDisplayName('Tài xế 93C12346');

    expect(result).toEqual({ kind: 'plate', plate: '93C12346' });
  });

  it('classifies a person name with a Tài xế prefix as person', () => {
    const result = classifyDisplayName('Tài xế Toàn');

    expect(result).toEqual({ kind: 'person' });
  });
});
