// ============================================
// 로그 파일 관리 모듈
// - logs 폴더에 최신 100줄만 유지
// ============================================

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../../logs');
const LOG_FILE_NAME = 'server.log';
const MAX_LOG_LINES = 100;
const LOG_FILE_PATH = path.join(LOG_DIR, LOG_FILE_NAME);
const TRIM_CHECK_INTERVAL = 50;

// 원본 console 함수 저장
const originalLog = console.log;
const originalError = console.error;

// 로그 스트림
let logStream = null;
let logLineCount = 0;

/**
 * 로그 디렉토리 초기화
 */
function initializeLogDirectory() {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      console.log(`[로그] 디렉토리 생성: ${LOG_DIR}`);
    }
    
    // 디렉토리 쓰기 권한 확인
    try {
      const testFile = path.join(LOG_DIR, '.test_write');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      console.log(`[로그] ✅ 디렉토리 쓰기 권한 확인 완료: ${LOG_DIR}`);
    } catch (writeErr) {
      console.error(`[로그] ❌ 디렉토리 쓰기 권한 없음: ${LOG_DIR}`, writeErr.message);
    }
  } catch (e) {
    console.error(`[로그] 디렉토리 생성 실패: ${LOG_DIR}`, e.message);
    console.error(`[로그] 스택 트레이스:`, e.stack);
  }
}

/**
 * 로그 파일을 최신 100줄만 유지하도록 정리
 */
function trimLogFileToMaxLines() {
  try {
    if (!fs.existsSync(LOG_FILE_PATH)) {
      return;
    }

    const stats = fs.statSync(LOG_FILE_PATH);
    const fileSize = stats.size;
    
    let fileContent;
    if (fileSize > 1024 * 1024) {
      // 1MB 이상이면 마지막 50KB만 읽기
      const readSize = Math.min(50 * 1024, fileSize);
      const buffer = Buffer.alloc(readSize);
      const fd = fs.openSync(LOG_FILE_PATH, 'r');
      fs.readSync(fd, buffer, 0, readSize, fileSize - readSize);
      fs.closeSync(fd);
      fileContent = buffer.toString('utf8');
    } else {
      fileContent = fs.readFileSync(LOG_FILE_PATH, 'utf8');
    }

    const lines = fileContent.split('\n');
    const validLines = lines.filter(line => {
      return line.trim() !== '' && /^\[.*\]\s*\[.*\]/.test(line);
    });

    if (validLines.length > MAX_LOG_LINES) {
      const targetValidLineCount = MAX_LOG_LINES;
      let validLineIndex = 0;
      let startLineIndex = 0;
      
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim() !== '' && /^\[.*\]\s*\[.*\]/.test(lines[i])) {
          validLineIndex++;
          if (validLineIndex === targetValidLineCount) {
            startLineIndex = i;
            break;
          }
        }
      }
      
      const trimmedLines = lines.slice(startLineIndex);
      const trimmedContent = trimmedLines.join('\n');
      
      fs.writeFileSync(LOG_FILE_PATH, trimmedContent, 'utf8');
      console.log(`[로그 정리] 로그 파일 정리 완료: ${validLines.length}줄 → ${targetValidLineCount}줄`);
    }
  } catch (e) {
    console.error(`[로그 정리] 파일 정리 실패:`, e.message);
    console.error(`[로그 정리] 스택 트레이스:`, e.stack);
  }
}

/**
 * 로그 기록 함수 (콘솔 + 파일)
 */
function writeLog(level, ...args) {
  const timestamp = new Date().toISOString();
  const message = args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
  
  const logLine = `[${timestamp}] [${level}] ${message}\n`;
  
  // 콘솔 출력
  if (level === 'ERROR') {
    originalError(...args);
  } else {
    originalLog(...args);
  }
  
  // 파일 출력
  if (logStream) {
    try {
      logStream.write(logLine);
      logLineCount++;
      
      // 주기적으로 파일 정리
      if (logLineCount >= TRIM_CHECK_INTERVAL) {
        logLineCount = 0;
        trimLogFileToMaxLines();
      }
    } catch (e) {
      originalError(`[로그] 파일 쓰기 실패:`, e.message);
      originalError(`[로그] 스택 트레이스:`, e.stack);
    }
  } else {
    if (!global._logStreamWarningShown) {
      originalError(`[로그] ⚠️ logStream이 초기화되지 않았습니다. 로그 파일에 저장되지 않습니다.`);
      originalError(`[로그] LOG_FILE_PATH: ${LOG_FILE_PATH}`);
      originalError(`[로그] 파일 존재 여부: ${fs.existsSync(LOG_FILE_PATH)}`);
      global._logStreamWarningShown = true;
    }
  }
}

/**
 * 로그 시스템 초기화
 */
function initialize() {
  initializeLogDirectory();
  trimLogFileToMaxLines();
  
  try {
    logStream = fs.createWriteStream(LOG_FILE_PATH, { flags: 'a', encoding: 'utf8', autoClose: false });
    
    logStream.on('error', (err) => {
      originalError(`[로그] 스트림 에러:`, err.message);
      originalError(`[로그] 스트림 에러 스택:`, err.stack);
    });
    
    logStream.on('open', () => {
      originalLog(`[로그] ✅ 로그 파일 스트림 열림: ${LOG_FILE_PATH}`);
    });
    
    console.log(`[로그] 로그 파일 생성: ${LOG_FILE_NAME}`);
    console.log(`[로그] 로그 파일 경로: ${LOG_FILE_PATH}`);
    console.log(`[로그] 최대 보관 라인 수: ${MAX_LOG_LINES}줄`);
    console.log(`[로그] 파일 존재 여부: ${fs.existsSync(LOG_FILE_PATH)}`);
  } catch (e) {
    console.error(`[로그] 로그 파일 생성 실패:`, e.message);
    console.error(`[로그] 스택 트레이스:`, e.stack);
    logStream = null;
  }
  
  // 주기적으로 로그 파일 정리 (10분마다)
  if (typeof setInterval !== 'undefined') {
    setInterval(() => {
      trimLogFileToMaxLines();
    }, 10 * 60 * 1000);
  }
  
  // console.log, console.error 래핑
  console.log = function(...args) {
    writeLog('INFO', ...args);
  };
  
  console.error = function(...args) {
    writeLog('ERROR', ...args);
  };
}

/**
 * 종료 시 정리
 */
function shutdown() {
  if (logStream) {
    logStream.end();
  }
  trimLogFileToMaxLines();
}

module.exports = {
  initialize,
  shutdown,
  trimLogFileToMaxLines
};







