# Quizhunter

A Mac desktop app and private web app for understanding PowerPoints and practicing what you learn.

## Mac application

Open **Quizhunter** from your Applications folder. It includes its own runtime and starts its own private local server; Node.js, a terminal, and the Codex preview are not needed to run the packaged app. Only AI generation requires internet access.

To build the Mac app from source, run `npm run desktop:package`. The `.app` is created under `release/`. The renderer runs sandboxed with Node integration disabled. Source decks and API keys stay in memory for the app session; save a study pack before quitting.

## Using the app

1. Choose **Try a sample lesson** to explore without an API key.
2. Upload one or several `.pptx` or `.pdf` files. You can add more later with **Add PowerPoints / PDFs**.
3. Select **Connect AI** and enter an OpenAI API key with access to GPT-5.4. API usage is billed separately from a ChatGPT subscription.
4. Choose a learning level and click **Build complete study pack**. The dedicated study agent explains every slide in detail, makes 2–4 flashcards and 1–2 quiz questions per substantive slide, and checks the source references. You can also generate each type separately. The **Ask** tab answers independent questions about the selected slide.
5. Export flashcards as TSV for Quizlet/Anki, explanations as Markdown, or save the whole collection as a study-pack JSON file.

Multiple decks retain their filenames and original slide numbers. Study-slide numbers are unique across the collection. The reader follows PowerPoint presentation order, including decks whose internal XML filenames are out of order.

## Local development

Requires Node 22.13 or newer and npm.

```sh
npm run install:ci
npm run dev
```

Open the Local URL printed by the server (normally http://localhost:5173).

```sh
npx tsc --noEmit
npm run build
npm run test:study
npm run test:desktop
```

Hosting uses the registered Sites project in `.openai/hosting.json`.

## Dedicated study agent

The agent runs one slide at a time and saves each validated lesson, flashcard set, and quiz together. A coverage list shows every source slide, its completion state, and any error. Blank slides, dividers, and unreadable material receive an explanation with a specific limitation instead of fabricated questions.

Stop pauses the run; Continue processes only unfinished slides. If one slide fails validation, the agent keeps it pending and tries the next slide. Authentication and billing errors pause immediately, and three consecutive failures pause the run. Save a study pack before closing the app to preserve completed work. Keep the app open while generation runs. Adding more decks preserves your existing material and checkpoints.

The workflow is implemented in `lib/study/agent.ts`, teaching instructions in `lib/study/prompts.ts`, and strict output checks in `lib/study/schemas.ts`. It uses the existing OpenAI Responses integration with [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs). No separate service installation is needed.

## How the tutor works

- PPTX reading happens in the browser: text, tables, speaker notes, and up to four embedded images per slide.
- PDF pages are rendered into images, with extracted text, so diagrams and layout can be read by the model.
- Explanations run one slide at a time. Cards and quizzes use batches of up to four slides, reduced further for image-heavy content. Completed batches are kept when you stop or a request fails; Continue resumes the remaining slides. Explain all skips already completed explanations for the current learning settings. Save a study pack to preserve this progress between app sessions.
- The server calls the OpenAI Responses API with `store: false` and strict structured outputs, then validates answer shape and source slide numbers.
- The teaching prompt distinguishes source content from additional teaching examples, defines terms, explains mechanisms, addresses misconceptions, and checks understanding.

Official implementation references: [Responses structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4).

## Limits and data handling

- 100 MB and 150 slides/pages per file, 12 files per selection, and 600 slides per collection. Extracted slide content is capped at 192 MB; saved study packs can be up to 256 MB.
- Older `.ppt` files must first be saved as `.pptx` or PDF.
- For PowerPoint charts, SmartArt, equation objects, and full layout interpretation, use a PDF export. Images that cannot be read are reported in Reading notes.
- Work and the API key live in browser memory. Reloading or closing the tab clears them. Save a study pack to retain your material. Quizhunter does not keep server-side copies of decks or keys; selected material and the key are sent through its server to OpenAI when you generate. OpenAI's applicable API data handling policies apply.
- Flashcard ratings and quiz attempts last while that study view stays mounted; saved study packs contain source files' extracted material and generated content, not practice history.
- Questions are independent, not a multi-turn conversation. The tutor uses the selected slide and a deck outline.
- Generated content can be wrong. Cross-check important details with the source.
- Quizlet export is import-ready text, not automatic creation in a Quizlet account. Anki export is TSV, not an `.apkg` package.

## Verification

The dedicated agent has automated checks for a full 150-slide run, partial failure and resume, cancellation, billing errors, source references, sparse-slide handling, saved checkpoints, and its structured API contract. Browser checks cover the agent panel, a 150-slide upload, the API-key gate, and restoring a run with 8 completed slides and 142 remaining. Model responses were mocked for automated tests; teaching quality has not been evaluated with a paid live model call.

Type checking and production build pass. Browser checks passed for sample lessons, flashcard reveal and missed-card review, multi-PowerPoint import with presentation order and notes, adding a PDF to an existing collection, and the WebMCP outline tool including invalid input rejection. Local API contract checks cover invalid keys, cross-origin requests, malformed input, source references across multiple large decks, structured-response validation, truncated outputs, and rate-limit handling with a mocked upstream response. Large-deck checks passed for two 150-slide PowerPoints together, a 150-page PDF, rejection of 151 slides without losing existing material, and restoring a partial study pack with 142 slides remaining. Automated checks cover 600-slide source references, saved progress, and image-aware batching. The initial desktop bundle was tested using its own embedded runtime; the updated bundle passed macOS code-signature verification. No paid live model request has been made during development.
