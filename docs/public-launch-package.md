# InstaFetch Public Launch Package

This document is the internal launch package for the current InstaFetch release. It is ready for review and reuse, but it has not been posted to any external community. It contains no user data, credentials, or third-party media.

**NO CODE CHANGES REQUIRED.** The current product, security controls, and deployment are sufficient for a careful public marketing launch. This package keeps the product claim narrow: public Instagram Reels are verified; other media types remain conditional on anonymous availability.

## A. Launch positioning

**One-line tagline**

Save public Instagram Reels with a clean, private-first flow.

**20-word description**

InstaFetch helps you download publicly accessible Instagram Reels with real previews, best available quality, no login, and short-lived secure links.

**50-word description**

InstaFetch is a lightweight public Instagram Reel downloader for people who want a clear, private-first way to save media they can access. Paste a public link, review the real result, and download a short-lived file. Reels are verified; other public videos, photos, carousels, Stories, and legacy TV links remain conditional.

**100-word description**

InstaFetch is a privacy-first utility for downloading publicly accessible Instagram Reels through a browser workflow. Paste a supported public link, let the service check what Instagram exposes anonymously, preview the real media, and download the file. Public Reels are the verified path, including video and audio when the source provides both. Public videos, photos, carousels, Stories, and legacy TV links may work, but availability varies and no success is promised. InstaFetch never asks for Instagram passwords, cookies, or private-account access. Links and temporary files expire. Use the service only for media you own or have permission to save, reuse, or archive.

**Elevator pitch**

InstaFetch is a small, privacy-first web utility for saving public Instagram Reels. It validates the link, shows a genuine preview, and returns a short-lived download without asking for an Instagram login. The product reports the real availability of each request instead of promising that every public post is downloadable.

**Why use it**

- A focused Reel workflow with a clear preview before saving.
- No Instagram password, cookie, browser profile, or private-account access.
- Short-lived application links keep upstream media addresses out of the browser response.
- Responsive UI for phones, tablets, and desktop browsers.
- Honest failure messages when Instagram does not expose a usable anonymous file.

**Privacy-first explanation**

InstaFetch is designed around public links and temporary processing. The service does not request Instagram credentials or access private posts. Optional browser analytics is disabled by default and, when deliberately enabled, accepts only an allowlisted event name and a broad media category; it does not receive URLs, usernames, captions, tokens, filenames, or provider addresses.

**Limitations statement**

Public Reels are the only fully live-verified path. Public video posts, photos, carousels, Stories, and legacy TV links are conditional because Instagram may require login, expose only a thumbnail, change its response, or omit a downloadable file. InstaFetch does not work around those restrictions.

## B. Homepage conversion audit

The current homepage has no launch-blocking conversion issue:

1. The hero states “Verified Reel downloads” and explains that other public media may work only when anonymously exposed.
2. The input has a visible label, paste and clear actions, keyboard submission, validation, and a disabled state while resolving.
3. Processing includes a slow-request message for a sleeping free instance instead of showing a premature failure.
4. Result cards use application preview/download URLs and show real dimensions, type, and quality when available.
5. Error states distinguish invalid links, login-required content, rate limits, timeouts, provider failures, and expired temporary links.
6. The supported-content section marks Reels “Verified” and keeps Photo, Carousel, Story, and TV conditional.
7. Privacy, terms, disclaimer, contact, footer credit, and language controls are visible and linked.
8. The 320–1920px responsive checks show no horizontal overflow, and the existing Playwright suite covers the primary interaction path.

No copy or layout change is required before launch. The launch copy in this document is the approved source for external descriptions.

## C. Search indexing preparation

### Current site inventory

The production origin is `https://instafetch.pages.dev`. The site exposes these public pages in its generated sitemap:

- `/`
- `/privacy`
- `/terms`
- `/disclaimer`
- `/contact`

`robots.txt` allows normal public pages, points to the production sitemap, and disallows API, preview, and temporary download paths. Canonical, Open Graph, Twitter, JSON-LD, and sitemap origins are generated from the configured site origin and do not use branch-preview hostnames in production. No indexing work requires a code change.

### Google Search Console checklist (manual)

Google’s Sitemaps report accepts a sitemap URL, tests whether it is fetchable, and reports parsing and crawl status. It does not guarantee that every listed URL will be indexed ([Google Search Console Sitemaps report](https://support.google.com/webmasters/answer/7451001?hl=en)).

1. Sign in to Google Search Console with the site owner account.
2. Add a URL-prefix property for `https://instafetch.pages.dev/` while that is the production origin. A future custom domain should be added as a separate property after DNS and Pages configuration are complete.
3. Complete one of Google’s offered ownership-verification methods. Keep any verification value out of this repository unless a separate, approved code change is requested.
4. Open **Sitemaps** and submit `https://instafetch.pages.dev/sitemap.xml`.
5. Open **URL inspection** for `/`, `/privacy`, `/terms`, `/disclaimer`, and `/contact`. Request indexing only after the live inspection reports a successful fetch.
6. Review Page indexing, HTTPS, Core Web Vitals, and Enhancements reports weekly during the first month. Treat indexing as a search-engine decision, not a product guarantee.

### Bing Webmaster Tools checklist (manual)

Bing accepts XML sitemaps and also discovers a sitemap referenced in `robots.txt` ([Bing sitemaps guidance](https://www.bing.com/webmasters/help/sitemaps-3b5cf6ed)).

1. Sign in to Bing Webmaster Tools and add `https://instafetch.pages.dev/`; verify ownership using the offered DNS or HTML method.
2. Submit `https://instafetch.pages.dev/sitemap.xml` in the Sitemaps page.
3. Inspect the homepage and legal/support URLs for crawl or policy issues.
4. Use manual URL submission sparingly for a newly changed page. Bing recommends IndexNow for sites that frequently publish or update URLs, but this five-page static site does not need a key file or new integration today. IndexNow notifications improve discovery but do not guarantee indexing ([Bing IndexNow](https://www.bing.com/indexnow/getstarted), [Bing URL submission](https://www.bing.com/webmasters/help/URL-Submission-62f2860b)).

### Search hygiene

- Keep the sitemap limited to the five public pages; never add `/api`, `/preview`, `/download`, tokenized URLs, or user-generated result pages.
- Keep the canonical origin stable while `pages.dev` is production. When a custom domain is actually configured, set `VITE_SITE_URL` and regenerate the Pages build before requesting migration indexing.
- Do not create thin pages for every keyword or claim that photos, carousels, Stories, or private posts are guaranteed.

## D. Keyword strategy

The strategy targets the verified Reel path first and uses conditional wording for other formats.

**Primary keywords**

- instagram reel downloader
- download instagram reels
- instagram reels downloader online
- save public instagram reel
- instagram reel downloader no login

**Secondary keywords**

- instagram video downloader
- download public instagram video
- instagram reel mp4 download
- reel downloader for mobile
- save instagram reel with audio
- public instagram media downloader
- instagram downloader privacy first
- download reel from link

**Long-tail map**

| Query | Intended page/section | Claim guardrail |
| --- | --- | --- |
| download a public Instagram Reel | Home hero | Say “public” and “when available.” |
| Instagram Reel downloader without login | Home + privacy | Explain no login is requested. |
| save Instagram Reel to phone | Home how-it-works | Do not promise every device or post. |
| download Reel MP4 with audio | Home FAQ | Audio is present when the source exposes it. |
| Instagram Reel downloader online free | Home metadata | Do not promise unlimited capacity. |
| paste Instagram Reel link to download | Home input | Describe the real three-step flow. |
| best available quality Instagram Reel | Home results | “Best available” means provider-returned quality. |
| Instagram Reel preview before download | Home results | Preview is application-mediated and temporary. |
| public Instagram video downloader | Video supported card | Mark video posts conditional. |
| why Instagram Reel download fails | FAQ | Explain anonymous access and changing provider responses. |
| Instagram downloader no password | Privacy + FAQ | State that credentials are never requested. |
| download Reel on iPhone browser | How it works | Explain responsive browser use; avoid OS guarantees. |
| download Reel on Android browser | How it works | Same guardrail as iPhone. |
| Instagram Reel link not working | FAQ | Offer retry and explain availability. |
| save my own Instagram Reel | Privacy/disclaimer | Encourage rights and permission. |
| anonymous Instagram Reel downloader | Privacy + hero | Anonymous means no user login, not guaranteed access. |
| Instagram Reel video with sound | FAQ | Audio depends on exposed source formats. |
| public Instagram post downloader | Supported content | Posts are conditional outside verified Reels. |
| Instagram photo downloader public post | Photo card | Never imply guaranteed photo support. |
| Instagram carousel downloader public | Carousel card | Never imply complete carousel resolution. |
| Instagram Story downloader without login | Story card | State limited/conditional availability. |

Recommended page mapping is the existing homepage, legal pages, and FAQ; no additional SEO landing pages are needed until search data shows a genuine need.

## E. Reddit launch plan

Reddit’s official spam guidance prohibits repeated or unsolicited mass engagement and asks users whose contributions are primarily business links to be thoughtful about frequency ([Reddit Spam](https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam)). The safe approach is to participate in an existing discussion, answer the question first, disclose that InstaFetch is your project, and post only where the live sidebar permits self-promotion.

### Candidate communities and fit

- **r/SideProject:** best initial fit for a transparent build story and feedback request. Check current flair and self-promotion rules before posting.
- **r/indiehackers:** useful for a launch retrospective, reliability lessons, and privacy decisions. Use the current promotion/showcase category if available.
- **r/webdev:** only for a technical post about safe public-media handling; avoid a drive-by product link and follow the community’s current showcase rules.
- **r/InternetIsBeautiful:** consider only after confirming that a small utility meets its current submission requirements and provides a genuinely useful public experience.
- **r/Entrepreneur:** lower fit for an early utility; use only a relevant weekly feedback thread if its current rules allow it.

Community rules change, so the live sidebar is authoritative. Do not create multiple accounts, mass-post identical copy, automate replies, or ask for upvotes.

### Three unpublished drafts

**Draft 1 — builder feedback (r/SideProject or r/indiehackers)**

> I built InstaFetch, a small public Instagram Reel downloader focused on a clean, no-login flow. Paste a public Reel link, preview the real media, and download the short-lived file. Reels are the path I have verified end to end; photos, carousels, Stories, and legacy TV links stay conditional because Instagram does not expose them consistently without login. I would value feedback on the first-run experience and error messages: https://instafetch.pages.dev

**Draft 2 — privacy angle (a relevant privacy/tool thread)**

> I wanted a media utility that never asks for an Instagram password, cookie, or browser profile. InstaFetch accepts public links, keeps provider addresses server-side, and reports when anonymous access is unavailable. It is intentionally Reel-first rather than claiming every Instagram format works. Feedback on the privacy wording is welcome: https://instafetch.pages.dev

**Draft 3 — answer-first reply**

> If the link is a public Reel, InstaFetch can be worth trying: https://instafetch.pages.dev. It shows a real preview before download and does not ask for login details. A public post can still fail if Instagram requires login or does not expose a downloadable file, so I would not promise it for every photo or carousel.

Do not publish any draft until the relevant community rules and the surrounding conversation make it appropriate.

## F. Product Hunt package

Product Hunt allows makers to submit their own product from a personal account; company accounts cannot post. Its guidance recommends becoming familiar with the community before posting, and newly created accounts may need to wait a week before posting ([How to post a product](https://help.producthunt.com/en/articles/479557-how-to-post-a-product), [Before launch](https://www.producthunt.com/launch/before-launch)). Product Hunt also warns against paying hunters or rewarding upvotes ([Sharing your launch](https://www.producthunt.com/launch/sharing-your-launch)).

**Product name:** InstaFetch

**Tagline:** A private-first downloader for public Instagram Reels.

**260-character description:**

InstaFetch helps you preview and download publicly accessible Instagram Reels without an Instagram login. Reels are verified; other public media may work when Instagram exposes a genuine file anonymously. Temporary links, clear errors, and no private-content bypasses.

**Long description:**

Paste a public Instagram link, review the media that is genuinely available, and save it through a short-lived application link. InstaFetch is designed around public access, no credentials, and honest capability labels. Public Reels are verified with video and audio when the source exposes both. Photos, carousels, Stories, and legacy TV links remain conditional because anonymous availability changes by post.

**Maker comment:**

I built InstaFetch to keep a simple utility honest. The product does not ask for Instagram credentials, harvest cookies, or attempt to open private posts. The Reel path is verified in production; when Instagram does not expose a file anonymously, the interface reports that instead of showing a fake download.

**First comment prompts:**

- Which part of a public-media downloader should explain its limitations more clearly?
- Would you prefer a shorter result card or more format details before saving?
- Which conditional format would you try first, knowing that anonymous availability is not guaranteed?

**Launch assets to prepare locally:**

- The existing square social preview and favicon.
- One 1440px desktop screenshot and one 375px mobile screenshot using synthetic or owned media only.
- A short screen recording that shows paste → resolve → preview → download with no personal account content.
- A text note that the product is not affiliated with Instagram or Meta.

Do not submit until a personal Product Hunt account, maker profile, screenshots, and a response plan are ready. Do not pay a hunter, buy votes, or run an upvote incentive.

## G. Social launch copy

All drafts below are internal and unpublished. Replace no claims with “everything” or “100% success.”

### X / Twitter

**Short:**

> Built InstaFetch: a clean, no-login way to preview and download public Instagram Reels. Reels are verified; other formats stay conditional when Instagram requires login. https://instafetch.pages.dev

**Medium:**

> Public Reel → real preview → short-lived download. InstaFetch keeps upstream media addresses out of the browser response and never asks for passwords or cookies. It reports when Instagram does not expose a file anonymously. https://instafetch.pages.dev

**Builder story:**

> The product decision I kept was simple: never fake success. InstaFetch verifies public Reels end to end, preserves audio when Instagram exposes it, and labels photos, carousels, Stories, and TV as conditional. Honest limits make a better utility. https://instafetch.pages.dev

### LinkedIn

**Short:**

> InstaFetch is now ready for careful public feedback: a privacy-first downloader for publicly accessible Instagram Reels.

**Medium:**

> I built InstaFetch around a narrow promise: public Reels with a genuine preview and download, without Instagram credentials. The app keeps temporary links short-lived and makes conditional formats explicit instead of hiding failures. I’m looking for feedback on clarity and mobile usability. https://instafetch.pages.dev

**Builder story:**

> Shipping a small utility taught me that reliability copy is part of the product. A public URL does not always mean an anonymous downloadable file. InstaFetch treats that as a normal outcome, explains it clearly, and keeps its verified Reel path front and center.

### Instagram

**Short caption:**

> Public Reel in. Real preview out. InstaFetch keeps the flow simple and never asks for your Instagram login. Availability still depends on what Instagram exposes publicly. Link in bio copy: https://instafetch.pages.dev

**Medium caption:**

> Save a public Reel with a quick preview and a temporary download link. Reels are verified; photos, carousels, Stories, and older TV links can vary. Use only media you own or have permission to save.

**Builder story caption:**

> We built InstaFetch with a rule: no passwords, no cookies, no private-content shortcuts, and no fake download buttons. The app tells you what is genuinely available and leaves the choice in your hands.

### Facebook

**Short:**

> InstaFetch is a lightweight public Instagram Reel downloader with previews, no login, and clear availability messages: https://instafetch.pages.dev

**Medium:**

> Copy a public Instagram Reel link, paste it into InstaFetch, preview the real media, and download the available file. Reels are verified; other public formats depend on anonymous availability. Please download only content you have permission to use.

**Builder story:**

> Instead of promising every Instagram post, InstaFetch focuses on a verified Reel flow and transparent limits. That keeps the utility useful without asking for credentials or accessing private content.

### Indie Hackers

**Short:**

> Launched a privacy-first public Reel downloader. Looking for feedback on the first-run experience and how clearly the conditional formats are explained.

**Medium:**

> InstaFetch validates public Instagram links, resolves verified Reels, and keeps preview/download links temporary. Photo, carousel, Story, and TV support remains conditional because anonymous extraction is inconsistent. What would you improve before a wider launch? https://instafetch.pages.dev

**Builder story:**

> My launch constraint was more important than a feature checklist: no login scraping, no cookies, no stealth automation, and no fake success. That left a smaller but defensible product. I’m testing whether the honest Reel-first positioning is clear enough for new users.

## H. Demo content plan

Use only media created by the maker, public-domain media, or synthetic test fixtures. Do not record a third party’s Instagram post without permission. Blur usernames and remove URL query strings from recordings.

**Thirty-second demo script**

- **0–4s:** Show the InstaFetch homepage and the “Verified Reel downloads” message.
- **4–9s:** Paste an owned/public Reel link; keep the URL visible only long enough to show the input flow, then crop or blur it in the final asset.
- **9–15s:** Show the processing state and the slow-server message if demonstrating a cold start.
- **15–22s:** Show the result card with video badge, 1080×1920 dimensions, and preview controls.
- **22–27s:** Click download and show the browser save completing; never show a provider URL.
- **27–30s:** End on “Public Reels verified · No login · Availability varies by format.”

## I. Feedback readiness

The Contact route now links to structured bug and feature templates without adding a feedback SaaS, chat widget, or user database. The repository is private, so grant issue access to invited testers or provide another approved contact channel before sharing the link broadly.

Suggested privacy-safe prompts:

- Which browser and device did you use?
- Was the link a Reel, photo, carousel, Story, or TV URL?
- What user-safe error code or message appeared?
- Did the preview load and did the downloaded file play?
- What wording or control was confusing?

Ask people not to send passwords, cookies, private links, signed download URLs, or personal captions. Do not request Instagram usernames as part of feedback. Record only aggregate counts and reproducible error categories.

## J. First 100 users plan

The goal is 100 genuine sessions, not 100 forced clicks. Start with people who have a reason to save public Reels and can give permission-based feedback.

1. Invite 10 trusted testers who already use public media tools; ask each for one successful and one failed case.
2. Share the builder-feedback draft in one community only after checking its rules.
3. Publish one short product explanation on a personal social channel; reply to questions instead of repeating the link.
4. Ask early users to describe the job they were trying to complete, not to send private media.
5. Add the most common safe wording improvement to the FAQ or help text only after observing a repeated confusion.
6. Create a small referral loop: ask satisfied users to share the homepage with one person who has a public Reel to save.
7. Keep a weekly count of sessions, successful Reel resolutions, failures by normalized code, and feedback themes. Do not identify individuals.
8. Stop or slow outreach if a community removes a post, users report confusion, or provider errors rise. Protect service reliability before increasing traffic.

## K. Day 1–Day 7 plan

| Day | Action | Evidence to review |
| --- | --- | --- |
| 1 | Confirm production homepage, health endpoints, robots, sitemap, legal pages, and one Reel smoke test. | HTTP status, valid media, audio, no leakage. |
| 2 | Invite the first ten permission-based testers. | Completion rate and safe feedback themes. |
| 3 | Share one answer-first community post where rules allow it. | Moderation response and qualified visits. |
| 4 | Publish one personal social post and answer every real question. | Questions about capability and clarity. |
| 5 | Review normalized failures and contact messages; change copy only for repeated confusion. | Error-code counts and support themes. |
| 6 | Prepare Product Hunt screenshots, maker comment, and FAQ; do not submit yet. | Asset checklist and response coverage. |
| 7 | Decide whether to schedule a broader announcement. | Reliability, feedback quality, and readiness against this package. |

## L. Practical launch metrics

Current analytics is disabled by default, so no product metric should be invented from an empty sink. Until the owner deliberately enables an approved internal sink, use:

- **Reliability:** manual smoke status, normalized failure categories, and Render health checks.
- **Usage:** Cloudflare Pages aggregate requests if available; do not attempt to identify visitors.
- **Conversion:** a manually sampled ratio of resolve attempts to successful Reel results, using aggregate counts only.
- **Quality:** preview success, non-zero download, and audio/video validation in a small smoke sample.
- **Demand:** count requests or feedback mentions for Photo, Carousel, Story, and TV without retaining URLs or usernames.
- **Search:** Search Console and Bing impressions, clicks, crawl errors, and indexed pages after the owner connects those tools.

Useful weekly targets for the first month are operational rather than vanity-based: zero unresolved security incidents, no repeated 5xx regression, a documented response for every common error code, and at least ten useful qualitative feedback notes.

## M. Competitor positioning

Several public downloader sites advertise broad support for Reels, photos, Stories, and carousels. Those statements are self-described marketing claims, not independently verified compatibility. Examples include [Instasnap](https://instasnap.co/), [PasteDL](https://www.pastedl.com/), [TikGo](https://tikgo.me/instagram), [FromInsta](https://frominsta.net/en), and [TapSave](https://www.tapsave.net/).

| Market pattern | InstaFetch position |
| --- | --- |
| Broad “all formats” claims | Lead with the narrower, verified Reel promise. |
| “No login” claims without details | State that no passwords, cookies, profiles, or private access are used. |
| Direct or opaque download buttons | Show a real application-mediated preview and temporary download. |
| Quality promises without source context | Say “best available” and show the returned dimensions. |
| Silent failures or repeated retries | Explain login-required, unavailable, timeout, and rate-limit outcomes. |
| Carousel/Story pages presented as universal | Keep them conditional until anonymous completeness is proven. |

This is a trust and clarity position, not a claim that InstaFetch has broader format coverage than competitors.

## N. Photo/carousel demand validation

Do not restart provider experiments from marketing pressure. Validate demand first with privacy-safe aggregate evidence:

1. Add no new tracker; count format mentions from support messages or manually reviewed aggregate error categories.
2. Treat a format as worth a new research pass after at least 15 distinct requests or five repeated requests over 30 days, whichever comes first.
3. Record only the category (`photo`, `carousel`, `story`, `tv`), outcome code, and date bucket. Do not store the submitted URL, username, caption, token, or media address.
4. Ask whether users need a single photo, all carousel items, mixed media, or Stories before evaluating a provider.
5. Re-check official/public API terms and anonymous behavior before writing code. A paid provider or any login/session approach requires explicit approval.
6. Keep the UI conditional until every requested item can be proven as genuine post media and safely downloaded.

The current evidence supports **DEFER** for Photo/Carousel/Story/TV provider expansion. Reels remain the launch wedge.

## Launch owner checklist

- [ ] Read the production privacy, terms, and disclaimer pages.
- [ ] Run `npm run smoke:production` and record only aggregate results.
- [ ] Confirm the current Pages and Render deployments are healthy.
- [ ] Create screenshots using owned or synthetic media only.
- [ ] Check the live rules of any community before sharing.
- [ ] Use a personal account where a platform requires it; do not create accounts for the product without approval.
- [ ] Keep analytics disabled unless an approved privacy-safe sink is intentionally configured.
- [ ] Do not publish launch copy until the owner approves the specific channel and timing.

## Sources

1. [Reddit Help — Spam](https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam). Official guidance on repeated or unsolicited engagement and business-link frequency.
2. [Product Hunt Help — How to post a product](https://help.producthunt.com/en/articles/479557-how-to-post-a-product). Official posting fields, personal-account requirement, and direct product URL guidance.
3. [Product Hunt — Before launch](https://www.producthunt.com/launch/before-launch). Official preparation, account-age, self-hunting, and genuine-community guidance.
4. [Product Hunt — Sharing your launch](https://www.producthunt.com/launch/sharing-your-launch). Official guidance against paid hunters, upvote incentives, and inauthentic promotion.
5. [Google Search Console — Sitemaps report](https://support.google.com/webmasters/answer/7451001?hl=en). Official sitemap submission, fetch, and indexing caveats.
6. [Bing Webmaster Tools — Sitemaps](https://www.bing.com/webmasters/help/sitemaps-3b5cf6ed). Official sitemap formats and robots reference guidance.
7. [Bing — IndexNow](https://www.bing.com/indexnow/getstarted). Official key-hosting, submission, rate-limit, and no-indexing-guarantee guidance.
8. [Bing Webmaster Tools — URL submission](https://www.bing.com/webmasters/help/URL-Submission-62f2860b). Official manual submission and IndexNow guidance.
9. [Instasnap](https://instasnap.co/), [PasteDL](https://www.pastedl.com/), [TikGo](https://tikgo.me/instagram), [FromInsta](https://frominsta.net/en), and [TapSave](https://www.tapsave.net/). Public competitor pages reviewed only for self-described feature positioning; claims were not independently verified.
