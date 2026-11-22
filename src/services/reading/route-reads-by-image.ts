import { hasImagePart, type ReaderRequest, type ReaderService } from './reader-service.ts';

export function routeReadsByImage(photoReader: ReaderService, textReader: ReaderService): ReaderService {
  const pickReader = (request: ReaderRequest): ReaderService => (hasImagePart(request) && request.useTextModel !== true ? photoReader : textReader);
  return {
    chooseModel: (request) => pickReader(request).chooseModel(request),
    read: (request) => pickReader(request).read(request),
  };
}
