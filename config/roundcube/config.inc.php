<?php
// Initialize config array as per default Roundcube behavior
$config = [];
$config['plugins'] = ['pqc_encryption'];
$config['log_driver'] = 'stdout';
$config['zipdownload_selection'] = true;
// Random key for security (normally generated, but static here is fine for dev)
$config['des_key'] = '6WgUaGloMCvXRotjY/JOyJ6W'; 
$config['enable_spellcheck'] = true;
$config['spellcheck_engine'] = 'pspell';

// Include Docker defaults
include(__DIR__ . '/config.docker.inc.php');

// Disable SSL verification for local self-signed certs
$config['imap_conn_options'] = [
    'ssl' => [
        'verify_peer' => false,
        'verify_peer_name' => false,
        'allow_self_signed' => true,
    ],
];

$config['smtp_conn_options'] = [
    'ssl' => [
        'verify_peer' => false,
        'verify_peer_name' => false,
        'allow_self_signed' => true,
    ],
];
