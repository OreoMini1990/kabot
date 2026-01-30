/**
 * Supabase 토큰 저장
 * naver_oauth_tokens (kakkaobot과 동일 DB)
 */

const { createClient } = require('@supabase/supabase-js');

let _client = null;

function getSupabase() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY(또는 SUPABASE_ANON_KEY) 필요');
  _client = createClient(url, key);
  return _client;
}

/**
 * 토큰 저장 (upsert on user_id)
 */
async function saveToken({ userId, userName, accessToken, refreshToken, expiresAt, scope }) {
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const row = {
    user_id: userId,
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
    scope: scope || null,
    is_active: true,
    updated_at: now,
  };
  if (userName && String(userName).trim()) row.user_name = String(userName).trim();

  const { error } = await supabase
    .from('naver_oauth_tokens')
    .upsert(row, { onConflict: 'user_id' });
  if (error) throw new Error('토큰 저장 실패: ' + (error.message || error.code));
}

module.exports = { getSupabase, saveToken };
