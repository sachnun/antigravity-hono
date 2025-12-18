import type { FC } from 'hono/jsx'

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
    if (diff <= 0) return { text: 'Expired', class: 'text-red-500' };
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    const text = hours > 0 ? hours + 'h ' + mins + 'm' : mins + 'm';
    const cls = diff < 30 * 60 * 1000 ? 'text-amber-500' : 'text-green-500';
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
      const [tokenRes, quotaRes] = await Promise.all([
        fetch('/admin/token/details', { headers: getAuthHeaders() }),
        fetch('/admin/quota', { headers: getAuthHeaders() })
      ]);
      
      if (tokenRes.status === 401) {
        mainContent.classList.add('hidden');
        loginSection.classList.remove('hidden');
        document.getElementById('logoutBtn').classList.add('hidden');
        return;
      }
      
      mainContent.classList.remove('hidden');
      loginSection.classList.add('hidden');
      document.getElementById('logoutBtn').classList.remove('hidden');
      
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        const quotaData = quotaRes.ok ? await quotaRes.json() : { quotas: [] };
        
        const quotaByEmail = {};
        for (const q of quotaData.quotas || []) {
          quotaByEmail[q.email] = q;
        }
        
        statusEl.className = 'flex items-center gap-2 p-3 rounded-md text-sm bg-green-500/10 border border-green-500/30 text-green-500';
        statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-current"></span><span>' + tokenData.tokens.length + ' account(s) configured</span>';
        
        let html = '';
        for (const token of tokenData.tokens) {
          const expiry = formatExpiry(token.expiresAt);
          const geminiRL = token.rateLimitUntil?.gemini;
          const claudeRL = token.rateLimitUntil?.claude;
          const hasRL = (geminiRL && Date.now() < geminiRL) || (claudeRL && Date.now() < claudeRL);
          const quota = quotaByEmail[token.email];
          
            html += \`
            <div class="bg-neutral-900 border rounded-lg p-4 mb-3 \${hasRL ? 'border-amber-500 bg-amber-500/5' : 'border-neutral-800'}">
              <div class="flex justify-between items-center mb-3">
                <span class="font-semibold text-white text-sm">\${token.email}</span>
                <div class="flex gap-2">
                  \${token.tier && token.tier !== 'unknown' ? '<span class="px-2 py-0.5 rounded text-xs font-semibold ' + (token.tier.toLowerCase().includes('pro') || token.tier === 'standard-tier' ? 'bg-green-600 text-white' : token.tier === 'free-tier' ? 'bg-blue-600 text-white' : 'bg-neutral-600 text-white') + '">' + (token.tier.toLowerCase().includes('pro') || token.tier === 'standard-tier' ? 'PRO' : token.tier === 'free-tier' ? 'FREE' : token.tier.toUpperCase()) + '</span>' : ''}
                  \${hasRL ? '<span class="bg-amber-500 text-black px-2 py-0.5 rounded text-xs font-semibold">RATE LIMITED</span>' : ''}
                </div>
              </div>
              <div class="text-xs text-neutral-500 space-y-1">
                <div class="flex justify-between">
                  <span>Project ID</span>
                  <span>\${token.projectId || 'N/A'}</span>
                </div>
                <div class="flex justify-between">
                  <span>Expires</span>
                  <span class="\${expiry.class}">\${expiry.text}</span>
                </div>
                \${token.lastUsed ? '<div class="flex justify-between"><span>Last Used</span><span>' + new Date(token.lastUsed).toLocaleTimeString() + '</span></div>' : ''}
              </div>
          \`;
          
          if (quota && quota.status === 'success' && quota.groups) {
            html += '<div class="mt-4 space-y-3">';
            for (const group of quota.groups) {
              const pct = group.remainingFraction !== null ? Math.round(group.remainingFraction * 100) : 0;
              const cls = getQuotaClass(group.remainingFraction);
              const resetText = group.resetTimestamp ? formatRelativeTime(group.resetTimestamp) : null;
              
              html += '<div>';
              html += '<div class="flex justify-between items-center mb-1">';
              html += '<span class="text-xs text-neutral-300">' + group.displayName + '</span>';
              html += '<span class="text-xs text-neutral-500">' + pct + '%</span>';
              html += '</div>';
              html += '<div class="h-2 bg-neutral-800 rounded-full overflow-hidden"><div class="h-full rounded-full transition-all ' + cls + '" style="width: ' + pct + '%;"></div></div>';
              if (resetText) {
                html += '<div class="text-[11px] text-neutral-600 mt-1">Reset: ' + resetText + '</div>';
              }
              html += '</div>';
            }
            html += '</div>';
          } else if (quota && quota.status === 'error') {
            html += '<div class="text-red-500 text-xs p-2 bg-red-500/10 rounded mt-3">' + (quota.error || 'Failed to fetch quota') + '</div>';
          }
          
          html += \`
              <div class="flex gap-2 mt-3">
                <button class="px-3 py-1.5 text-xs font-medium rounded bg-red-600 hover:bg-red-700 text-white" onclick="deleteAccount('\${token.email}')">Delete</button>
              </div>
            </div>
          \`;
        }
        listEl.innerHTML = html;
      } else {
        statusEl.className = 'flex items-center gap-2 p-3 rounded-md text-sm bg-red-500/10 border border-red-500/30 text-red-500';
        statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-current"></span><span>No accounts configured</span>';
        listEl.innerHTML = '<div class="text-center py-6 text-neutral-500">No accounts added yet. Add one below.</div>';
      }
    } catch (e) {
      statusEl.className = 'flex items-center gap-2 p-3 rounded-md text-sm bg-red-500/10 border border-red-500/30 text-red-500';
      statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-current"></span><span>Error loading accounts</span>';
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
      resultEl.innerHTML = '<div class="text-red-500 text-sm mt-2">Please paste the callback URL</div>';
      return;
    }

    resultEl.innerHTML = '<div class="flex items-center gap-2 p-3 rounded-md text-sm bg-blue-500/10 border border-blue-500/30 text-blue-500 mt-2"><span class="w-2 h-2 rounded-full bg-current"></span>Exchanging...</div>';

    try {
      const url = new URL(callbackUrl);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');

      if (!code || !state) {
        resultEl.innerHTML = '<div class="text-red-500 text-sm mt-2">Invalid URL - missing code or state</div>';
        return;
      }

      const res = await fetch('/auth/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ code, state, redirectUri: 'http://localhost:9999/' })
      });

      const data = await res.json();

      if (res.ok) {
        resultEl.innerHTML = '<div class="text-green-500 text-sm mt-2">Added: ' + data.email + '</div>';
        document.getElementById('callbackUrl').value = '';
        document.getElementById('generateBtn').disabled = false;
        document.getElementById('generateBtn').textContent = 'Generate Auth URL';
        document.getElementById('authUrlBox').classList.add('hidden');
        document.getElementById('authUrlBtns').classList.add('hidden');
        await loadAccounts();
      } else {
        resultEl.innerHTML = '<div class="text-red-500 text-sm mt-2">' + (data.error || 'Exchange failed') + '</div>';
      }
    } catch (e) {
      resultEl.innerHTML = '<div class="text-red-500 text-sm mt-2">Error: ' + e.message + '</div>';
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
    document.getElementById('logoutBtn').classList.add('hidden');
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
    if (fraction === null || fraction <= 0) return 'bg-red-600';
    if (fraction <= 0.2) return 'bg-red-500';
    if (fraction <= 0.5) return 'bg-amber-500';
    return 'bg-green-500';
  }

  loadAccounts();
  setInterval(loadAccounts, 10000);
`

export const AuthPage: FC = () => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Antigravity Auth</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-neutral-950 text-neutral-300 min-h-screen p-6 overflow-y-auto font-sans">
        <div class="max-w-5xl w-full mx-auto">
          <div class="flex justify-between items-center mb-6">
            <div>
              <h1 class="text-2xl font-semibold text-white">Antigravity Auth</h1>
              <p class="text-neutral-500 text-sm">Multi-account Google OAuth token management</p>
            </div>
            <button
              id="logoutBtn"
              class="hidden px-3 py-1.5 text-xs font-medium rounded bg-neutral-700 hover:bg-neutral-600 text-white transition-colors"
              onclick="logout()"
            >
              Logout
            </button>
          </div>

          <div id="loginSection" class="hidden max-w-md mx-auto p-5 bg-neutral-900 rounded-lg border border-neutral-800">
            <div class="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-3">Admin Login</div>
            <input
              type="password"
              id="adminKeyInput"
              placeholder="Enter Admin Key"
              class="w-full px-3 py-3 rounded-md border border-neutral-700 bg-neutral-950 text-neutral-300 text-sm font-mono focus:outline-none focus:border-blue-500"
            />
            <button
              class="w-full mt-3 px-4 py-2.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
              onclick="login()"
            >
              Login
            </button>
          </div>

          <div id="mainContent" class="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div class="lg:col-span-3 p-5 bg-neutral-900 rounded-lg border border-neutral-800">
              <div class="flex justify-between items-center mb-3">
                <div class="text-xs font-semibold text-neutral-400 uppercase tracking-wide">Accounts</div>
                <button
                  class="px-3 py-1.5 text-xs font-medium rounded bg-neutral-700 hover:bg-neutral-600 text-white transition-colors"
                  onclick="refreshAll()"
                >
                  Refresh All
                </button>
              </div>
              <div
                id="status"
                class="flex items-center gap-2 p-3 rounded-md text-sm bg-blue-500/10 border border-blue-500/30 text-blue-500"
              >
                <span class="w-2 h-2 rounded-full bg-current"></span>
                <span>Loading...</span>
              </div>
              <div id="accountList" class="mt-4 max-h-[calc(100vh-280px)] overflow-y-auto"></div>
            </div>

            <div class="lg:col-span-2 p-5 bg-neutral-900 rounded-lg border border-neutral-800 h-fit lg:sticky lg:top-6">
              <div class="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-4">Add Account</div>

              <div class="flex gap-3 mb-4">
                <div class="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0">
                  1
                </div>
                <div class="flex-1">
                  <p class="text-neutral-400 text-sm mb-2">Generate OAuth URL</p>
                  <button
                    id="generateBtn"
                    class="w-full px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                    onclick="generateAuthUrl()"
                  >
                    Generate Auth URL
                  </button>
                  <div
                    id="authUrlBox"
                    class="hidden mt-2 p-2 bg-neutral-950 border border-neutral-700 rounded-md font-mono text-xs break-all max-h-20 overflow-y-auto"
                  ></div>
                  <div id="authUrlBtns" class="hidden flex gap-2 mt-2">
                    <button
                      class="flex-1 px-3 py-1.5 text-xs font-medium rounded bg-neutral-700 hover:bg-neutral-600 text-white transition-colors"
                      onclick="copyAuthUrl()"
                    >
                      Copy
                    </button>
                    <button
                      class="flex-1 px-3 py-1.5 text-xs font-medium rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                      onclick="openAuthUrl()"
                    >
                      Open
                    </button>
                  </div>
                </div>
              </div>

              <div class="flex gap-3">
                <div class="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0">
                  2
                </div>
                <div class="flex-1">
                  <p class="text-neutral-400 text-sm mb-2">Paste callback URL</p>
                  <textarea
                    id="callbackUrl"
                    placeholder="http://localhost:9999/?state=...&amp;code=..."
                    class="w-full px-3 py-2 rounded-md border border-neutral-700 bg-neutral-950 text-neutral-300 text-sm font-mono focus:outline-none focus:border-blue-500 resize-y min-h-16"
                  ></textarea>
                  <button
                    class="w-full mt-2 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
                    onclick="exchangeToken()"
                  >
                    Add Account
                  </button>
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
