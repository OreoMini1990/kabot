/**
 * GET /api/naver/oauth/callback
 * 네이버 → code, state 수신 → 토큰 교환 → Supabase 저장 → 성공 페이지
 */

const { verifyState } = require('./_lib/state');
const { saveToken } = require('./_lib/db');

const CLIENT_ID = process.env.NAVER_CLIENT_ID;
const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
const REDIRECT_URI =
  process.env.NAVER_REDIRECT_URI ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/api/naver/oauth/callback` : null);

const HTML_ERR = (msg) =>
  `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><h2>연동 실패</h2><p>${msg}</p><p><a href="https://medifirstall.vercel.app">MediFirst로 돌아가기</a></p></body></html>`;

const HTML_OK = (userId) =>
  `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>연동 완료</title><style>body{font-family:system-ui,sans-serif;max-width:420px;margin:60px auto;padding:24px;text-align:center;}h2{color:#03c75a;}a{color:#03c75a;}</style></head><body><h2>네이버 계정 연동 완료</h2><p>연동이 완료되었습니다. 카카오톡으로 돌아가서 <strong>다시 !질문</strong>을 입력해 주세요.</p><p><a href="https://medifirstall.vercel.app">MediFirst 홈</a></p></body></html>`;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send(HTML_ERR('허용되지 않은 메서드입니다.'));
  }

  const code = req.query.code;
  const state = req.query.state;
  const err = req.query.error;

  if (err) {
    return res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8').send(HTML_ERR(`네이버 연동 오류: ${err}`));
  }
  if (!code || !state) {
    return res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8').send(HTML_ERR('code 또는 state가 없습니다.'));
  }

  const payload = verifyState(state);
  if (!payload) {
    return res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8').send(HTML_ERR('유효하지 않은 요청입니다. 링크를 다시 시도해 주세요.'));
  }

  const userId = String(payload.userId);
  const userName = (payload.userName && String(payload.userName).trim()) || null;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8').send(HTML_ERR('서버 설정 오류입니다. 관리자에게 문의하세요.'));
  }
  if (!REDIRECT_URI) {
    return res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8').send(HTML_ERR('NAVER_REDIRECT_URI 설정이 필요합니다.'));
  }

  let tokenRes;
  try {
    const tokenUrl = 'https://nid.naver.com/oauth2.0/token';
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      state,
    });
    tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch (e) {
    return res.status(502).setHeader('Content-Type', 'text/html; charset=utf-8').send(HTML_ERR('토큰 요청 중 오류가 발생했습니다.'));
  }

  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    return res.status(502).setHeader('Content-Type', 'text/html; charset=utf-8').send(HTML_ERR('토큰 발급 실패. 다시 시도해 주세요.'));
  }

  let data;
  try {
    data = await tokenRes.json();
  } catch (e) {
    return res.status(502).setHeader('Content-Type', 'text/html; charset=utf-8').send(HTML_ERR('토큰 응답 파싱 실패.'));
  }

  const accessToken = data.access_token;
  const refreshToken = data.refresh_token;
  const expiresIn = data.expires_in;

  if (!accessToken || !refreshToken) {
    return res.status(502).setHeader('Content-Type', 'text/html; charset=utf-8').send(HTML_ERR('토큰 응답에 access_token 또는 refresh_token이 없습니다.'));
  }

  const expiresAt = new Date(Date.now() + (expiresIn || 3600) * 1000).toISOString();

  try {
    await saveToken({
      userId,
      userName,
      accessToken,
      refreshToken,
      expiresAt,
      scope: data.scope || null,
    });
  } catch (e) {
    return res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8').send(HTML_ERR('토큰 저장 실패: ' + (e.message || '알 수 없는 오류')));
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8').status(200).send(HTML_OK(userId));
};
