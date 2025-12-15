// PM2 Ecosystem 설정 파일
// kakkaobot 서버 관리

module.exports = {
  apps: [
    {
      name: 'kakkaobot-server',
      script: '../server/server.js',
      cwd: '../server',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 5002,
        // GitHub 동기화 설정
        GITHUB_OWNER: 'OreoMini1990',        // ⚠️ 실제 GitHub 사용자명으로 변경하세요
        GITHUB_REPO: 'labbot',             // ⚠️ 실제 레포지토리 이름으로 변경하세요
        GITHUB_FILE_PATH: 'irispy.py',        // 동기화할 파일 경로 (레포지토리 내 경로)
        // GITHUB_TOKEN: 'ghp_xxxxxxxxxxxx',     // 선택사항: Private 레포지토리인 경우만 주석 해제하고 토큰 입력
        SERVER_URL: 'http://211.218.42.222:5002'  // 서버 URL (파일 다운로드용)
      },
      error_file: '../logs/kakkaobot-error.log',
      out_file: '../logs/kakkaobot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};

