export const MAX_TEMPLATES_PER_WORKSPACE = 50;
export const MAX_FIELDS_PER_TEMPLATE = 20;

export type TemplateStage = 'dispatch' | 'receipt';

export type TemplateFieldType = 'text' | 'number' | 'date';

export type TemplateField = { name: string; nameKey: string; valueType: TemplateFieldType; unit: string | null; required: boolean };

export type DocumentTemplate = {
  id: string;
  name: string;
  kind: string;
  issuerName: string | null;
  description: string;
  stage: TemplateStage | null;
  revision: number;
  updatedAt: Date;
  fields: TemplateField[];
};
