/**
 * DB에서 v 필드 데이터 확인 테스트 스크립트
 * 
 * 사용법:
 *   node server/test/test_db_v_field.js [DB_PATH]
 * 
 * 예시:
 *   node server/test/test_db_v_field.js /path/to/chat_logs.db
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// DB 경로 (기본값: 환경변수 또는 입력 파라미터)
const DB_PATH = process.argv[2] || process.env.KAKAO_DB_PATH || '/data/data/com.kakao.talk/databases/KakaoTalk.db';

console.log('='.repeat(60));
console.log('DB v 필드 확인 테스트');
console.log('='.repeat(60));
console.log(`DB 경로: ${DB_PATH}`);
console.log(`DB 파일 존재: ${fs.existsSync(DB_PATH) ? '✅ 예' : '❌ 아니오'}`);
console.log('');

if (!fs.existsSync(DB_PATH)) {
    console.error('❌ DB 파일을 찾을 수 없습니다.');
    console.error(`경로: ${DB_PATH}`);
    console.error('');
    console.error('사용법:');
    console.error('  node server/test/test_db_v_field.js [DB_PATH]');
    console.error('  또는 환경변수 설정: export KAKAO_DB_PATH=/path/to/db');
    process.exit(1);
}

try {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
            console.error('❌ DB 연결 실패:', err.message);
            process.exit(1);
        }
    });

    console.log('✅ DB 연결 성공');
    console.log('');

    // 테이블 구조 확인
    db.all("PRAGMA table_info(chat_logs)", (err, rows) => {
        if (err) {
            console.error('❌ 테이블 정보 조회 실패:', err.message);
            db.close();
            process.exit(1);
        }

        console.log('📋 chat_logs 테이블 컬럼:');
        const columns = rows.map(r => r.name);
        console.log(`  ${columns.join(', ')}`);
        console.log('');
        console.log(`  v 컬럼 존재: ${columns.includes('v') ? '✅ 예' : '❌ 아니오'}`);
        console.log(`  supplement 컬럼 존재: ${columns.includes('supplement') ? '✅ 예' : '❌ 아니오'}`);
        console.log('');

        // 최근 메시지 조회 (v 필드가 있는 것만)
        const query = `
            SELECT _id, chat_id, user_id, message, v, supplement, type, created_at
            FROM chat_logs
            WHERE v IS NOT NULL AND v != '' AND v != '{}'
            ORDER BY _id DESC
            LIMIT 20
        `;

        console.log('📊 최근 메시지 조회 (v 필드가 있는 메시지):');
        console.log('');

        db.all(query, [], (err, messages) => {
            if (err) {
                console.error('❌ 메시지 조회 실패:', err.message);
                db.close();
                process.exit(1);
            }

            if (messages.length === 0) {
                console.log('⚠️ v 필드가 있는 메시지가 없습니다.');
            } else {
                console.log(`총 ${messages.length}개 메시지 발견`);
                console.log('');

                messages.forEach((msg, idx) => {
                    console.log(`[${idx + 1}] 메시지 ID: ${msg._id}`);
                    console.log(`    chat_id: ${msg.chat_id}`);
                    console.log(`    user_id: ${msg.user_id}`);
                    console.log(`    type: ${msg.type || 'null'}`);
                    console.log(`    created_at: ${msg.created_at}`);
                    console.log(`    message: ${(msg.message || '').substring(0, 50)}...`);

                    // v 필드 파싱
                    if (msg.v) {
                        try {
                            const v_json = typeof msg.v === 'string' ? JSON.parse(msg.v) : msg.v;
                            if (typeof v_json === 'object') {
                                console.log(`    v 필드 (JSON):`);
                                console.log(`      keys: ${Object.keys(v_json).join(', ')}`);
                                const defaultEmoticonsCount = v_json.defaultEmoticonsCount;
                                if (defaultEmoticonsCount !== undefined) {
                                    console.log(`      defaultEmoticonsCount: ${defaultEmoticonsCount}`);
                                }
                                // v 필드의 일부 내용 출력
                                const v_str = JSON.stringify(v_json).substring(0, 200);
                                console.log(`      내용 (일부): ${v_str}...`);
                            } else {
                                console.log(`    v 필드 (파싱 실패, 타입): ${typeof v_json}`);
                            }
                        } catch (e) {
                            console.log(`    v 필드 (파싱 실패): ${e.message}`);
                            console.log(`    v 필드 (원본): ${String(msg.v).substring(0, 100)}...`);
                        }
                    } else {
                        console.log(`    v 필드: null 또는 빈 값`);
                    }

                    // supplement 필드 확인
                    if (msg.supplement) {
                        try {
                            const supp_json = typeof msg.supplement === 'string' ? JSON.parse(msg.supplement) : msg.supplement;
                            if (typeof supp_json === 'object') {
                                console.log(`    supplement 필드:`);
                                console.log(`      keys: ${Object.keys(supp_json).join(', ')}`);
                                if (supp_json.reactions) {
                                    console.log(`      reactions 개수: ${Array.isArray(supp_json.reactions) ? supp_json.reactions.length : 'N/A'}`);
                                }
                                if (supp_json.emoticons) {
                                    console.log(`      emoticons 개수: ${Array.isArray(supp_json.emoticons) ? supp_json.emoticons.length : 'N/A'}`);
                                }
                            }
                        } catch (e) {
                            console.log(`    supplement 필드 (파싱 실패): ${e.message}`);
                        }
                    } else {
                        console.log(`    supplement 필드: null 또는 빈 값`);
                    }

                    console.log('');
                });
            }

            // v 필드에서 defaultEmoticonsCount가 있는 메시지 확인
            console.log('='.repeat(60));
            console.log('반응이 있는 메시지 확인:');
            console.log('');

            db.all(query, [], (err, allMessages) => {
                if (err) {
                    db.close();
                    return;
                }

                const messagesWithReactions = [];
                allMessages.forEach(msg => {
                    if (msg.v) {
                        try {
                            const v_json = typeof msg.v === 'string' ? JSON.parse(msg.v) : msg.v;
                            if (typeof v_json === 'object' && v_json.defaultEmoticonsCount > 0) {
                                messagesWithReactions.push({
                                    id: msg._id,
                                    count: v_json.defaultEmoticonsCount,
                                    supplement: msg.supplement
                                });
                            }
                        } catch (e) {
                            // 파싱 실패 무시
                        }
                    }
                });

                if (messagesWithReactions.length === 0) {
                    console.log('⚠️ defaultEmoticonsCount > 0인 메시지가 없습니다.');
                } else {
                    console.log(`✅ 반응이 있는 메시지: ${messagesWithReactions.length}개`);
                    messagesWithReactions.slice(0, 5).forEach((msg, idx) => {
                        console.log(`  [${idx + 1}] ID: ${msg.id}, 반응 개수: ${msg.count}`);
                    });
                }

                db.close();
                console.log('');
                console.log('='.repeat(60));
                console.log('테스트 완료');
            });
        });
    });

} catch (error) {
    console.error('❌ 오류 발생:', error.message);
    process.exit(1);
}









