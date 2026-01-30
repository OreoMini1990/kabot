// PM2 Ecosystem 설정 파일
// kakkaobot 서버 관리

module.exports = {
  apps: [
    {
      name: 'kakkaobot-server',
      script: 'server.js',  // server.js 파일
      // cwd는 절대 경로 또는 프로젝트 루트 기준 상대 경로로 설정
      // NAS 경로 예시: '/volume1/web/kakkaobot/server' 또는 '/home/app/iris-core/server'
      cwd: process.env.PM2_CWD || require('path').join(__dirname.replace(/[\\/]config$/, ''), 'server'),
      interpreter: 'node',
      // interpreter_args 제거: server.js와 database.js에서 이미 dotenv를 require하므로 불필요
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 5002,
        TZ: 'Asia/Seoul',  // 한국 시간대 설정 (UTC+9)
        // GitHub 동기화 설정
        GITHUB_OWNER: 'OreoMini1990',        // ⚠️ 실제 GitHub 사용자명으로 변경하세요
        GITHUB_REPO: 'labbot',             // ⚠️ 실제 레포지토리 이름으로 변경하세요
        GITHUB_FILE_PATH: 'irispy.py',        // 동기화할 파일 경로 (레포지토리 내 경로)
        // GITHUB_TOKEN: 'ghp_xxxxxxxxxxxx',     // 선택사항: Private 레포지토리인 경우만 주석 해제하고 토큰 입력
        SERVER_URL: 'http://192.168.0.15:5002',  // 서버 URL (파일 다운로드용)
        // OAuth 연동 링크 (미설정 시 SERVER_URL 사용). Vercel 등 외부 인증 시 설정
        NAVER_OAUTH_BASE_URL: 'https://medifirstall.vercel.app',
        NAVER_OAUTH_START_PATH: '/oauth/naver/start'  // naver-oauth-app 사용 시 BASE_URL=해당앱 URL, START_PATH=/api/start
      },
      error_file: './logs/kakkaobot-error.log',
      out_file: './logs/kakkaobot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};

