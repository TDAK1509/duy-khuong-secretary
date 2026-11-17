const PLATE_REGEX = /^\d{2}[A-Z]\d{3,5}$/;

export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[\s.-]/g, '');
}

export function isVehiclePlate(plate: string): boolean {
  return PLATE_REGEX.test(plate);
}
