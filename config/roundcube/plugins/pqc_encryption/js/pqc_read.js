/**
 * QuMail PQC Read Integration
 * 
 * Handles detection and decryption of PQC-encrypted messages when reading emails.
 * Shows E2E badges and prompts for passphrase when needed.
 */

window.PQCRead = (function() {
    'use strict';

    const PQC_BEGIN_MARKER = '-----BEGIN QUMAIL PQC ENCRYPTED MESSAGE-----';
    const PQC_END_MARKER = '-----END QUMAIL PQC ENCRYPTED MESSAGE-----';
    let currentPayload = null;
    let originalContent = null;  // Store original encrypted content for retry
    let messageContainer = null; // Store reference to message container

    /**
     * Initialize read integration
     */
    function init() {
        console.log('[PQC Read] Initializing...');
        
        if (typeof rcmail !== 'undefined') {
            rcmail.addEventListener('init', function() {
                if (rcmail.env.action === 'show' || rcmail.env.action === 'preview') {
                    setTimeout(checkForEncryptedMessage, 300);
                }
            });
            
            // Also listen for message load events
            rcmail.addEventListener('aftershow', function() {
                setTimeout(checkForEncryptedMessage, 300);
            });
        }
        
        // Check immediately if already viewing a message
        setTimeout(checkForEncryptedMessage, 500);
    }

    /**
     * Check if current message is encrypted
     */
    function checkForEncryptedMessage() {
        const messageBody = getMessageBody();
        if (!messageBody) {
            console.log('[PQC Read] No message body found');
            return;
        }

        const content = messageBody.innerText || messageBody.textContent || '';
        
        if (content.includes(PQC_BEGIN_MARKER)) {
            console.log('[PQC Read] 🔐 PQC Encrypted message detected!');
            handleEncryptedMessage(messageBody, content);
        } else {
            console.log('[PQC Read] Regular (non-encrypted) message');
        }
    }

    /**
     * Get message body element
     */
    function getMessageBody() {
        // Try multiple selectors for different Roundcube themes
        const selectors = [
            '#messagebody',
            '#message-content',
            '.message-part',
            '.message-body',
            '#message-htmlpart'
        ];
        
        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) return el;
        }
        
        // Try iframe
        const iframe = document.querySelector('iframe');
        if (iframe && iframe.contentDocument) {
            return iframe.contentDocument.body;
        }
        
        return null;
    }

    /**
     * Handle encrypted message display
     */
    async function handleEncryptedMessage(container, content) {
        // Extract encrypted payload
        const payload = extractEncryptedPayload(content);
        if (!payload) {
            showDecryptionError(container, 'Invalid encrypted message format');
            return;
        }
        
        currentPayload = payload;
        
        // Store original content and container for retry functionality
        originalContent = content;
        messageContainer = container;

        // Check key status
        const keyStatus = PQCUI.getKeyStatus();
        console.log('[PQC Read] User key status:', keyStatus);

        // Check if we have cached private key
        let privateKey = PQCUI.getCachedPrivateKey();
        
        if (privateKey) {
            // Keys unlocked - decrypt directly
            console.log('[PQC Read] Keys unlocked, decrypting...');
            await decryptMessage(container, payload, privateKey);
        } else if (keyStatus === 'locked') {
            // Keys exist but locked - show unlock prompt
            console.log('[PQC Read] Keys locked - showing unlock prompt');
            showUnlockPrompt(container, payload);
        } else if (keyStatus === 'none' || keyStatus === 'unknown') {
            // No keys - show error
            console.log('[PQC Read] No keys found - cannot decrypt');
            showNoKeysError(container);
        } else {
            // Ask for passphrase
            showUnlockPrompt(container, payload);
        }
    }

    /**
     * Extract encrypted payload from message content
     */
    function extractEncryptedPayload(content) {
        try {
            console.log('[PQC Read] Raw content length:', content.length);
            
            const startIdx = content.indexOf(PQC_BEGIN_MARKER);
            const endIdx = content.indexOf(PQC_END_MARKER);
            
            console.log('[PQC Read] Markers found at:', startIdx, '-', endIdx);
            
            if (startIdx === -1 || endIdx === -1) {
                console.log('[PQC Read] Markers not found');
                return null;
            }
            
            let jsonStr = content.substring(
                startIdx + PQC_BEGIN_MARKER.length,
                endIdx
            );
            
            console.log('[PQC Read] Extracted JSON (before cleanup):', jsonStr.substring(0, 100) + '...');
            
            // Clean up the JSON string
            jsonStr = jsonStr
                .trim()
                // CRITICAL: Remove control characters that break JSON (except valid JSON whitespace)
                // eslint-disable-next-line no-control-regex
                .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
                // Replace newlines and carriage returns within the JSON structure
                .replace(/\r\n/g, '')
                .replace(/\r/g, '')
                .replace(/\n/g, '')
                .replace(/\t/g, '')
                // Handle HTML entities that might have been introduced
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&#39;/g, "'")
                .replace(/&nbsp;/g, ' ')
                // Handle potential HTML line breaks
                .replace(/<br\s*\/?>/gi, '')
                .replace(/<\/p>/gi, '')
                .replace(/<p>/gi, '')
                // Remove any remaining HTML tags
                .replace(/<[^>]*>/g, '')
                .trim();
            
            console.log('[PQC Read] Cleaned JSON:', jsonStr.substring(0, 200) + '...');
            console.log('[PQC Read] JSON length after cleanup:', jsonStr.length);
            
            const parsed = JSON.parse(jsonStr);
            console.log('[PQC Read] ✓ Payload parsed successfully:', Object.keys(parsed));
            return parsed;
            
        } catch (err) {
            console.error('[PQC Read] Failed to parse encrypted payload:', err);
            console.error('[PQC Read] Content sample:', content?.substring(0, 500));
            return null;
        }
    }

    /**
     * Show unlock prompt for locked keys
     */
    function showUnlockPrompt(container, payload) {
        container.innerHTML = `
            <div class="pqc-encrypted-placeholder" style="text-align:center; padding:40px; background:linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius:12px; color:white;">
                <div class="pqc-encrypted-icon" style="font-size:64px; margin-bottom:20px;">🔐</div>
                <h3 style="margin:0 0 10px 0; font-size:24px;">PQC E2E Encrypted Message</h3>
                <p style="margin:0 0 5px 0; opacity:0.9;">This message was encrypted using <strong>Post-Quantum Cryptography</strong></p>
                <p style="margin:0 0 20px 0; font-size:13px; opacity:0.7;">Algorithm: ${payload.algorithm || 'Kyber768+AES256GCM'}</p>
                
                <div style="background:rgba(255,255,255,0.95); padding:25px; border-radius:10px; max-width:350px; margin:0 auto; color:#333;">
                    <p style="margin:0 0 15px 0; font-weight:600; color:#667eea;">🔑 Enter your passphrase to decrypt</p>
                    <input type="password" id="pqc-unlock-input" placeholder="Your passphrase" 
                           style="width:100%; padding:12px; border:2px solid #ddd; border-radius:6px; font-size:14px; box-sizing:border-box;">
                    <div id="pqc-unlock-error" style="color:#e53935; font-size:12px; margin-top:8px; display:none;"></div>
                    <button id="pqc-unlock-btn" class="btn btn-primary" 
                            style="width:100%; padding:12px; margin-top:15px; background:#667eea; color:white; border:none; border-radius:6px; cursor:pointer; font-size:14px; font-weight:600;">
                        🔓 Unlock & Decrypt
                    </button>
                </div>
            </div>
        `;
        
        // Add event listeners
        document.getElementById('pqc-unlock-btn').onclick = () => handleUnlockClick(container, payload);
        document.getElementById('pqc-unlock-input').onkeypress = (e) => {
            if (e.key === 'Enter') handleUnlockClick(container, payload);
        };
        
        // Focus input
        setTimeout(() => document.getElementById('pqc-unlock-input')?.focus(), 100);
    }

    /**
     * Handle unlock button click
     */
    async function handleUnlockClick(container, payload) {
        const input = document.getElementById('pqc-unlock-input');
        const errorDiv = document.getElementById('pqc-unlock-error');
        const btn = document.getElementById('pqc-unlock-btn');
        
        const passphrase = input?.value;
        if (!passphrase) {
            errorDiv.textContent = 'Please enter your passphrase';
            errorDiv.style.display = 'block';
            return;
        }
        
        // Show loading
        btn.textContent = '⏳ Decrypting...';
        btn.disabled = true;
        errorDiv.style.display = 'none';
        
        try {
            await unlockAndDecrypt(container, payload, passphrase);
        } catch (err) {
            btn.textContent = '🔓 Unlock & Decrypt';
            btn.disabled = false;
            errorDiv.textContent = 'Wrong passphrase or decryption failed';
            errorDiv.style.display = 'block';
        }
    }

    /**
     * Show no keys error
     */
    function showNoKeysError(container) {
        container.innerHTML = `
            <div class="pqc-encrypted-placeholder error" style="text-align:center; padding:40px; background:#ffebee; border-radius:12px; border:2px solid #ef5350;">
                <div class="pqc-encrypted-icon" style="font-size:48px; margin-bottom:10px;">❌</div>
                <h3 style="margin:0 0 10px 0; color:#c62828;">Cannot Decrypt Message</h3>
                <p style="color:#666;">You don't have PQC encryption keys set up.</p>
                <p style="color:#666; font-size:13px;">Set up your keys first to decrypt E2E messages.</p>
                <button onclick="PQCUI.showKeyManagementDialog()" class="btn btn-primary" 
                        style="margin-top:15px; padding:10px 20px; background:#667eea; color:white; border:none; border-radius:6px; cursor:pointer;">
                    Setup PQC Keys
                </button>
            </div>
        `;
    }

    /**
     * Unlock keys and decrypt message
     */
    async function unlockAndDecrypt(container, payload, passphrase) {
        const config = PQCUI.getConfig();

        console.log('[PQC Read] Fetching encrypted private key...');
        
        // Fetch encrypted private key from API
        const response = await fetch(
            `${PQCUI.getKeyServiceUrl()}/keys/my/private?user_email=${encodeURIComponent(config.user_email)}`
        );
        
        if (!response.ok) {
            throw new Error('Failed to fetch private key');
        }
        
        const data = await response.json();
        
        console.log('[PQC Read] Decrypting private key with passphrase...');
        
        // Decrypt private key with passphrase
        const encryptedPrivKey = PQCCrypto.base64ToArrayBuffer(data.encrypted_private_key);
        const salt = PQCCrypto.base64ToArrayBuffer(data.salt);
        const nonce = data.nonce ? PQCCrypto.base64ToArrayBuffer(data.nonce) : encryptedPrivKey.slice(0, 12);
        
        const privateKey = await PQCCrypto.decryptPrivateKey(
            encryptedPrivKey,
            salt,
            nonce,
            passphrase
        );
        
        // Cache it for session
        PQCUI.cachePrivateKey(privateKey);
        console.log('[PQC Read] Private key unlocked and cached');
        
        // Now decrypt the message
        await decryptMessage(container, payload, privateKey);
    }

    /**
     * Decrypt message with private key
     * Supports dual encryption - tries sender_copy if in Sent folder
     */
    async function decryptMessage(container, payload, privateKey) {
        try {
            console.log('[PQC Read] Decrypting message content...');
            
            // Check if in Sent folder - if so, try sender_copy first
            const isSentFolder = window.location.href.includes('_mbox=Sent') || 
                                 document.querySelector('.mailbox.sent.selected') ||
                                 rcmail?.env?.mailbox?.toLowerCase() === 'sent';
            
            let kemCiphertext, msgCiphertext, msgNonce;
            
            if (isSentFolder && payload.sender_copy) {
                // Use sender copy for decryption (sender viewing their sent message)
                console.log('[PQC Read] Sent folder detected - using sender_copy for decryption');
                kemCiphertext = PQCCrypto.base64ToArrayBuffer(payload.sender_copy.kem_ciphertext);
                msgCiphertext = PQCCrypto.base64ToArrayBuffer(payload.sender_copy.message_ciphertext);
                msgNonce = PQCCrypto.base64ToArrayBuffer(payload.sender_copy.message_nonce);
            } else {
                // Use recipient copy (normal case)
                console.log('[PQC Read] Using recipient copy for decryption');
                kemCiphertext = PQCCrypto.base64ToArrayBuffer(payload.kem_ciphertext);
                msgCiphertext = PQCCrypto.base64ToArrayBuffer(payload.message_ciphertext);
                msgNonce = PQCCrypto.base64ToArrayBuffer(payload.message_nonce);
            }
            
            // Decapsulate to get shared secret
            const sharedSecret = await PQCCrypto.decapsulate(kemCiphertext, privateKey);
            
            // Decrypt message
            const plaintext = await PQCCrypto.decryptMessage(
                msgCiphertext,
                msgNonce,
                sharedSecret
            );
            
            // Show decrypted message
            showDecryptedMessage(container, plaintext, payload, isSentFolder);
            
            console.log('[PQC Read] ✓✓ Message decrypted successfully!');
            
        } catch (err) {
            console.error('[PQC Read] Message decryption failed:', err);
            showDecryptionError(container, 'Failed to decrypt message: ' + err.message);
        }
    }

    /**
     * Show decrypted message as normal email body content
     * Renders plaintext naturally, matching Roundcube's default message display
     */
    function showDecryptedMessage(container, plaintext, payload, isSentFolder = false) {
        // Simply replace the container content with the decrypted plaintext,
        // rendered the same way Roundcube shows normal unencrypted emails.
        container.innerHTML = `<div class="message-part"><div class="rcmBody" style="white-space: pre-wrap;">${escapeHtml(plaintext)}</div></div>`;
    }

    /**
     * Show decryption error - with special handling for sent messages and key mismatch
     */
    function showDecryptionError(container, message) {
        // Check if viewing from Sent folder
        const isSentFolder = window.location.href.includes('_mbox=Sent') || 
                             document.querySelector('.mailbox.sent.selected') ||
                             rcmail?.env?.mailbox?.toLowerCase() === 'sent';
        
        if (isSentFolder) {
            // This is expected - show E2E explanation
            container.innerHTML = `
                <div class="pqc-sent-encrypted" style="text-align:center; padding:30px; background:linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius:12px; color:white;">
                    <div style="font-size:48px; margin-bottom:15px;">🔐</div>
                    <h3 style="margin:0 0 10px 0;">PQC E2E Encrypted Message Sent</h3>
                    <p style="margin:0 0 15px 0; opacity:0.9; font-size:14px;">
                        This message was encrypted with the <strong>recipient's public key</strong>.
                    </p>
                    <div style="background:rgba(255,255,255,0.15); padding:15px; border-radius:8px; font-size:13px; text-align:left;">
                        <p style="margin:0 0 8px 0;">✓ <strong>True E2E encryption:</strong> Only the recipient can decrypt this message.</p>
                        <p style="margin:0;">✓ <strong>Algorithm:</strong> Kyber768 + AES-256-GCM</p>
                    </div>
                    <p style="margin:15px 0 0 0; opacity:0.7; font-size:12px;">
                        This is the expected behavior for end-to-end encryption.
                    </p>
                </div>
            `;
        } else {
            // Regular decryption error - might be key mismatch after regeneration
            container.innerHTML = `
                <div class="pqc-encrypted-placeholder error" style="text-align:center; padding:40px; background:#ffebee; border-radius:12px;">
                    <div class="pqc-encrypted-icon" style="font-size:48px;">❌</div>
                    <h3 style="color:#c62828;">Decryption Failed</h3>
                    <p style="color:#666;">${escapeHtml(message)}</p>
                    
                    <div style="background:#fff3cd; border:1px solid #ffc107; border-radius:8px; padding:15px; margin:15px 0; text-align:left;">
                        <p style="margin:0 0 8px 0; font-weight:bold; color:#856404;">⚠️ Possible causes:</p>
                        <ul style="margin:0; padding-left:20px; color:#856404; font-size:13px;">
                            <li>Wrong passphrase entered</li>
                            <li>You regenerated your keys after this message was sent</li>
                            <li>Message was encrypted with different keys</li>
                        </ul>
                        <p style="margin:10px 0 0 0; font-size:12px; color:#856404;">
                            <strong>Note:</strong> If you regenerated keys, old messages cannot be recovered.
                        </p>
                    </div>
                    
                    <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
                        <button id="pqc-retry-btn" class="btn btn-primary" 
                                style="padding:10px 20px; background:#667eea; color:white; border:none; border-radius:6px; cursor:pointer;">
                            🔑 Try Different Passphrase
                        </button>
                    </div>
                </div>
            `;
            
            // Attach event handler
            document.getElementById('pqc-retry-btn').onclick = function() {
                retryDecryption();
            };
        }
    }

    /**
     * Retry decryption - clears cached key to prompt for passphrase again
     */
    function retryDecryption() {
        console.log('[PQC Read] Retry decryption requested - clearing cached key');
        
        // Clear the cached private key so it asks for passphrase again
        PQCUI.clearCache();
        
        // Use stored original content and container instead of re-detecting from DOM
        if (originalContent && messageContainer && currentPayload) {
            console.log('[PQC Read] Using stored content for retry');
            handleEncryptedMessage(messageContainer, originalContent);
        } else {
            // Fallback: try to re-detect (may not work if DOM was modified)
            console.log('[PQC Read] No stored content, attempting re-detection');
            currentPayload = null;
            checkForEncryptedMessage();
        }
    }

    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Initialize when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Public API
    return {
        init,
        checkForEncryptedMessage,
        retryDecryption
    };
})();
