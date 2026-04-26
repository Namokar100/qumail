/**
 * QuMail PQC UI Module
 * 
 * User interface components for PQC E2E encryption in Roundcube.
 * Handles key setup wizard, passphrase dialogs, and status indicators.
 */

window.PQCUI = (function() {
    'use strict';

    // Session cache for decrypted private key (RAM only, never persisted)
    let sessionCache = {
        privateKey: null,
        cachedAt: null,
        expiresAt: null
    };

    let config = null;
    let keyStatus = 'unknown'; // 'none', 'locked', 'unlocked'
    let isRegeneratingKeys = false; // Track if regenerating existing keys

    /**
     * Initialize the PQC UI
     */
    function init() {
        // Wait for rcmail to be ready
        if (typeof rcmail === 'undefined' || !rcmail.env) {
            console.log('[PQC] Waiting for rcmail...');
            setTimeout(init, 100);
            return;
        }
        
        config = rcmail.env.pqc_config || {};
        
        // Disable console.log entirely when in production
        if (config.env === 'prod') {
            const noop = function() {};
            console.log = noop;
            console.info = noop;
            console.debug = noop;
            console.warn = noop;
        }
        
        // Check if we have user email (logged in)
        if (!config.user_email) {
            console.log('[PQC] No user email, not initializing');
            return;
        }
        
        console.log('[PQC] UI initializing for:', config.user_email);
        
        // Add toolbar button after a short delay to ensure DOM is ready
        setTimeout(addToolbarButton, 500);
        
        // Check initial key status
        checkKeyStatus();
    }

    /**
     * Add PQC status button to toolbar
     */
    function addToolbarButton() {
        // Try multiple possible toolbar locations for different Roundcube themes
        const toolbarSelectors = [
            '#messagetoolbar',
            '.toolbar.menu',
            '.toolbar',
            '#toolbar',
            '.header-title',
            '#layout-sidebar .header',
            '#taskmenu',
            '.menu'
        ];
        
        let toolbar = null;
        for (const selector of toolbarSelectors) {
            toolbar = document.querySelector(selector);
            if (toolbar) {
                console.log('[PQC] Found toolbar:', selector);
                break;
            }
        }
        
        if (!toolbar) {
            console.log('[PQC] No toolbar found, will try again...');
            // Try again later
            setTimeout(addToolbarButton, 1000);
            return;
        }
        
        // Don't add if already exists
        if (document.getElementById('pqc-status-btn')) {
            return;
        }
        
        const btn = document.createElement('a');
        btn.id = 'pqc-status-btn';
        btn.className = 'button pqc-status';
        btn.href = '#';
        btn.title = 'PQC Key Management';
        btn.innerHTML = '<span class="pqc-btn-icon">🔒</span><span class="pqc-btn-label">PQC</span>';
        btn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            showKeyManagementDialog();
        };
        toolbar.appendChild(btn);
        console.log('[PQC] Toolbar button added');
    }

    /**
     * Check if current user has PQC keys
     */
    async function checkKeyStatus() {
        try {
            const response = await fetch(
                `${getKeyServiceUrl()}/keys/${encodeURIComponent(config.user_email)}/public`
            );
            
            if (response.ok) {
                // Keys exist - check if we have them unlocked in session
                keyStatus = sessionCache.privateKey ? 'unlocked' : 'locked';
                console.log('[PQC] Keys found, status:', keyStatus);
            } else if (response.status === 404) {
                // No keys found - user needs to generate
                keyStatus = 'none';
                console.log('[PQC] No keys found for user - setup required');
            } else {
                // API error
                console.error('[PQC] Key service error:', response.status);
                keyStatus = 'unknown';
            }
        } catch (err) {
            console.error('[PQC] Error checking key status:', err);
            // On network error, assume no keys (so setup wizard shows)
            keyStatus = 'none';
            console.log('[PQC] Key service unreachable, defaulting to setup mode');
        }
        
        updateStatusIndicator();
    }

    /**
     * Get Key Service URL (browser-accessible)
     */
    function getKeyServiceUrl() {
        // Use relative /api path proxied via Nginx 
        // to solve CORS and HTTPS mixed-content blocks
        
        // Handle local testing fallback when bypassing Nginx
        if (config && config.env === 'local') {
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                if (window.location.port === '8080') {
                    return 'http://localhost:8081';
                }
            }
        }
        
        return '/api';
    }

    /**
     * Update the status indicator in toolbar
     * Only updates the tooltip — the label stays as a short static "PQC"
     * to avoid text overflow in the narrow Roundcube sidebar.
     * The private key cache is RAM-only, so status always resets to
     * "locked" on page refresh; showing that in the label was confusing.
     */
    function updateStatusIndicator() {
        const btn = document.getElementById('pqc-status-btn');
        if (!btn) return;

        // Only update the tooltip, not the visible label
        switch(keyStatus) {
            case 'none':
                btn.title = 'No PQC keys — click to set up';
                break;
            case 'locked':
                btn.title = 'PQC keys available — click to unlock';
                break;
            case 'unlocked':
                btn.title = 'PQC keys unlocked for this session';
                break;
            default:
                btn.title = 'PQC Key Management';
        }
    }

    /**
     * Show key management dialog
     */
    function showKeyManagementDialog() {
        if (keyStatus === 'none') {
            showKeySetupWizard();
        } else {
            showKeyStatusDialog();
        }
    }

    /**
     * Show key setup wizard for generating new keys
     */
    function showKeySetupWizard() {
        const dialogHtml = `
            <div id="pqc-setup-wizard" class="pqc-dialog">
                <div class="pqc-dialog-content">
                    <h2>🔐 Setup PQC Encryption</h2>
                    
                    <div class="pqc-warning-box">
                        <h3>⚠️ IMPORTANT WARNING</h3>
                        <p>Your passphrase protects your encryption keys.</p>
                        <ul>
                            <li>We do <strong>NOT</strong> store your passphrase</li>
                            <li>We <strong>CANNOT</strong> recover your passphrase</li>
                            <li>If you forget it, encrypted emails are <strong>PERMANENTLY LOST</strong></li>
                        </ul>
                        <p><strong>Please write down your passphrase and store it safely!</strong></p>
                    </div>
                    
                    <div class="pqc-form">
                        <div class="form-group">
                            <label for="pqc-passphrase">Enter Passphrase:</label>
                            <input type="password" id="pqc-passphrase" 
                                   placeholder="Minimum 8 characters" autocomplete="new-password">
                        </div>
                        
                        <div class="form-group">
                            <label for="pqc-passphrase-confirm">Confirm Passphrase:</label>
                            <input type="password" id="pqc-passphrase-confirm" 
                                   placeholder="Confirm passphrase" autocomplete="new-password">
                        </div>
                        
                        <div class="form-group checkbox">
                            <label>
                                <input type="checkbox" id="pqc-understand-checkbox">
                                I understand this cannot be recovered
                            </label>
                        </div>
                        
                        <div id="pqc-setup-error" class="pqc-error" style="display:none;"></div>
                        
                        <div class="pqc-buttons">
                            <button id="pqc-generate-btn" class="btn btn-primary" disabled>
                                Generate Keys
                            </button>
                            <button id="pqc-cancel-btn" class="btn">Cancel</button>
                        </div>
                    </div>
                    
                    <div id="pqc-generating" class="pqc-loading" style="display:none;">
                        <div class="spinner"></div>
                        <p>Generating quantum-safe keys...</p>
                    </div>
                </div>
            </div>
        `;
        
        // Add dialog to page
        const overlay = document.createElement('div');
        overlay.id = 'pqc-overlay';
        overlay.className = 'pqc-overlay';
        overlay.innerHTML = dialogHtml;
        document.body.appendChild(overlay);
        
        // Setup event handlers
        document.getElementById('pqc-understand-checkbox').onchange = function() {
            document.getElementById('pqc-generate-btn').disabled = !this.checked;
        };
        
        document.getElementById('pqc-generate-btn').onclick = handleGenerateKeys;
        document.getElementById('pqc-cancel-btn').onclick = function() {
            isRegeneratingKeys = false; // Reset flag on cancel
            closeDialog();
        };
    }

    /**
     * Show key regeneration wizard (for forgot passphrase scenario)
     * Similar to setup wizard but with stronger warnings about data loss
     */
    function showKeyRegenerationWizard() {
        const dialogHtml = `
            <div id="pqc-setup-wizard" class="pqc-dialog">
                <div class="pqc-dialog-content">
                    <h2>🔄 Regenerate PQC Keys</h2>
                    
                    <div class="pqc-warning-box critical">
                        <h3>⚠️ CRITICAL DATA LOSS WARNING</h3>
                        <p><strong>You are about to generate completely new encryption keys.</strong></p>
                        <ul>
                            <li><strong>ALL previously encrypted emails will become PERMANENTLY UNREADABLE</strong></li>
                            <li>This action <strong>CANNOT be undone</strong></li>
                            <li>Your new passphrase will protect your new keys</li>
                            <li>Only do this if you have forgotten your old passphrase</li>
                        </ul>
                    </div>
                    
                    <div class="pqc-form">
                        <div class="form-group">
                            <label for="pqc-passphrase">Enter NEW Passphrase:</label>
                            <input type="password" id="pqc-passphrase" 
                                   placeholder="Minimum 8 characters" autocomplete="new-password">
                        </div>
                        
                        <div class="form-group">
                            <label for="pqc-passphrase-confirm">Confirm NEW Passphrase:</label>
                            <input type="password" id="pqc-passphrase-confirm" 
                                   placeholder="Confirm passphrase" autocomplete="new-password">
                        </div>
                        
                        <div class="form-group checkbox">
                            <label>
                                <input type="checkbox" id="pqc-understand-checkbox">
                                I understand that ALL my old encrypted emails will be permanently lost
                            </label>
                        </div>
                        
                        <div id="pqc-setup-error" class="pqc-error" style="display:none;"></div>
                        
                        <div class="pqc-buttons">
                            <button id="pqc-generate-btn" class="btn btn-danger" disabled>
                                ⚠️ Regenerate Keys (Destroy Old Data)
                            </button>
                            <button id="pqc-cancel-btn" class="btn">Cancel</button>
                        </div>
                    </div>
                    
                    <div id="pqc-generating" class="pqc-loading" style="display:none;">
                        <div class="spinner"></div>
                        <p>Generating new quantum-safe keys...</p>
                    </div>
                </div>
            </div>
        `;
        
        // Add dialog to page
        const overlay = document.createElement('div');
        overlay.id = 'pqc-overlay';
        overlay.className = 'pqc-overlay';
        overlay.innerHTML = dialogHtml;
        document.body.appendChild(overlay);
        
        // Setup event handlers
        document.getElementById('pqc-understand-checkbox').onchange = function() {
            document.getElementById('pqc-generate-btn').disabled = !this.checked;
        };
        
        document.getElementById('pqc-generate-btn').onclick = handleGenerateKeys;
        document.getElementById('pqc-cancel-btn').onclick = function() {
            isRegeneratingKeys = false; // Reset flag on cancel
            closeDialog();
        };
    }

    /**
     * Handle key generation
     */
    async function handleGenerateKeys() {
        const passphrase = document.getElementById('pqc-passphrase').value;
        const confirm = document.getElementById('pqc-passphrase-confirm').value;
        const errorDiv = document.getElementById('pqc-setup-error');
        const formDiv = document.querySelector('.pqc-form');
        const loadingDiv = document.getElementById('pqc-generating');
        
        // Validate
        if (passphrase.length < 8) {
            errorDiv.textContent = 'Passphrase must be at least 8 characters!';
            errorDiv.style.display = 'block';
            return;
        }
        
        if (passphrase !== confirm) {
            errorDiv.textContent = 'Passphrases do not match!';
            errorDiv.style.display = 'block';
            return;
        }
        
        // Show loading
        formDiv.style.display = 'none';
        loadingDiv.style.display = 'block';
        
        try {
            // Generate keypair
            const keyPair = await PQCCrypto.generateKeyPair();
            
            // Encrypt private key with passphrase
            const encrypted = await PQCCrypto.encryptPrivateKey(
                keyPair.privateKey, 
                passphrase
            );
            
            // Send to Key Service - use rotate endpoint if regenerating, generate if new
            const endpoint = isRegeneratingKeys ? '/keys/rotate' : '/keys/generate';
            const bodyData = isRegeneratingKeys ? {
                user_email: config.user_email,
                new_public_key: PQCCrypto.arrayBufferToBase64(keyPair.publicKey),
                new_encrypted_private_key: PQCCrypto.arrayBufferToBase64(encrypted.ciphertext),
                new_salt: PQCCrypto.arrayBufferToBase64(encrypted.salt),
                new_nonce: PQCCrypto.arrayBufferToBase64(encrypted.nonce)
            } : {
                user_email: config.user_email,
                public_key: PQCCrypto.arrayBufferToBase64(keyPair.publicKey),
                encrypted_private_key: PQCCrypto.arrayBufferToBase64(encrypted.ciphertext),
                salt: PQCCrypto.arrayBufferToBase64(encrypted.salt),
                nonce: PQCCrypto.arrayBufferToBase64(encrypted.nonce)
            };
            
            const response = await fetch(`${getKeyServiceUrl()}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyData)
            });
            
            if (!response.ok) {
                const data = await response.json();
                // Handle structured error responses from FastAPI/Pydantic
                let errorMsg = 'Failed to store keys';
                if (data.detail) {
                    if (typeof data.detail === 'string') {
                        errorMsg = data.detail;
                    } else if (Array.isArray(data.detail)) {
                        // Pydantic validation errors are arrays
                        errorMsg = data.detail.map(e => e.msg || e.message || JSON.stringify(e)).join(', ');
                    } else if (typeof data.detail === 'object') {
                        errorMsg = JSON.stringify(data.detail);
                    }
                }
                throw new Error(errorMsg);
            }
            
            // Cache decrypted private key in session
            cachePrivateKey(keyPair.privateKey);
            
            // Update status
            keyStatus = 'unlocked';
            updateStatusIndicator();
            
            // Show success
            const successMsg = isRegeneratingKeys 
                ? 'PQC keys regenerated successfully! Old encrypted emails can no longer be decrypted.'
                : 'PQC keys generated successfully!';
            showSuccessMessage(successMsg);
            isRegeneratingKeys = false; // Reset flag
            closeDialog();
            
        } catch (err) {
            console.error('[PQC] Key generation error:', err);
            loadingDiv.style.display = 'none';
            formDiv.style.display = 'block';
            // Ensure error message is a string
            const errMsg = err.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
            errorDiv.textContent = 'Error: ' + errMsg;
            errorDiv.style.display = 'block';
            // Don't reset isRegeneratingKeys here - user might retry
        }
    }

    /**
     * Show key status dialog (when keys exist)
     */
    function showKeyStatusDialog() {
        const isUnlocked = keyStatus === 'unlocked';
        
        const dialogHtml = `
            <div id="pqc-status-dialog" class="pqc-dialog">
                <div class="pqc-dialog-content">
                    <h2>🔐 PQC Encryption Status</h2>
                    
                    <div class="pqc-status-info">
                        <p><strong>Status:</strong> 
                            <span class="status-badge ${isUnlocked ? 'unlocked' : 'locked'}">
                                ${isUnlocked ? '🔓 Unlocked' : '🔒 Locked'}
                            </span>
                        </p>
                        <p><strong>Email:</strong> ${config.user_email}</p>
                        <p><strong>Algorithm:</strong> Kyber768 (Post-Quantum)</p>
                    </div>
                    
                    ${!isUnlocked ? `
                        <div class="pqc-form">
                            <div class="form-group">
                                <label for="pqc-unlock-passphrase">Enter Passphrase to Unlock:</label>
                                <input type="password" id="pqc-unlock-passphrase" 
                                       placeholder="Your passphrase">
                            </div>
                            <div id="pqc-unlock-error" class="pqc-error" style="display:none;"></div>
                            <button id="pqc-unlock-btn" class="btn btn-primary">Unlock</button>
                        </div>
                        
                        <div class="pqc-divider">
                            <span>or</span>
                        </div>
                        
                        <div class="pqc-regen-area">
                            <p>Forgot passphrase? Generate new keys (old encrypted emails will be lost)</p>
                            <button id="pqc-regenerate-btn" class="btn btn-danger">Generate New Keys</button>
                        </div>
                    ` : `
                        <p class="pqc-info">Your encryption keys are active for this session.</p>
                    `}
                    
                    <div class="pqc-buttons">
                        <button id="pqc-close-btn" class="btn">Close</button>
                    </div>
                </div>
            </div>
        `;
        
        const overlay = document.createElement('div');
        overlay.id = 'pqc-overlay';
        overlay.className = 'pqc-overlay';
        overlay.innerHTML = dialogHtml;
        document.body.appendChild(overlay);
        
        document.getElementById('pqc-close-btn').onclick = closeDialog;
        
        if (!isUnlocked) {
            document.getElementById('pqc-unlock-btn').onclick = handleUnlock;
            document.getElementById('pqc-unlock-passphrase').onkeypress = function(e) {
                if (e.key === 'Enter') handleUnlock();
            };
            // Add regenerate keys handler
            document.getElementById('pqc-regenerate-btn').onclick = function() {
                closeDialog();
                isRegeneratingKeys = true; // Set flag to use /keys/rotate endpoint
                showKeyRegenerationWizard(); // Show wizard with appropriate warning
            };
        }
    }

    /**
     * Handle unlocking keys with passphrase
     */
    async function handleUnlock() {
        const passphrase = document.getElementById('pqc-unlock-passphrase').value;
        const errorDiv = document.getElementById('pqc-unlock-error');
        
        if (!passphrase) {
            errorDiv.textContent = 'Please enter your passphrase';
            errorDiv.style.display = 'block';
            return;
        }
        
        try {
            // Fetch encrypted private key
            const response = await fetch(
                `${getKeyServiceUrl()}/keys/my/private?user_email=${encodeURIComponent(config.user_email)}`
            );
            
            if (!response.ok) {
                throw new Error('Failed to fetch private key');
            }
            
            const data = await response.json();
            
            // Decrypt private key
            const ciphertext = PQCCrypto.base64ToArrayBuffer(data.encrypted_private_key);
            const salt = PQCCrypto.base64ToArrayBuffer(data.salt);
            const nonce = data.nonce ? PQCCrypto.base64ToArrayBuffer(data.nonce) : ciphertext.slice(0, 12);
            
            const privateKey = await PQCCrypto.decryptPrivateKey(
                ciphertext,
                salt,
                nonce,
                passphrase
            );
            
            // Cache it
            cachePrivateKey(privateKey);
            
            keyStatus = 'unlocked';
            updateStatusIndicator();
            
            closeDialog();
            showSuccessMessage('Keys unlocked successfully!');
            
        } catch (err) {
            console.error('[PQC] Unlock error:', err);
            errorDiv.textContent = 'Wrong passphrase or decryption failed';
            errorDiv.style.display = 'block';
        }
    }

    /**
     * Show passphrase prompt dialog
     * @returns {Promise<string>} Passphrase or null if cancelled
     */
    function promptPassphrase(message) {
        return new Promise((resolve) => {
            const dialogHtml = `
                <div id="pqc-passphrase-dialog" class="pqc-dialog">
                    <div class="pqc-dialog-content">
                        <h2>🔒 Passphrase Required</h2>
                        <p>${message || 'Enter your passphrase to decrypt this message'}</p>
                        
                        <div class="pqc-form">
                            <div class="form-group">
                                <input type="password" id="pqc-prompt-passphrase" 
                                       placeholder="Your passphrase" autofocus>
                            </div>
                            <div id="pqc-prompt-error" class="pqc-error" style="display:none;"></div>
                        </div>
                        
                        <div class="pqc-buttons">
                            <button id="pqc-prompt-ok" class="btn btn-primary">Unlock</button>
                            <button id="pqc-prompt-cancel" class="btn">Cancel</button>
                        </div>
                    </div>
                </div>
            `;
            
            const overlay = document.createElement('div');
            overlay.id = 'pqc-overlay';
            overlay.className = 'pqc-overlay';
            overlay.innerHTML = dialogHtml;
            document.body.appendChild(overlay);
            
            document.getElementById('pqc-prompt-ok').onclick = () => {
                const pass = document.getElementById('pqc-prompt-passphrase').value;
                closeDialog();
                resolve(pass);
            };
            
            document.getElementById('pqc-prompt-cancel').onclick = () => {
                closeDialog();
                resolve(null);
            };
            
            document.getElementById('pqc-prompt-passphrase').onkeypress = (e) => {
                if (e.key === 'Enter') {
                    const pass = document.getElementById('pqc-prompt-passphrase').value;
                    closeDialog();
                    resolve(pass);
                }
            };
        });
    }

    /**
     * Cache decrypted private key in memory
     */
    function cachePrivateKey(privateKey) {
        const timeout = (config.session_timeout || 3600) * 1000;
        sessionCache = {
            privateKey: privateKey,
            cachedAt: Date.now(),
            expiresAt: Date.now() + timeout
        };
        
        // Set timeout to clear cache
        setTimeout(() => {
            if (sessionCache.expiresAt && Date.now() >= sessionCache.expiresAt) {
                clearCache();
            }
        }, timeout);
    }

    /**
     * Get cached private key
     * @returns {Uint8Array|null}
     */
    function getCachedPrivateKey() {
        if (!sessionCache.privateKey) return null;
        if (sessionCache.expiresAt && Date.now() >= sessionCache.expiresAt) {
            clearCache();
            return null;
        }
        return sessionCache.privateKey;
    }

    /**
     * Clear session cache
     */
    function clearCache() {
        sessionCache = { privateKey: null, cachedAt: null, expiresAt: null };
        keyStatus = 'locked';
        updateStatusIndicator();
        console.log('[PQC] Session cache cleared');
    }

    /**
     * Close dialog
     */
    function closeDialog() {
        const overlay = document.getElementById('pqc-overlay');
        if (overlay) {
            overlay.remove();
        }
    }

    /**
     * Show success message
     */
    function showSuccessMessage(message) {
        if (typeof rcmail !== 'undefined' && rcmail.display_message) {
            rcmail.display_message(message, 'confirmation');
        } else {
            alert(message);
        }
    }

    /**
     * Show error message
     */
    function showErrorMessage(message) {
        if (typeof rcmail !== 'undefined' && rcmail.display_message) {
            rcmail.display_message(message, 'error');
        } else {
            alert('Error: ' + message);
        }
    }

    // Public API
    return {
        init,
        checkKeyStatus,
        getKeyStatus: () => keyStatus,
        getCachedPrivateKey,
        cachePrivateKey,
        clearCache,
        promptPassphrase,
        showKeyManagementDialog,
        showSuccessMessage,
        showErrorMessage,
        getKeyServiceUrl,
        getConfig: () => config
    };
})();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PQCUI.init());
} else {
    PQCUI.init();
}
