import { refuseInvalidArgument } from './tool-result.ts';

const PLATE_REGEX = /^\d{2}[A-Z]\d{3,5}$/;

export function readPlateArgument(raw: string | null): string | null {
  if (raw === null) return null;
  const plate = normalizePlate(raw);
  if (!isVehiclePlate(plate)) refuseInvalidArgument('vehicle_plate');
  return plate;
}

export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[\s.-]/g, '');
}

export function isVehiclePlate(plate: string): boolean {
  return PLATE_REGEX.test(plate);
}
