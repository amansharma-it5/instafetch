import { expect, test } from '@playwright/test';

const videoItem = {
  id: 'video-1',
  type: 'video',
  width: 1080,
  height: 1920,
  extension: 'mp4',
  qualityLabel: '1080x1920',
  thumbnail: null,
  previewUrl: '/api/preview?token=preview-video-1',
  downloadUrl: '/api/download?token=download-video-1',
};

const photoItem = {
  id: 'photo-1',
  type: 'photo',
  width: 1080,
  height: 1080,
  extension: 'jpg',
  qualityLabel: '1080x1080',
  thumbnail: null,
  previewUrl: '/api/preview?token=preview-photo-1',
  downloadUrl: '/api/download?token=download-photo-1',
};

const reelResponse = {
  success: true,
  data: {
    sourceType: 'reel',
    title: 'Demo public Reel',
    author: 'public.creator',
    thumbnail: null,
    isCarousel: false,
    itemCount: 1,
    resolvedItemCount: 1,
    partial: false,
    warning: null,
    items: [videoItem],
  },
};

test('homepage renders the downloader and navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Instagram Reel Downloader · YouTube Beta – InstaFetch');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg');
  const favicon = await page.request.get('/favicon.svg');
  expect(favicon.status()).toBe(200);
  expect(await favicon.text()).toContain('InstaFetch');
  await expect(page.getByRole('heading', { name: /Instagram & YouTube Downloader/i })).toBeVisible();
  await expect(page.getByPlaceholder('Paste an Instagram or YouTube link here')).toBeVisible();
  await expect(page.getByRole('link', { name: 'InstaFetch home' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'FAQ' }).first()).toBeVisible();
  await expect(page.getByText('Crafted with love ❤️ by Aman Sharma', { exact: true })).toBeVisible();
  await expect(page.getByText('Verified', { exact: true })).toBeVisible();
  await expect(page.getByText('Supported when publicly accessible', { exact: true })).toBeVisible();
  await expect(page.getByText('Limited / depends on Instagram access', { exact: true })).toBeVisible();
  await expect(page.locator('#supported-photo .support-status')).toHaveText('Limited / depends on Instagram access');
  await expect(page.locator('#supported-carousel .support-status')).toHaveText('Limited / compatibility varies');
  await expect(page.locator('#supported-story .support-status')).toHaveText('Limited / compatibility varies');
  await expect(page.getByText('Verified Instagram Reel downloads. YouTube is in beta, and other media may work when a genuine file is exposed anonymously.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Why do Reels work when some photos do not?' })).toBeVisible();
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /publicly accessible Instagram Reels/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://instafetch.pages.dev/');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'Instagram Reel Downloader · YouTube Beta – InstaFetch');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://instafetch.pages.dev/social-preview.png');
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', 'https://instafetch.pages.dev/social-preview.png');
  await expect(page.locator('meta[name="twitter:image:alt"]')).toHaveAttribute('content', 'InstaFetch public Reel downloader with beta YouTube support');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/site.webmanifest');
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary');
  const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
  expect(() => JSON.parse(jsonLd ?? '')).not.toThrow();
  expect(jsonLd).toContain('WebApplication');
  const duplicateIds = await page.evaluate(() => {
    const counts = new Map<string, number>();
    document.querySelectorAll<HTMLElement>('[id]').forEach((element) => counts.set(element.id, (counts.get(element.id) ?? 0) + 1));
    return [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  });
  expect(duplicateIds).toEqual([]);
});

test('rejects an invalid URL before calling the API', async ({ page }) => {
  let apiCalled = false;
  await page.route('**/api/instagram/resolve', async (route) => { apiCalled = true; await route.continue(); });
  await page.goto('/');
  await page.getByPlaceholder('Paste an Instagram or YouTube link here').fill('https://example.com/not-instagram');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByText('That link does not look like a supported public Instagram or YouTube URL.')).toBeVisible();
  expect(apiCalled).toBe(false);
});

test('maps malformed YouTube links to the YouTube-specific error', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('Paste an Instagram or YouTube link here').fill('https://www.youtube.com/watch?v=too-short');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByText('That link does not look like a supported public YouTube video or Shorts URL.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).not.toBeVisible();
});

test('shows processing and then a real Reel result card', async ({ page }) => {
  await page.route('**/api/instagram/resolve', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(reelResponse) });
  });
  await page.route('**/api/preview**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'video/mp4', body: Buffer.concat([Buffer.from('0000ftypisom'), Buffer.alloc(32)]) });
  });
  await page.goto('/');
  await page.getByPlaceholder('Paste an Instagram or YouTube link here').fill('https://www.instagram.com/reel/ABC123/');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByText('Checking the public post and preparing available media…')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your media is ready' })).toBeVisible();
  await expect(page.getByText('1080x1920')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download video' })).toBeVisible();
});

test('submits a public YouTube video through the platform route', async ({ page }) => {
  await page.route('**/api/youtube/resolve', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      success: true,
      data: { platform: 'youtube', sourceType: 'youtube_video', title: 'Public demo video', author: 'Open channel', thumbnail: null, isCarousel: false, itemCount: 1, resolvedItemCount: 1, partial: false, warning: null, items: [{ ...videoItem, durationSeconds: 42, hasAudio: true, hasVideo: true, container: 'mp4' }] },
    }) });
  });
  await page.route('**/api/preview**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'video/mp4', body: Buffer.concat([Buffer.from('0000ftypisom'), Buffer.alloc(32)]) });
  });
  await page.goto('/');
  await page.getByPlaceholder('Paste an Instagram or YouTube link here').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your media is ready' })).toBeVisible();
  await expect(page.getByText('Download video')).toBeVisible();
});

test('explains anonymous YouTube access failures without offering login workarounds', async ({ page }) => {
  await page.route('**/api/youtube/resolve', async (route) => {
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'LOGIN_REQUIRED', message: 'internal detail' } }) });
  });
  await page.goto('/');
  await page.getByPlaceholder('Paste an Instagram or YouTube link here').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByText('YouTube did not allow anonymous access to this video from the current server. You can try another public video later.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).not.toBeVisible();
});

test('renders mixed carousel items independently', async ({ page }) => {
  await page.route('**/api/instagram/resolve', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      success: true,
      data: { ...reelResponse.data, isCarousel: true, itemCount: 2, resolvedItemCount: 2, items: [videoItem, photoItem] },
    }) });
  });
  await page.goto('/');
  await page.getByPlaceholder('Paste an Instagram or YouTube link here').fill('https://www.instagram.com/p/ALBUM123/');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByRole('heading', { name: '2 items found' })).toBeVisible();
  await expect(page.getByText('Item 1 of 2')).toBeVisible();
  await expect(page.getByText('Item 2 of 2')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download video' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download photo' })).toBeVisible();
});

test('renders a single public photo result', async ({ page }) => {
  await page.route('**/api/instagram/resolve', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      success: true,
      data: { ...reelResponse.data, sourceType: 'post', items: [photoItem] },
    }) });
  });
  await page.goto('/');
  await page.getByPlaceholder('Paste an Instagram or YouTube link here').fill('https://www.instagram.com/p/PHOTO123/');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your media is ready' })).toBeVisible();
  await expect(page.locator('#results').getByText('Photo', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download photo' })).toBeVisible();
});

test('shows an explicit warning for a partial carousel without fabricating an item', async ({ page }) => {
  await page.route('**/api/instagram/resolve', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      success: true,
      data: {
        ...reelResponse.data,
        sourceType: 'post',
        isCarousel: true,
        itemCount: 3,
        resolvedItemCount: 2,
        partial: true,
        warning: 'Some carousel items were unavailable.',
        items: [videoItem, photoItem],
      },
    }) });
  });
  await page.goto('/');
  await page.getByPlaceholder('Paste an Instagram or YouTube link here').fill('https://www.instagram.com/p/PARTIAL123/');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByRole('heading', { name: '2 of 3 items available' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Some carousel items were unavailable.' })).toBeVisible();
  await expect(page.getByText('Item 1 of 2')).toBeVisible();
  await expect(page.getByText('Item 2 of 2')).toBeVisible();
  await expect(page.getByText('Item 3 of 3')).not.toBeVisible();
});

test('maps provider errors and network failures to friendly status text', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/instagram/resolve', async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'RATE_LIMITED', message: 'internal detail' } }) });
    } else {
      await route.abort('failed');
    }
  });
  await page.goto('/');
  await page.getByPlaceholder('Paste an Instagram or YouTube link here').fill('https://www.instagram.com/reel/RATE123/');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByText('The service is busy right now. Wait a moment, then try again.')).toBeVisible();
  await expect(page.getByText('internal detail')).not.toBeVisible();

  await page.getByPlaceholder('Paste an Instagram or YouTube link here').fill('https://www.instagram.com/reel/NETWORK123/');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByText('We could not reach InstaFetch. Check your connection and try again.')).toBeVisible();
});

test('shows a cold-start message and can retry a failed request', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/instagram/resolve', async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await new Promise((resolve) => setTimeout(resolve, 6_000));
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'PROVIDER_UNAVAILABLE', message: 'internal detail' } }) });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(reelResponse) });
  });
  await page.goto('/');
  await page.getByPlaceholder('Paste an Instagram or YouTube link here').fill('https://www.instagram.com/reel/COLDSTART123/');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByText('Server is waking up. This can take up to a minute on the free hosting plan.')).toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible({ timeout: 12_000 });
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Your media is ready' })).toBeVisible();
});

test('renders the static legal and support pages', async ({ page }) => {
  for (const [path, heading] of [['/privacy', 'Privacy at InstaFetch'], ['/terms', 'Terms of use'], ['/disclaimer', 'Disclaimer'], ['/contact', 'Contact InstaFetch']] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page.getByText(/not affiliated with|public|private|Instagram/i).first()).toBeVisible();
    await expect(page.getByText('Crafted with love ❤️ by Aman Sharma', { exact: true })).toBeVisible();
  }
});

test('exposes a public email feedback path and collaborator report links', async ({ page }) => {
  await page.goto('/');
  const feedback = page.getByRole('link', { name: 'Found a problem? Send feedback' });
  await expect(feedback).toHaveAttribute('href', '/contact#feedback');
  await feedback.click();
  await expect(page).toHaveURL(/\/contact#feedback$/);
  await expect(page.getByRole('heading', { name: 'Found a problem? Send feedback' })).toBeVisible();
  const bugEmail = page.getByRole('link', { name: 'Email a bug report' });
  const featureEmail = page.getByRole('link', { name: 'Email a feature request' });
  await expect(bugEmail).toHaveAttribute('href', /mailto:instafetch\.support@gmail\.com\?subject=InstaFetch%20Bug%20Report&body=/);
  await expect(featureEmail).toHaveAttribute('href', /mailto:instafetch\.support@gmail\.com\?subject=InstaFetch%20Feature%20Request&body=/);
  await expect(bugEmail).toHaveAttribute('href', /Platform%3A%20Instagram%20%2F%20YouTube/);
  await expect(bugEmail).toHaveAttribute('href', /Browser%3A/);
  await expect(bugEmail).toHaveAttribute('href', /Did%20download%20work%3F/);
  await expect(bugEmail).toHaveAttribute('href', /Do%20not%20send%20passwords%2C%20cookies%2C%20authentication%20tokens/);
  await expect(page.getByText('Do not send passwords, cookies, authentication tokens, private media links, or other sensitive information.', { exact: true })).toBeVisible();
  await expect(page.getByText('For invited testers/collaborators', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open GitHub bug form' })).toHaveAttribute('href', /issues\/new\?template=bug-report\.yml$/);
  await expect(page.getByRole('link', { name: 'Open GitHub feature form' })).toHaveAttribute('href', /issues\/new\?template=feature-request\.yml$/);
});

test('maps anonymous availability errors to capability-aware copy', async ({ page }) => {
  const cases = [
    {
      code: 'LOGIN_REQUIRED',
      status: 401,
      expected: 'This media is not available for anonymous download. The platform may require login for this content.',
    },
    { code: 'PRIVATE_OR_UNAVAILABLE', status: 404, expected: 'This media is private or unavailable. Only public content can be downloaded.' },
    { code: 'SERVER_BUSY', status: 503, expected: 'Server is busy right now. Please try again shortly.' },
    { code: 'EXTRACTION_FAILED', status: 502, expected: /We could not resolve that media\./ },
  ];
  let index = 0;
  await page.route('**/api/instagram/resolve', async (route) => {
    const current = cases[index++];
    await route.fulfill({
      status: current.status,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, error: { code: current.code, message: 'internal detail' } }),
    });
  });
  await page.goto('/');
  for (const current of cases) {
    await page.getByPlaceholder('Paste an Instagram or YouTube link here').fill(`https://www.instagram.com/reel/${current.code}/`);
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    await expect(page.getByText(current.expected)).toBeVisible();
  }
});

test('prevents duplicate download requests and offers a retry after a recoverable failure', async ({ page }) => {
  await page.route('**/api/instagram/resolve', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(reelResponse) });
  });
  let attempts = 0;
  await page.route('**/api/download**', async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'SERVER_BUSY', message: 'internal detail' } }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'video/mp4', body: Buffer.concat([Buffer.from('0000ftypisom'), Buffer.alloc(32)]) });
  });
  await page.goto('/');
  await page.getByPlaceholder('Paste an Instagram or YouTube link here').fill('https://www.instagram.com/reel/DOWNLOAD123/');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const link = page.locator('.download-link');
  await link.click();
  await expect(page.getByRole('link', { name: 'Preparing…' })).toBeVisible();
  await link.evaluate((element) => (element as HTMLElement).click());
  expect(attempts).toBe(1);
  await expect(page.getByRole('link', { name: 'Retry download' })).toBeVisible();
  await link.click();
  await expect(page.getByRole('link', { name: 'Downloaded' })).toBeVisible();
  expect(attempts).toBe(2);
});

test('mobile menu and FAQ work with keyboard input', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Open menu' });
  await menu.click();
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
  await page.getByRole('button', { name: 'Close menu' }).click();
  await page.locator('#faq').scrollIntoViewIfNeeded();
  const faq = page.getByRole('button', { name: 'Can private posts be downloaded?' });
  await faq.focus();
  await faq.press('Enter');
  await expect(faq).toHaveAttribute('aria-expanded', 'true');
});

test('has no horizontal overflow at supported widths', async ({ page }) => {
  for (const width of [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow, `horizontal overflow at ${width}px`).toBe(false);
    await expect(page.getByText('Crafted with love ❤️ by Aman Sharma', { exact: true })).toBeVisible();
    await expect(page.locator('#supported-reels .support-status')).toHaveText('Verified');
    await expect(page.locator('#supported-photo .support-status')).not.toHaveText('Verified');
  }
});

test('switches and persists the supported interface languages', async ({ page }) => {
  await page.goto('/');
  const picker = page.locator('.language-picker select');
  await expect(picker).toHaveValue('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await picker.selectOption('es');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.getByRole('heading', { name: /Descargador de Instagram/i })).toBeVisible();
  await expect(page.locator('#supported-reels .support-status')).toHaveText('Verificado');
  await expect(page.locator('#supported-photo .support-status')).not.toHaveText('Verificado');
  await page.reload();
  await expect(page.locator('.language-picker select')).toHaveValue('es');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await picker.selectOption('fr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('#supported-reels .support-status')).toHaveText('Vérifié');
});

test('serves crawlable robots and sitemap files without temporary routes', async ({ page }) => {
  const robots = await page.request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  const robotsText = await robots.text();
  expect(robotsText).toContain('Disallow: /api/');
  expect(robotsText).toContain('Sitemap: https://instafetch.pages.dev/sitemap.xml');
  expect(robotsText).not.toContain('__INSTAFETCH_SITE_URL__');
  const sitemap = await page.request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  const sitemapText = await sitemap.text();
  expect(sitemapText).toContain('/privacy');
  expect(sitemapText).toContain('/contact');
  expect(sitemapText).not.toContain('/api/');
  expect(sitemapText).not.toContain('__INSTAFETCH_SITE_URL__');
});

test('updates unique metadata on direct legal routes', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page).toHaveTitle('Privacy · InstaFetch');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /temporary media/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://instafetch.pages.dev/privacy');
});
