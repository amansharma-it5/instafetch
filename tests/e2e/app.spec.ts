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
  await expect(page).toHaveTitle('InstaFetch · Public Instagram media downloader');
  await expect(page.getByRole('heading', { name: /Instagram Downloader/i })).toBeVisible();
  await expect(page.getByPlaceholder('Paste Instagram link here')).toBeVisible();
  await expect(page.getByRole('link', { name: 'InstaFetch home' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'FAQ' }).first()).toBeVisible();
  await expect(page.getByText('Verified', { exact: true })).toBeVisible();
  await expect(page.getByText('Supported when publicly accessible', { exact: true })).toBeVisible();
  await expect(page.getByText('Limited / depends on Instagram access', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Why do Reels work when some photos do not?' })).toBeVisible();
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /publicly accessible Instagram Reels/);
});

test('rejects an invalid URL before calling the API', async ({ page }) => {
  let apiCalled = false;
  await page.route('**/api/instagram/resolve', async (route) => { apiCalled = true; await route.continue(); });
  await page.goto('/');
  await page.getByPlaceholder('Paste Instagram link here').fill('https://example.com/not-instagram');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByText('That link does not look like a supported public Instagram URL.')).toBeVisible();
  expect(apiCalled).toBe(false);
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
  await page.getByPlaceholder('Paste Instagram link here').fill('https://www.instagram.com/reel/ABC123/');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByText('Checking the public post and preparing available media…')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your media is ready' })).toBeVisible();
  await expect(page.getByText('1080x1920')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download video' })).toBeVisible();
});

test('renders mixed carousel items independently', async ({ page }) => {
  await page.route('**/api/instagram/resolve', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      success: true,
      data: { ...reelResponse.data, isCarousel: true, itemCount: 2, resolvedItemCount: 2, items: [videoItem, photoItem] },
    }) });
  });
  await page.goto('/');
  await page.getByPlaceholder('Paste Instagram link here').fill('https://www.instagram.com/p/ALBUM123/');
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
  await page.getByPlaceholder('Paste Instagram link here').fill('https://www.instagram.com/p/PHOTO123/');
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
  await page.getByPlaceholder('Paste Instagram link here').fill('https://www.instagram.com/p/PARTIAL123/');
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
  await page.getByPlaceholder('Paste Instagram link here').fill('https://www.instagram.com/reel/RATE123/');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByText('The service is busy right now. Wait a moment, then try again.')).toBeVisible();
  await expect(page.getByText('internal detail')).not.toBeVisible();

  await page.getByPlaceholder('Paste Instagram link here').fill('https://www.instagram.com/reel/NETWORK123/');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByText('We could not reach InstaFetch. Check your connection and try again.')).toBeVisible();
});

test('shows a cold-start message and can retry a failed request', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/instagram/resolve', async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await new Promise((resolve) => setTimeout(resolve, 5_200));
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'PROVIDER_UNAVAILABLE', message: 'internal detail' } }) });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(reelResponse) });
  });
  await page.goto('/');
  await page.getByPlaceholder('Paste Instagram link here').fill('https://www.instagram.com/reel/COLDSTART123/');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(page.getByText('Server is waking up. This can take up to a minute on the free hosting plan.')).toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Your media is ready' })).toBeVisible();
});

test('renders the static legal and support pages', async ({ page }) => {
  for (const [path, heading] of [['/privacy', 'Privacy at InstaFetch'], ['/terms', 'Terms of use'], ['/disclaimer', 'Disclaimer'], ['/contact', 'Contact InstaFetch']] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page.getByText(/not affiliated with|public|private|Instagram/i).first()).toBeVisible();
  }
});

test('maps anonymous availability errors to capability-aware copy', async ({ page }) => {
  const cases = [
    {
      code: 'LOGIN_REQUIRED',
      status: 401,
      expected: 'This post is not available for anonymous download. Instagram may require login for this content.',
    },
    { code: 'PRIVATE_OR_UNAVAILABLE', status: 404, expected: 'This post is private or unavailable. Only public content can be downloaded.' },
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
    await page.getByPlaceholder('Paste Instagram link here').fill(`https://www.instagram.com/reel/${current.code}/`);
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    await expect(page.getByText(current.expected)).toBeVisible();
  }
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
  for (const width of [375, 430, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow, `horizontal overflow at ${width}px`).toBe(false);
  }
});
