# How to Add a New AI Provider

Follow these steps to add any provider not included by default.

---

## Python (`fallback_client.py`)

### Step 1 — Write the adapter function

Add a new function near the other `_call_*` functions:

```python
def _call_myprovider(model: str, api_key: str, prompt: str, timeout: int) -> str:
    url = "https://api.myprovider.com/v1/chat"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    body = {"model": model, "messages": [{"role": "user", "content": prompt}]}
    resp = requests.post(url, headers=headers, json=body, timeout=timeout)
    resp.raise_for_status()          # raises HTTPError on 4xx/5xx
    return resp.json()["output"]     # adjust key to match their API response
```

### Step 2 — Register the provider

In the `PROVIDERS` dict, add:

```python
PROVIDERS = {
    ...
    "myprovider": _call_myprovider,
}
```

### Step 3 — Add to config.json

```json
{
  "provider": "myprovider",
  "model": "their-model-name",
  "api_key": "ENV:MYPROVIDER_API_KEY"
}
```

---

## JavaScript (`fallbackClient.js`)

### Step 1 — Write the adapter function

```javascript
async function callMyprovider(model, apiKey, prompt, timeoutMs) {
  const res = await fetchWithTimeout('https://api.myprovider.com/v1/chat', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
  }, timeoutMs);
  if (!res.ok) { const err = new Error(`HTTP ${res.status}`); err.status = res.status; throw err; }
  const data = await res.json();
  return data.output; // adjust to match their response format
}
```

### Step 2 — Register the provider

```javascript
const PROVIDERS = {
  ...
  myprovider: callMyprovider,
};
```

### Step 3 — Add to config.json

Same as Python above.

---

## Tips

- Always call `resp.raise_for_status()` (Python) or manually check `res.ok` (JS) so the fallback logic can detect errors.
- The response key (e.g. `data["output"]`) must match the actual field in the provider's JSON response. Check their API docs.
- To test your adapter in isolation, set it as the only model in `config.json`.
