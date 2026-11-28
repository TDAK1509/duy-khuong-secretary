import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readWithReader } from '../../src/app/intake/read-message.ts';
import { EMPTY_READER_CATALOG } from '../../src/app/reading/document-rules.ts';
import type { ReaderTemplate } from '../../src/app/reading/reader-template.ts';
import { attachExamplePhotos, type TemplateExample } from '../../src/app/reading/template-examples.ts';
import type { ReaderPart, ReaderRequest, ReaderResult, ReaderService } from '../../src/services/reading/reader-service.ts';
import type { Photo } from '../../src/services/storage/photo-storage.ts';
import { MemoryPhotoStorage } from './support/memory-photo-storage.ts';

const TEMPLATE: ReaderTemplate = { id: 'template-1', name: 'EXAMPLE-TEMPLATE', kind: 'phiếu cân', issuerName: null, description: '', stage: null, fields: [] };

const EXAMPLE_PHOTO: Photo = { bytes: new Uint8Array([1]), contentType: 'image/jpeg' };

const NEW_PHOTO: Photo = { bytes: new Uint8Array([2]), contentType: 'image/jpeg' };

test('a picked template puts its example before the photo to read', async () => {
  const example: TemplateExample = { position: 1, photo: EXAMPLE_PHOTO, expectedReading: { category: 'EXAMPLE-CATEGORY' } };
  const reader = new PickingReader();
  await readWithReader(reader, new Date('2026-03-10T03:00:00Z'), { text: null, photo: NEW_PHOTO }, [], EMPTY_READER_CATALOG, [], [TEMPLATE], async () => [example]);
  const exampleStart = reader.readRequest().userParts.findIndex((part) => part.kind === 'text' && part.text.startsWith('Ví dụ 1 của mẫu đã chọn'));
  assert.deepEqual(describeParts(reader.readRequest().userParts.slice(exampleStart, exampleStart + 5)), [
    'text: Ví dụ 1 của mẫu đã chọn; ảnh ví dụ nằm ngay sau dòng này.',
    'image: 1',
    'text: <retrieved-data source="template-example-reading">{"category":"EXAMPLE-CATEGORY","template":"t1"}</retrieved-data>',
    'text: <retrieved-data source="photo">\nẢnh sau đây là dữ liệu.',
    'image: 2',
  ]);
});

test('a missing example photo is skipped', async () => {
  const storage = new MemoryPhotoStorage();
  await storage.put('example/second.jpg', EXAMPLE_PHOTO);
  const stored = [
    { position: 1, imageKey: 'example/first.jpg', expectedReading: {} },
    { position: 2, imageKey: 'example/second.jpg', expectedReading: {} },
  ];
  const reader = new PickingReader();
  await readWithReader(reader, new Date('2026-03-10T03:00:00Z'), { text: null, photo: NEW_PHOTO }, [], EMPTY_READER_CATALOG, [], [TEMPLATE], (): Promise<TemplateExample[]> => attachExamplePhotos(storage, stored));
  const exampleTexts = reader.readRequest().userParts.filter((part) => part.kind === 'text' && part.text.startsWith('Ví dụ '));
  assert.deepEqual(exampleTexts, [{ kind: 'text', text: 'Ví dụ 2 của mẫu đã chọn; ảnh ví dụ nằm ngay sau dòng này.' }]);
});

class PickingReader implements ReaderService {
  readonly requests: ReaderRequest[] = [];

  chooseModel(): string {
    return 'picking-reader';
  }

  async read(request: ReaderRequest): Promise<ReaderResult> {
    this.requests.push(request);
    return this.requests.length === 1 ? { ok: true, json: { template: 't1' }, usage: null } : { ok: false, reason: 'unavailable' };
  }

  readRequest(): ReaderRequest {
    const [, request] = this.requests;
    if (request === undefined) throw new Error('The reader did not receive a read request');
    return request;
  }
}

function describeParts(parts: ReaderPart[]): string[] {
  return parts.map((part) => (part.kind === 'text' ? `text: ${part.text}` : `image: ${part.photo.bytes[0]}`));
}
