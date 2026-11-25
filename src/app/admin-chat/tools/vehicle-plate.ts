import { ToolRefusal } from './tool-result.ts';

const PLATE_REGEX = /^\d{2}[A-Z]\d{3,5}$/;

export function readPlateArgument(raw: string | null): string | null {
  if (raw === null) return null;
  const plate = normalizePlate(raw);
  if (!isVehiclePlate(plate)) refuseInvalidPlate(raw);
  return plate;
}

export function refuseInvalidPlate(received: string): never {
  throw new ToolRefusal(`Biển số "${received}" chưa đúng dạng. Biển số gồm 2 số, 1 chữ cái rồi 3 đến 5 số, ví dụ 00X00001. Sửa biển số theo đúng dạng rồi gọi lại.`);
}

export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[\s.-]/g, '');
}

export function isVehiclePlate(plate: string): boolean {
  return PLATE_REGEX.test(plate);
}
