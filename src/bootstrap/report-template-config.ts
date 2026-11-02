const TEMPLATE_ID_NAME = 'ZALO_REPORT_READY_TEMPLATE_ID';

export type ReportTemplateConfig = { templateId: string };

export type ReportTemplateConfigResult = { ok: true; config: ReportTemplateConfig } | { ok: false; missing: string[] };

export function loadReportTemplateConfig(environment: NodeJS.ProcessEnv): ReportTemplateConfigResult {
  const templateId = environment[TEMPLATE_ID_NAME];
  return templateId ? { ok: true, config: { templateId } } : { ok: false, missing: [TEMPLATE_ID_NAME] };
}
