/**
 * GET /api/naver/oauth/start
 * 쿼리: user_id (필수), draft_id, user_name (선택)
 * → 네이버 OAuth authorize 로 리다이렉트
 */

const { createState } = require('./_lib/state');

const CLIENT_ID = process.env.NAVER_CLIENT_ID;
const REDIRECT_URI =
  process.env.NAVER_REDIRECT_URI ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/api/naver/oauth/callback` : null);

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const userId = req.query.user_id || req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: 'user_id_required', message: 'user_id가 필요합니다.' });
  }

  if (!CLIENT_ID) {
    return res.status(500).json({
      error: 'config_error',
      message: 'NAVER_CLIENT_ID가 설정되지 않았습니다. 환경변수를 확인하세요.',
    });
  }
  if (!REDIRECT_URI) {
    return res.status(500).json({
      error: 'config_error',
      message: 'NAVER_REDIRECT_URI 또는 VERCEL_URL이 필요합니다.',
    });
  }

  const userIdStr = String(userId);
  const draftId = (req.query.draft_id || req.query.draftId || '').trim() || null;
  const userName = (req.query.user_name || req.query.userName || '').trim() || null;

  const state = createState(userIdStr, draftId, userName);

  const authUrl = new URL('https://nid.naver.com/oauth2.0/authorize');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('scope', 'cafe_write');

  res.redirect(302, authUrl.toString());
};
