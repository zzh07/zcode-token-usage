#!/usr/bin/env node
/**
 * token-usage — Stop hook
 *
 * 每个任务(一轮主对话)结束时,ZCode 会以 Stop 事件调用本脚本,stdin 传入:
 *   { session_id, sessionId, turnId, stop_hook_active, stopHookActive,
 *     last_assistant_message, agent_type, permission_mode, ... , transcript_path }
 * 其中没有 usage 数据(transcript.jsonl 只含最后一条助手消息文本)。
 *
 * 真实的逐次模型调用用量记录在:
 *   ~/.zcode/cli/rollout/model-io-sess_<sessionId>.jsonl
 * 每行一次 API 调用,含 turnId / querySource / model.role / response.usage:
 *   usage = { inputTokens, outputTokens, totalTokens, cacheReadTokens, cacheWriteTokens }
 * 注意 inputTokens 已包含缓存读/写,totalTokens = inputTokens + outputTokens。
 * 按 turnId 过滤 querySource==="main_turn" 的行求和,即该任务的总消耗
 * (session_title 等辅助调用共用 turnId 但 querySource 不同,必须排除)。
 *
 * v0.2.0 输出通道(修复 0.1.0 的"页脚顶掉回答"问题):
 *   - system(默认): 经 systemMessage 直接向用户展示页脚,零额外模型调用,
 *     任何模型下都不可能影响回答文本;
 *   - footer: 仍走 continue+additionalContext 补跑,但指令改为"在同一条回答
 *     消息末尾续写追加",并新增空回答守卫(回答为空时不补跑);
 *   - silent: 仅留档;off: 完全关闭。
 * stop_hook_active=true 表示当前已是补跑轮,必须静默退出,否则会循环(core 上限 3 次)。
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const FOOTER_MARKER = '🔧';
const PLUGIN_ROOT = path.resolve(__dirname, '..', '..');

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    const done = (text) => resolve(text);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => done(data));
    process.stdin.on('error', () => done(''));
    // 3 秒收不到完整 stdin 就放弃,避免挂起
    setTimeout(() => done(data), 3000).unref();
  });
}

function loadConfig() {
  const defaults = { mode: 'system', language: 'zh', showCache: true };
  try {
    const file = path.join(PLUGIN_ROOT, 'config.json');
    return { ...defaults, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    return defaults;
  }
}

function resolveRolloutFile(sessionId, rolloutDir) {
  const dir = rolloutDir || path.join(os.homedir(), '.zcode', 'cli', 'rollout');
  const exact = path.join(dir, `model-io-${sessionId}.jsonl`);
  if (fs.existsSync(exact)) return exact;
  try {
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith('.jsonl') && name.includes(sessionId)) return path.join(dir, name);
    }
  } catch { /* 目录不存在时忽略 */ }
  return null;
}

// 流式逐行扫描,rollout 文件可达几十 MB
function sumTurnUsage(file, turnId) {
  return new Promise((resolve, reject) => {
    const rows = [];
    let lastTurnId = null;
    const lastByTurn = new Map(); // turnId -> 聚合( turnId 缺失或未命中时的回退数据源)
    const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
    rl.on('line', (line) => {
      if (!line.includes('"main_turn"')) return;
      let row;
      try { row = JSON.parse(line); } catch { return; }
      if (!row || row.querySource !== 'main_turn' || !row.response || !row.response.usage) return;
      rows.push(row);
      lastTurnId = row.turnId;
      const agg = lastByTurn.get(row.turnId) || blankAgg();
      mergeAgg(agg, row);
      lastByTurn.set(row.turnId, agg);
    });
    rl.on('error', reject);
    rl.on('close', () => {
      // lastTurnId 按文件顺序记录(不能依赖 Map 插入序:同一 turnId 重复 set 不更新位置)
      let lastTurnId = null;
      const matched = turnId ? rows.filter((r) => r.turnId === turnId) : [];
      if (matched.length > 0) {
        const agg = blankAgg();
        for (const row of matched) mergeAgg(agg, row);
        return resolve(agg);
      }
      // 没传 turnId 或没匹配到:回退到文件里最后一个 main_turn(即刚结束的任务)
      if (lastTurnId && lastByTurn.has(lastTurnId)) return resolve(lastByTurn.get(lastTurnId));
      const keys = [...lastByTurn.keys()];
      resolve(keys.length > 0 ? lastByTurn.get(keys[keys.length - 1]) : blankAgg());
    });
  });
}

function blankAgg() {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, requests: 0, models: new Set() };
}

function mergeAgg(agg, row) {
  const u = row.response.usage;
  agg.inputTokens += u.inputTokens || 0;
  agg.outputTokens += u.outputTokens || 0;
  agg.cacheReadTokens += u.cacheReadTokens || 0;
  agg.cacheWriteTokens += u.cacheWriteTokens || 0;
  agg.requests += 1;
  if (row.model && row.model.modelId) agg.models.add(row.model.modelId);
}

function fmt(n) { return n.toLocaleString('en-US'); }

function buildFooter(agg, cfg) {
  const cache = cfg.showCache ? `(缓存读 ${fmt(agg.cacheReadTokens)} / 缓存写 ${fmt(agg.cacheWriteTokens)}) ` : '';
  const models = [...agg.models].join(', ');
  if (cfg.language === 'en') {
    return `${FOOTER_MARKER} Task token usage: input ${fmt(agg.inputTokens)} ${cache}· output ${fmt(agg.outputTokens)} · total ${fmt(agg.inputTokens + agg.outputTokens)} · ${agg.requests} model call${agg.requests === 1 ? '' : 's'}${models ? ` · ${models}` : ''}`;
  }
  return `${FOOTER_MARKER} 本次任务 Token 消耗:输入 ${fmt(agg.inputTokens)} ${cache}· 输出 ${fmt(agg.outputTokens)} · 合计 ${fmt(agg.inputTokens + agg.outputTokens)} · ${agg.requests} 次模型调用${models ? ` · ${models}` : ''}`;
}

function logSidecar(sessionId, turnId, agg) {
  try {
    const base = process.env.ZCODE_PLUGIN_DATA || path.join(os.homedir(), '.zcode', 'token-usage');
    fs.mkdirSync(base, { recursive: true });
    const record = {
      ts: new Date().toISOString(),
      sessionId,
      turnId,
      inputTokens: agg.inputTokens,
      outputTokens: agg.outputTokens,
      cacheReadTokens: agg.cacheReadTokens,
      cacheWriteTokens: agg.cacheWriteTokens,
      totalTokens: agg.inputTokens + agg.outputTokens,
      requests: agg.requests,
      models: [...agg.models],
    };
    fs.appendFileSync(path.join(base, 'usage.jsonl'), JSON.stringify(record) + '\n');
  } catch { /* 统计留档失败不影响主流程 */ }
}

async function main() {
  const raw = await readStdin();
  if (!raw.trim()) return;
  let input;
  try { input = JSON.parse(raw); } catch { return; }

  if (input.hook_event_name && input.hook_event_name !== 'Stop') return;
  // 补跑轮:页脚刚发过,静默退出防止循环
  if (input.stop_hook_active || input.stopHookActive) return;
  // 兜底:上一条助手消息本身就是页脚时不再补发
  const lastMsg = String(input.last_assistant_message || input.lastAssistantMessage || '');
  if (lastMsg.length < 400 && lastMsg.includes(FOOTER_MARKER) && lastMsg.includes('---')) return;
  // v0.2.0 守卫:回答为空(生成失败/被中断)时不补跑,避免"整条回复只剩页脚"
  if (!lastMsg.trim()) return;

  const cfg = loadConfig();
  if (cfg.mode === 'off') return;

  const sessionId = input.session_id || input.sessionId || process.env.ZCODE_SESSION_ID;
  if (!sessionId) return;

  const file = resolveRolloutFile(sessionId, cfg.rolloutDir);
  if (!file) return;

  const agg = await sumTurnUsage(file, input.turnId || input.turn_id);
  if (!agg || agg.requests === 0) return;

  logSidecar(sessionId, input.turnId || input.turn_id || '(unknown)', agg);

  // v0.2.0 默认:systemMessage 直达用户,不触发模型补跑
  if (cfg.mode === 'system') {
    process.stdout.write(JSON.stringify({ systemMessage: buildFooter(agg, cfg) }));
    return;
  }

  if (cfg.mode === 'silent') {
    process.stdout.write(JSON.stringify({ suppressOutput: true }));
    return;
  }

  // footer 模式:补跑追加页脚。指令为"续写追加"语义(0.1.0 的"只输出页脚"
  // 指令会让轻量模型把补跑轮整条吐成页脚,从用户视角顶掉了回答文本)。
  const footer = buildFooter(agg, cfg);
  const instruction = cfg.language === 'en'
    ? `[token-usage plugin] The task finished and your answer above was already delivered. Continue THAT SAME message by appending a footer: output only one line of --- followed by the footer line below, copied verbatim. Do not output anything else — do not repeat or rewrite your answer, do not explain, do not call tools. Finish immediately after.\n---\n${footer}`
    : `[token-usage 插件] 本轮任务已结束,你上面的回答已完整送达。请在那条回答消息的末尾续写追加页脚:只输出一行 --- ,随后一行是下面的页脚文本(逐字复制)。除此之外不要输出任何内容——不要重复或改写你的回答,不要解释,不要调用工具。追加完成后立即结束。\n---\n${footer}`;

  process.stdout.write(JSON.stringify({
    continue: true,
    suppressOutput: true,
    additionalContext: instruction,
  }));
}

main().catch(() => {});
