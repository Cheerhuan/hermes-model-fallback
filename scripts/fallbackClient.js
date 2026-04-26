/**
 * Hermes Model Fallback Client (JavaScript / Node.js)
 * -----------------------------------------------------
 * Automatically retries and switches AI models on HTTP 429, 503, or Timeout errors.
 *
 * Usage:
 *   const { FallbackClient } = require('./fallbackClient');
 *   const client = new FallbackClient('./config.json');
 *   const response = await client.chat('Your prompt here');
 *   console.log(response);
 *
 * Requirements:
 *   npm install node-fetch   (Node 16 and below)
 *   Node 18+ has built-in fetch — no install needed.
 */

const fs = require('fs');
const path = require('path');

// Use built-in fetch (Node 18+) or node-fetch
let fetchFn;
try {
  fetchFn = fetch; // Node 18+ global
} catch {
  fetchFn = require('node-fetch');
}

// ── Errors that trigger a retry / fallback ─────────────────────────────────────
const RETRYABLE_STATUS = new Set([429, 503]);

class AllModelsFailedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AllModelsFailedError';
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Supports 'ENV:VAR_NAME' syntax to read from environment variables. */
function resolveKey(rawKey) {
  if (!rawKey) return '';
  if (rawKey.startsWith('ENV:')) {
    const envVar = rawKey.slice(4);
    const value = process.env[envVar] || '';
    if (!value) throw new Error(`Environment variable '${envVar}' is not set.`);
    return value;
  }
  return rawKey;
}

/** Simple timeout wrapper around fetch */
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Provider adapters ──────────────────────────────────────────────────────────

async function callGemini(model, apiKey, prompt, timeoutMs) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  }, timeoutMs);
  if (!res.ok) { const err = new Error(`HTTP ${res.status}`); err.status = res.status; throw err; }
  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

async function callOpenAI(model, apiKey, prompt, timeoutMs) {
  const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
  }, timeoutMs);
  if (!res.ok) { const err = new Error(`HTTP ${res.status}`); err.status = res.status; throw err; }
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callClaude(model, apiKey, prompt, timeoutMs) {
  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
  }, timeoutMs);
  if (!res.ok) { const err = new Error(`HTTP ${res.status}`); err.status = res.status; throw err; }
  const data = await res.json();
  return data.content[0].text;
}

async function callMistral(model, apiKey, prompt, timeoutMs) {
  const res = await fetchWithTimeout('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
  }, timeoutMs);
  if (!res.ok) { const err = new Error(`HTTP ${res.status}`); err.status = res.status; throw err; }
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callGroq(model, apiKey, prompt, timeoutMs) {
  const res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
  }, timeoutMs);
  if (!res.ok) { const err = new Error(`HTTP ${res.status}`); err.status = res.status; throw err; }
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callOllama(model, _apiKey, prompt, timeoutMs) {
  const res = await fetchWithTimeout('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false }),
  }, timeoutMs);
  if (!res.ok) { const err = new Error(`HTTP ${res.status}`); err.status = res.status; throw err; }
  const data = await res.json();
  return data.response;
}

const PROVIDERS = {
  gemini: callGemini,
  openai: callOpenAI,
  claude: callClaude,
  mistral: callMistral,
  groq: callGroq,
  ollama: callOllama,
};

// ── Main Client ────────────────────────────────────────────────────────────────

class FallbackClient {
  /**
   * @param {string} configPath - Path to config.json
   * @param {boolean} verbose   - Print fallback events to console
   */
  constructor(configPath = './config.json', verbose = true) {
    const raw = fs.readFileSync(path.resolve(configPath), 'utf-8');
    const cfg = JSON.parse(raw);
    this.models = cfg.models;
    this.retryLimit = cfg.retry_limit ?? 2;
    this.timeoutMs = (cfg.timeout_seconds ?? 30) * 1000;
    this.verbose = verbose;
  }

  _log(msg) {
    if (this.verbose) console.log(`[HermesFallback] ${msg}`);
  }

  /**
   * Attempt one model up to (retryLimit + 1) times.
   * @returns {Promise<string|null>} response text, or null if all attempts failed
   */
  async _tryModel(modelCfg) {
    const { provider, model } = modelCfg;
    const apiKey = resolveKey(modelCfg.api_key || '');
    const caller = PROVIDERS[provider];

    if (!caller) {
      this._log(`Unknown provider '${provider}', skipping.`);
      return null;
    }

    for (let attempt = 1; attempt <= this.retryLimit + 1; attempt++) {
      try {
        this._log(`Trying ${provider}/${model} (attempt ${attempt})...`);
        const result = await caller(model, apiKey, this._currentPrompt, this.timeoutMs);
        this._log(`✅ Success with ${provider}/${model}`);
        return result;

      } catch (err) {
        // Timeout (AbortError)
        if (err.name === 'AbortError') {
          this._log(`⏱ Timeout on ${provider}/${model} (attempt ${attempt})`);
          // fall through to retry

        } else if (err.status) {
          if (RETRYABLE_STATUS.has(err.status)) {
            this._log(`⚠️  HTTP ${err.status} on ${provider}/${model} (attempt ${attempt})`);
            if (attempt <= this.retryLimit) await sleep(2 ** (attempt - 1) * 1000);
          } else {
            this._log(`❌ Non-retryable HTTP ${err.status} on ${provider}/${model}`);
            return null; // skip this model immediately
          }

        } else {
          // Connection error or other
          this._log(`🔌 Error on ${provider}/${model}: ${err.message}`);
          // fall through to retry
        }
      }
    }

    this._log(`❌ All attempts exhausted for ${provider}/${model}, switching...`);
    return null;
  }

  /**
   * Send a prompt. Automatically falls back through all configured models.
   * @param {string} prompt
   * @returns {Promise<string>}
   * @throws {AllModelsFailedError}
   */
  async chat(prompt) {
    this._currentPrompt = prompt;

    for (const modelCfg of this.models) {
      const result = await this._tryModel(modelCfg);
      if (result !== null) return result;
    }

    throw new AllModelsFailedError(
      'All models failed (429 / 503 / Timeout). ' +
      'Check your API keys and quotas, or add more fallback models in config.json.'
    );
  }
}

module.exports = { FallbackClient, AllModelsFailedError };

// ── Quick test ─────────────────────────────────────────────────────────────────
if (require.main === module) {
  const client = new FallbackClient('./config.json');
  client.chat('Say hello in one sentence.')
    .then(res => console.log('Response:', res))
    .catch(err => console.error('Error:', err.message));
}
