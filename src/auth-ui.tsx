import type { FC } from 'hono/jsx'

const styles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0a0a0a;
    color: #e5e5e5;
    min-height: 100vh;
    padding: 40px 20px;
    overflow-y: auto;
  }
  .container {
    max-width: 700px;
    width: 100%;
    margin: 0 auto;
    background: #171717;
    border-radius: 12px;
    padding: 32px;
    border: 1px solid #262626;
  }
  h1 { font-size: 24px; margin-bottom: 8px; color: #fff; }
  .subtitle { color: #737373; margin-bottom: 24px; }
  .section {
    margin-bottom: 24px;
    padding: 20px;
    background: #0a0a0a;
    border-radius: 8px;
    border: 1px solid #262626;
  }
  .section-title {
    font-size: 14px;
    font-weight: 600;
    color: #a3a3a3;
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    border-radius: 6px;
    font-size: 14px;
  }
  .status.valid {
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.3);
    color: #22c55e;
  }
  .status.invalid {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #ef4444;
  }
  .status.loading {
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.3);
    color: #3b82f6;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
  }
  button {
    background: #2563eb;
    color: white;
    border: none;
    padding: 10px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }
  button:hover { background: #1d4ed8; }
  button:disabled { background: #374151; cursor: not-allowed; }
  .btn-full { width: 100%; }
  input, textarea {
    width: 100%;
    padding: 12px;
    border-radius: 6px;
    border: 1px solid #374151;
    background: #171717;
    color: #e5e5e5;
    font-size: 14px;
    font-family: monospace;
  }
  input:focus, textarea:focus { outline: none; border-color: #2563eb; }
  textarea { resize: vertical; min-height: 80px; }
  .url-box {
    background: #0a0a0a;
    border: 1px solid #374151;
    border-radius: 6px;
    padding: 12px;
    font-family: monospace;
    font-size: 12px;
    word-break: break-all;
    max-height: 100px;
    overflow-y: auto;
    margin-bottom: 12px;
  }
  .btn-group { display: flex; gap: 8px; flex-wrap: wrap; }
  .btn-secondary { background: #374151; }
  .btn-secondary:hover { background: #4b5563; }
  .btn-danger { background: #dc2626; }
  .btn-danger:hover { background: #b91c1c; }
  .btn-success { background: #16a34a; }
  .btn-success:hover { background: #15803d; }
  .btn-sm { padding: 6px 12px; font-size: 12px; }
  .step { display: flex; gap: 12px; margin-bottom: 16px; }
  .step-num {
    width: 24px;
    height: 24px;
    background: #2563eb;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
    flex-shrink: 0;
  }
  .step-content { flex: 1; }
  .step-content p { color: #a3a3a3; font-size: 14px; margin-bottom: 12px; }
  .hidden { display: none; }
  .error { color: #ef4444; font-size: 14px; margin-top: 8px; }
  .success { color: #22c55e; font-size: 14px; margin-top: 8px; }
  .account-card {
    background: #171717;
    border: 1px solid #262626;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 12px;
  }
  .account-card.rate-limited {
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.05);
  }
  .account-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  .account-email {
    font-weight: 600;
    color: #fff;
    font-size: 14px;
  }
  .account-badge {
    background: #22c55e;
    color: #000;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
  }
  .account-details {
    font-size: 12px;
    color: #737373;
  }
  .account-row {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
  }
  .account-actions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }
  .expiry-warn { color: #f59e0b; }
  .expiry-ok { color: #22c55e; }
  .expiry-expired { color: #ef4444; }
  .empty-state {
    text-align: center;
    padding: 24px;
    color: #737373;
  }
  .quota-section {
    margin-top: 16px;
  }
  .quota-group {
    margin-bottom: 16px;
  }
  .quota-group:last-child {
    margin-bottom: 0;
  }
  .quota-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }
  .quota-name {
    font-size: 13px;
    color: #e5e5e5;
  }
  .quota-value {
    font-size: 12px;
    color: #a3a3a3;
  }
  .quota-bar {
    height: 8px;
    background: #262626;
    border-radius: 4px;
    overflow: hidden;
  }
  .quota-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s ease;
  }
  .quota-fill.high { background: #22c55e; }
  .quota-fill.medium { background: #f59e0b; }
  .quota-fill.low { background: #ef4444; }
  .quota-fill.exhausted { background: #dc2626; }
  .quota-reset {
    font-size: 11px;
    color: #737373;
    margin-top: 4px;
  }
  .quota-loading {
    text-align: center;
    padding: 16px;
    color: #737373;
    font-size: 13px;
  }
  .quota-error {
    color: #ef4444;
    font-size: 12px;
    padding: 8px;
    background: rgba(239, 68, 68, 0.1);
    border-radius: 4px;
  }
`

const clientScript = `
  let authUrl = '';
  let adminKey = localStorage.getItem('adminKey') || '';

  function getAuthHeaders() {
    return adminKey ? { 'Authorization': 'Bearer ' + adminKey } : {};
  }

  function formatExpiry(expiresAt) {
    if (!expiresAt) return { text: 'Unknown', class: '' };
    const now = Date.now();
    const diff = expiresAt - now;
    if (diff <= 0) return { text: 'Expired', class: 'expiry-expired' };
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    const text = hours > 0 ? hours + 'h ' + mins + 'm' : mins + 'm';
    const cls = diff < 30 * 60 * 1000 ? 'expiry-warn' : 'expiry-ok';
    return { text, class: cls };
  }

  function maskToken(token) {
    if (!token || token.length < 20) return token || 'N/A';
    return token.slice(0, 8) + '...' + token.slice(-8);
  }

  async function loadAccounts() {
    const listEl = document.getElementById('accountList');
    const statusEl = document.getElementById('status');
    const mainContent = document.getElementById('mainContent');
    const loginSection = document.getElementById('loginSection');
    
    try {
      const res = await fetch('/admin/token/details', { headers: getAuthHeaders() });
      if (res.status === 401) {
        mainContent.classList.add('hidden');
        loginSection.classList.remove('hidden');
        return;
      }
      
      mainContent.classList.remove('hidden');
      loginSection.classList.add('hidden');
      
      if (res.ok) {
        const data = await res.json();
        
        statusEl.className = 'status valid';
        statusEl.innerHTML = '<span class="dot"></span><span>' + data.tokens.length + ' account(s) configured</span>';
        
        let html = '';
        for (const token of data.tokens) {
          const expiry = formatExpiry(token.expiresAt);
          const geminiRL = token.rateLimitUntil?.gemini;
          const claudeRL = token.rateLimitUntil?.claude;
          const hasRL = (geminiRL && Date.now() < geminiRL) || (claudeRL && Date.now() < claudeRL);
          
          html += \`
            <div class="account-card \${hasRL ? 'rate-limited' : ''}">
              <div class="account-header">
                <span class="account-email">\${token.email}</span>
                <div>
                  \${hasRL ? '<span class="account-badge" style="background:#f59e0b;">RATE LIMITED</span>' : ''}
                </div>
              </div>
              <div class="account-details">
                <div class="account-row">
                  <span>Project ID</span>
                  <span>\${token.projectId || 'N/A'}</span>
                </div>
                <div class="account-row">
                  <span>Expires</span>
                  <span class="\${expiry.class}">\${expiry.text}</span>
                </div>
                \${token.lastUsed ? '<div class="account-row"><span>Last Used</span><span>' + new Date(token.lastUsed).toLocaleTimeString() + '</span></div>' : ''}
              </div>
              <div class="account-actions">
                <button class="btn-sm btn-danger" onclick="deleteAccount('\${token.email}')">Delete</button>
              </div>
            </div>
          \`;
        }
        listEl.innerHTML = html;
      } else {
        statusEl.className = 'status invalid';
        statusEl.innerHTML = '<span class="dot"></span><span>No accounts configured</span>';
        listEl.innerHTML = '<div class="empty-state">No accounts added yet. Add one below.</div>';
      }
    } catch (e) {
      statusEl.className = 'status invalid';
      statusEl.innerHTML = '<span class="dot"></span><span>Error loading accounts</span>';
      listEl.innerHTML = '';
    }
  }

  async function deleteAccount(email) {
    if (!confirm('Delete account ' + email + '?')) return;
    
    try {
      const res = await fetch('/admin/token?email=' + encodeURIComponent(email), { 
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        await loadAccounts();
      } else {
        const data = await res.json();
        alert('Delete failed: ' + (data.error || 'Unknown error'));
      }
    } catch (e) {
      alert('Delete failed: ' + e.message);
    }
  }

  async function refreshAll() {
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = 'Refreshing...';
    
    try {
      const res = await fetch('/admin/token/refresh', { 
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (res.ok) {
        alert('Refreshed ' + data.refreshed + ' token(s)');
        await loadAccounts();
      } else {
        alert('Refresh failed: ' + (data.error || 'Unknown error'));
      }
    } catch (e) {
      alert('Refresh failed: ' + e.message);
    }
    
    btn.disabled = false;
    btn.textContent = 'Refresh All';
  }

  async function generateAuthUrl() {
    const btn = document.getElementById('generateBtn');
    btn.disabled = true;
    btn.textContent = 'Generating...';

    try {
      const res = await fetch('/auth/authorize?redirectUri=http://localhost:9999/', {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      authUrl = data.url;
      
      document.getElementById('authUrlBox').textContent = authUrl;
      document.getElementById('authUrlBox').classList.remove('hidden');
      document.getElementById('authUrlBtns').classList.remove('hidden');
      btn.textContent = 'URL Generated';
    } catch (e) {
      btn.textContent = 'Error - Retry';
      btn.disabled = false;
    }
  }

  function copyAuthUrl() {
    navigator.clipboard.writeText(authUrl);
  }

  function openAuthUrl() {
    window.open(authUrl, '_blank');
  }

  async function exchangeToken() {
    const callbackUrl = document.getElementById('callbackUrl').value.trim();
    const resultEl = document.getElementById('exchangeResult');
    
    if (!callbackUrl) {
      resultEl.innerHTML = '<div class="error">Please paste the callback URL</div>';
      return;
    }

    resultEl.innerHTML = '<div class="status loading"><span class="dot"></span>Exchanging...</div>';

    try {
      const url = new URL(callbackUrl);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');

      if (!code || !state) {
        resultEl.innerHTML = '<div class="error">Invalid URL - missing code or state</div>';
        return;
      }

      const res = await fetch('/auth/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ code, state, redirectUri: 'http://localhost:9999/' })
      });

      const data = await res.json();

      if (res.ok) {
        resultEl.innerHTML = '<div class="success">Added: ' + data.email + '</div>';
        document.getElementById('callbackUrl').value = '';
        document.getElementById('generateBtn').disabled = false;
        document.getElementById('generateBtn').textContent = 'Generate Auth URL';
        document.getElementById('authUrlBox').classList.add('hidden');
        document.getElementById('authUrlBtns').classList.add('hidden');
        await loadAccounts();
      } else {
        resultEl.innerHTML = '<div class="error">' + (data.error || 'Exchange failed') + '</div>';
      }
    } catch (e) {
      resultEl.innerHTML = '<div class="error">Error: ' + e.message + '</div>';
    }
  }

  async function login() {
    const keyInput = document.getElementById('adminKeyInput');
    adminKey = keyInput.value.trim();
    localStorage.setItem('adminKey', adminKey);
    await loadAccounts();
  }

  function logout() {
    adminKey = '';
    localStorage.removeItem('adminKey');
    document.getElementById('mainContent').classList.add('hidden');
    document.getElementById('loginSection').classList.remove('hidden');
    document.getElementById('adminKeyInput').value = '';
  }

  function formatRelativeTime(timestamp) {
    if (!timestamp) return null;
    const now = Date.now();
    const diff = timestamp - now;
    if (diff <= 0) return 'Now';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) return days + 'd ' + (hours % 24) + 'h';
    if (hours > 0) return hours + 'h ' + mins + 'm';
    return mins + 'm';
  }

  function getQuotaClass(fraction) {
    if (fraction === null || fraction <= 0) return 'exhausted';
    if (fraction <= 0.2) return 'low';
    if (fraction <= 0.5) return 'medium';
    return 'high';
  }

  async function loadQuota() {
    const quotaContainer = document.getElementById('quotaContainer');
    if (!quotaContainer) return;
    
    quotaContainer.innerHTML = '<div class="quota-loading">Loading quota...</div>';
    
    try {
      const res = await fetch('/admin/quota', { headers: getAuthHeaders() });
      if (!res.ok) {
        quotaContainer.innerHTML = '<div class="quota-error">Failed to load quota</div>';
        return;
      }
      
      const data = await res.json();
      let html = '';
      
      for (const account of data.quotas) {
        html += '<div class="account-card">';
        html += '<div class="account-header"><span class="account-email">' + account.email + '</span></div>';
        
        if (account.status === 'error') {
          html += '<div class="quota-error">' + (account.error || 'Failed to fetch quota') + '</div>';
        } else {
          html += '<div class="quota-section">';
          for (const group of account.groups) {
            const pct = group.remainingFraction !== null ? Math.round(group.remainingFraction * 100) : 0;
            const cls = getQuotaClass(group.remainingFraction);
            const resetText = group.resetTimestamp ? formatRelativeTime(group.resetTimestamp) : null;
            
            html += '<div class="quota-group">';
            html += '<div class="quota-header">';
            html += '<span class="quota-name">' + group.displayName + '</span>';
            html += '<span class="quota-value">' + pct + '%</span>';
            html += '</div>';
            html += '<div class="quota-bar"><div class="quota-fill ' + cls + '" style="width: ' + pct + '%;"></div></div>';
            if (resetText) {
              html += '<div class="quota-reset">Reset: ' + resetText + '</div>';
            }
            html += '</div>';
          }
          html += '</div>';
        }
        html += '</div>';
      }
      
      if (data.quotas.length === 0) {
        html = '<div class="empty-state">No accounts to show quota for</div>';
      }
      
      quotaContainer.innerHTML = html;
    } catch (e) {
      quotaContainer.innerHTML = '<div class="quota-error">Error: ' + e.message + '</div>';
    }
  }

  async function refreshQuota() {
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = 'Refreshing...';
    await loadQuota();
    btn.disabled = false;
    btn.textContent = 'Refresh';
  }

  loadAccounts();
  loadQuota();
`

export const AuthPage: FC = () => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Antigravity Auth</title>
        <style dangerouslySetInnerHTML={{ __html: styles }} />
      </head>
      <body>
        <div class="container">
          <h1>Antigravity Auth</h1>
          <p class="subtitle">Multi-account Google OAuth token management</p>

          <div id="loginSection" class="section hidden">
            <div class="section-title">Admin Login</div>
            <input type="password" id="adminKeyInput" placeholder="Enter Admin Key" />
            <button class="btn-full" style="margin-top: 12px;" onclick="login()">Login</button>
          </div>

          <div id="mainContent">
            <div style="display: flex; justify-content: flex-end; margin-bottom: 16px;">
              <button class="btn-sm btn-secondary" onclick="logout()">Logout</button>
            </div>

            <div class="section">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div class="section-title" style="margin-bottom: 0;">Accounts</div>
                <button class="btn-sm btn-secondary" onclick="refreshAll()">Refresh All</button>
              </div>
              <div id="status" class="status loading">
                <span class="dot"></span>
                <span>Loading...</span>
              </div>
              <div id="accountList" style="margin-top: 16px;"></div>
            </div>

            <div class="section">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div class="section-title" style="margin-bottom: 0;">Quota Status</div>
                <button class="btn-sm btn-secondary" onclick="refreshQuota()">Refresh</button>
              </div>
              <div id="quotaContainer"></div>
            </div>

            <div class="section">
              <div class="section-title">Add Account</div>
              
              <div class="step">
                <div class="step-num">1</div>
                <div class="step-content">
                  <p>Generate OAuth URL and open in browser</p>
                  <button id="generateBtn" class="btn-full" onclick="generateAuthUrl()">Generate Auth URL</button>
                  <div id="authUrlBox" class="url-box hidden"></div>
                  <div id="authUrlBtns" class="btn-group hidden" style="margin-top: 8px;">
                    <button class="btn-secondary" onclick="copyAuthUrl()">Copy</button>
                    <button onclick="openAuthUrl()">Open in Browser</button>
                  </div>
                </div>
              </div>

              <div class="step">
                <div class="step-num">2</div>
                <div class="step-content">
                  <p>Paste the localhost callback URL here</p>
                  <textarea id="callbackUrl" placeholder="http://localhost:9999/?state=...&code=..."></textarea>
                  <button class="btn-full" style="margin-top: 12px;" onclick="exchangeToken()">Add Account</button>
                  <div id="exchangeResult"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <script dangerouslySetInnerHTML={{ __html: clientScript }} />
      </body>
    </html>
  )
}
