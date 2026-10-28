import { TaskStatus } from '../generated/prisma/client.js';

/**
 * Task-статуси оновлення HTML листа. Для них джоба приходить зі скороченим
 * набором полів: taskStatus, taskDescription і необов'язковий isBannerUpdate.
 * Решта полів (steps, jobType, messageType, board, ruleIds, sm, llm) не потрібна:
 * вони не валідуються й не зберігаються.
 */
export const HTML_UPDATE_TASK_STATUSES: readonly TaskStatus[] = [TaskStatus.welcome_email_html_update, TaskStatus.system_email_html_update];

export function isHtmlUpdateTaskStatus(status: unknown): boolean {
  return HTML_UPDATE_TASK_STATUSES.includes(status as TaskStatus);
}
