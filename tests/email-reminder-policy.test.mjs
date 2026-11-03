import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addCalendarDays,
  isIsoDate,
  isReminderDue,
  kyivDate,
  reminderDaysBefore,
  reminderDeliveryKey,
  validUnsubscribeToken,
} from '../lib/email-reminder-policy.js';

test('Kyiv calendar date follows DST and does not depend on the host timezone', () => {
  assert.equal(kyivDate(new Date('2026-03-28T22:30:00.000Z')), '2026-03-29');
  assert.equal(kyivDate(new Date('2026-10-24T21:30:00.000Z')), '2026-10-25');
});

test('reminder window includes the selected date and N days before it', () => {
  assert.equal(isReminderDue('2026-11-04', '2026-11-03', 1), true);
  assert.equal(isReminderDue('2026-11-03', '2026-11-03', 1), true);
  assert.equal(isReminderDue('2026-11-05', '2026-11-03', 1), false);
  assert.equal(isReminderDue('2026-11-02', '2026-11-03', 1), false);
  assert.equal(isReminderDue('2026-11-05', '2026-11-03', 2), true);
});

test('date validation rejects impossible dates and reminder offset is bounded', () => {
  assert.equal(isIsoDate('2026-02-29'), false);
  assert.equal(isIsoDate('2028-02-29'), true);
  assert.equal(addCalendarDays('2026-12-31', 1), '2027-01-01');
  assert.equal(reminderDaysBefore('3'), 3);
  assert.equal(reminderDaysBefore('0'), 1);
  assert.equal(reminderDaysBefore('31'), 1);
});

test('one-click tokens and delivery keys have strict, deterministic formats', () => {
  assert.equal(validUnsubscribeToken('A'.repeat(43)), true);
  assert.equal(validUnsubscribeToken('short'), false);
  assert.equal(validUnsubscribeToken('A'.repeat(42) + '.'), false);
  assert.equal(reminderDeliveryKey('item-1', '2026-11-04'), 'planner:item-1:2026-11-04');
});
