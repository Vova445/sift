import {expect,test} from '@playwright/test';

test('empty domain index explains the five-account threshold and links its methodology and representative form',async({page})=>{
  await page.goto('/domains');
  await expect(page.getByRole('heading',{name:'Індекс доменів'})).toBeVisible();
  await expect(page.getByText('Публічних профілів поки немає')).toBeVisible();
  await expect(page.locator('.domainIndexEmpty')).toContainText(/щонайменше п’ять незалежних перевірок/i);
  await expect(page.getByRole('link',{name:/Як рахуються показники/})).toHaveAttribute('href','/domains/methodology');
  await expect(page.getByRole('link',{name:/Форма представника сервісу/})).toHaveAttribute('href','/domains/respond');
  await expect(page.locator('.domainIndexCard')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  if((page.viewportSize()?.width||0)>900)await expect(page.locator('.productSidebar')).toBeVisible();
  else await expect(page.locator('.productTabNav')).toBeVisible();
});
