import { describePhotoStorageContract } from '../contracts/photo-storage-contract.ts';
import { FakePhotoStorage } from '../fakes/fake-photo-storage.ts';

describePhotoStorageContract('FakePhotoStorage', () => new FakePhotoStorage());
