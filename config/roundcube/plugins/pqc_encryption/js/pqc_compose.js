/**
 * QuMail PQC Compose Integration
 * 
 * Handles encryption toggle and message encryption when composing emails.
 * Only enables encryption for @qumail.work.gd recipients with PQC keys.
 */

window.PQCCompose = (function() {
    'use strict';

    let encryptionEnabled = false;
    let recipientHasKeys = false;
    let recipientPublicKey = null;
    let toggleButton = null;
    let initialized = false;

    /**
     * Initialize compose integration
     */
    function init() {
        if (initialized) return;
        
        // Wait for rcmail
        if (typeof rcmail === 'undefined') {
            setTimeout(init, 200);
            return;
        }
        
        console.log('[PQC Compose] Initializing...');
        
        // Listen for compose action
        rcmail.addEventListener('init', function(evt) {
            if (rcmail.env.action === 'compose') {
                console.log('[PQC Compose] Compose action detected');
                setTimeout(setupComposeUI, 500);
            }
        });
        
        // Also check if already on compose page
        setTimeout(function() {
            if (rcmail.env && rcmail.env.action === 'compose') {
                setupComposeUI();
            }
        }, 1000);
        
        initialized = true;
    }

    /**
     * Setup compose UI elements
     */
    function setupComposeUI() {
        console.log('[PQC Compose] Setting up compose UI');
        
        // Clean any PQC encrypted content from quoted reply/forward text
        setTimeout(cleanEncryptedQuotedText, 300);
        
        // Multiple attempts to add toggle
        addEncryptionToggle();
        
        // Watch recipient field for changes
        setTimeout(watchRecipientField, 500);
    }

    /**
     * Strip PQC encrypted blocks from the compose body.
     * When replying/forwarding, Roundcube quotes the original message which
     * may contain the raw encrypted payload. Replace it with a clean placeholder.
     */
    function cleanEncryptedQuotedText() {
        const PQC_BEGIN = '-----BEGIN QUMAIL PQC ENCRYPTED MESSAGE-----';
        const PQC_END = '-----END QUMAIL PQC ENCRYPTED MESSAGE-----';

        // Try textarea first (plain text editor)
        const textarea = document.getElementById('composebody') ||
                         document.querySelector('textarea[name="_message"]');
        if (textarea && textarea.value && textarea.value.includes(PQC_BEGIN)) {
            console.log('[PQC Compose] Cleaning PQC content from textarea');
            textarea.value = stripPqcBlock(textarea.value);
            return;
        }

        // Try iframe (HTML editor like TinyMCE)
        const iframe = document.querySelector('iframe');
        if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
            const body = iframe.contentDocument.body;
            const html = body.innerHTML;
            if (html.includes(PQC_BEGIN) || html.includes('BEGIN QUMAIL PQC')) {
                console.log('[PQC Compose] Cleaning PQC content from HTML editor');
                body.innerHTML = stripPqcBlock(html);
            }
        }
    }

    /**
     * Remove everything between (and including) the PQC markers.
     */
    function stripPqcBlock(text) {
        const beginMarker = '-----BEGIN QUMAIL PQC ENCRYPTED MESSAGE-----';
        const endMarker = '-----END QUMAIL PQC ENCRYPTED MESSAGE-----';

        // Handle both plain text and HTML: the markers may be preceded by
        // quoting characters like "> " on each line.
        // Use a regex that grabs from the marker line through the end marker line.
        const regex = new RegExp(
            '[>\\s]*-{5}BEGIN QUMAIL PQC ENCRYPTED MESSAGE-{5}[\\s\\S]*?-{5}END QUMAIL PQC ENCRYPTED MESSAGE-{5}',
            'g'
        );

        return text.replace(regex, '[Encrypted message]');
    }

    /**
     * Add encryption toggle button to compose view
     */
    function addEncryptionToggle() {
        if (document.getElementById('pqc-encrypt-container')) {
            console.log('[PQC Compose] Toggle already exists');
            return;
        }
        
        // Try multiple possible locations for compose toolbar in different themes
        const toolbarSelectors = [
            '#compose-buttons',
            '#composetoolbar',
            '.compose-headers',
            '#composeheaders',
            '.formcontent',
            '#compose-content .header',
            '#compose-content',
            '.compose-form',
            '#messageform .formcontent'
        ];
        
        let toolbar = null;
        for (const selector of toolbarSelectors) {
            toolbar = document.querySelector(selector);
            if (toolbar) {
                console.log('[PQC Compose] Found compose area:', selector);
                break;
            }
        }
        
        if (!toolbar) {
            console.log('[PQC Compose] No compose area found, retrying...');
            setTimeout(addEncryptionToggle, 1000);
            return;
        }

        const container = document.createElement('div');
        container.id = 'pqc-encrypt-container';
        container.className = 'pqc-encrypt-container';
        // Always show the container - initially with disabled state
        container.style.cssText = 'display:inline-flex; padding:10px; margin:10px 0; background:#f5f5f5; border-radius:8px; align-items:center; gap:10px;';
        
        const config = PQCUI ? PQCUI.getConfig() : {};
        const domain = config.domain || 'qumail.work.gd';
        
        container.innerHTML = `
            <button type="button" id="pqc-encrypt-toggle" class="btn pqc-toggle disabled" style="padding:8px 16px; border:1px solid #ccc; border-radius:4px; cursor:pointer; background:#fff;" disabled>
                <span class="icon">🔒</span>
                <span class="label">PQC Encrypt</span>
            </button>
            <span id="pqc-encrypt-status" class="pqc-status-text" style="color:#666; font-size:13px;">Enter @${domain} recipient</span>
        `;
        
        // Insert at the top of compose area
        toolbar.insertBefore(container, toolbar.firstChild);
        
        toggleButton = document.getElementById('pqc-encrypt-toggle');
        if (toggleButton) {
            toggleButton.onclick = handleToggleClick;
            console.log('[PQC Compose] Toggle button added (initially disabled)');
        }
    }

    /**
     * Watch recipient field for changes
     */
    function watchRecipientField() {
        // Multiple possible recipient field locations
        const recipientSelectors = [
            '#_to',
            'input[name="_to"]',
            '.recipient-input input',
            '#compose_to input',
            'textarea[name="_to"]'
        ];
        
        let recipientField = null;
        for (const selector of recipientSelectors) {
            recipientField = document.querySelector(selector);
            if (recipientField) {
                console.log('[PQC Compose] Found recipient field:', selector);
                break;
            }
        }
        
        if (!recipientField) {
            console.log('[PQC Compose] No recipient field found, retrying...');
            setTimeout(watchRecipientField, 1000);
            return;
        }

        recipientField.addEventListener('change', checkRecipient);
        recipientField.addEventListener('blur', checkRecipient);
        recipientField.addEventListener('input', debounce(checkRecipient, 500));
        
        // Also watch for Roundcube's autocomplete chip additions
        const recipientContainer = recipientField.closest('.input-group') || recipientField.parentElement;
        if (recipientContainer) {
            const observer = new MutationObserver(function(mutations) {
                // When chips are added/removed, recheck recipient
                setTimeout(() => checkRecipient({ target: recipientField }), 100);
            });
            observer.observe(recipientContainer, { childList: true, subtree: true });
            console.log('[PQC Compose] Watching recipient container for chip changes');
        }
        
        // Check immediately if there's already a value
        if (recipientField.value) {
            checkRecipient({ target: recipientField });
        }
        
        console.log('[PQC Compose] Watching recipient field');
    }

    /**
     * Get all recipient emails (handles chips and input field)
     */
    function getAllRecipientEmails() {
        const emails = [];
        
        // Check for Roundcube chip elements (modern themes)
        const chips = document.querySelectorAll('.recipient .recipient-name, .token-input-token span, .recipient-input .token span');
        chips.forEach(chip => {
            const email = extractEmail(chip.textContent || chip.getAttribute('data-email'));
            if (email) emails.push(email);
        });
        
        // Also check hidden input value
        const hiddenInput = document.querySelector('input[name="_to"]');
        if (hiddenInput && hiddenInput.value) {
            // Can contain multiple emails separated by comma
            hiddenInput.value.split(',').forEach(part => {
                const email = extractEmail(part.trim());
                if (email && !emails.includes(email)) emails.push(email);
            });
        }
        
        // Check visible input
        const visibleInput = document.getElementById('_to');
        if (visibleInput && visibleInput.value) {
            visibleInput.value.split(',').forEach(part => {
                const email = extractEmail(part.trim());
                if (email && !emails.includes(email)) emails.push(email);
            });
        }
        
        console.log('[PQC Compose] Found recipient emails:', emails);
        return emails;
    }

    /**
     * Check if recipient supports PQC encryption
     */
    async function checkRecipient(event) {
        const input = event.target || document.getElementById('_to');
        if (!input) return;

        // Get ALL recipient emails (handles chips)
        const emails = getAllRecipientEmails();
        const email = emails.length > 0 ? emails[0] : extractEmail(input.value);
        
        console.log('[PQC Compose] Checking recipient email:', email);
        
        if (!email) {
            console.log('[PQC E2E] ❌ No valid email found in recipient field');
            hideEncryptionToggle();
            return;
        }

        const config = PQCUI.getConfig();
        const domain = config.domain || 'qumail.work.gd';

        // Only check @qumail.work.gd addresses
        if (!email.toLowerCase().endsWith('@' + domain.toLowerCase())) {
            console.log(`[PQC E2E] ❌ Recipient ${email} is NOT a ${domain} user - E2E encryption NOT available`);
            hideEncryptionToggle();
            showStatusMessage('E2E encryption only for @' + domain + ' users');
            return;
        }

        console.log(`[PQC E2E] ✓ Recipient ${email} IS a ${domain} user - checking for PQC keys...`);

        // Check if recipient has PQC keys
        try {
            const response = await fetch(
                `${PQCUI.getKeyServiceUrl()}/keys/${encodeURIComponent(email)}/public`
            );

            if (response.ok) {
                const data = await response.json();
                recipientPublicKey = PQCCrypto.base64ToArrayBuffer(data.public_key);
                recipientHasKeys = true;
                console.log(`[PQC E2E] ✓✓ Recipient ${email} HAS PQC keys - E2E encryption AVAILABLE`);
                showEncryptionToggle();
                showStatusMessage('Recipient has PQC keys - click to enable E2E');
            } else if (response.status === 404) {
                recipientHasKeys = false;
                recipientPublicKey = null;
                console.log(`[PQC E2E] ❌ Recipient ${email} has NO PQC keys - E2E encryption NOT available`);
                showEncryptionToggleDisabled('Recipient has no PQC keys');
            } else {
                throw new Error('API error: ' + response.status);
            }
        } catch (err) {
            console.error('[PQC Compose] Error checking recipient keys:', err);
            recipientHasKeys = false;
            hideEncryptionToggle();
            showStatusMessage('Could not check recipient keys');
        }
    }

    /**
     * Show encryption toggle (enabled)
     */
    function showEncryptionToggle() {
        const container = document.getElementById('pqc-encrypt-container');
        if (container) {
            container.style.display = 'inline-flex';
        }
        if (toggleButton) {
            toggleButton.classList.remove('disabled');
            toggleButton.disabled = false;
            console.log('[PQC E2E] Toggle button ENABLED - user can click to enable E2E encryption');
        }
    }

    /**
     * Show encryption toggle but disabled
     */
    function showEncryptionToggleDisabled(reason) {
        const container = document.getElementById('pqc-encrypt-container');
        if (container) {
            container.style.display = 'inline-flex';
        }
        if (toggleButton) {
            toggleButton.classList.add('disabled');
            toggleButton.disabled = true;
        }
        console.log('[PQC E2E] Toggle button DISABLED - reason:', reason);
        showStatusMessage(reason);
    }

    /**
     * Reset toggle to initial disabled state (instead of hiding)
     */
    function hideEncryptionToggle() {
        // Don't hide - just reset to disabled state
        if (toggleButton) {
            toggleButton.classList.add('disabled');
            toggleButton.disabled = true;
            toggleButton.innerHTML = '<span class="icon">🔒</span><span class="label">PQC Encrypt</span>';
            toggleButton.style.background = '#fff';
            toggleButton.style.color = '#333';
        }
        encryptionEnabled = false;
        recipientHasKeys = false;
        const config = PQCUI ? PQCUI.getConfig() : {};
        const domain = config.domain || 'qumail.work.gd';
        showStatusMessage(`Enter @${domain} recipient`);
        console.log('[PQC E2E] Toggle button reset to initial disabled state');
    }

    /**
     * Show status message
     */
    function showStatusMessage(message) {
        const status = document.getElementById('pqc-encrypt-status');
        if (status) {
            status.textContent = message;
        }
    }

    /**
     * Handle toggle button click
     */
    async function handleToggleClick() {
        console.log('[PQC E2E] Toggle button clicked!');
        console.log('[PQC E2E]   - recipientHasKeys:', recipientHasKeys);
        console.log('[PQC E2E]   - current encryptionEnabled:', encryptionEnabled);
        
        if (!recipientHasKeys) {
            console.log('[PQC E2E] ❌ Cannot toggle - recipient has no keys');
            return;
        }
        
        // If already enabled, just toggle off
        if (encryptionEnabled) {
            encryptionEnabled = false;
            console.log('[PQC E2E] 🔓 E2E disabled by user');
            updateToggleState();
            return;
        }
        
        // Check if user has keys - show setup if none, unlock if locked
        const keyStatus = PQCUI.getKeyStatus();
        console.log('[PQC E2E]   - user keyStatus:', keyStatus);
        
        if (keyStatus === 'none' || keyStatus === 'unknown') {
            console.log('[PQC E2E] ❌ User needs to generate keys first');
            PQCUI.showKeyManagementDialog();
            showStatusMessage('⚠️ Generate your keys first, then try again');
            return;
        }
        
        if (keyStatus === 'locked') {
            console.log('[PQC E2E] 🔐 Keys locked - prompting for unlock');
            showStatusMessage('🔑 Enter passphrase to unlock...');
            
            // Prompt for passphrase inline
            const passphrase = await PQCUI.promptPassphrase('Unlock your keys to enable E2E encryption');
            
            if (!passphrase) {
                showStatusMessage('Unlock cancelled - click to try again');
                return;
            }
            
            // Try to unlock
            try {
                showStatusMessage('🔓 Unlocking keys...');
                const config = PQCUI.getConfig();
                
                const response = await fetch(
                    `${PQCUI.getKeyServiceUrl()}/keys/my/private?user_email=${encodeURIComponent(config.user_email)}`
                );
                
                if (!response.ok) throw new Error('Failed to fetch private key');
                
                const data = await response.json();
                
                const encryptedPrivKey = PQCCrypto.base64ToArrayBuffer(data.encrypted_private_key);
                const salt = PQCCrypto.base64ToArrayBuffer(data.salt);
                const nonce = data.nonce ? PQCCrypto.base64ToArrayBuffer(data.nonce) : encryptedPrivKey.slice(0, 12);
                
                const privateKey = await PQCCrypto.decryptPrivateKey(
                    encryptedPrivKey,
                    salt,
                    nonce,
                    passphrase
                );
                
                // Cache the key
                PQCUI.cachePrivateKey(privateKey);
                console.log('[PQC E2E] ✓ Keys unlocked successfully');
                
                // Now enable encryption
                encryptionEnabled = true;
                updateToggleState();
                PQCUI.showSuccessMessage('Keys unlocked! E2E encryption enabled');
                
            } catch (err) {
                console.error('[PQC E2E] ❌ Unlock failed:', err);
                showStatusMessage('❌ Wrong passphrase - click to retry');
                return;
            }
            
            return;
        }

        // Keys are unlocked - toggle encryption on
        encryptionEnabled = true;
        console.log('[PQC E2E] ✓ E2E enabled! encryptionEnabled is now:', encryptionEnabled);
        updateToggleState();
    }

    /**
     * Update toggle button state
     */
    function updateToggleState() {
        if (!toggleButton) return;

        if (encryptionEnabled) {
            toggleButton.classList.add('active');
            toggleButton.style.background = '#4CAF50';
            toggleButton.style.color = 'white';
            toggleButton.innerHTML = '<span class="icon">🔐</span><span class="label">E2E ON</span>';
            showStatusMessage('✓ E2E Encryption ENABLED - message will be encrypted');
            console.log('[PQC E2E] 🔐 E2E Encryption is NOW ON - message WILL be encrypted before sending');
        } else {
            toggleButton.classList.remove('active');
            toggleButton.style.background = '#fff';
            toggleButton.style.color = '#333';
            toggleButton.innerHTML = '<span class="icon">🔓</span><span class="label">PQC Encrypt</span>';
            showStatusMessage('Click to enable E2E encryption');
            console.log('[PQC E2E] 🔓 E2E Encryption is OFF - message will be sent as plaintext');
        }
    }

    /**
     * Encrypt message before sending
     * Called from form submit hook
     * Uses DUAL ENCRYPTION - encrypts for both recipient AND sender
     */
    async function encryptBeforeSend(messageBody) {
        if (!encryptionEnabled || !recipientPublicKey) {
            console.log('[PQC E2E] 📧 Sending message WITHOUT E2E encryption (plaintext)');
            return messageBody;
        }

        try {
            console.log('[PQC E2E] 🔐 Encrypting message with Kyber768 (dual encryption)...');

            // === ENCRYPT FOR RECIPIENT ===
            const { ciphertext: recipientKem, sharedSecret: recipientSecret } = 
                await PQCCrypto.encapsulate(recipientPublicKey);

            const { ciphertext: msgCiphertext, nonce: msgNonce } = 
                await PQCCrypto.encryptMessage(messageBody, recipientSecret);

            // === ENCRYPT SAME MESSAGE FOR SENDER (so they can read sent messages) ===
            let senderEncryption = null;
            try {
                const config = PQCUI.getConfig();
                const senderEmail = config.user_email;
                
                // Fetch sender's public key
                const response = await fetch(
                    `${PQCUI.getKeyServiceUrl()}/keys/${encodeURIComponent(senderEmail)}/public`
                );
                
                if (response.ok) {
                    const data = await response.json();
                    const senderPublicKey = PQCCrypto.base64ToArrayBuffer(data.public_key);
                    
                    // Encrypt message again for sender with their public key
                    const { ciphertext: senderKem, sharedSecret: senderSecret } = 
                        await PQCCrypto.encapsulate(senderPublicKey);
                    
                    const { ciphertext: senderMsgCiphertext, nonce: senderMsgNonce } = 
                        await PQCCrypto.encryptMessage(messageBody, senderSecret);
                    
                    senderEncryption = {
                        kem_ciphertext: PQCCrypto.arrayBufferToBase64(senderKem),
                        message_ciphertext: PQCCrypto.arrayBufferToBase64(senderMsgCiphertext),
                        message_nonce: PQCCrypto.arrayBufferToBase64(senderMsgNonce)
                    };
                    
                    console.log('[PQC E2E] ✓ Dual encryption: message also encrypted for sender');
                }
            } catch (senderErr) {
                console.log('[PQC E2E] Could not encrypt for sender:', senderErr.message);
                // Continue without sender encryption - not fatal
            }

            // Create encrypted payload with dual encryption support
            const payload = {
                version: '1.1',  // Version 1.1 = dual encryption
                algorithm: 'Kyber768+AES256GCM',
                // Recipient encryption (primary)
                kem_ciphertext: PQCCrypto.arrayBufferToBase64(recipientKem),
                message_ciphertext: PQCCrypto.arrayBufferToBase64(msgCiphertext),
                message_nonce: PQCCrypto.arrayBufferToBase64(msgNonce),
                // Sender encryption (for sent folder viewing)
                sender_copy: senderEncryption
            };

            const encryptedContent = `-----BEGIN QUMAIL PQC ENCRYPTED MESSAGE-----
${JSON.stringify(payload)}
-----END QUMAIL PQC ENCRYPTED MESSAGE-----`;

            console.log('[PQC E2E] ✓✓ Message encrypted successfully');
            return encryptedContent;

        } catch (err) {
            console.error('[PQC E2E] ❌ Encryption failed:', err);
            PQCUI.showErrorMessage('Encryption failed: ' + err.message);
            throw err;
        }
    }

    /**
     * Extract email from input (handles "Name <email>" format and Roundcube chips)
     */
    function extractEmail(input) {
        if (!input) return null;
        
        // First try to match <email> format
        const angleMatch = input.match(/<([^>]+)>/);
        if (angleMatch && angleMatch[1].includes('@')) {
            return angleMatch[1].trim();
        }
        
        // Then try plain email
        const emailMatch = input.match(/[\w.-]+@[\w.-]+\.\w+/);
        if (emailMatch) {
            return emailMatch[0].trim();
        }
        
        return null;
    }

    /**
     * Debounce helper
     */
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    /**
     * Check if encryption is enabled
     */
    function isEncryptionEnabled() {
        const enabled = encryptionEnabled && recipientHasKeys;
        console.log('[PQC E2E] isEncryptionEnabled check:', enabled);
        return enabled;
    }

    /**
     * Hook the send button to intercept and encrypt before send
     */
    let hookRetryCount = 0;
    const MAX_HOOK_RETRIES = 5;
    
    function hookSendButton() {
        // Only hook on compose page
        if (typeof rcmail === 'undefined' || rcmail.env?.action !== 'compose') {
            // Not on compose page, don't retry
            return;
        }
        
        // Find send button
        const sendBtn = document.querySelector('#compose-buttons button[type="submit"], .send-button, button.send, #rcmbtn110');
        const form = document.getElementById('compose-form') || document.querySelector('form[name="form"]');
        
        if (!form) {
            hookRetryCount++;
            if (hookRetryCount < MAX_HOOK_RETRIES) {
                console.log('[PQC Compose] No compose form found, retry', hookRetryCount, 'of', MAX_HOOK_RETRIES);
                setTimeout(hookSendButton, 1000);
            } else {
                console.log('[PQC Compose] Max retries reached, giving up on form hook');
            }
            return;
        }
        
        hookRetryCount = 0; // Reset for next time
        
        console.log('[PQC Compose] Hooking into compose form submit');
        
        // Store original submit handler
        const originalSubmit = form.onsubmit;
        
        // Override form submission
        form.onsubmit = async function(e) {
            console.log('[PQC E2E] Form submit intercepted');
            
            if (!isEncryptionEnabled()) {
                console.log('[PQC E2E] E2E not enabled - submitting plaintext');
                if (originalSubmit) return originalSubmit.call(form, e);
                return true;
            }
            
            // Prevent default submission
            e.preventDefault();
            e.stopPropagation();
            
            console.log('[PQC E2E] 🔐 Encrypting message before send...');
            
            const body = document.getElementById('composebody') ||
                        document.querySelector('textarea[name="_message"]') ||
                        document.querySelector('iframe')?.contentDocument?.body;
            
            if (!body) {
                console.error('[PQC E2E] ❌ Could not find message body');
                alert('Error: Could not find message body for encryption');
                return false;
            }
            
            try {
                // Get the content (handle both textarea and iframe)
                let content = body.value !== undefined ? body.value : body.innerHTML;
                
                // Encrypt the message
                const encrypted = await encryptBeforeSend(content);
                
                // Set encrypted content back
                if (body.value !== undefined) {
                    body.value = encrypted;
                } else {
                    body.innerHTML = encrypted;
                }
                
                console.log('[PQC E2E] ✓✓ Message encrypted successfully!');
                console.log('[PQC E2E] Encrypted content preview:', encrypted.substring(0, 100) + '...');
                
                // Now disable encryption flag to prevent re-encryption on resubmit
                encryptionEnabled = false;
                
                // Submit the form programmatically
                console.log('[PQC E2E] Submitting encrypted message...');
                
                // Use rcmail's send command if available
                if (typeof rcmail !== 'undefined' && rcmail.command) {
                    rcmail.command('send', '', this);
                } else {
                    // Fallback to direct submit
                    HTMLFormElement.prototype.submit.call(form);
                }
                
            } catch (err) {
                console.error('[PQC E2E] ❌ Encryption failed:', err);
                alert('Encryption failed: ' + err.message);
                return false;
            }
            
            return false;
        };
        
        // Also hook the Send button directly
        if (sendBtn) {
            sendBtn.addEventListener('click', async function(e) {
                if (isEncryptionEnabled()) {
                    console.log('[PQC E2E] Send button clicked with E2E enabled');
                    // Let form.onsubmit handle it
                }
            });
        }
    }

    /**
     * Do synchronous encryption with blocking
     */
    async function encryptMessageSync() {
        const body = document.getElementById('composebody') ||
                    document.querySelector('textarea[name="_message"]');
        
        if (!body) {
            console.error('[PQC E2E] ❌ Could not find message body');
            return false;
        }
        
        try {
            console.log('[PQC E2E] 🔐 Starting encryption...');
            const encrypted = await encryptBeforeSend(body.value);
            body.value = encrypted;
            console.log('[PQC E2E] ✓✓ Encryption complete! Content starts with:', encrypted.substring(0, 50));
            return true;
        } catch (err) {
            console.error('[PQC E2E] ❌ Encryption failed:', err);
            return false;
        }
    }

    // Initialize when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    // Hook send button after compose UI is loaded
    setTimeout(hookSendButton, 2000);

    // Public API
    return {
        init,
        checkRecipient,
        encryptBeforeSend,
        isEncryptionEnabled,
        getRecipientPublicKey: () => recipientPublicKey,
        hookSendButton,
        encryptMessageSync,
        // Debug helpers
        getEncryptionState: () => ({
            encryptionEnabled,
            recipientHasKeys,
            hasPublicKey: !!recipientPublicKey
        }),
        // Expose for command hook
        setEncryptionEnabled: (val) => { encryptionEnabled = val; }
    };
})();

// Override rcmail command to intercept 'send'
if (typeof rcmail !== 'undefined') {
    const originalCommand = rcmail.command.bind(rcmail);
    let isEncrypting = false;
    
    rcmail.command = async function(command, props, obj, event) {
        console.log('[PQC E2E] rcmail.command intercepted:', command);
        
        if (command === 'send' && PQCCompose.isEncryptionEnabled() && !isEncrypting) {
            console.log('[PQC E2E] 🔐 INTERCEPTING SEND COMMAND - encrypting first!');
            
            isEncrypting = true;
            
            // Encrypt the message
            const success = await PQCCompose.encryptMessageSync();
            
            if (!success) {
                isEncrypting = false;
                alert('Encryption failed! Message not sent.');
                return false;
            }
            
            // Disable encryption to prevent re-encryption
            PQCCompose.setEncryptionEnabled(false);
            
            console.log('[PQC E2E] ✓ Now sending encrypted message...');
            
            // Call original send
            const result = originalCommand(command, props, obj, event);
            
            isEncrypting = false;
            return result;
        }
        
        // For all other commands, pass through
        return originalCommand(command, props, obj, event);
    };
    

}
