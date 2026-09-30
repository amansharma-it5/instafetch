# InstaFetch first 100 users

This is an internal, unpublished launch checklist for the first 100 genuine sessions. Do not post these drafts automatically.

## Current support promise

- **Verified:** public Instagram Reels with anonymous resolve, preview, and download.
- **Beta:** public YouTube videos and Shorts when the current server can access genuine anonymous formats.
- **Conditional:** Instagram photos, carousels, Stories, and legacy TV links.
- No Instagram or YouTube login, cookies, private-content access, or bypasses are used. Download only content you own or have permission to save.

## Feedback path

The site links to `/contact#feedback`, where collaborators can open the structured GitHub bug or feature template. Reports must not include passwords, cookies, private links, signed preview/download URLs, tokens, captions, or personal information. The repository is private, so the owner must grant issue access or provide another approved contact channel before inviting people without repository access.

## Five tester questions

1. Did you immediately understand what the site does?
2. Did your public Reel or video resolve?
3. Did the preview work?
4. Did the download work and play correctly?
5. What confused you or felt unnecessary?

Optional: What feature would you want next?

## Aggregate metrics

Record only weekly totals or category counts, never submitted URLs, usernames, titles, captions, tokens, filenames, IP addresses, or provider addresses.

- **Resolve success rate:** successful resolve responses divided by resolve attempts, grouped by `reel`, `youtube`, or `unknown`.
- **Preview success rate:** successful preview responses divided by preview attempts.
- **Download success rate:** successful downloads divided by download attempts; validate a small sample for non-zero bytes and playable media.
- **Failure distribution:** counts by normalized code such as invalid URL, login required, unavailable, timeout, rate limited, server busy, too large, or provider failure.
- **Retry frequency:** aggregate count of repeated attempts after a failure; do not link attempts to a person or URL.
- **Language usage:** aggregate language-change counts only when the owner intentionally enables the existing privacy-safe sink; analytics stays disabled by default.
- **Format demand:** counts of Photo, Carousel, Story, or TV requests from safe feedback categories only.

## First 100 plan

**First channel:** r/SideProject, with an answer-first builder-feedback post after checking its current rules. **Second channel:** Indie Hackers, using a build-story thread focused on honest Reel-first scope and feedback rather than a drive-by link.

1. Verify the live homepage, legal pages, health endpoints, and one approved Reel smoke test.
2. Invite ten permission-based testers who already have a public Reel to save; ask each for one success and one failure report without private links.
3. Share one answer-first post in a relevant community only after checking its current rules.
4. Use one personal social post for additional testers; answer questions instead of repeating the link.
5. Review normalized failures and feedback themes after each ten sessions. Change copy only when the same confusion repeats.
6. Count genuine sessions, successful Reel results, safe failure categories, and qualitative feedback. Do not optimize for forced clicks.
7. Revisit Photos/Carousels only after at least 15 category requests or five repeated requests over 30 days, and only after fresh provider/terms research.
8. Revisit YouTube hosting only when repeated demand justifies an owner-approved hosting decision; do not add authentication or bypasses.
9. Do not add features because of one request, vanity traffic, or provider pressure. Protect the verified Reel path first.

## Unpublished launch drafts

### Reddit — r/SideProject

**Title:** I built a no-login downloader focused on public Instagram Reels — looking for honest first-use feedback

> I built InstaFetch around a narrow promise: paste a public Instagram Reel, see a genuine preview, and download the available media without an Instagram password or cookie. Reels are verified in production; YouTube is Beta and photos, carousels, Stories, and legacy TV stay conditional because anonymous availability changes. I’m looking for feedback on clarity and mobile usability: https://instafetch.pages.dev

### Indie Hackers

**Title:** Launching a privacy-first public Reel downloader with honest limits

> InstaFetch validates public links, resolves verified Instagram Reels, and keeps preview/download links short-lived. It never asks for credentials or private access. I’m testing whether first-time users understand the Reel-first scope and error messages. What would you improve before a wider launch? https://instafetch.pages.dev

### X

> Built InstaFetch: a clean, no-login way to preview and download public Instagram Reels. Reels are verified; YouTube is Beta and other formats stay conditional when a platform requires login. https://instafetch.pages.dev

### Product Hunt

**Tagline:** A no-login downloader for public Instagram Reels.

> InstaFetch helps you preview and download publicly accessible Instagram Reels without an Instagram login. Reels are verified; other public media may work when a genuine file is exposed anonymously. Temporary links, clear errors, and no private-content bypasses. https://instafetch.pages.dev

### Direct tester invite

> Could you try one public Instagram Reel at https://instafetch.pages.dev and tell me: did you understand the site, did resolve work, did preview work, and did the download play? Please do not send the Reel URL, passwords, cookies, private links, tokens, or personal information. A safe error message and your browser/device are enough.

Do not publish any draft until the owner checks the destination's current rules and is ready to answer feedback.

## Triage model

- **P0:** security issue, provider/CDN leak, sensitive-data exposure, or production outage. Stop launch activity, preserve evidence without retaining user content, and fix before further traffic.
- **P1:** verified Instagram Reel flow broken or downloads invalid. Hotfix before continuing outreach.
- **P2:** major UX, accessibility, reliability, or repeated error-classification problem. Schedule the smallest safe fix.
- **P3:** minor polish or feature request. Batch only after launch stability is established.

For every report, reproduce with a safe public URL only when the reporter explicitly supplies one and has permission. Record the normalized error code and category, not the URL or account identity.
