# Babelfish.ai

A realtime live transcription and translation app built with [Huggingface Transformer.js](https://huggingface.co/docs/transformers.js) and [Supabase Realtime](https://supabase.com/realtime).

[![Realtime AI in the Browser video tutorial](https://img.youtube.com/vi/uT945Rh5sl8/0.jpg)](https://supabase.link/realtime-ai-yt)

It's absolutely wild what's possible with HuggingFace's Transformers.js in the browser! 🤯

🎙️ Realtime in-browser speech-to-text with OpenAI Whisper! [[transcriptionWorker.js](./src/transcriptionWorker.js)]

📡 Broadcast to subscribed clients with Supabase Realtime. [[broadcaster.jsx](./src/routes/broadcaster.jsx)] [[receiver.jsx](./src/routes/receiver.jsx)]

🌏 Translate to 200 languages with Meta's NLLB-200! [[translationWorker.js](./src/translationWorker.js)]

## Run locally

- `cp .env.local.example .env.local`.
- Set your Supabase credentials in `.env.local`.
- Run `npm run dev`

## Deploy to GitHub Pages

- Set your secrets in the GitHub repository settings.
- Push to main to deploy.
