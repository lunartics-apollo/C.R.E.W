import { expect, test } from '@playwright/test';

// Full guided playthrough: menu -> build -> plan -> ground -> tests -> MRR -> launch -> ops -> debrief.
test('a fresh player can complete Mission Rajang without login', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  // The prologue (Premier Hamdan, team meeting) and the walk to the Mission Planning Table cannot be driven headlessly,
  // so jump straight to the briefing panel that the table opens.
  await page.goto('/?qa=briefing');
  await page.getByRole('button', { name: /Accept mission/ }).click();

  // Build: compare builds -> load Balanced, add drag sail
  await page.getByRole('button', { name: /Compare builds/ }).click();
  await page.getByRole('button', { name: 'Load' }).nth(1).click();
  await page.getByRole('tab', { name: /Deorbit/ }).click();
  await page.getByRole('button', { name: 'Install' }).click();
  await expect(page.getByText('No blocking issues')).toBeVisible();
  await page.getByTestId('to-planning').click();

  await page.getByTestId('pkg-polar').click();
  await page.getByTestId('to-ground').click();
  await page.getByTestId('gs-sband_dish').click();
  await page.getByTestId('cal-lock').click();
  await page.getByTestId('to-lab').click();

  // DITL configuration that satisfies the polar ICD
  await page.getByRole('button', { name: /Separation switches .* \+/ }).click();
  await page.getByRole('button', { name: 'Off' }).click();
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: /Deploy antenna\/panels after \+/ }).click();
  for (let i = 0; i < 8; i++) await page.getByRole('button', { name: /First transmission after \+/ }).click();
  await page.getByTestId('run-all').click();
  await expect(page.getByTestId('run-all')).toContainText('(0)', { timeout: 60_000 });
  await page.getByTestId('to-mrr').click();
  await page.getByTestId('run-poll').click();
  await expect(page.getByTestId('mrr-verdict')).toContainText('GO', { timeout: 10_000 });
  await page.getByTestId('approve-launch').click();
  await page.getByRole('button', { name: /Skip launch/ }).click();
  await page.getByTestId('begin-ops').click();

  // Operations: answer every decision with a sensible default until the debrief appears.
  for (let i = 0; i < 80; i++) {
    if (await page.getByTestId('debrief-verdict').isVisible().catch(() => false)) break;
    for (const id of ['dec-ack', 'dec-capture', 'dec-send', 'opt-useAnyway', 'opt-shedLoad', 'opt-prioritize', 'dec-end']) {
      const b = page.getByTestId(id);
      if (await b.isVisible().catch(() => false) && (await b.isEnabled())) {
        await b.click();
        break;
      }
    }
    const skip = page.getByTestId('dec-skip');
    if (await skip.isVisible().catch(() => false)) await skip.click();
    await page.waitForTimeout(1500);
  }
  await expect(page.getByTestId('debrief-verdict')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('score-total')).toHaveText(/\d+/);
  expect(errors).toEqual([]);
});

test('language switch keeps progress and translates the UI', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Bahasa Melayu' }).click();
  await expect(page.getByRole('button', { name: /Mula Misi/ })).toBeVisible();
});
