import type { ReaderRequest, ReaderService } from './reader-service.ts';

export function routeReadsByImage(photoReader: ReaderService, textReader: ReaderService): ReaderService {
  const pickReader = (request: ReaderRequest): ReaderService => (request.image === null ? textReader : photoReader);
  return {
    chooseModel: (request) => pickReader(request).chooseModel(request),
    read: (request) => pickReader(request).read(request),
  };
}
