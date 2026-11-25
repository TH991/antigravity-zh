// 一次性脚本：合并模型行悬停详情（ⓘ 浮层）的文案
import { readFile, writeFile } from 'node:fs/promises';

const path = new URL('./dict.json', import.meta.url);
const dict = JSON.parse(await readFile(path, 'utf8'));
const before = Object.keys(dict).length;

const add = {
  'For most deep reasoning and complex problems': '用于最深入的推理与复杂问题',
  'For your hardest, long-horizon tasks': '用于最难的、长时间跨度的任务',
  'For speed and efficiency in execution tasks': '用于执行类任务的速度与效率',
  'Offloads routine steps to a faster executor. Same quality, fewer tokens used.':
    '把常规步骤交给更快的执行器。质量相同，token 更省。',
  'Use Hydrogen for better quality with lower quota usage. Leaving on Nov 30.':
    '想要更高质量、更省配额，请改用 Hydrogen。将于 11 月 30 日下线。',
  'GPT-OSS will be removed from Antigravity on November 30, 2026.':
    'GPT-OSS 将于 2026 年 11 月 30 日从 Antigravity 移除。',
};

for (const [k, v] of Object.entries(add)) dict[k] = v;
await writeFile(path, JSON.stringify(dict, null, 2) + '\n', 'utf8');
console.log(`词条 ${before} -> ${Object.keys(dict).length}`);