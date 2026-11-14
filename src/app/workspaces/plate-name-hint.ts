const TAI_XE_PREFIX = /^tài xế\s+/i;
const PLATE_PATTERN = /^\d{2}[A-Z]-?\d{3,4}\.?\d{2}$/;

export type DisplayNameClassification = { kind: 'plate'; plate: string } | { kind: 'person' };

export function buildPlateNameHint(displayName: string): string {
  const classification = classifyDisplayName(displayName);
  if (classification.kind === 'plate') return buildPlateHint(displayName, classification.plate);
  return buildPersonHint(displayName);
}

export function classifyDisplayName(displayName: string): DisplayNameClassification {
  const remainder = displayName.replace(TAI_XE_PREFIX, '');
  if (PLATE_PATTERN.test(remainder)) return { kind: 'plate', plate: remainder };
  return { kind: 'person' };
}

function buildPlateHint(displayName: string, plate: string): string {
  return `Tên "${displayName}" trông giống biển số xe. Khi tài xế đã vào nhóm, nhắn tôi: "Lưu cho ${displayName}: Biển số xe: ${plate}" để mọi giấy tờ của tài xế được lưu dưới biển số này.`;
}

function buildPersonHint(displayName: string): string {
  return `Khi tài xế đã vào nhóm, bạn có thể lưu biển số xe cho tài xế này. Ví dụ: "Lưu cho ${displayName}: Biển số xe: 93A-1234".`;
}
