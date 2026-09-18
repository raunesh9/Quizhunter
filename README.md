# Quizhunter

A Mac desktop app and web app that reads PDFs and PowerPoints, curates flashcards and quizzes, and exports practice material as JSON.

**Live website: [quizhunter.raunesh9.workers.dev](https://quizhunter.raunesh9.workers.dev)**

The website is open to anyone with the link. Bring your own OpenAI API key to generate new study material; sample lessons and saved study packs work without a key. The Mac app also offers free local AI.

## Mac application

Open **Quizhunter.app** under `release/Quizhunter-darwin-arm64/` (or copy it to your Applications folder). It includes its own runtime and starts its own private local server; Node.js, a terminal, and the Codex preview are not needed to run the packaged app. Local AI works offline after the initial model download. OpenAI mode requires internet access and an API key.

To build the Mac app from source, run `npm run desktop:package`. The `.app` is created under `release/`. The renderer runs sandboxed with Node integration disabled. Source decks and API keys stay in memory for the app session; save a study pack before quitting.

## Using the app

1. Start on **Home**. Upload study material, open a saved pack, or choose **Explore a sample lesson**. Home shows your current collection with shortcuts to flashcards, quizzes, and the study studio. Returning Home keeps the collection in memory.
2. Upload one or several `.pptx` or `.pdf` files. You can add more later with **Add PowerPoints / PDFs**.
3. **Local AI** is selected by default in the Mac app. The hosted website selects **OpenAI** and requires your API key for generation; the sample lesson and saved study packs work without a key. The Mac app starts the bundled Ollama engine, using the downloaded `gemma3:4b` model without an API key. **Local AI · Settings** shows its status. Optionally select OpenAI and connect an API key to use GPT-5.4.
4. Choose **Quick** (the default for your own files) for concise explanations and focused practice, or **Thorough** for more detail. Choose a learning level and click **Build complete study pack**. The dedicated study agent explains each retained page at the selected pace, selects useful concepts for flashcards and quizzes, and checks source references. There is no per-page question quota: title-only pages, agendas, and housekeeping are excluded while useful introductory facts are included. You can also generate each type separately. The **Ask** tab answers independent questions about the selected slide.
5. In **Flashcards**, choose **Download flashcards JSON**. In **Quiz**, choose **Download quiz JSON**. You can also export TSV for Quizlet/Anki, explanations as Markdown, or save the whole collection as a study-pack JSON file.

Quiz questions are self-contained and shuffled across the whole collection each round, including retakes and missed-question review. Choosing a source slide does not restrict practice. **Rebuild flashcards** and **Rebuild quiz** replace old practice material; completed work is kept if you stop. Broken response fragments, unreadable repetition, presentation trivia, and duplicate questions are filtered from practice. Opening an older study pack recovers its valid cards and marks damaged content for regeneration.

Multiple decks retain their filenames and original slide numbers. Study-slide numbers are unique across the collection. The reader follows PowerPoint presentation order, including decks whose internal XML filenames are out of order.

## Home and removing content

**Home** has upload and saved-pack actions, Quick/Thorough choices, a sample lesson, and shortcuts back to the current collection. Clicking the logo or Home does not navigate away or reload the app. The current collection stays in memory; save a study pack before quitting.

Use **Manage pages** to search by topic or filename, select individual or matching pages, and remove them together. **Remove this page** removes the current page directly. Its explanations, cards, quiz questions, progress, and agent checkpoints are removed from the collection. Original files on disk are untouched. Study IDs and original page references remain stable when you add more files afterward. Removing the last page returns Home.

**Remove card**, **Remove question**, and **Remove explanation** hide individual items from practice and individual exports. **Undo** restores the latest removal. **Manage pages → Restore removed content** restores hidden practice items and explanations. Saved study packs retain hidden content and its removal markers so those choices survive reopening and remain reversible; JSON card/quiz exports and Markdown guides include only visible content. Removed source pages are excluded from saved packs. An explicit rebuild may generate different wording; remove the source page to exclude its topic altogether.

Quick mode uses shorter model responses, reuses completed Quick checkpoints, and batches small text-only practice requests. Thorough checkpoints are tracked separately so a short explanation does not stand in for a requested deep explanation. Generation can still be stopped and resumed; both modes use the same content and answer validation.

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

The live website is hosted on Cloudflare Workers. To publish an update after signing into Cloudflare, run `npm run build`, then `npx wrangler deploy --config dist/server/wrangler.json`. The build includes the app server and PDF reader assets. The existing `.openai/hosting.json` records the earlier Sites deployment.

## Local AI on this Mac

The app uses Ollama and `gemma3:4b` (text and vision). The engine is installed under `.local-ai/engine/` and is included when packaging this checkout. Models are stored in Ollama's standard `~/.ollama/models` folder and are not included in study packs or the application bundle. The first model download is about 3.3 GB. To download it on another Mac after starting the engine:

```sh
.local-ai/engine/ollama pull gemma3:4b
```

Development startup and the desktop app start the bundled engine automatically when port 11434 is not already serving Ollama. The engine binds to `127.0.0.1` and is started with cloud features disabled. It remains available after closing Quizhunter. Local generation uses a fixed local model, never silently falls back to a paid API, and only accepts local app requests. An existing Ollama installation can also supply the same model.

Local mode processes one page per complete bundle or explanation. Quick flashcard and quiz runs batch up to three short text-only pages (up to 6,000 source characters total), while visual and dense pages stay separate. Each batch requires an explicit result or exclusion reason for every source page; failed batches are retried page by page while preserving completed work. It supports page images, validates the same output structure as OpenAI mode, and retries malformed output once. The model supplies the correct quiz option as text; the app computes its zero-based answer index. Explicit contradictions between an answer letter and the explanation are rejected. Explanations are shorter to keep generation practical on a laptop. Dense pages over 30,000 extracted characters must be split; unsupported output is reported, not exported. Smaller local models can miss details or produce incorrect answers. Check material against its cited source.

Local generation is available in the Mac app or a local preview. A hosted website cannot reach the model on your Mac through its server. The hosted version uses OpenAI with a session-only API key; local AI is available in the Mac app and local preview.

Official references: [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs), [vision input](https://docs.ollama.com/capabilities/vision), [Gemma 3](https://ollama.com/library/gemma3:4b).

## PDF parser and JSON downloads

Mozilla PDF.js (`pdfjs-dist`) is installed in this project. `npm run setup:pdf` copies its matching worker, fonts, character maps, image decoders, and license into the local app. This also runs automatically after installation and before development or production builds. PDF parsing needs no API key or internet connection; generation uses the local model by default, with optional OpenAI API access.

Quick PDF reading handles at most two pages at a time and uses extracted text directly when the page has no detected graphics and a simple text layout. This avoids rendering and vision processing for those pages. Diagrams, scans, complex text layouts, and uncertain cases retain their images. Thorough reading renders every page. Repeated PowerPoint images are resized only once per file. It reports missing text, shortened text, and rendering failures in **Reading notes**. Scans are supplied as images, not guaranteed OCR text. Unlock password-protected PDFs before uploading.

Flashcard and quiz JSON exports contain `version`, `type`, `deck`, `sample`, and `coverage` metadata plus `cards` or `quiz`. Each item retains its unique study `slide` number and a `source` object containing `file`, original `position`, `unit` (`page` for PDFs or `slide` for PowerPoints), and `title`. Cards contain `front` and `back`. Quiz items contain `question`, four `options`, zero-based `answer`, and `explanation`; `answerIndexBase` is explicitly `0`.

`coverage.processedSources` and `coverage.pendingSources` identify completed and unfinished study-slide numbers, including processed dividers with no questions. JSON downloads include all generated items, even when the practice view is filtered to missed cards or questions. These compact exports omit source images and notes; use **Save study pack** to preserve source material and resume generation.

Example flashcard item:

```json
{
  "id": "card-1",
  "front": "What does this concept mean?",
  "back": "A concise, source-grounded answer.",
  "slide": 5,
  "source": { "file": "Lecture.pdf", "position": 2, "unit": "page", "title": "Concept" }
}
```

## Dedicated study agent

The agent runs one slide at a time and saves each validated lesson, flashcard set, and quiz together. A coverage list shows every source slide, its completion state, and any error. Blank slides, dividers, and unreadable material receive an explanation with a specific limitation instead of fabricated questions.

Stop pauses the run; Continue processes only unfinished slides. If one slide fails validation, the agent keeps it pending and tries the next slide. Authentication and billing errors pause immediately, and three consecutive failures pause the run. Save a study pack before closing the app to preserve completed work. Keep the app open while generation runs. Adding more decks preserves your existing material and checkpoints.

The workflow is implemented in `lib/study/agent.ts`, teaching instructions in `lib/study/prompts.ts`, and strict output checks in `lib/study/schemas.ts`. It uses the existing OpenAI Responses integration with [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs). Local mode uses the bundled Ollama service; OpenAI mode needs no additional service.

## How the tutor works

- PPTX reading happens in the browser: text, tables, speaker notes, and up to four embedded images per slide.
- PDF diagrams, scans, and complex layouts retain page images. Quick mode skips image rendering only for detected simple text pages.
- Explanations run one slide at a time. Cards and quizzes use batches of up to four slides, reduced further for image-heavy content. Completed batches are kept when you stop or a request fails; Continue resumes the remaining slides. Explain all skips already completed explanations for the current learning settings. Save a study pack to preserve this progress between app sessions.
- Local mode calls Ollama with a JSON schema; optional OpenAI mode calls the Responses API with `store: false` and strict structured outputs. Both validate answer shape and source slide numbers.
- The teaching prompt distinguishes source content from additional teaching examples, defines terms, explains mechanisms, addresses misconceptions, and checks understanding.

Official implementation references: [Responses structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4).

## Limits and data handling

- 100 MB and 150 slides/pages per file, 12 files per selection, and 600 slides per collection. Extracted slide content is capped at 192 MB; saved study packs can be up to 256 MB.
- Older `.ppt` files must first be saved as `.pptx` or PDF.
- For PowerPoint charts, SmartArt, equation objects, and full layout interpretation, use a PDF export. Images that cannot be read are reported in Reading notes.
- Work and the API key live in browser memory. Reloading or closing the tab clears them. Save a study pack to retain your material. Quizhunter does not keep server-side copies of decks or keys; local generation processes material on your Mac. If you select OpenAI, selected material and the key are sent through the app server to OpenAI; OpenAI's applicable API data handling policies apply.
- Flashcard ratings and quiz attempts last while that study view stays mounted; removing an item starts a new practice round; saved study packs contain source files' extracted material and generated content, not practice history.
- Ask-tab questions are independent, not a multi-turn conversation. That tutor uses the selected slide and a deck outline; flashcards and quizzes cover the entire collection.
- Generated content can be wrong. Cross-check important details with the source.
- Quizlet export is import-ready text, not automatic creation in a Quizlet account. Anki export is TSV, not an `.apkg` package.

## Verification

The dedicated agent has automated checks for a full 150-slide run, partial failure and resume, cancellation, billing errors, source references, sparse-slide handling, saved checkpoints, and its structured API contract. Browser checks cover the agent panel, a 150-slide upload, the API-key gate, and restoring a run with 8 completed slides and 142 remaining. Model responses were mocked for automated tests; teaching quality has not been evaluated with a paid live model call.

Type checking and production build pass. Browser checks passed for sample lessons, flashcard reveal and missed-card review, multi-PowerPoint import with presentation order and notes, adding a PDF to an existing collection, and the WebMCP outline tool including invalid input rejection. Local API contract checks cover invalid keys, cross-origin requests, malformed input, source references across multiple large decks, structured-response validation, truncated outputs, and rate-limit handling with a mocked upstream response. Large-deck checks passed for two 150-slide PowerPoints together, a 150-page PDF, rejection of 151 slides without losing existing material, and restoring a partial study pack with 142 slides remaining. Automated checks cover 600-slide source references, saved progress, and image-aware batching. The initial desktop bundle was tested using its own embedded runtime; the updated bundle passed macOS code-signature verification. No paid live model request has been made during development.

PDF and export checks cover page provenance across multiple files, partial coverage, Unicode JSON round trips, missing sources, empty answers, duplicate quiz options, scans, damaged or locked files, parser cleanup, and matching parser/worker versions. Model output is mocked in automated tests.

A live offline-model check successfully rendered and read a sample PDF, then generated a validated complete study bundle with 4 flashcards and 2 quiz questions in 81 seconds on this Mac. Sample JSON files are in `outputs/local-ai-flashcards.json` and `outputs/local-ai-quiz.json`. No OpenAI API key or paid model call was used. Automated checks: 26 study/PDF/export/local-provider tests plus the desktop serving check; type checking and the production build passed. The refreshed Mac app passed code-signature verification. Native UI launch could not be verified because computer-control permission was unavailable.

The final packaged app was also checked with its own embedded runtime: the page returned 200, local AI reported ready, and PDF.js assets reported version 6.3.289. Sample JSON was reviewed for answer consistency; one flashcard question was clarified to distinguish chemical reactants from the light-energy input.

Practice curation update: 35 automated study/parser/export/provider checks pass, including randomized rounds and missed-question retries, broken flashcard rejection, recovery of older packs, duplicate filtering, and retention of useful opening pages. A live Gemma 3 check excluded a cover-page image, retained a useful introductory flashcard, and produced a standalone concept quiz. Type checking and the production build pass.

Home/removal/performance update: 46 automated checks cover removal and undo snapshots, saved hidden content, source-ID stability after appending files, Quick/Thorough checkpoints, bounded parser concurrency, graphics/layout preservation, and compact local output. Browser checks verified the home screen, sample cards/questions/explanation removal, page removal and undo, a real PDF upload in Quick mode, and returning Home after removing the final page. In one real local-model sample, a complete Quick pack took 53 seconds versus 112 seconds for Thorough (including a validation retry in the Thorough run); Quick produced two cards and one quiz with shorter explanations. Warm PDF parsing of that simple one-page sample took 4 ms versus 36 ms. These are sample observations, not general latency guarantees.

The corrected local batch format was also tested live: all three short sample pages contributed a flashcard (17 seconds total) and a quiz question (29 seconds total). Each page has a separately validated practice decision; invalid batched responses are split into single-page requests in the client.
