import { expect, test } from '@playwright/test';

test('foundation home page renders', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('InstaFetch · Public Instagram media downloader');
  await expect(page.getByRole('link', { name: 'InstaFetch', exact: true })).toBeVisible();
});
