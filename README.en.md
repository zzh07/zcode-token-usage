# token-usage

English | [简体中文](README.md)

A [ZCode](https://z.ai) plugin that automatically shows **how many tokens each task actually consumed**, right at the bottom of the task.

When a task finishes, you get a footer like this:

```
---
🔧 Task token usage: input 5,314,077 (cache read 5,271,616 / cache write 0) · output 29,169 · total 5,343,246 · 22 model calls · GLM-5.3-Flash
```

## ✨ Features

- **Accurate numbers**: computed from the real usage ZCode recorded for every model API call (summed per task `turnId`) — not a model's own estimate
- **Cache transparency**: cache read / cache write are broken out, so you can see how much your context cache is saving
- **Zero-config**: works out of the box; optional `silent` (archive only, no footer) and `off` modes
- **`/tokens` command**: summarize recent tasks, today, or a specific session at any time
- **Local archive**: every measurement is appended to `~/.zcode/token-usage/usage.jsonl` for later analysis

## 📦 Install

### Option 1 — Plugin marketplace (recommended)

In ZCode, open **Settings → Plugin Management → Discover**, click `+` to add a marketplace,
and enter this repository URL (`https://github.com/zzh07/zcode-token-usage`).
Then install `token-usage`.

### Option 2 — Local directory

Clone (or download and extract) this repository to any folder, e.g. `C:\tools\zcode-token-usage`,
then edit `~/.zcode/cli/config.json`:

```json
{
  "plugins": {
    "dirs": ["C:\\tools\\zcode-token-usage"]
  }
}
```

Restart your ZCode session and the plugin loads as `token-usage@inline`
(verify with `/plugins` in the input box or `zcode plugins list` in a terminal).

> No git? Just use **Code → Download ZIP** on GitHub and extract it — the folder name doesn't matter.

### Verify

After restarting, send any task; when it finishes, the 🔧 footer appears at the bottom.

## 🚀 Usage

- **Automatic footer**: nothing to do — it appears at the end of every task.
- **`/tokens`**: summarize recent tasks and totals. Arguments:
  - `/tokens 20` — last 20 entries
  - `/tokens today` — today only
  - `/tokens session <id>` — a specific session only

## ⚙️ Configuration

Edit `config.json` in the plugin folder (takes effect on the next task, no restart needed):

| Field | Values | Description |
|---|---|---|
| `mode` | `footer` (default) | Show the footer at the bottom of each task |
| | `silent` | No footer; archive only |
| | `off` | Fully disabled |
| `language` | `zh` / `en` (default `zh`) | Footer language |
| `showCache` | `true` (default) / `false` | Show cache read/write breakdown |
| `rolloutDir` | default `~/.zcode/cli/rollout` | Usage log directory (rarely needs changing) |

## 🔍 How it works

1. When a task (one main-conversation turn) finishes, ZCode fires the **Stop** hook with
   `session_id` and `turnId`.
2. The plugin reads the session's usage log `~/.zcode/cli/rollout/model-io-sess_<sessionId>.jsonl`
   — one line per model API call with its real usage — filters the `main_turn` rows by
   `turnId`, and sums them (auxiliary calls like title generation are excluded).
3. ZCode hooks have no direct channel to render text in the UI, so the plugin returns
   `continue:true + additionalContext`, which makes the model post one extra short message
   carrying the footer — that's the line at the bottom of the task. A `stop_hook_active`
   guard prevents it from looping.

## ⚠️ Known limitations

- Only main-conversation (`main_turn`) calls are counted; background subagent calls are not in
  the log and are not included.
- The footer is posted by the model and may very rarely not be verbatim; the numbers themselves
  come from the log and are exact.
- The footer mechanism adds one tiny model call per task (input is almost entirely cache reads,
  so the overhead is negligible); use `silent` mode if you mind.

## 📄 License

[MIT](LICENSE)
