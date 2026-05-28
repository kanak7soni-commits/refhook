# RefHook - Bot Credential Dashboard

Real-time webhook dashboard for ProxyPin ref bots.

## Deploy to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → Import Project → Select repo
3. Deploy (zero config needed)

## How it works

- **POST `/api/webhook`** — ProxyPin bot sends credentials here
- **GET `/api/webhook`** — View stored credentials as JSON
- **GET `/api/webhook?ref=bypasstest99`** — Filter by ref code
- **GET `/api/webhook?ref=bypasstest99&format=txt`** — Plain text format
- **Dashboard (`/`)** — Live UI with auto-refresh, copy & download

## ProxyPin Bot Setup

Set your Vercel URL in the bot script:
```js
var WEBHOOK = "https://your-app.vercel.app/api/webhook";
```
