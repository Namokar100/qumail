<?php
/**
 * English localization for PQC Encryption Plugin
 */

$labels = array();
$labels['pqc_settings'] = 'PQC Encryption';
$labels['pqc_enabled'] = 'PQC E2E Encryption Settings';
$labels['pqc_setup_keys'] = 'Setup Encryption Keys';
$labels['pqc_generate_keys'] = 'Generate PQC Keys';
$labels['pqc_enter_passphrase'] = 'Enter Passphrase';
$labels['pqc_confirm_passphrase'] = 'Confirm Passphrase';
$labels['pqc_passphrase_hint'] = 'Your passphrase protects your encryption keys. Store it safely!';
$labels['pqc_keys_generated'] = 'PQC keys generated successfully!';
$labels['pqc_keys_exist'] = 'You already have PQC keys configured.';
$labels['pqc_regenerate_warning'] = 'Regenerating keys will make old encrypted emails unreadable!';
$labels['pqc_no_keys'] = 'No encryption keys found. Generate keys to enable E2E encryption.';
$labels['pqc_encrypt_message'] = 'Encrypt with PQC';
$labels['pqc_encryption_enabled'] = 'PQC Encryption Enabled';
$labels['pqc_encryption_disabled'] = 'PQC Encryption Disabled';
$labels['pqc_recipient_no_keys'] = 'Recipient does not have PQC keys';
$labels['pqc_external_recipient'] = 'E2E encryption only available for QuMail users';
$labels['pqc_decrypting'] = 'Decrypting message...';
$labels['pqc_decryption_failed'] = 'Decryption failed. Check your passphrase.';
$labels['pqc_passphrase_required'] = 'Enter your passphrase to decrypt this message';
$labels['pqc_unlock'] = 'Unlock';
$labels['pqc_key_status'] = 'Key Status';
$labels['pqc_key_active'] = 'Active';
$labels['pqc_key_cached'] = 'Unlocked';
$labels['pqc_key_locked'] = 'Locked';

$messages = array();
$messages['pqc_passphrase_mismatch'] = 'Passphrases do not match!';
$messages['pqc_passphrase_weak'] = 'Passphrase must be at least 8 characters!';
$messages['pqc_key_generation_error'] = 'Error generating keys. Please try again.';
$messages['pqc_encryption_error'] = 'Error encrypting message. Sending unencrypted.';
$messages['pqc_decryption_error'] = 'Error decrypting message. Wrong passphrase?';
$messages['pqc_api_error'] = 'Key service unavailable. Try again later.';

$messages['pqc_passphrase_warning'] = <<<EOT
⚠️ IMPORTANT WARNING

Your passphrase protects your encryption keys.

• We do NOT store your passphrase
• We CANNOT recover your passphrase  
• If you forget it, encrypted emails are PERMANENTLY LOST

Please write down your passphrase and store it safely.
EOT;
