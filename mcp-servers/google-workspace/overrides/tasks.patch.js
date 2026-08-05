/**
 * Local Google Tasks MCP patch.
 * tasks.insert receives title/notes/due in --json, and parent in --params.
 */
import { execute } from '../../executor/gws.js';
import { requireString } from '../../server/handlers/validate.js';

function taskBody(params) {
    const title = requireString(params, 'title').trim();
    if (!title)
        throw new Error('title must not be empty');
    const body = { title };
    if (params.notes !== undefined && params.notes !== null)
        body.notes = String(params.notes);
    if (params.due !== undefined && params.due !== null)
        body.due = String(params.due);
    return body;
}

async function insertTask(taskListId, title, account, parent, extra = {}) {
    const query = { tasklist: taskListId };
    if (parent)
        query.parent = parent;
    const result = await execute([
        'tasks', 'tasks', 'insert',
        '--params', JSON.stringify(query),
        '--json', JSON.stringify({ title, ...extra }),
    ], { account });
    return result.data ?? {};
}

async function createHandler(params, account) {
    const taskListId = requireString(params, 'taskListId');
    const body = taskBody(params);
    const data = await insertTask(taskListId, body.title, account, params.parent, {
        ...(body.notes ? { notes: body.notes } : {}),
        ...(body.due ? { due: body.due } : {}),
    });
    const id = String(data.id ?? '');
    return {
        text: `Task created: **${body.title}**\n\n**ID:** ${id}${params.parent ? `\n**Parent:** ${params.parent}` : ''}`,
        refs: { id, title: body.title, parent: params.parent ? String(params.parent) : '' },
    };
}

function parseBatchTasks(raw) {
    if (Array.isArray(raw))
        return raw;
    if (typeof raw === 'string' && raw.trim()) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed))
                return parsed;
        }
        catch {
            // Fall through to the clear validation error below.
        }
    }
    throw new Error('tasks must be an array or a JSON-encoded array');
}

async function batchCreateHandler(params, account) {
    const taskListId = requireString(params, 'taskListId');
    const tasks = parseBatchTasks(params.tasks);
    const created = [];
    for (const parentSpec of tasks) {
        if (!parentSpec || typeof parentSpec.title !== 'string' || !parentSpec.title.trim())
            throw new Error('Each batch parent requires a non-empty title');
        const parent = await insertTask(taskListId, parentSpec.title.trim(), account, undefined, {
            ...(parentSpec.notes ? { notes: String(parentSpec.notes) } : {}),
            ...(parentSpec.due ? { due: String(parentSpec.due) } : {}),
        });
        const parentId = String(parent.id ?? '');
        if (!parentId)
            throw new Error(`Google Tasks returned no ID for parent '${parentSpec.title}'`);
        created.push({ id: parentId, title: parentSpec.title.trim(), parent: null });
        const children = Array.isArray(parentSpec.children) ? parentSpec.children : [];
        for (const childSpec of children) {
            if (!childSpec || typeof childSpec.title !== 'string' || !childSpec.title.trim())
                throw new Error(`Each child of '${parentSpec.title}' requires a non-empty title`);
            const child = await insertTask(taskListId, childSpec.title.trim(), account, parentId, {
                ...(childSpec.notes ? { notes: String(childSpec.notes) } : {}),
                ...(childSpec.due ? { due: String(childSpec.due) } : {}),
            });
            const childId = String(child.id ?? '');
            if (!childId)
                throw new Error(`Google Tasks returned no ID for child '${childSpec.title}'`);
            created.push({ id: childId, title: childSpec.title.trim(), parent: parentId });
        }
    }
    return {
        text: `Batch created: **${created.length} tasks** (${tasks.length} parents)`,
        refs: { count: created.length, parents: tasks.length, ids: created.map(t => t.id), tasks: created },
    };
}

export const tasksPatch = {
    customHandlers: {
        create: createHandler,
        batchCreate: batchCreateHandler,
    },
};
