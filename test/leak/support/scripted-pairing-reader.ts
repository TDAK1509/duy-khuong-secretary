import type { ReaderRequest, ReaderResult } from '../../../src/services/reading/reader-service.ts';
import { RecordingReader } from './recording-reader.ts';

export type ScriptedPair = { pickup: string; receipt: string };

export class ScriptedPairingReader extends RecordingReader {
  private readonly pairs: ScriptedPair[];

  constructor(pairs: ScriptedPair[]) {
    super();
    this.pairs = pairs;
  }

  override async read(request: ReaderRequest): Promise<ReaderResult> {
    await super.read(request);
    return { ok: true, json: { pairs: this.pairs.map((pair) => ({ ...pair, reason: 'scripted' })) }, usage: null };
  }
}
