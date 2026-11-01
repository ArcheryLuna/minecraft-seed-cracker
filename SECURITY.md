# Security Policy

## Supported versions

Only the latest version on the default branch gets security fixes.

## Reporting a vulnerability

Please don't report security problems in public issues.

Report them privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Include:

- What the problem is and what an attacker could do with it.
- Steps to reproduce it, or a proof of concept.
- The browser and version you used.

You should get a reply within 7 days. Once a fix is ready, we'll agree with you on when to publish details, and credit you if you'd like.

## Scope

Seed Cracker runs entirely in the browser. There is no server-side code, no accounts and no uploads. Structure lists stay in the browser's local storage.

In scope:

- Input that crashes the page, hangs it, or runs code (the structure form, pasted lists, saved local storage).
- Problems in the Web Workers, the WebAssembly module or the WebGPU shader, such as reading or writing outside their buffers.
- Generated downloads (TXT, PDF, Excel) that could harm the person opening them.
- Vulnerable dependencies that actually affect this site.

Out of scope:

- The seed-cracking results themselves. Finding world seeds is what the tool does.
- Slow searches the user starts on purpose. Long searches can be stopped, and the GPU runs in small batches.
- Problems in third-party sites the result links to, such as online seed maps.
- Reports from automated scanners with no demonstrated impact.
