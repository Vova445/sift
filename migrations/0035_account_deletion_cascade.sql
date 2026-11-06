-- Keep account deletion within the Worker CPU budget by moving broad cleanup
-- into one atomic SQLite operation. Migrations are the schema source of truth.
CREATE TRIGGER IF NOT EXISTS cleanup_user_owned_data_before_delete
BEFORE DELETE ON users
BEGIN
  UPDATE shared_space_items
    SET assigned_to_user_id = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE assigned_to_user_id = OLD.id
      AND space_id NOT IN (SELECT id FROM shared_spaces WHERE owner_user_id = OLD.id);
  DELETE FROM billing_events
    WHERE order_reference IN (SELECT order_reference FROM payment_orders WHERE user_id = OLD.id)
       OR order_reference IN (SELECT recurring_order_reference FROM subscriptions WHERE user_id = OLD.id)
       OR order_reference IN (SELECT order_reference FROM shared_space_orders WHERE owner_user_id = OLD.id);
  DELETE FROM shared_space_items WHERE created_by_user_id = OLD.id OR space_id IN (SELECT id FROM shared_spaces WHERE owner_user_id = OLD.id);
  DELETE FROM shared_space_invite_acceptances WHERE user_id = OLD.id OR invite_id IN (SELECT id FROM shared_space_invites WHERE space_id IN (SELECT id FROM shared_spaces WHERE owner_user_id = OLD.id));
  DELETE FROM shared_space_invites WHERE created_by = OLD.id OR space_id IN (SELECT id FROM shared_spaces WHERE owner_user_id = OLD.id);
  DELETE FROM shared_space_members WHERE user_id = OLD.id OR space_id IN (SELECT id FROM shared_spaces WHERE owner_user_id = OLD.id);
  DELETE FROM shared_space_legal_acceptances WHERE user_id = OLD.id OR space_id IN (SELECT id FROM shared_spaces WHERE owner_user_id = OLD.id);
  DELETE FROM shared_space_orders WHERE owner_user_id = OLD.id OR space_id IN (SELECT id FROM shared_spaces WHERE owner_user_id = OLD.id);
  DELETE FROM shared_spaces WHERE owner_user_id = OLD.id;
  DELETE FROM domain_correction_requests WHERE lower(contact_email) = lower(OLD.email);
  DELETE FROM watchlist WHERE user_id = OLD.id;
  DELETE FROM scans WHERE user_id = OLD.id;
  DELETE FROM scan_usage WHERE owner_key = 'account:' || OLD.id;
  DELETE FROM translation_usage WHERE user_id = OLD.id;
  DELETE FROM ai_usage_events WHERE user_id = OLD.id;
  DELETE FROM email_verification_tokens WHERE user_id = OLD.id;
  DELETE FROM email_verification_status WHERE user_id = OLD.id;
  DELETE FROM email_verification_limits WHERE user_id = OLD.id;
  DELETE FROM email_reminder_deliveries WHERE user_id = OLD.id;
  DELETE FROM email_reminder_unsubscribe_tokens WHERE user_id = OLD.id;
  DELETE FROM email_reminder_preferences WHERE user_id = OLD.id;
  DELETE FROM password_reset_tokens WHERE user_id = OLD.id;
  DELETE FROM sessions WHERE user_id = OLD.id;
  DELETE FROM telegram_group_authorizations WHERE owner_user_id = OLD.id OR linked_telegram_user_id IN (SELECT telegram_user_id FROM telegram_accounts WHERE user_id = OLD.id);
  DELETE FROM telegram_accounts WHERE user_id = OLD.id;
  DELETE FROM telegram_link_codes WHERE user_id = OLD.id;
  DELETE FROM developer_api_keys WHERE user_id = OLD.id;
  DELETE FROM subscription_payments WHERE user_id = OLD.id;
  DELETE FROM legal_acceptances WHERE user_id = OLD.id;
  DELETE FROM payment_orders WHERE user_id = OLD.id;
  DELETE FROM subscriptions WHERE user_id = OLD.id;
  DELETE FROM signups WHERE lower(email) = lower(OLD.email);
END;
