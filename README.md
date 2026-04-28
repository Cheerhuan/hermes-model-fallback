<div align="center">

# 🛡️ Hermes Model Fallback Skill

![Hermes Model Fallback Logo](assets/logo.jpg)

**The ultimate resilience layer for AI Agents. No more 429s, 503s, or hanging processes.**
**AI Agent 的終極韌性層。徹底解決 429 頻率限制、503 伺服器錯誤或程序掛起問題。**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform: Hermes](https://img.shields.io/badge/Platform-Hermes-blue)](https://github.com/cheerhuan)
[![Platform: OpenClaw](https://img.shields.io/badge/Platform-OpenClaw-green)](https://github.com/cheerhuan)

</div>

---

## 📌 Table of Contents | 目錄
- [📖 Overview | 概覽](#-overview--概覽)
- [✨ Key Features | 核心功能](#-key-features--核心功能)
- [🚀 Quick Start | 快速上手](#-🚀-quick-start--快速上手)
- [📁 Structure | 結構](#-structure--結構)
- [📄 License | 授權](#-license--授權)

---

## 📖 Overview | 概覽

`hermes-model-fallback` is a cross-platform skill designed to prevent AI Agents from freezing or crashing when a primary LLM provider fails. It implements a smart failover mechanism that automatically switches to backup models upon encountering rate limits (HTTP 429), server errors (HTTP 503), or timeouts.

`hermes-model-fallback` 是一個跨平台的技能模組，旨在防止 AI Agent 在主模型失效時發生凍結或崩潰。它實作了一套智能故障轉移機制，當偵測到頻率限制 (HTTP 429)、伺服器錯誤 (HTTP 503) 或超時時，會自動切換至備用模型。

---

## ✨ Key Features | 核心功能

| Feature | 說明 | Description |
| :--- | :--- | :--- |
| **Smart Auto-Retry** | **智能重試** | Retries the same model (default 2x) before switching to avoid transient hiccups. <br> 在切換前嘗試重試同一模型 (預設 2 次) 以避免瞬時故障。 |
| **Instant Failover** | **極速轉移** | Switches to the next model in the priority list immediately after exhaustion. <br> 在主模型耗盡後立即切換至優先級列表中的下一個模型。 |
| **Timeout Shield** | **超時保護** | Prevents agents from hanging indefinitely on slow API responses. <br> 防止 Agent 因 API 回應過慢而無限期掛起。 |
| **Multi-Provider Support** | **多提供者支援** | Gemini, OpenAI, Claude, Mistral, Groq, and local Ollama. <br> 支援 Gemini, OpenAI, Claude, Mistral, Groq 以及本地 Ollama。 |
| **Env Var Security** | **環境變數安全** | Supports `ENV:VAR_NAME` to keep your API keys out of the config files. <br> 支援 `ENV:VAR_NAME` 格式，確保 API 金鑰不直接暴露在配置文件中。 |
| **Cross-Language** | **跨語言支援** | Ready-to-use Python and JavaScript clients. <br> 提供開箱即用的 Python 與 JavaScript 用戶端。 |

---

## 🚀 Quick Start | 快速上手

### 1️⃣ Install | 安裝

**For Hermes/OpenClaw Agent:**
```bash
# Hermes Agent
git clone https://github.com/cheerhuan/hermes-model-fallback.git ~/.hermes/skills/hermes-model-fallback

# OpenClaw Agent
git clone https://github.com/cheerhuan/hermes-model-fallback.git ~/.openclaw/skills/hermes-model-fallback
```

**For General Development:**
```bash
git clone https://github.com/cheerhuan/hermes-model-fallback.git
```

### 2️⃣ Configure | 設定
Edit `scripts/config.json` to define your models and API keys (Use `ENV:VAR_NAME` for security):
編輯 `scripts/config.json` 定義模型列表與 API 金鑰 (建議使用 `ENV:VAR_NAME` 確保安全)：

```json
{
  "models": [
    { "provider": "gemini", "model": "gemini-1.5-pro", "api_key": "***" },
    { "provider": "openai", "model": "gpt-4o", "api_key": "***" },
    { "provider": "ollama", "model": "llama3", "api_key": "" }
  ],
  "retry_limit": 2,
  "timeout_seconds": 30
}
```

### 3️⃣ Use | 使用
- **As an Agent Skill**: Just restart your Agent. It will now automatically handle 429/503 errors.
  **作為 Agent 技能**：重新啟動 Agent 即可，它將自動處理 429/503 錯誤。
- **In your own Code**:
  **在自有代碼中使用**：
  - **Python**: `from scripts.fallback_client import FallbackClient`
  - **JS**: `const { FallbackClient } = require('./scripts/fallbackClient')`

---

## 📁 Structure | 結構

```text
hermes-model-fallback/
├── SKILL.md              # Agent definition (Hermes/OpenClaw)
├── README.md             # Documentation
├── scripts/
│   ├── config.json       # Model list & Keys
│   ├── fallback_client.py# Python Implementation
│   └── fallbackClient.js # JS Implementation
└── references/
    ├── add-provider.md   # How to add new providers
    └── troubleshooting.md# Common fixes
```

---

## 📄 License | 授權
MIT License. Feel free to use, modify, and distribute.
MIT 授權。歡迎自由使用、修改與分發。
