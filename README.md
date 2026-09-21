# Quizhunter

A Mac desktop app and web app that reads PDFs and PowerPoints, curates flashcards and quizzes, and exports practice material as JSON.

**Live website: [quizhunter.raunesh9.workers.dev](https://quizhunter.raunesh9.workers.dev)**

The website is open to anyone with the link. Bring your own OpenAI API key to generate new study material; sample lessons and saved study packs work without a key. The Mac app also offers free local AI.

## Mac application

Open **Quizhunter.app** under `release/Quizhunter-darwin-arm64/` (or copy it to your Applications folder). It includes its own runtime and starts its own private local server; Node.js, a terminal, and the Codex preview are not needed to run the packaged app. Local AI works offline after the initial model download. OpenAI mode requires internet access and an API key.

To build the Mac app from source, run `npm run desktop:package`. The `.app` is created under `release/`. The renderer runs sandboxed with Node integration disabled. Collections are saved automatically in the local Library. The desktop library uses files under Electron’s user-data folder and persists independently of the private server’s port. API keys remain in memory only. The browser preview uses IndexedDB for its library; its storage is separate from the Mac app.

## Using the app

1. Start on **Home** and upload PDFs or PowerPoints, import an existing study-pack JSON, or try the sample. Use **New collection** for a separate topic and **Add files** to extend the open collection.
2. In **Study studio**, the persistent **Previous / Go to slide / Next** bar lets you jump directly to any page. Left/right arrow keys also move through explanations and diagrams when you are not typing or in a dialog. **Manage slides** opens a searchable selector for choosing several pages or deleting them. Its checkbox list stays out of the main workspace.
3. Choose a generation scope: **Current slide** (the default), **Selected slides**, or **All slides**. **Quick** builds a brief core explanation, 1–2 flashcards, and one quiz where useful. **Thorough** adds richer teaching detail. Completed work is reused and each finished page is saved; Stop interrupts the pending request without discarding earlier results. Local AI uses the installed Gemma 3 model without an API key. OpenAI remains optional.
4. **Explain** shows a short overview. Choose **Open full explanation** to read the complete lesson in its own in-app tab, with a picker and arrow controls for saved explanations. Return to the study studio without changing its selected slide; close the reading tab with its × button. Existing lessons remain available even when their original settings differ from your current options. Regenerate a single explanation when you want a different style. **Flashcards** and **Quiz** show all saved practice by default; optionally filter them to the current generation scope. Questions are self-contained and shuffled each round.
5. **Diagrams** displays the actual source images with an enlarge control. **Analyze diagram** asks the visual model to describe visible components, labels, arrows, chart axes, relationships, and limitations. Analyses are saved. Quick PDF import retains diagrams and scans; if an image is missing, import that PDF in Thorough mode in a new collection.
6. **Library** is a separate navigation tab for saved collections. Filter for quizzes, flashcards, explanations, or diagrams and open them directly. Collections persist across normal app restarts. Download a study pack for a portable backup or transfer it between the Mac app and browser. Older packs can be imported with **Import pack**.
7. Download cards and quizzes as JSON, cards as TSV for Quizlet/Anki, or explanations as Markdown. API keys are never stored in packs or the library.

## Removing content

**Manage slides → Delete current slide / Delete selected** removes source pages and their related explanations, cards, questions, diagram analyses, and checkpoints. Deletion stops an active generation request before changing its source collection. **Undo** restores the last removal. Original files on disk are untouched, and remaining source IDs and original page numbers stay stable.

Individual card, question, explanation, and diagram-analysis removal controls are in their respective views. Hidden cards/questions/explanations can be restored through **Manage slides**. Deleting a library collection also offers Undo during the current session. An explicit regeneration can produce new wording; delete the source slide to exclude its topic entirely.

Quick mode uses a compact local bundle format, avoids regenerating completed work, and batches short text-only practice requests. A saved Thorough bundle can satisfy Quick mode; a Quick bundle does not stand in for a requested Thorough explanation. Corrupt output and invalid source references are rejected. Explicit A–D labels can be normalized to answer indices, but ambiguous answer letters are never guessed. Older packs recover usable practice and explanations while removing broken response fragments.

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
- Explanations run one slide at a time. Cards and quizzes use batches of up to four slides, reduced further for image-heavy content. Completed batches are kept when you stop or a request fails; Continue resumes the remaining slides. Generation honors the selected scope and explanations already available. Progress is saved to the Library between sessions.
- Local mode calls Ollama with a JSON schema; optional OpenAI mode calls the Responses API with `store: false` and strict structured outputs. Both validate answer shape and source slide numbers.
- The teaching prompt distinguishes source content from additional teaching examples, defines terms, explains mechanisms, addresses misconceptions, and checks understanding.

Official implementation references: [Responses structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4).

## Limits and data handling

- 100 MB and 150 slides/pages per file, 12 files per selection, and 600 slides per collection. Extracted slide content is capped at 192 MB; saved study packs can be up to 256 MB.
- Older `.ppt` files must first be saved as `.pptx` or PDF.
- For PowerPoint charts, SmartArt, equation objects, and full layout interpretation, use a PDF export. Images that cannot be read are reported in Reading notes.
- Collections persist in the local Library; API keys and Ask conversations stay in memory. Clearing browser site data clears the browser library, so keep portable backups. The Mac app stores its library in its private local user-data directory. Quizhunter does not keep cloud server copies of decks or keys; local generation processes material on your Mac. If you select OpenAI, selected material and the key are sent through the app server to OpenAI; OpenAI's applicable API data handling policies apply.
- Flashcard ratings and quiz attempts last while that study view stays mounted; newly generated material does not reset the current practice round; saved study packs contain source files' extracted material and generated content, not practice history.
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


Library, navigation, and diagrams update: regression coverage includes settings-independent lesson lookup, selected-source scoping, cancellation before a deleted page can commit, diagram provenance/removal, corrupt lesson recovery, ordered durable desktop library writes and reopening, and compact bundle validation. Browser checks cover library reopening after reload, slide navigation, deletion/Undo, and filtered practice. A synthetic local-model test produced a validated Quick bundle in 21 seconds and an image-only diagram analysis in 15 seconds on this Mac, without a retry. These are small-source observations, not general latency guarantees; local-model accuracy and coverage still depend on the source and model.
