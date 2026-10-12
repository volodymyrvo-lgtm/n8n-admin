/** Тип за замовчуванням для флоу, який не підпав під жодне правило. */
export const FLOW_TYPE_OTHER = 'other';

/**
 * Явні відповідності "точна назва флоу → тип" — повний список на зараз.
 * Мають пріоритет над правилами за словами нижче.
 */
const FLOW_TYPE_OVERRIDES: Readonly<Record<string, string>> = {
  NEW_CRM_PPLEN_Email_Generation: 'new_email_generation',
  'NEWCRM_PPL_AZ/RU_EMAIL_Localization': 'email_localization',
  NEWCRM_PPLEN_SMS_Generation: 'new_sms_generation',
  'NEWCRM_PPL_AZ/RU_SMS_Localization': 'sms_localization',
  NEW_CRM_PPLEN_WEBPUSH_Generation: 'new_webpush_generation',
  'NEWCRM_PPL_AZ/RU_WEBPUSH_Localization': 'webpush_localization',
  NEW_CRM_PPLEN_INAPP_Generation: 'new_inapp_generation',
  'NEWCRM_PPL_AZ/RU_INAPP_Localization': 'inapp_localization',
  NEW_CRM_PPLEN_NC_Generation: 'new_nc_generation',
  'NEWCRM_PPL_AZ/RU_NC_Localization': 'nc_localization',
};

const CHANNELS: ReadonlySet<string> = new Set(['email', 'sms', 'webpush', 'inapp', 'nc']);

/**
 * Запасне правило для нових флоу, названих за тією ж схемою: у назві (як
 * цілі слова, без урахування регістру й роздільників) має бути рівно один
 * канал і одна стадія. Generation → new_<канал>_generation,
 * Localization → <канал>_localization. Усе інше — other.
 */
function resolveByTokens(flow: string): string {
  const tokens = flow
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const channels = [...new Set(tokens.filter((token) => CHANNELS.has(token)))];
  const isGeneration = tokens.includes('generation');
  const isLocalization = tokens.includes('localization');

  if (channels.length !== 1 || isGeneration === isLocalization) {
    return FLOW_TYPE_OTHER;
  }

  return isGeneration ? `new_${channels[0]}_generation` : `${channels[0]}_localization`;
}

export function resolveFlowType(flow: string): string {
  return FLOW_TYPE_OVERRIDES[flow] ?? resolveByTokens(flow);
}
