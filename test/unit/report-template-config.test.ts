import { describe, expect, it } from 'vitest';
import { loadReportTemplateConfig } from '../../src/bootstrap/report-template-config.ts';

describe('loadReportTemplateConfig', () => {
  it('names the template id when it is missing', () => {
    expect(loadReportTemplateConfig({})).toEqual({ ok: false, missing: ['ZALO_REPORT_READY_TEMPLATE_ID'] });
  });

  it('treats an empty template id as missing', () => {
    expect(loadReportTemplateConfig({ ZALO_REPORT_READY_TEMPLATE_ID: '' })).toEqual({
      ok: false,
      missing: ['ZALO_REPORT_READY_TEMPLATE_ID'],
    });
  });

  it('reads the template id', () => {
    expect(loadReportTemplateConfig({ ZALO_REPORT_READY_TEMPLATE_ID: 'tpl-1' })).toEqual({
      ok: true,
      config: { templateId: 'tpl-1' },
    });
  });
});
