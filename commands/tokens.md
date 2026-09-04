---
description: 查看每个任务的 Token 消耗统计(token-usage)
---

读取 Token 消耗留档文件 `~/.zcode/token-usage/usage.jsonl`(每行一个 JSON:ts、sessionId、
turnId、inputTokens、outputTokens、cacheReadTokens、cacheWriteTokens、totalTokens、
requests、models),向用户汇报:

1. **最近的任务**:默认列最近 10 条(按时间倒序),每条一行——时间、总 tokens、
   输入/输出拆分(输入注明其中缓存读)、调用次数、模型。
2. **汇总**:全部记录的合计(输入、其中缓存读/写、输出、总计、调用次数);若有
   多个会话,按会话分列合计;能按天分组的就给出每天的合计。
3. 数字用千分位格式化,大数可辅以 k/M 缩写。

若 $ARGUMENTS 有内容:是数字 N 就只列最近 N 条;是 "today"/"今天" 只统计当天;
是 "session <id>" 只统计指定会话;其他关键词按语义过滤。

若文件不存在或为空,说明插件尚未记录任何任务:提示用户重启会话以加载
token-usage 插件,完成任务后这里就会出现记录;不要臆造数据。
