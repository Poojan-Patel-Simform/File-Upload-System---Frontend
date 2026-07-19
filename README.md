# UploadLab — File Upload Strategies, Compared

A demo of four different ways to get a file from a browser to storage, built to make the trade-offs between them concrete instead of theoretical. Each strategy is a fully working implementation — drop a file in and watch it upload, pause, resume, retry, and (for large files) chunk.

This is the frontend (Next.js 16 / React 19 / TypeScript). The backend lives in the sibling `file-upload-system--backend` repo (Express 5 + Prisma 7 + Postgres).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (this repo)                       │
│                                                                    │
│  Dropzone → useFileUpload*() hook → UploadQueueProvider (shared   │
│             cap across all 3 strategies)                         │
│                                                                    │
│  ┌───────────────┐ ┌──────────────────┐ ┌─────────────────────┐ ┌──────────────────────┐│
│  │  Traditional   │ │ Chunked          │ │ Chunked Worker Pool  │ │ Cloudinary Worker Pool││
│  │  single POST   │ │ Sequential       │ │ N concurrent workers │ │ N concurrent workers ││
│  └───────┬───────┘ └────────┬─────────┘ └──────────┬───────────┘ └──────────┬───────────┘│
│          │                  │  (share useFileUploadChunkedBase)              │            │
│          │                  └──────────────┬───────────────────────────────┬─┘            │
└──────────┼─────────────────────────────────┼───────────────────────────────┼──────────────┘
           │ multipart POST                  │ chunk POST                   │ chunk POST (direct)
           ▼                                  ▼                              ▼
┌────────────────────────────────────┐                          ┌─────────────────────┐
│   Express API (sibling repo)      │                          │      Cloudinary       │
│                                    │                          │  (chunked upload API) │
│  /uploads/single                  │                          └──────────┬────────────┘
│  /uploads/init  /uploads/chunk    │──────► Postgres (Upload, UploadChunk)          │
│  storage/traditional, /chunks,    │                          sign + confirm only ◄──┘
│  /merged  (local disk)            │──────► Postgres (CloudinaryUpload, CloudinaryUploadChunk)
│  /uploads/cloudinary/*            │
└────────────────────────────────────┘
```

Hashing (SHA-256, for dedup + integrity) runs on a dedicated Web Worker (`src/workers/hash.worker.ts`) so it never blocks the main thread, however large the file.

## Strategy comparison

| | Traditional | Chunked Sequential | Chunked Worker Pool | Cloudinary Worker Pool |
|---|---|---|---|---|
| **Bytes through our server** | Full file | Full file (in chunks) | Full file (in chunks) | None — chunks go straight to Cloudinary |
| **Resumable** | No | Yes, from last uploaded chunk | Yes, approximately (see below) | Yes, but only as far as our own bookkeeping knows (see below) |
| **Integrity check** | None | Per-chunk checksum + merge-time SHA-256 | Per-chunk checksum + merge-time SHA-256 | Chunk-count + total-size sanity check only (see below) |
| **Concurrency model** | 1 request | 1 chunk at a time | N chunks at once (shared cursor) | Chunk 0 first, then N chunks at once, last chunk last (Cloudinary's own ordering constraint) |
| **Best fit** | Small files, simplicity | Large files, constrained/flaky networks (each chunk isolated) | Large files, fast/stable networks (throughput) | Large files when you want a managed storage/CDN backend instead of your own disk |

All three strategies dedupe by whole-file SHA-256 hash before transferring any bytes — re-uploading a file the server already has a `COMPLETED` record for short-circuits immediately.

## Why these choices (not the more "textbook" ones)

**Race-safe merge, not a plain status update.** Two concurrent requests for a file's last chunk could both observe "all chunks present" and both try to merge. The backend uses a conditional `UPDATE ... WHERE status = 'UPLOADING'` — only one wins the transition to `MERGING`; the other sees `count === 0` and backs off. A plain `UPDATE` (no `WHERE` guard) would let both proceed and corrupt the merged file.

**Per-chunk checksums *and* a merge-time hash — not just one.** The merge-time SHA-256 check alone is sufficient for correctness, but it only tells you something went wrong *after* every chunk has already been sent. Verifying each chunk's checksum on arrival fails fast — the client finds out which specific chunk was corrupted immediately, not after uploading the whole rest of the file. The cost (one extra hash per chunk, already computed with the same primitive used for the final check) is cheap enough that fail-fast wins here.

**True resume-after-failure, not wipe-and-restart.** A naive implementation resets a `FAILED` upload to zero chunks on retry — simple, but it throws away real work every time a merge fails transiently (a disk hiccup, for instance). Instead, the backend re-verifies each surviving chunk file against its stored checksum and resumes from whatever's still valid, only falling back to a full wipe if the chunk directory itself is gone. This is the difference between "resumable" being a real property of the system versus just a label on the pause button.

**localStorage for resume metadata, not IndexedDB.** There are only ever a handful of in-flight uploads at once, and the record itself is a few small fields. IndexedDB is the "correct" answer at real scale (many uploads, complex queries), but reaching for it here would be machinery this project doesn't need — a textbook answer chosen out of habit rather than fit. The local record is also never trusted as a source of truth either way: it only drives the "resumable upload detected" prompt, and the server's own response to `/uploads/init` is what actually decides which bytes still need to go.

**A shared upload queue, not per-strategy caps.** All three strategies route through one `UploadQueueContext` instance so dropping ten files anywhere in the app never fires ten uploads (or, for the worker-pool strategy, up to 10× the per-file concurrency) at once — a real scheduling/backpressure concern, not just a UI nicety.

**One `useFileUploadChunkedBase`, not four copy-pasted hooks.** All three chunked strategies (sequential, worker pool, Cloudinary worker pool) share every piece of bookkeeping (hashing, init/resume handshake, pause/cancel/remove, the upload queue, resume-after-reload) and differ only in how they schedule chunks and (for Cloudinary) how they init/size chunks. That shared logic lives in one hook, parameterized by a `sendChunks` function plus two optional overrides (`initRequest`, `generateChunks`) that the Cloudinary strategy uses and the other two don't — so their behavior is unchanged.

**Known, accepted limitations** (not fixed, on purpose — scoping decisions, not oversights):
- Pause on the worker-pool strategies is approximate — up to `CONCURRENCY - 1` requests may already be in flight and complete after a pause is requested. Not a correctness issue (the server's bookkeeping is idempotent either way), just means the pause point isn't exact. For the Cloudinary strategy, the first-chunk and last-chunk phases are single in-flight requests that can't be pause-interrupted mid-request at all.
- The Web Worker hash is still a single-shot `crypto.subtle.digest` over the whole file buffer (not a streaming/incremental hash) — it no longer blocks the main thread, but a truly memory-bounded hash of a multi-GB file would need a WASM-based incremental hasher instead of the Web Crypto API, which has no incremental mode.
- **Cloudinary strategy: resume relies entirely on our own backend's bookkeeping, not on Cloudinary.** Cloudinary has no API to ask "what byte ranges have you received for this upload session" — so unlike the disk-based strategy (which re-verifies survivors against real files on disk), a resumed Cloudinary upload trusts our DB's record of which chunks were confirmed. See the backend README for the full list of Cloudinary-specific limitations (hard-restart-on-`FAILED`, best-effort vs. load-bearing chunk confirmations, size-only integrity check, placeholder signature max-age).

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Set `NEXT_PUBLIC_API_ENDPOINT` in `.env` to point at the backend (see the sibling `file-upload-system--backend` repo for setup — it needs a Postgres database). No frontend env var is needed for the Cloudinary strategy — the cloud name, API key, and signed upload URL all come back dynamically from the backend's `/uploads/cloudinary/init`; the backend does need `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` set for that strategy to actually work end-to-end.
