import { TaskStatus } from '../generated/prisma/client.js';

/**
 * Task-статус short_communication_update. Джоба приходить зі скороченим набором
 * полів: taskStatus, steps, jobType, messageType і необов'язкова language
 * (плюс необов'язковий glossaryId). board, taskDescription, ruleIds, sm і llm
 * не потрібні: вони не валідуються й не зберігаються.
 */
export function isShortCommunicationTaskStatus(status: unknown): boolean {
  return status === TaskStatus.short_communication_update;
}
