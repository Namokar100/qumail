<?php
/**
 * PQC Encryption Plugin Configuration
 *
 * Copy this file to config.inc.php and adjust settings as needed.
 */

// Key Service API URL (internal Docker network)
$config['pqc_key_service_url'] = 'http://key-service:8081';

// QuMail domain and environment for PQC encryption
$config['pqc_domain'] = getenv('DOMAIN') ?: 'qumail.work.gd';
$config['pqc_env'] = getenv('ENVIRONMENT') ?: 'local';

// Session timeout for cached private key (seconds)
// Default: 1 hour (3600 seconds)
$config['pqc_session_timeout'] = 3600;

// Encryption marker header for encrypted messages
$config['pqc_header_marker'] = 'X-QuMail-PQC-Encrypted';
