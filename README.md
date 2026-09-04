# token-usage

[English](README.en.md) | 简体中文

一个 [ZCode](https://z.ai) 插件:在**每个任务的底部**自动显示该任务实际消耗的 Token 数量。

任务结束时,你会看到这样一行页脚:

```
---
🔧 本次任务 Token 消耗:输入 5,314,077 (缓存读 5,271,616 / 缓存写 0) · 输出 29,169 · 合计 5,343,246 · 22 次模型调用 · GLM-5.3-Flash
```

## ✨ 功能特性

- **精确统计**:数字来自 ZCode 记录的每一次模型 API 调用真实用量(按任务 `turnId` 汇总),不是模型自己估计的
- **缓存透明**:区分缓存读 / 缓存写,清楚看到上下文缓存省了多少
- **零配置可用**:装上即用;可选 `silent`(仅留档不显示)/ `off` 模式
- **`/tokens` 命令**:随时汇总查看最近任务、当天、指定会话的消耗
- **本地留档**:每次统计追加到 `~/.zcode/token-usage/usage.jsonl`,便于日后分析

## 📦 安装

### 方式一:插件市场(推荐)

在 ZCode 中打开 **设置 → 插件管理 → 发现**,点 `+` 添加市场,填入本仓库地址
(`https://github.com/zzh07/zcode-token-usage`),然后安装 `token-usage` 即可。

### 方式二:本地目录安装

把本仓库克隆(或下载解压)到任意目录,例如 `C:\tools\zcode-token-usage`,然后编辑
`~/.zcode/cli/config.json`:

```json
{
  "plugins": {
    "dirs": ["C:\\tools\\zcode-token-usage"]
  }
}
```

重启 ZCode 会话,插件即以 `token-usage@inline` 加载(输入框输入 `/plugins` 或运行
`zcode plugins list` 可确认)。

> 没有 git?直接在 GitHub 页面 **Code → Download ZIP** 下载解压即可,目录名随意。

### 验证安装

重启会话后随便发一个任务,任务结束时底部出现 🔧 页脚即安装成功。

## 🚀 使用

- **自动页脚**:无需任何操作,每个任务结束时自动显示。
- **`/tokens`**:汇总最近任务与合计。支持参数:
  - `/tokens 20` —— 最近 20 条
  - `/tokens today` —— 只统计今天
  - `/tokens session <id>` —— 只统计指定会话

## ⚙️ 配置

编辑插件目录下的 `config.json`(对下一个任务生效,无需重启):

| 字段 | 取值 | 说明 |
|---|---|---|
| `mode` | `footer`(默认) | 任务底部显示页脚 |
| | `silent` | 不显示页脚,仅写入留档文件 |
| | `off` | 完全停用 |
| `language` | `zh`(默认)/ `en` | 页脚语言 |
| `showCache` | `true`(默认)/ `false` | 是否显示缓存读/写明细 |
| `rolloutDir` | 默认 `~/.zcode/cli/rollout` | 用量日志目录(一般无需修改) |

## 🔍 工作原理

1. ZCode 在每个任务(一轮主对话)结束时触发 **Stop** hook,传入 `session_id` 和 `turnId`。
2. 插件读取本会话的用量日志 `~/.zcode/cli/rollout/model-io-sess_<会话id>.jsonl`
   —— 每行是一次模型 API 调用的真实记录(含 usage),按 `turnId` 过滤
   `main_turn` 行求和(自动排除标题生成等辅助调用)。
3. 由于 ZCode 的 hook 没有直接向界面输出文本的通道,插件返回
   `continue:true + additionalContext`,让模型带着页脚内容补发一条消息——
   这就是任务底部那行页脚。`stop_hook_active` 守卫保证不会循环补发。

## ⚠️ 已知限制

- 统计的是主对话(`main_turn`)的调用;子代理(后台 Agent)的调用不在该日志中,不计入。
- 页脚由模型补发,极少数情况下可能不逐字一致;但数字本身来自日志,是精确的。
- 页脚机制会让每个任务多一次很小的模型调用(输入部分几乎全走缓存读,开销可忽略);
  在意的话用 `silent` 模式。

## 📄 License

[MIT](LICENSE)
