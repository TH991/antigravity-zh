// 一次性脚本：把新增词条并进 dict.json（可重复执行，按 key 覆盖）
import { readFile, writeFile } from 'node:fs/promises';

const path = new URL('./dict.json', import.meta.url);
const dict = JSON.parse(await readFile(path, 'utf8'));
const before = Object.keys(dict).length;

const add = {
  // 模型下拉
  New: '新建',
  'Leaving Soon': '即将下线',
  Orchestrator: '编排器',
  Notice: '通知',
  'View Usage': '查看用量',
  High: '高',
  Medium: '中',
  Low: '低',
  'Gemini 4 Neon High': 'Gemini 4 Neon 高',
  'GPT-OSS 120B (Medium)': 'GPT-OSS 120B（中）',
  // 项目选择器
  'No projects found': '未找到项目',
  'New Project': '新建项目',
  // 会话「更多」菜单（DOM 菜单）
  Pin: '置顶',
  'Mark Unread': '标记未读',
  Copy: '复制',
  Split: '分屏',
  Archive: '归档',
  'Outside of Project': '项目外',
  // 自动化页
  'Create with Prompt': '用提示词创建',
  'Run a prompt on a schedule, like a morning summary of yesterday\u2019s changes. Runs show up here.':
    '按计划运行提示词，比如每天早上汇总昨天的改动。运行记录会显示在这里。',
  "Run a prompt on a schedule, like a morning summary of yesterday's changes. Runs show up here.":
    '按计划运行提示词，比如每天早上汇总昨天的改动。运行记录会显示在这里。',
  // 自定义（市场）页
  Marketplace: '市场',
  Installed: '已安装',
  Featured: '精选',
  Details: '详情',
};

for (const [k, v] of Object.entries(add)) dict[k] = v;
await writeFile(path, JSON.stringify(dict, null, 2) + '\n', 'utf8');
console.log(`词条 ${before} -> ${Object.keys(dict).length}（新增/覆盖 ${Object.keys(add).length}）`);