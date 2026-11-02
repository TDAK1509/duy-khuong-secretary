import type { FakeReader } from '../fakes/fake-reader.ts';

export function holdReaderUntilArrivals(reader: FakeReader, arrivals: number): void {
  let arrived = 0;
  let release: () => void = () => {};
  const everyoneArrived = new Promise<void>((resolve) => {
    release = resolve;
  });
  const readNow = reader.read.bind(reader);
  reader.read = async (request) => {
    arrived += 1;
    if (arrived >= arrivals) release();
    await everyoneArrived;
    return readNow(request);
  };
}
