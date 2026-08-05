/**
 * Local task_create adapter patch.
 * tasks.insert expects the task object in --json, not nested in --params.
 */
import { execute } from '../../../executor/gws.js';

export async function sendTaskCreate(scratchpads, scratchpadId, targetParams) {
    const content = scratchpads.getContent(scratchpadId);
    if (content === null) {
        return { text: `Scratchpad ${scratchpadId} not found.`, refs: { error: true } };
    }
    const { email, taskListId = '@default' } = targetParams;
    if (!email) {
        return {
            text: `Send failed: email is required for task_create.\nScratchpad ${scratchpadId} is still active.`,
            refs: { error: true, scratchpadId },
        };
    }
    const lines = content.split('\n');
    const titleLine = lines.findIndex(l => l.trim().length > 0);
    if (titleLine === -1) {
        return {
            text: `Send failed: scratchpad is empty, no task title.\nScratchpad ${scratchpadId} is still active.`,
            refs: { error: true, scratchpadId },
        };
    }
    const title = lines[titleLine].replace(/^#+\s*/, '').trim();
    const notes = lines.slice(titleLine + 1).join('\n').trim();
    const requestBody = { title };
    if (notes)
        requestBody.notes = notes;
    try {
        const result = await execute([
            'tasks', 'tasks', 'insert',
            '--params', JSON.stringify({ tasklist: taskListId }),
            '--json', JSON.stringify(requestBody),
        ], { account: email });
        const data = result.data ?? {};
        return {
            text: `Task created: **${title}**\n\n` +
                (notes ? `**Notes:** ${notes.split('\n').length} lines\n` : '') +
                `**Task ID:** ${data.id ?? 'unknown'}`,
            refs: { scratchpadId, taskId: data.id, title },
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            text: `Send failed: ${message}\nScratchpad ${scratchpadId} is still active.`,
            refs: { error: true, scratchpadId },
        };
    }
}
