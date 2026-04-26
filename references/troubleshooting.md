# Troubleshooting

---

## "Environment variable 'X' is not set"

You used `"api_key": "ENV:MY_VAR"` in config.json but forgot to set the variable.

**Fix (Linux / macOS / terminal):**
```bash
export GEMINI_API_KEY="your-key-here"
```

**Fix (Windows CMD):**
```cmd
set GEMINI_API_KEY=your-key-here
```

**Fix (in your .env file with python-dotenv):**
```python
from dotenv import load_dotenv
load_dotenv()  # call this before FallbackClient()
```

---

## "Unknown provider '...', skipping"

The `"provider"` value in config.json doesn't match any built-in adapter.

**Supported values:** `gemini`, `openai`, `claude`, `mistral`, `groq`, `ollama`

**Fix:** Correct the spelling, or follow `references/add-provider.md` to add a new one.

---

## "AllModelsFailedError: All models failed"

Every model in your list failed after all retries.

**Common causes:**
- All API keys are wrong or expired → check them on each provider's dashboard
- You've hit your free quota → upgrade or add a model with remaining quota
- Network / firewall is blocking the API endpoints → test with `curl`
- `timeout_seconds` is too low → raise it in config.json

---

## HTTP 401 Unauthorized

Your API key is invalid. The client **does not retry** on 401 — it skips to the next model.

**Fix:** Replace the key in config.json or the matching environment variable.

---

## HTTP 400 Bad Request

Your prompt or model name may be malformed, or the model doesn't exist.

**Fix:** Double-check the `"model"` value against the provider's documentation.

---

## Ollama not responding

Ollama must be running locally before you call it.

**Fix:**
```bash
ollama serve          # start the server
ollama pull llama3    # download the model first (one-time)
```

---

## JavaScript: `fetch is not defined`

You're on Node 16 or below which doesn't have built-in fetch.

**Fix:**
```bash
npm install node-fetch
```
Then add at the top of your script:
```javascript
const fetch = require('node-fetch');
```
The client auto-detects this — just make sure the package is installed.

---

## Response is cut off / too short

The default `max_tokens` is 1024. For long outputs, increase it inside the provider adapter function (in `fallback_client.py` or `fallbackClient.js`).
