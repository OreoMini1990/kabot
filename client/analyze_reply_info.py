#!/usr/bin/env python3
"""
카카오톡 DB 답장 정보 분석 스크립트
- 답장(reply/referer) 정보 추출 및 분석
"""
import sqlite3
import json
import os
import sys
from datetime import datetime
from collections import defaultdict

def analyze_reply_info(db_path):
    """답장 정보 분석"""
    if not os.path.exists(db_path):
        print(f"[오류] DB 파일을 찾을 수 없습니다: {db_path}")
        return None
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print(f"[분석 시작] {db_path}")
    print("=" * 80)
    
    # 1. 테이블 목록 확인
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    tables = [row[0] for row in cursor.fetchall()]
    print(f"\n[테이블 목록] {len(tables)}개 테이블 발견")
    for table in tables:
        print(f"  - {table}")
    
    # 2. 메시지 테이블 찾기 (보통 chat_logs, chat_logs_old, chat_logs_new 등)
    message_tables = [t for t in tables if 'chat' in t.lower() or 'message' in t.lower() or 'log' in t.lower()]
    print(f"\n[메시지 테이블 후보] {message_tables}")
    
    analysis_results = {}
    
    for table_name in message_tables:
        print(f"\n{'=' * 80}")
        print(f"[분석] 테이블: {table_name}")
        print("=" * 80)
        
        try:
            # 테이블 구조 확인
            cursor.execute(f"PRAGMA table_info({table_name})")
            columns = cursor.fetchall()
            column_names = [col[1] for col in columns]
            
            print(f"\n[컬럼 목록] ({len(column_names)}개)")
            for col in column_names:
                print(f"  - {col}")
            
            # 답장 관련 컬럼 찾기
            reply_columns = [col for col in column_names if 'referer' in col.lower() or 'reply' in col.lower() or 'parent' in col.lower()]
            print(f"\n[답장 관련 컬럼] {reply_columns}")
            
            # 전체 메시지 수
            cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            total_count = cursor.fetchone()[0]
            print(f"\n[전체 메시지 수] {total_count:,}개")
            
            # 답장이 있는 메시지 찾기
            reply_messages = []
            
            if reply_columns:
                # referer 컬럼이 있는 경우
                for col in reply_columns:
                    cursor.execute(f"SELECT COUNT(*) FROM {table_name} WHERE {col} IS NOT NULL AND {col} != '' AND {col} != '0'")
                    count = cursor.fetchone()[0]
                    print(f"\n[{col}가 있는 메시지] {count:,}개")
                    
                    # 샘플 조회 (최근 10개)
                    # referer 값과 원본 메시지 매칭 확인
                    cursor.execute(f"""
                        SELECT 
                            r._id as reply_id,
                            r.chat_id,
                            r.user_id,
                            r.v,
                            r.{col} as referer_value,
                            r.created_at as reply_created_at,
                            o._id as original_id,
                            o.v as original_v,
                            o.message as original_message
                        FROM {table_name} r
                        LEFT JOIN {table_name} o ON r.{col} = o._id
                        WHERE r.{col} IS NOT NULL AND r.{col} != '' AND r.{col} != '0'
                        ORDER BY r.created_at DESC
                        LIMIT 20
                    """)
                    samples = cursor.fetchall()
                    
                    if samples:
                        print(f"\n[{col} 샘플] (최근 20개 - 원본 메시지 매칭 포함)")
                        for sample in samples:
                            reply_id = sample[0]
                            chat_id = sample[1]
                            user_id = sample[2]
                            v = sample[3]
                            referer = sample[4]
                            reply_created_at = sample[5]
                            original_id = sample[6]
                            original_v = sample[7]
                            original_message = sample[8]
                            
                            # v 필드 파싱 시도
                            v_text = ""
                            if v:
                                try:
                                    v_parsed = json.loads(v) if isinstance(v, str) else v
                                    if isinstance(v_parsed, dict):
                                        v_text = v_parsed.get('text', v_parsed.get('message', str(v_parsed)[:50]))
                                    else:
                                        v_text = str(v_parsed)[:100]
                                except:
                                    v_text = str(v)[:100]
                            
                            # 원본 메시지 내용 파싱
                            original_text = ""
                            if original_v:
                                try:
                                    orig_parsed = json.loads(original_v) if isinstance(original_v, str) else original_v
                                    if isinstance(orig_parsed, dict):
                                        original_text = orig_parsed.get('text', orig_parsed.get('message', str(orig_parsed)[:50]))
                                    else:
                                        original_text = str(orig_parsed)[:100]
                                except:
                                    original_text = str(original_v)[:100] if original_v else ""
                            
                            if original_message:
                                original_text = original_message[:100]
                            
                            print(f"\n  [답장 메시지]")
                            print(f"    메시지 ID: {reply_id}")
                            print(f"    채팅방 ID: {chat_id}")
                            print(f"    사용자 ID: {user_id}")
                            print(f"    답장 대상 ({col}): {referer}")
                            print(f"    답장 내용: {v_text[:100]}")
                            print(f"    생성 시간: {reply_created_at}")
                            
                            if original_id:
                                print(f"  [원본 메시지]")
                                print(f"    메시지 ID: {original_id}")
                                print(f"    원본 내용: {original_text[:100]}")
                            else:
                                print(f"  [원본 메시지] ⚠️ 찾을 수 없음 (referer={referer})")
                            
                            print(f"  {'-' * 60}")
                            
                            reply_messages.append({
                                'table': table_name,
                                'msg_id': reply_id,
                                'chat_id': chat_id,
                                'user_id': user_id,
                                'referer': referer,
                                'original_id': original_id,
                                'original_text': original_text,
                                'v': v,
                                'v_text': v_text,
                                'created_at': reply_created_at
                            })
            
            # attachment 필드에서 답장 정보 찾기
            if 'attachment' in column_names:
                print(f"\n[attachment 필드 분석]")
                # user_id 컬럼이 있는지 확인
                has_user_id = 'user_id' in column_names
                user_id_col = 'user_id' if has_user_id else 'NULL as user_id'
                cursor.execute(f"""
                    SELECT _id, chat_id, {user_id_col}, attachment, v, created_at
                    FROM {table_name}
                    WHERE attachment IS NOT NULL AND attachment != ''
                    ORDER BY created_at DESC
                    LIMIT 20
                """)
                attachment_samples = cursor.fetchall()
                
                print(f"  attachment가 있는 메시지 샘플: {len(attachment_samples)}개")
                
                for sample in attachment_samples:
                    msg_id = sample[0]
                    chat_id = sample[1]
                    user_id = sample[2]
                    attachment = sample[3]
                    v = sample[4]
                    created_at = sample[5]
                    
                    # attachment 파싱
                    try:
                        if isinstance(attachment, str):
                            attach_parsed = json.loads(attachment)
                        else:
                            attach_parsed = attachment
                        
                        # 답장 관련 필드 찾기
                        reply_info = {}
                        if isinstance(attach_parsed, dict):
                            for key in attach_parsed.keys():
                                if 'reply' in key.lower() or 'referer' in key.lower() or 'parent' in key.lower():
                                    reply_info[key] = attach_parsed[key]
                        
                        if reply_info:
                            print(f"\n  메시지 ID: {msg_id}")
                            print(f"  답장 정보: {reply_info}")
                            
                            # v 필드에서 텍스트 추출
                            v_text = ""
                            if v:
                                try:
                                    v_parsed = json.loads(v) if isinstance(v, str) else v
                                    if isinstance(v_parsed, dict):
                                        v_text = v_parsed.get('text', v_parsed.get('message', str(v_parsed)[:50]))
                                    else:
                                        v_text = str(v_parsed)[:100]
                                except:
                                    v_text = str(v)[:100]
                            
                            print(f"  메시지 내용: {v_text[:100]}")
                            print(f"  생성 시간: {created_at}")
                            print(f"  {'-' * 60}")
                            
                            reply_messages.append({
                                'table': table_name,
                                'msg_id': sample[0],  # _id
                                'chat_id': sample[1],  # chat_id
                                'user_id': sample[2] if len(sample) > 2 else None,  # user_id
                                'attachment_reply_info': reply_info,
                                'v': v,
                                'v_text': v_text,
                                'created_at': created_at
                            })
                    except Exception as e:
                        pass  # 파싱 실패는 무시
            
            # supplement 필드에서 답장 정보 찾기
            if 'supplement' in column_names:
                print(f"\n[supplement 필드 분석]")
                # user_id 컬럼이 있는지 확인
                has_user_id = 'user_id' in column_names
                user_id_col = 'user_id' if has_user_id else 'NULL as user_id'
                cursor.execute(f"""
                    SELECT _id, chat_id, {user_id_col}, supplement, v, created_at
                    FROM {table_name}
                    WHERE supplement IS NOT NULL AND supplement != ''
                    ORDER BY created_at DESC
                    LIMIT 20
                """)
                supplement_samples = cursor.fetchall()
                
                print(f"  supplement가 있는 메시지 샘플: {len(supplement_samples)}개")
                
                for sample in supplement_samples:
                    msg_id = sample[0]
                    chat_id = sample[1]
                    user_id = sample[2]
                    supplement = sample[3]
                    v = sample[4]
                    created_at = sample[5]
                    
                    # supplement 파싱
                    try:
                        if isinstance(supplement, str):
                            supp_parsed = json.loads(supplement)
                        else:
                            supp_parsed = supplement
                        
                        # 답장 관련 필드 찾기
                        reply_info = {}
                        if isinstance(supp_parsed, dict):
                            for key in supp_parsed.keys():
                                if 'reply' in key.lower() or 'referer' in key.lower() or 'parent' in key.lower():
                                    reply_info[key] = supp_parsed[key]
                        
                        if reply_info:
                            print(f"\n  메시지 ID: {msg_id}")
                            print(f"  답장 정보: {reply_info}")
                            
                            # v 필드에서 텍스트 추출
                            v_text = ""
                            if v:
                                try:
                                    v_parsed = json.loads(v) if isinstance(v, str) else v
                                    if isinstance(v_parsed, dict):
                                        v_text = v_parsed.get('text', v_parsed.get('message', str(v_parsed)[:50]))
                                    else:
                                        v_text = str(v_parsed)[:100]
                                except:
                                    v_text = str(v)[:100]
                            
                            print(f"  메시지 내용: {v_text[:100]}")
                            print(f"  생성 시간: {created_at}")
                            print(f"  {'-' * 60}")
                            
                            reply_messages.append({
                                'table': table_name,
                                'msg_id': sample[0],  # _id
                                'chat_id': sample[1],  # chat_id
                                'user_id': sample[2] if len(sample) > 2 else None,  # user_id
                                'supplement_reply_info': reply_info,
                                'v': v,
                                'v_text': v_text,
                                'created_at': created_at
                            })
                    except Exception as e:
                        pass  # 파싱 실패는 무시
            
            analysis_results[table_name] = {
                'columns': column_names,
                'reply_columns': reply_columns,
                'total_messages': total_count,
                'reply_messages': reply_messages
            }
            
        except Exception as e:
            print(f"[오류] 테이블 분석 실패: {e}")
            import traceback
            traceback.print_exc()
    
    conn.close()
    
    print(f"\n{'=' * 80}")
    print("[분석 완료]")
    print("=" * 80)
    
    return analysis_results

def main():
    """메인 함수"""
    if len(sys.argv) > 1:
        db_path = sys.argv[1]
    else:
        # 기본값: ref/db/251221 폴더의 DB 파일
        script_dir = os.path.dirname(os.path.abspath(__file__))
        ref_dir = os.path.join(os.path.dirname(script_dir), 'ref', 'db', '251221')
        
        # KakaoTalk.db 찾기
        db_path = None
        for filename in os.listdir(ref_dir):
            if filename.startswith('KakaoTalk') and filename.endswith('.db') and '2' not in filename:
                db_path = os.path.join(ref_dir, filename)
                break
        
        if not db_path:
            print(f"[오류] DB 파일을 찾을 수 없습니다: {ref_dir}")
            print("[사용법] python analyze_reply_info.py [KakaoTalk.db 경로]")
            return
    
    results = analyze_reply_info(db_path)
    
    # JSON 결과 저장
    if results:
        output_dir = "db_analysis_output"
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)
        
        output_path = os.path.join(output_dir, f"reply_analysis_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2, default=str)
        print(f"\n[저장] JSON 결과: {output_path}")

if __name__ == "__main__":
    main()

