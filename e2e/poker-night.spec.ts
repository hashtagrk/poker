import { expect, test, type Page } from '@playwright/test'

async function seat(page: Page, name: string) {
  await page.getByLabel('Player name').fill(name)
  await page.getByRole('button', { name: 'Add seat' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: name })).toBeVisible()
}

test('a full league night: seats, rebuy, loan, cash-out and settlement', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Alpine')

  await page.getByLabel('Night name').fill('Lodge night')
  await page.getByLabel('Default buy-in').fill('500')
  await page.getByRole('button', { name: 'Set up the table' }).click()
  await expect(page.getByRole('heading', { name: 'Seat the table' })).toBeVisible()

  for (const name of ['Ana', 'Ben', 'Cal']) await seat(page, name)
  await expect(page.getByText('₹1,500')).toBeVisible()
  await page.getByRole('button', { name: 'Deal the cards' }).click()

  // Rebuy for Ben, Cal borrows 300 from Ana out of the bank.
  await page.getByRole('article', { name: 'Ben, seat' }).getByRole('button', { name: 'Rebuy' }).click()
  await page.getByRole('button', { name: 'Add rebuy' }).click()
  await page.getByRole('article', { name: 'Cal, seat' }).getByRole('button', { name: 'Borrow' }).click()
  await page.getByLabel('Lender', { exact: true }).selectOption({ label: 'Ana' })
  await page.getByLabel('Amount', { exact: true }).fill('300')
  await page.getByRole('button', { name: 'Record loan' }).click()
  await expect(page.getByRole('region', { name: 'Table totals' })).toContainText('₹2,300')
  await expect(page.getByRole('article', { name: 'Cal, seat' })).toContainText('Owes ₹300')

  await page.getByRole('button', { name: 'Cash out' }).click()
  // In play: 3 × 500 + 500 rebuy + 300 bank-funded loan = 2,300
  await page.getByLabel("Ana's chips").fill('1400')
  await page.getByLabel("Ben's chips").fill('0')
  await page.getByLabel("Cal's chips").fill('800')
  const balance = page.getByRole('complementary', { name: 'Balance check' })
  await expect(balance.getByRole('status')).toContainText('missing')
  await expect(page.getByRole('button', { name: 'Settle up' })).toBeDisabled()
  await page.getByLabel("Cal's chips").fill('900')
  await expect(balance.getByRole('status')).toContainText('accounted for')
  await page.getByRole('button', { name: 'Settle up' }).click()

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ana takes the night')
  const transfers = page.getByRole('list').filter({ hasText: 'pays' })
  await expect(transfers.getByRole('listitem')).toHaveCount(2)
  await expect(transfers).toContainText('Ben pays Ana')
  // Ana: 1400 − 800 paid in + 300 lent = +900. Cal: 900 − 500 − 300 borrowed = +100. Ben: −1,000.
  await expect(transfers).toContainText('₹900')
  await expect(transfers).toContainText('₹100')
  await expect(transfers).toContainText('Ben pays Cal')

  // Tick off the first transfer as paid.
  await transfers.getByRole('checkbox').first().check()
  await expect(page.getByRole('region', { name: 'Who pays whom' })).toContainText('1 of 2 paid')

  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ana takes the night')
  await page.getByRole('button', { name: 'Go to league home' }).click()
  await expect(page.getByRole('heading', { name: 'League standings' })).toBeVisible()
  await expect(page.locator('.standings__leader')).toContainText('Ana')
})

test('domain errors surface as toasts without crashing', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Set up the table' }).click()
  await seat(page, 'Ana')
  await page.getByLabel('Player name').fill('ana')
  await page.getByRole('button', { name: 'Add seat' }).click()
  await expect(page.getByRole('alert')).toContainText('already at the table')
  await expect(page.getByRole('button', { name: 'Deal the cards' })).toBeDisabled()
})
