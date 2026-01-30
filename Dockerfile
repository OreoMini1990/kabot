# Node.js 18 LTS 기반 이미지
FROM node:18-alpine

# 작업 디렉토리 설정
WORKDIR /app

# 서버 디렉토리로 이동
WORKDIR /app/server

# package.json과 package-lock.json 복사
COPY server/package*.json ./

# 의존성 설치
RUN npm ci --only=production

# 서버 파일 복사
COPY server/ ./

# 로그 디렉토리 생성
RUN mkdir -p logs

# 포트 노출
EXPOSE 5002

# 서버 시작 명령어
CMD ["node", "-r", "dotenv/config", "server.js"]










