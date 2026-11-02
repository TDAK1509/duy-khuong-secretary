import type { MaintenanceRule } from './schedule.ts';

type StoredRule = { maintenance_item: string; age_days: number };

export function toStoredRules(rules: MaintenanceRule[]): StoredRule[] {
  return rules.map((rule) => ({ maintenance_item: rule.maintenanceItem, age_days: rule.ageDays }));
}

export function readStoredRules(stored: StoredRule[]): MaintenanceRule[] {
  return stored.map((rule) => ({ maintenanceItem: rule.maintenance_item, ageDays: rule.age_days }));
}

export function formatRules(rules: MaintenanceRule[]): string {
  return rules.map((rule) => `${rule.maintenanceItem} sau ${rule.ageDays} ngày`).join('; ');
}
