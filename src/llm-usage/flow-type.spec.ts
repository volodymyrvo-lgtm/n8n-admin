import { describe, expect, it } from 'vitest';
import { FLOW_TYPE_OTHER, resolveFlowType } from './flow-type.js';

const KNOWN_FLOWS: ReadonlyArray<[string, string]> = [
  ['NEW_CRM_PPLEN_Email_Generation', 'new_email_generation'],
  ['NEWCRM_PPL_AZ/RU_EMAIL_Localization', 'email_localization'],
  ['NEWCRM_PPLEN_SMS_Generation', 'new_sms_generation'],
  ['NEWCRM_PPL_AZ/RU_SMS_Localization', 'sms_localization'],
  ['NEW_CRM_PPLEN_WEBPUSH_Generation', 'new_webpush_generation'],
  ['NEWCRM_PPL_AZ/RU_WEBPUSH_Localization', 'webpush_localization'],
  ['NEW_CRM_PPLEN_INAPP_Generation', 'new_inapp_generation'],
  ['NEWCRM_PPL_AZ/RU_INAPP_Localization', 'inapp_localization'],
  ['NEW_CRM_PPLEN_NC_Generation', 'new_nc_generation'],
  ['NEWCRM_PPL_AZ/RU_NC_Localization', 'nc_localization'],
];

describe('resolveFlowType', () => {
  it.each(KNOWN_FLOWS)('%s → %s', (flow, type) => {
    expect(resolveFlowType(flow)).toBe(type);
  });

  it('нові флоу за тією ж схемою визначаються за словами, незалежно від регістру', () => {
    expect(resolveFlowType('NEWCRM_PPLEN_sms_generation')).toBe('new_sms_generation');
    expect(resolveFlowType('NEWCRM_PPL_AZ/RU_EMAIL_LOCALIZATION')).toBe('email_localization');
  });

  it('повертає other, якщо канал чи стадія не визначені однозначно', () => {
    expect(resolveFlowType('NEWCRM_PPLEN_Generation')).toBe(FLOW_TYPE_OTHER);
    expect(resolveFlowType('NEWCRM_PPLEN_EMAIL_SMS_Generation')).toBe(FLOW_TYPE_OTHER);
    expect(resolveFlowType('NEWCRM_PPLEN_EMAIL_Generation_Localization')).toBe(FLOW_TYPE_OTHER);
    expect(resolveFlowType('SOMETHING_ELSE')).toBe(FLOW_TYPE_OTHER);
  });

  it('не плутає підрядки зі словами (RESMS, EMAILER)', () => {
    expect(resolveFlowType('NEWCRM_RESMS_Generation')).toBe(FLOW_TYPE_OTHER);
    expect(resolveFlowType('NEWCRM_EMAILER_Generation')).toBe(FLOW_TYPE_OTHER);
  });
});
