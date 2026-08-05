import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const packageRoot = path.join(root, 'node_modules', '@aaronsb', 'google-workspace-mcp');
const manifestPath = path.join(packageRoot, 'build', 'factory', 'manifest', 'tasks.yaml');
const registryPath = path.join(packageRoot, 'build', 'factory', 'patches.js');
const taskPatchPath = path.join(packageRoot, 'build', 'services', 'tasks', 'patch.js');
const localTaskPatch = path.join(root, 'overrides', 'tasks.patch.js');
const sendTaskPath = path.join(packageRoot, 'build', 'server', 'scratchpad', 'adapters', 'send-task.js');
const localSendTaskPatch = path.join(root, 'overrides', 'send-task.patch.js');

if (!fs.existsSync(packageRoot)) {
  throw new Error(`Google Workspace MCP package not found: ${packageRoot}`);
}

let manifest = fs.readFileSync(manifestPath, 'utf8');
if (!manifest.includes('description: "Task title"')) {
  const oldCreate = `  create:\n    type: action\n    description: "create a new task"\n    resource: tasks.insert\n    params:\n      taskListId:\n        type: string\n        description: "Task list ID"\n        required: true\n        maps_to: tasklist`;
  const newCreate = `  create:\n    type: action\n    description: "create a new task, optionally under a parent task"\n    resource: tasks.insert\n    params:\n      taskListId:\n        type: string\n        description: "Task list ID"\n        required: true\n        maps_to: tasklist\n      title:\n        type: string\n        description: "Task title"\n        required: true\n      parent:\n        type: string\n        description: "Parent task ID for a hierarchical child task"\n        maps_to: parent\n      notes:\n        type: string\n        description: "Optional task notes"\n      due:\n        type: string\n        description: "Optional due date in RFC 3339 format"`;
  if (!manifest.includes(oldCreate))
    throw new Error('Could not locate the expected tasks.create manifest block');
  manifest = manifest.replace(oldCreate, newCreate);
}

if (!manifest.includes('batchCreate:')) {
  const marker = `\n  update:\n`;
  const batch = `\n  batchCreate:\n    type: action\n    description: "create a hierarchy of tasks in one batch operation"\n    resource: tasks.insert\n    params:\n      taskListId:\n        type: string\n        description: "Task list ID"\n        required: true\n        maps_to: tasklist\n      tasks:\n        type: array\n        description: "Array of parent tasks with optional children: [{title, children: [{title}]}]"\n        required: true\n`;
  if (!manifest.includes(marker))
    throw new Error('Could not locate the tasks manifest insertion point');
  manifest = manifest.replace(marker, `${batch}${marker}`);
}
fs.writeFileSync(manifestPath, manifest, 'utf8');

fs.copyFileSync(localTaskPatch, taskPatchPath);
fs.copyFileSync(localSendTaskPatch, sendTaskPath);
let registry = fs.readFileSync(registryPath, 'utf8');
if (!registry.includes("../services/tasks/patch.js")) {
  registry = registry.replace(
    "import { sheetsPatch } from '../services/sheets/patch.js';",
    "import { sheetsPatch } from '../services/sheets/patch.js';\nimport { tasksPatch } from '../services/tasks/patch.js';",
  );
  registry = registry.replace(
    '    sheets: sheetsPatch,',
    '    sheets: sheetsPatch,\n    tasks: tasksPatch,',
  );
  fs.writeFileSync(registryPath, registry, 'utf8');
}

console.log('Applied local Google Tasks MCP patch.');
