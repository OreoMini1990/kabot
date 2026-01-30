/**
 * 서버 로그 자동 수집 및 분석 스크립트
 * SSH로 서버에 접속하여 로그 수집 (Windows 환경 대응)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 설정 (환경변수 또는 기본값)
const SSH_HOST = process.env.SSH_HOST || '192.168.0.15';
const SSH_USER = process.env.SSH_USER || 'root';
const PM2_APP_NAME = process.env.PM2_APP_NAME || 'kakkaobot-server';
const LOG_LINES = parseInt(process.env.LOG_LINES || '500');
const LOG_DIR = '/home/app/iris-core';

function fetchLogsViaSSH() {
    try {
        // SSH로 PM2 logs 실행
        const command = `ssh ${SSH_USER}@${SSH_HOST} "pm2 logs ${PM2_APP_NAME} --lines ${LOG_LINES} --nostream --format"`;
        console.log(`SSH 명령 실행: ${command}`);
        const logs = execSync(command, { 
            encoding: 'utf-8', 
            timeout: 10000,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        return logs;
    } catch (error) {
        // SSH 실패 시 로그 파일 직접 읽기 시도
        try {
            const command = `ssh ${SSH_USER}@${SSH_HOST} "tail -n ${LOG_LINES} ${LOG_DIR}/server-*.log 2>/dev/null | tail -n ${LOG_LINES}"`;
            console.log(`SSH 로그 파일 읽기: ${command}`);
            const logs = execSync(command, { 
                encoding: 'utf-8', 
                timeout: 10000,
                stdio: ['pipe', 'pipe', 'pipe']
            });
            return logs;
        } catch (fileError) {
            throw new Error(`SSH 로그 수집 실패: ${error.message}`);
        }
    }
}

function fetchLogsFromFile() {
    // 로컬에 저장된 로그 파일이 있는 경우
    const logDir = process.env.LOG_DIR || LOG_DIR;
    if (fs.existsSync(logDir)) {
        try {
            const files = fs.readdirSync(logDir)
                .filter(f => f.startsWith('server-') && f.endsWith('.log'))
                .map(f => ({
                    name: f,
                    path: path.join(logDir, f),
                    mtime: fs.statSync(path.join(logDir, f)).mtime
                }))
                .sort((a, b) => b.mtime - a.mtime);
            
            if (files.length > 0) {
                const latestLog = files[0].path;
                const logContent = fs.readFileSync(latestLog, 'utf-8');
                const lines = logContent.split('\n');
                return lines.slice(-LOG_LINES).join('\n');
            }
        } catch (fileError) {
            console.error('로컬 로그 파일 읽기 실패:', fileError.message);
        }
    }
    return null;
}

function analyzeLogs(logs) {
    const analysis = {
        replyLink: {
            found: false,
            issues: [],
            samples: [],
            hasClientValue: false,
            hasAttachmentExtract: false,
            hasDbLookup: false,
            hasBackfill: false
        },
        reaction: {
            found: false,
            received: false,
            saved: false,
            issues: [],
            samples: []
        },
        image: {
            found: false,
            hasType: false,
            hasAttachment: false,
            extracted: false,
            saved: false,
            issues: [],
            samples: []
        },
        replies: {
            empty: false,
            count: 0,
            samples: []
        },
        errors: []
    };
    
    const lines = logs.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // 답장 링크 관련
        if (line.includes('[답장 링크]')) {
            analysis.replyLink.found = true;
            analysis.replyLink.samples.push(line.substring(0, 300));
            
            if (line.includes('클라이언트에서 받은 값')) {
                analysis.replyLink.hasClientValue = true;
                if (line.includes('null') || line.includes('undefined')) {
                    analysis.replyLink.issues.push('클라이언트에서 reply_to_message_id가 null');
                }
            }
            if (line.includes('attachment에서 추출')) {
                analysis.replyLink.hasAttachmentExtract = true;
            }
            if (line.includes('DB 조회 결과')) {
                analysis.replyLink.hasDbLookup = true;
            }
            if (line.includes('백필 필요') || line.includes('[백필]')) {
                analysis.replyLink.hasBackfill = true;
            }
        }
        
        // 반응 관련
        if (line.includes('[반응 처리]') || line.includes('[반응 저장]')) {
            analysis.reaction.found = true;
            analysis.reaction.samples.push(line.substring(0, 300));
            
            if (line.includes('반응 메시지 수신')) {
                analysis.reaction.received = true;
            }
            if (line.includes('✅ 성공') || line.includes('saved_reaction_id')) {
                analysis.reaction.saved = true;
            }
            if (line.includes('❌ 실패') || line.includes('실패:')) {
                analysis.reaction.issues.push(line.substring(0, 200));
            }
            if (line.includes('targetMessageId 또는 reactorName')) {
                analysis.reaction.issues.push('targetMessageId 또는 reactorName/reactorId 없음');
            }
        }
        
        // 이미지 저장 관련
        if (line.includes('[이미지 저장]')) {
            analysis.image.found = true;
            analysis.image.samples.push(line.substring(0, 300));
            
            if (line.includes('msgType=')) {
                analysis.image.hasType = true;
            }
            if (line.includes('attachmentData 존재=true')) {
                analysis.image.hasAttachment = true;
            }
            if (line.includes('extractImageUrl 결과:') && !line.includes('null')) {
                analysis.image.extracted = true;
            }
            if (line.includes('✅ 성공')) {
                analysis.image.saved = true;
            }
            if (line.includes('추출 실패') || line.includes('extractImageUrl 결과: null')) {
                analysis.image.issues.push('이미지 URL 추출 실패');
            }
            if (line.includes('attachmentData 존재=false')) {
                analysis.image.issues.push('attachment 데이터 없음');
            }
        }
        
        // replies 관련
        if (line.includes('replies.length') || line.includes('replies가 비어')) {
            analysis.replies.samples.push(line.substring(0, 300));
            if (line.includes('replies.length: 0') || line.includes('replies가 비어있습니다')) {
                analysis.replies.empty = true;
            } else {
                const match = line.match(/replies\.length[:\s=]+(\d+)/);
                if (match) {
                    analysis.replies.count = Math.max(analysis.replies.count, parseInt(match[1]));
                }
            }
        }
        
        // handleMessage 관련
        if (line.includes('[handleMessage]')) {
            if (line.includes('함수 종료') || line.includes('빈 replies')) {
                analysis.replies.samples.push(line.substring(0, 300));
            }
        }
        
        // 에러
        if (line.includes('ERROR') || line.includes('Error:') || line.includes('Exception:') || line.includes('❌')) {
            if (!line.includes('[이미지 저장]') && !line.includes('[반응 저장]') && !line.includes('[답장 링크]')) {
                analysis.errors.push(line.substring(0, 300));
            }
        }
    }
    
    return analysis;
}

function printAnalysis(analysis) {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('서버 로그 분석 결과');
    console.log('═══════════════════════════════════════════════════════\n');
    
    // 답장 링크
    console.log('📎 답장 링크:');
    if (analysis.replyLink.found) {
        console.log('  ✅ 로그 발견');
        console.log(`    - 클라이언트 값 수신: ${analysis.replyLink.hasClientValue ? '✅' : '❌'}`);
        console.log(`    - attachment 추출: ${analysis.replyLink.hasAttachmentExtract ? '✅' : '❌'}`);
        console.log(`    - DB 조회: ${analysis.replyLink.hasDbLookup ? '✅' : '❌'}`);
        console.log(`    - 백필 작업: ${analysis.replyLink.hasBackfill ? '✅' : '❌'}`);
        if (analysis.replyLink.issues.length > 0) {
            console.log('  ⚠️ 문제점:');
            analysis.replyLink.issues.forEach(issue => {
                console.log(`    - ${issue}`);
            });
        }
        if (analysis.replyLink.samples.length > 0) {
            console.log('  📝 샘플 로그 (최근 3개):');
            analysis.replyLink.samples.slice(-3).forEach(sample => {
                console.log(`    ${sample}`);
            });
        }
    } else {
        console.log('  ❌ 로그 없음 - 답장 링크 추출이 실행되지 않았거나 일반 메시지만 처리됨');
        console.log('  💡 확인: 클라이언트에서 reply_to_message_id를 보내는지 확인 필요');
    }
    console.log('');
    
    // 반응
    console.log('👍 반응:');
    if (analysis.reaction.found) {
        console.log('  ✅ 로그 발견');
        console.log(`    - 서버 수신: ${analysis.reaction.received ? '✅' : '❌'}`);
        console.log(`    - DB 저장: ${analysis.reaction.saved ? '✅' : '❌'}`);
        if (analysis.reaction.issues.length > 0) {
            console.log('  ⚠️ 문제점:');
            analysis.reaction.issues.forEach(issue => {
                console.log(`    - ${issue}`);
            });
        }
        if (analysis.reaction.samples.length > 0) {
            console.log('  📝 샘플 로그 (최근 3개):');
            analysis.reaction.samples.slice(-3).forEach(sample => {
                console.log(`    ${sample}`);
            });
        }
    } else {
        console.log('  ❌ 로그 없음 - 반응 메시지가 처리되지 않음');
        console.log('  💡 확인 사항:');
        console.log('    1. 클라이언트에서 반응 감지 여부 (Python 로그 확인)');
        console.log('    2. 클라이언트에서 type="reaction"으로 전송 여부');
        console.log('    3. 서버에서 messageData.type === "reaction" 조건 확인');
    }
    console.log('');
    
    // 이미지 저장
    console.log('🖼️ 이미지 저장:');
    if (analysis.image.found) {
        console.log('  ✅ 로그 발견');
        console.log(`    - 이미지 타입 체크: ${analysis.image.hasType ? '✅' : '❌'}`);
        console.log(`    - attachment 존재: ${analysis.image.hasAttachment ? '✅' : '❌'}`);
        console.log(`    - URL 추출: ${analysis.image.extracted ? '✅' : '❌'}`);
        console.log(`    - DB 저장: ${analysis.image.saved ? '✅' : '❌'}`);
        if (analysis.image.issues.length > 0) {
            console.log('  ⚠️ 문제점:');
            analysis.image.issues.forEach(issue => {
                console.log(`    - ${issue}`);
            });
        }
        if (analysis.image.samples.length > 0) {
            console.log('  📝 샘플 로그 (최근 3개):');
            analysis.image.samples.slice(-3).forEach(sample => {
                console.log(`    ${sample}`);
            });
        }
    } else {
        console.log('  ❌ 로그 없음 - 이미지 메시지가 처리되지 않음');
        console.log('  💡 확인 사항:');
        console.log('    1. 이미지 메시지 타입 (2, 12, 27) 확인');
        console.log('    2. attachment 필드 존재 여부 확인');
        console.log('    3. 이미지 타입 체크 로직 실행 여부 확인');
    }
    console.log('');
    
    // replies
    console.log('💬 replies:');
    if (analysis.replies.empty) {
        console.log('  ⚠️ 빈 replies 배열 발견');
        console.log('  💡 확인 사항:');
        console.log('    1. handleMessage 함수가 명령어를 인식하는지 확인');
        console.log('    2. 명령어 처리 로직이 실행되는지 확인');
        console.log('    3. replies.push()가 호출되는지 확인');
    } else if (analysis.replies.count > 0) {
        console.log(`  ✅ replies 있음 (최대 ${analysis.replies.count}개)`);
    } else {
        console.log('  ❓ replies 정보 없음');
    }
    if (analysis.replies.samples.length > 0) {
        console.log('  📝 샘플 로그:');
        analysis.replies.samples.slice(-5).forEach(sample => {
            console.log(`    ${sample}`);
        });
    }
    console.log('');
    
    // 에러
    if (analysis.errors.length > 0) {
        console.log('❌ 에러 (최근 5개):');
        analysis.errors.slice(-5).forEach(error => {
            console.log(`  ${error}`);
        });
        console.log('');
    }
    
    console.log('═══════════════════════════════════════════════════════\n');
}

// 메인 실행
(async () => {
    try {
        console.log(`서버 로그 수집 중...`);
        console.log(`SSH: ${SSH_USER}@${SSH_HOST}`);
        console.log(`PM2 앱: ${PM2_APP_NAME}`);
        console.log(`로그 라인: ${LOG_LINES}\n`);
        
        let logs = null;
        
        // SSH 시도
        try {
            logs = fetchLogsViaSSH();
        } catch (sshError) {
            console.warn(`SSH 로그 수집 실패: ${sshError.message}`);
            console.log('로컬 로그 파일 확인 중...\n');
            
            // 로컬 파일 시도
            logs = fetchLogsFromFile();
            if (!logs) {
                throw new Error('로그 수집 방법 없음. SSH 또는 로컬 로그 파일 필요');
            }
        }
        
        console.log(`로그 수집 완료: ${logs.split('\n').length}줄\n`);
        
        const analysis = analyzeLogs(logs);
        printAnalysis(analysis);
        
        // JSON으로도 저장
        const outputPath = path.join(__dirname, '..', 'logs_analysis.json');
        fs.writeFileSync(outputPath, JSON.stringify(analysis, null, 2));
        console.log(`분석 결과 저장: ${outputPath}`);
        
        // 요약 출력
        console.log('\n📊 요약:');
        console.log(`  답장 링크: ${analysis.replyLink.found ? '✅' : '❌'}`);
        console.log(`  반응: ${analysis.reaction.saved ? '✅ 저장됨' : analysis.reaction.received ? '⚠️ 수신됨' : '❌'}`);
        console.log(`  이미지: ${analysis.image.saved ? '✅ 저장됨' : analysis.image.found ? '⚠️ 처리됨' : '❌'}`);
        console.log(`  replies: ${analysis.replies.empty ? '⚠️ 비어있음' : analysis.replies.count > 0 ? `✅ ${analysis.replies.count}개` : '❓'}`);
        
    } catch (error) {
        console.error('오류 발생:', error.message);
        console.error('\n사용 방법:');
        console.error('  환경변수 설정:');
        console.error('    SSH_HOST=서버주소');
        console.error('    SSH_USER=사용자명');
        console.error('    PM2_APP_NAME=kakkaobot-server');
        console.error('    LOG_LINES=500');
        console.error('  또는 로컬 로그 파일 경로: LOG_DIR=/path/to/logs');
        process.exit(1);
    }
})();
