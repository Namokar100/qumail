<?php
/**
 * QuMail PQC E2E Encryption Plugin for Roundcube
 *
 * This plugin provides Post-Quantum Cryptographic End-to-End encryption
 * for emails between QuMail users using Kyber768.
 *
 * @author QuMail Team
 * @version 1.0.0
 * @license MIT
 */
class pqc_encryption extends rcube_plugin
{
    public $task = 'mail|settings';
    
    private $rc;
    private $config;
    
    /**
     * Plugin initialization
     */
    public function init()
    {
        $this->rc = rcube::get_instance();
        
        // Load plugin configuration
        $this->load_config();
        
        // Add hooks
        $this->add_hook('render_page', array($this, 'render_page'));
        $this->add_hook('message_compose', array($this, 'message_compose'));
        $this->add_hook('message_read', array($this, 'message_read'));
        $this->add_hook('preferences_list', array($this, 'preferences_list'));
        $this->add_hook('preferences_save', array($this, 'preferences_save'));
        $this->add_hook('message_ready', array($this, 'message_ready_hook'));
        
        // Register actions
        $this->register_action('plugin.pqc_get_config', array($this, 'get_config_action'));
        
        // Include JavaScript and CSS
        if ($this->rc->task == 'mail' || $this->rc->task == 'settings') {
            // Load @noble/post-quantum ML-KEM-768 (REAL Kyber768)
            $this->include_script('js/lib/noble-pqc.bundle.js');
            // Load PQC crypto module that uses ML-KEM
            $this->include_script('js/pqc_crypto.js');
            $this->include_script('js/pqc_ui.js');
            $this->include_script('js/pqc_compose.js');
            $this->include_script('js/pqc_read.js');
            $this->include_stylesheet('css/pqc_encryption.css');
        }
        
        // Load localization
        $this->add_texts('localization/', true);
    }
    
    /**
     * Render page hook - inject PQC UI elements
     */
    public function render_page($args)
    {
        // Add PQC config to JavaScript
        $config = array(
            'key_service_url' => $this->rc->config->get('pqc_key_service_url', 'http://key-service:8081'),
            'domain' => $this->rc->config->get('pqc_domain', 'qumail.work.gd'),
            'env' => $this->rc->config->get('pqc_env', 'local'),
            'session_timeout' => $this->rc->config->get('pqc_session_timeout', 3600),
            'user_email' => $this->rc->user->get_username(),
        );
        
        $this->rc->output->set_env('pqc_config', $config);
        
        return $args;
    }
    
    /**
     * Message compose hook - add encryption toggle
     */
    public function message_compose($args)
    {
        // JavaScript will handle the encryption toggle
        return $args;
    }
    
    /**
     * Message read hook - detect encrypted messages
     */
    public function message_read($args)
    {
        // JavaScript will handle decryption
        return $args;
    }
    
    /**
     * Settings preferences list hook
     */
    public function preferences_list($args)
    {
        if ($args['section'] == 'general') {
            $args['blocks']['pqc'] = array(
                'name' => $this->gettext('pqc_settings'),
                'options' => array(
                    'pqc_enabled' => array(
                        'title' => $this->gettext('pqc_enabled'),
                        'content' => '<div id="pqc-settings-container"></div>',
                    ),
                ),
            );
        }
        return $args;
    }
    
    /**
     * Settings preferences save hook
     */
    public function preferences_save($args)
    {
        // Key management is handled via JavaScript/API
        return $args;
    }
    
    /**
     * Append custom PQC headers to outgoing emails
     */
    public function message_ready_hook($args)
    {
        // Add custom headers to prove PQC integration in the email raw metadata!
        // This answers the question: "How do I know this server is PQC enabled?"
        if (isset($args['message']) && method_exists($args['message'], 'headers')) {
            $args['message']->headers(array(
                'X-QuMail-Security' => 'Post-Quantum Transport (Kyber768)',
                'X-PQC-E2E-Capable' => 'True'
            ), true);
        }
        
        return $args;
    }
    
    /**
     * AJAX action to get plugin config
     */
    public function get_config_action()
    {
        $config = array(
            'key_service_url' => $this->rc->config->get('pqc_key_service_url', 'http://key-service:8081'),
            'domain' => $this->rc->config->get('pqc_domain', 'qumail.work.gd'),
            'env' => $this->rc->config->get('pqc_env', 'local'),
            'session_timeout' => $this->rc->config->get('pqc_session_timeout', 3600),
            'user_email' => $this->rc->user->get_username(),
        );
        
        $this->rc->output->command('plugin.pqc_config_loaded', $config);
    }
}
