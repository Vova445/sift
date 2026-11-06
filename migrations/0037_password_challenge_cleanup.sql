CREATE TRIGGER IF NOT EXISTS cleanup_password_challenges_after_user_delete
AFTER DELETE ON users
BEGIN
  DELETE FROM auth_password_challenges WHERE email = OLD.email;
END;
