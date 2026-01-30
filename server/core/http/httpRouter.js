// ============================================
// HTTP 라우터 모듈
// - Express 라우트 설정
// ============================================

const express = require('express');
const path = require('path');
const fs = require('fs');

/**
 * HTTP 라우터 초기화
 * @param {Express} app - Express 앱 인스턴스
 * @param {Object} config - 설정 객체
 */
function setupHttpRoutes(app, config = {}) {
  const { CONFIG } = config;
  
  // JSON 파싱 미들웨어
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // 정적 파일 서빙 (관리자 패널)
  const projectRoot = path.join(__dirname, '../../..');
  const adminPath = path.join(projectRoot, 'admin');

  if (!fs.existsSync(adminPath)) {
    console.error(`[경고] 관리자 패널 경로를 찾을 수 없습니다: ${adminPath}`);
  }

  app.use('/admin', express.static(adminPath));

  // 관리자 페이지 라우트
  app.get('/admin', (req, res) => {
    const indexPath = path.join(adminPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ 
        ok: false, 
        error: 'Admin panel not found',
        path: indexPath,
        hint: 'Please check if admin/index.html exists'
      });
    }
  });

  // 라우터 등록
  const adminRouter = require('../../api/admin');
  const bridgeRouter = require('../../routes/bridge');
  const naverOAuthRouter = require('../../routes/naverOAuth');
  const dbUploadRouter = require('../../routes/dbUpload');

  app.use('/api/admin', adminRouter);
  app.use('/bridge', bridgeRouter);
  app.use('/auth/naver', naverOAuthRouter);
  app.use('/api', dbUploadRouter);

  // 네이버 OAuth API (선택적 로딩)
  try {
    const naverOAuthRouter2 = require('../../api/naverOAuth');
    app.use('/api/naver/oauth', naverOAuthRouter2);
    console.log('[서버] 네이버 OAuth 라우터 로드 완료');
  } catch (error) {
    console.warn('[서버] 네이버 OAuth 라우터 로드 실패:', error.message);
  }

  // 네이버 카페 짧은 링크 리다이렉트
  app.get('/go/:code', async (req, res) => {
    try {
      const { code } = req.params;
      const db = require('../../db/database');
      
      const query = 'SELECT article_url, status FROM naver_cafe_posts WHERE short_code = ? LIMIT 1';
      const result = await db.prepare(query).get(code);
      
      if (result && result.article_url) {
        res.redirect(302, result.article_url);
      } else {
        res.status(404).send(`
          <html>
            <head><title>링크를 찾을 수 없습니다</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1>404 - 링크를 찾을 수 없습니다</h1>
              <p>요청하신 링크가 존재하지 않거나 만료되었습니다.</p>
              <p><a href="/admin">관리자 페이지로 돌아가기</a></p>
            </body>
          </html>
        `);
      }
    } catch (error) {
      console.error('[shortlink] 리다이렉트 오류:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  // HTTP 요청 로깅 미들웨어
  app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] HTTP ${req.method} ${req.url} (${req.socket.remoteAddress})`);
    next();
  });

  // 헬스체크 엔드포인트
  app.get('/health', (req, res) => {
    res.status(200).json({ ok: true });
  });

  // 루트 엔드포인트
  app.get('/', (req, res) => {
    res.status(200).json({ 
      ok: true, 
      service: 'iris-core',
      ts: new Date().toISOString()
    });
  });

  // 404 핸들러
  app.use((req, res) => {
    res.status(404).json({ 
      ok: false, 
      error: 'Not Found', 
      path: req.url 
    });
  });

  // 에러 핸들러
  app.use((err, req, res, next) => {
    console.error(`[${new Date().toISOString()}] HTTP 에러:`, err);
    res.status(500).json({ 
      ok: false, 
      error: err.message 
    });
  });
}

module.exports = {
  setupHttpRoutes
};







