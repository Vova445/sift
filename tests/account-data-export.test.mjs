import test from 'node:test';
import assert from 'node:assert/strict';
import {buildHistoryCsv} from '../lib/history-csv.js';

test('CSV export includes report details and saved Planner notes',()=>{
  const csv=buildHistoryCsv([
    {id:'scan-1',createdAt:'2026-11-02T10:00:00.000Z',result:{title:'Course Terms',url:'https://example.com/terms',score:42,verdict:'Перевірте автопродовження',prices:['$19.00 / month'],findings:[{title:'Автопродовження',summary:'Щомісячне списання',evidence:'Your plan renews automatically.'}]}}
  ],[{scan_id:'scan-1',status:'considering',note:'Порівняти умови повернення',review_at:'2026-11-10'}]);
  assert.ok(csv.startsWith('\uFEFFsep=;'));
  assert.ok(csv.includes('Докази звіту (JSON)'));
  assert.ok(csv.includes('Автопродовження'));
  assert.ok(csv.includes('Your plan renews automatically.'));
  assert.ok(csv.includes('Порівняти умови повернення'));
  assert.ok(csv.includes('2026-11-10'));
});

test('CSV export neutralizes spreadsheet formulas in user-controlled fields',()=>{
  const csv=buildHistoryCsv([{id:'scan-2',result:{title:'=HYPERLINK("https://bad.test")',url:'https://example.com',score:10,findings:[]}}],[{scan_id:'scan-2',status:'considering',note:'=1+1'}]);
  assert.ok(csv.includes(`"'=HYPERLINK(""https://bad.test"")"`));
  assert.ok(csv.includes(`"'=1+1"`));
});
