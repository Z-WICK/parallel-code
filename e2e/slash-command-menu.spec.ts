import { test, expect } from '@playwright/test';

test.describe('slash command menu', () => {
  test('shows, navigates, completes, and closes', async ({ page }) => {
    await page.goto('/');

    const promptInput = page.locator('textarea.prompt-textarea');
    await expect(promptInput).toBeVisible();

    await promptInput.fill('/');
    const slashMenu = page.locator('.slash-command-menu');
    await expect(slashMenu).toBeVisible();

    const initialItems = slashMenu.locator('.slash-command-item');
    await expect(initialItems.first()).toBeVisible();

    await promptInput.press('ArrowDown');
    await promptInput.press('ArrowDown');
    await promptInput.press('Enter');

    await expect(slashMenu).toBeHidden();
    await expect(promptInput).toHaveValue(/\S/);

    await promptInput.press('Escape');
    await expect(slashMenu).toBeHidden();
  });

  test('filters and closes when query has no matches', async ({ page }) => {
    await page.goto('/');

    const promptInput = page.locator('textarea.prompt-textarea');
    await expect(promptInput).toBeVisible();

    await promptInput.fill('/zzzz-not-a-command');
    const slashMenu = page.locator('.slash-command-menu');
    await expect(slashMenu).toBeHidden();
  });
});
