// ============================================
// 공지 시스템 모듈 (Supabase 사용)
// ============================================

const db = require('../../db/database');
const CONFIG = require('../config');

const NOTICE_SYSTEM = {
    shouldSendScheduledNotice: async function() {
        if (!CONFIG.NOTICE_ENABLED) {
            return false;
        }
        
        try {
            // Supabase에서 활성화된 공지 조회
            const { data: notices, error: noticesError } = await db.supabase
                .from('notices')
                .select('*')
                .eq('enabled', true)
                .order('created_at', { ascending: false });
            
            if (noticesError) {
                console.error('[공지] 공지 조회 실패:', noticesError.message);
                return false;
            }
            
            if (!notices || notices.length === 0) {
                return false;
            }
            
            // 한국 시간대(KST, UTC+9)로 현재 시간 가져오기
            const now = new Date();
            const kstOffset = 9 * 60; // UTC+9 (분 단위)
            const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
            const kstTime = new Date(utcTime + (kstOffset * 60000));
            const currentHour = kstTime.getHours();
            const currentMinute = kstTime.getMinutes();
            const currentDateStr = kstTime.getFullYear() + "-" + 
                                ("0" + (kstTime.getMonth() + 1)).slice(-2) + "-" + 
                                ("0" + kstTime.getDate()).slice(-2);
            
            console.log(`[스케줄 공지] 체크 시작: 현재 시간=${currentHour}:${String(currentMinute).padStart(2, '0')}, 공지 개수=${notices.length}`);
            
            for (let i = 0; i < notices.length; i++) {
                const notice = notices[i];
                
                // 만료일 체크
                if (notice.expiry_date) {
                    const expiry = new Date(notice.expiry_date + "T23:59:59");
                    if (now > expiry) {
                        console.log(`[스케줄 공지] 공지 ${notice.id} 만료됨: expiry_date=${notice.expiry_date}`);
                        continue;
                    }
                }
                
                if (!notice.schedule_times) {
                    console.log(`[스케줄 공지] 공지 ${notice.id} 스케줄 시간 없음`);
                    continue;
                }
                
                let scheduleTimes;
                try {
                    scheduleTimes = typeof notice.schedule_times === 'string' 
                        ? JSON.parse(notice.schedule_times) 
                        : notice.schedule_times;
                } catch (e) {
                    console.error(`[스케줄 공지] 공지 ${notice.id} schedule_times 파싱 실패:`, e.message);
                    continue;
                }
                
                if (!Array.isArray(scheduleTimes) || scheduleTimes.length === 0) {
                    console.log(`[스케줄 공지] 공지 ${notice.id} 스케줄 시간 배열이 비어있음`);
                    continue;
                }
                
                for (let j = 0; j < scheduleTimes.length; j++) {
                    const timeStr = scheduleTimes[j].trim();
                    const timeParts = timeStr.split(":");
                    if (timeParts.length !== 2) {
                        console.warn(`[스케줄 공지] 공지 ${notice.id} 잘못된 시간 형식: ${timeStr}`);
                        continue;
                    }
                    
                    const scheduleHour = parseInt(timeParts[0], 10);
                    const scheduleMinute = parseInt(timeParts[1], 10);
                    
                    if (isNaN(scheduleHour) || isNaN(scheduleMinute)) {
                        console.warn(`[스케줄 공지] 공지 ${notice.id} 시간 파싱 실패: ${timeStr}`);
                        continue;
                    }
                    
                    if (scheduleHour < 0 || scheduleHour > 23 || scheduleMinute < 0 || scheduleMinute > 59) {
                        console.warn(`[스케줄 공지] 공지 ${notice.id} 잘못된 시간 범위: ${timeStr}`);
                        continue;
                    }
                    
                    // 정확한 시간 매칭 (시간과 분이 모두 일치해야 함)
                    if (currentHour === scheduleHour && currentMinute === scheduleMinute) {
                        const scheduleKey = currentDateStr + "_" + timeStr;
                        const oneDayAgoTimestamp = new Date(kstTime.getTime() - 24 * 60 * 60 * 1000);
                        const oneDayAgoISO = oneDayAgoTimestamp.toISOString();
                        
                        console.log(`[스케줄 공지] 공지 ${notice.id} 시간 매칭: ${timeStr}, scheduleKey=${scheduleKey}`);
                        
                        // 최근 24시간 내 발송 기록 확인
                        const { data: existing, error: scheduleError } = await db.supabase
                            .from('notice_schedules')
                            .select('id, sent_at')
                            .eq('notice_id', notice.id)
                            .like('schedule_key', `%_${timeStr}`)
                            .gte('sent_at', oneDayAgoISO)
                            .order('sent_at', { ascending: false })
                            .limit(1);
                        
                        if (scheduleError) {
                            console.error(`[스케줄 공지] 발송 기록 조회 실패:`, scheduleError.message);
                            continue;
                        }
                        
                        if (!existing || existing.length === 0) {
                            // 발송 기록 없음 - 새로 발송
                            const { data: newSchedule, error: insertError } = await db.supabase
                                .from('notice_schedules')
                                .insert({
                                    notice_id: notice.id,
                                    schedule_key: scheduleKey
                                })
                                .select()
                                .single();
                            
                            if (insertError) {
                                console.error(`[스케줄 공지] 발송 기록 저장 실패:`, insertError.message);
                                continue;
                            }
                            
                            console.log(`[스케줄 공지] ✅ 발송 대상 발견: 공지 ${notice.id}, 시간=${timeStr}, scheduleKey=${scheduleKey}`);
                            return { shouldSend: true, content: notice.content, noticeId: notice.id, scheduleKey: scheduleKey };
                        } else {
                            console.log(`[스케줄 공지] 이미 발송됨: 공지 ${notice.id}, 시간=${timeStr}, 마지막 발송=${existing[0].sent_at}`);
                        }
                    }
                }
            }
            
            return false;
        } catch (e) {
            console.error('[공지] 스케줄 체크 실패:', e.message);
            console.error('[공지] 스택 트레이스:', e.stack);
            return false;
        }
    },
    
    getNotice: async function() {
        try {
            const { data: notice, error } = await db.supabase
                .from('notices')
                .select('content')
                .eq('enabled', true)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            
            if (error) {
                console.error('[공지] 조회 실패:', error.message);
                return null;
            }
            
            return notice ? notice.content : null;
        } catch (e) {
            console.error('[공지] 조회 실패:', e.message);
            return null;
        }
    },
    
    sendNotice: async function(replies) {
        const notice = await this.getNotice();
        if (notice) {
            replies.push("📢 공지사항\n──────────\n" + notice);
            return true;
        }
        return false;
    },
    
    sendScheduledNotice: function(replies, content) {
        replies.push("📢 공지사항\n──────────\n" + content);
        return true;
    }
};

module.exports = NOTICE_SYSTEM;




