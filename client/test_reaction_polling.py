#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
클라이언트 반응 데이터 조회 테스트
카카오톡 DB에서 v 필드와 supplement 필드를 제대로 가져오는지 확인

사용법:
    python client/test_reaction_polling.py [DB_PATH]
    
예시:
    python client/test_reaction_polling.py /data/data/com.kakao.talk/databases/KakaoTalk.db
"""

import sys
import os
import sqlite3
import json
import time
from pathlib import Path

# 프로젝트 루트 경로 추가
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# 클라이언트 모듈 경로 추가
client_dir = project_root / 'client'
sys.path.insert(0, str(client_dir))

# DB 경로 설정
DB_PATH = None
if len(sys.argv) > 1:
    DB_PATH = sys.argv[1]
elif os.getenv('KAKAO_DB_PATH'):
    DB_PATH = os.getenv('KAKAO_DB_PATH')
else:
    # 기본 경로들 시도
    default_paths = [
        '/data/data/com.kakao.talk/databases/KakaoTalk.db',
        os.path.expanduser('~/KakaoTalk.db'),
        './KakaoTalk.db'
    ]
    for path in default_paths:
        if os.path.exists(path):
            DB_PATH = path
            break

if not DB_PATH:
    print("❌ DB 파일 경로를 지정해주세요.")
    print("")
    print("사용법:")
    print("  python client/test_reaction_polling.py [DB_PATH]")
    print("  또는 환경변수 설정: export KAKAO_DB_PATH=/path/to/db")
    sys.exit(1)

if not os.path.exists(DB_PATH):
    print(f"❌ DB 파일을 찾을 수 없습니다: {DB_PATH}")
    sys.exit(1)

print("=" * 60)
print("클라이언트 반응 데이터 조회 테스트")
print("=" * 60)
print(f"DB 경로: {DB_PATH}")
print("")

# DB 연결
try:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    print("✅ DB 연결 성공")
    print("")
except Exception as e:
    print(f"❌ DB 연결 실패: {e}")
    sys.exit(1)

# 테이블 구조 확인
try:
    cursor.execute("PRAGMA table_info(chat_logs)")
    columns_info = cursor.fetchall()
    column_names = [col[1] for col in columns_info]
    
    print("📋 chat_logs 테이블 컬럼:")
    print(f"  {', '.join(column_names)}")
    print("")
    
    has_v = 'v' in column_names
    has_supplement = 'supplement' in column_names
    
    print(f"  v 컬럼 존재: {'✅ 예' if has_v else '❌ 아니오'}")
    print(f"  supplement 컬럼 존재: {'✅ 예' if has_supplement else '❌ 아니오'}")
    print("")
    
    if not has_v and not has_supplement:
        print("⚠️ v 또는 supplement 컬럼이 없어 반응 정보를 가져올 수 없습니다.")
        conn.close()
        sys.exit(1)
        
except Exception as e:
    print(f"❌ 테이블 구조 확인 실패: {e}")
    conn.close()
    sys.exit(1)

# 클라이언트 코드와 동일한 쿼리 실행
print("=" * 60)
print("클라이언트 poll_reaction_updates() 함수와 동일한 쿼리 실행")
print("=" * 60)
print("")

# 최근 24시간 내 메시지 조회 (클라이언트 코드와 동일)
twenty_four_hours_ago = int(time.time() * 1000) - (24 * 60 * 60 * 1000)

query = """
    SELECT _id, chat_id, user_id, v, supplement, created_at
    FROM chat_logs
    WHERE created_at > ?
    ORDER BY _id DESC
    LIMIT 100
"""

try:
    cursor.execute(query, (twenty_four_hours_ago,))
    recent_messages = cursor.fetchall()
    
    print(f"✅ 최근 24시간 내 메시지: {len(recent_messages)}개 조회됨")
    print("")
    
    if len(recent_messages) == 0:
        print("⚠️ 최근 24시간 내 메시지가 없습니다.")
        conn.close()
        sys.exit(0)
    
    # 첫 번째 메시지의 컬럼 구조 확인 (클라이언트 코드와 동일)
    first_msg = recent_messages[0]
    print(f"[DB 검증] 첫 메시지: msg_id={first_msg[0]}, 컬럼 수={len(first_msg)}")
    print(f"[DB 검증] v 필드 존재={len(first_msg) > 3 and first_msg[3] is not None}, supplement 존재={len(first_msg) > 4 and first_msg[4] is not None}")
    
    if len(first_msg) > 3 and first_msg[3] is not None:
        v_sample = str(first_msg[3])[:100] if first_msg[3] else "None"
        print(f"[DB 검증] v 필드 샘플: {v_sample}...")
    if len(first_msg) > 4 and first_msg[4] is not None:
        supp_sample = str(first_msg[4])[:100] if first_msg[4] else "None"
        print(f"[DB 검증] supplement 필드 샘플: {supp_sample}...")
    print("")
    
    # 각 메시지의 v 필드 파싱 (클라이언트 코드와 동일한 로직)
    print("=" * 60)
    print("v 필드 파싱 테스트 (클라이언트 로직과 동일)")
    print("=" * 60)
    print("")
    
    messages_with_reactions = []
    parse_errors = []
    
    for idx, msg in enumerate(recent_messages[:20]):  # 처음 20개만 상세 확인
        msg_id = msg[0]
        chat_id = msg[1]
        user_id = msg[2]
        v_field = msg[3] if len(msg) > 3 else None
        supplement = msg[4] if len(msg) > 4 else None
        created_at = msg[5] if len(msg) > 5 else None
        
        # v 필드에서 defaultEmoticonsCount 확인 (클라이언트 코드와 동일)
        current_reaction_count = 0
        v_json = None
        
        if v_field:
            try:
                if isinstance(v_field, str):
                    v_json = json.loads(v_field)
                else:
                    v_json = v_field
                
                if isinstance(v_json, dict):
                    current_reaction_count = v_json.get("defaultEmoticonsCount", 0)
                    if current_reaction_count > 0:
                        messages_with_reactions.append({
                            'msg_id': msg_id,
                            'count': current_reaction_count,
                            'v_json': v_json,
                            'supplement': supplement
                        })
                        print(f"[{idx+1}] ✅ msg_id={msg_id}, defaultEmoticonsCount={current_reaction_count}")
                        print(f"     v 필드 keys: {list(v_json.keys())[:10]}")
                else:
                    if idx < 5:  # 처음 5개만 로깅
                        print(f"[{idx+1}] ⚠️ msg_id={msg_id}, v 필드가 dict가 아님: type={type(v_json)}")
            except (json.JSONDecodeError, TypeError) as e:
                parse_errors.append({
                    'msg_id': msg_id,
                    'error': str(e),
                    'v_field_type': type(v_field).__name__,
                    'v_field_sample': str(v_field)[:100] if v_field else 'None'
                })
                if idx < 5:  # 처음 5개만 로깅
                    print(f"[{idx+1}] ❌ msg_id={msg_id}, v 필드 파싱 실패: {e}")
        else:
            if idx < 5:  # 처음 5개만 로깅
                print(f"[{idx+1}] ⚠️ msg_id={msg_id}, v 필드 없음")
    
    print("")
    print("=" * 60)
    print("결과 요약")
    print("=" * 60)
    print(f"총 조회 메시지: {len(recent_messages)}개")
    print(f"반응이 있는 메시지: {len(messages_with_reactions)}개")
    print(f"파싱 오류: {len(parse_errors)}개")
    print("")
    
    if messages_with_reactions:
        print("✅ 반응이 있는 메시지 상세:")
        for msg_info in messages_with_reactions[:5]:
            print(f"  - msg_id={msg_info['msg_id']}, 반응 개수={msg_info['count']}")
            if msg_info['supplement']:
                try:
                    supp_json = json.loads(msg_info['supplement']) if isinstance(msg_info['supplement'], str) else msg_info['supplement']
                    if isinstance(supp_json, dict):
                        reactions = supp_json.get("reactions") or supp_json.get("emoticons") or []
                        if isinstance(reactions, list):
                            print(f"    supplement reactions: {len(reactions)}개")
                except:
                    pass
        print("")
    
    if parse_errors:
        print("⚠️ 파싱 오류 상세 (처음 5개):")
        for err in parse_errors[:5]:
            print(f"  - msg_id={err['msg_id']}, 오류={err['error']}")
            print(f"    v_field 타입={err['v_field_type']}, 샘플={err['v_field_sample']}")
        print("")
    
    # supplement 필드 파싱 테스트
    print("=" * 60)
    print("supplement 필드 파싱 테스트")
    print("=" * 60)
    print("")
    
    supplement_with_reactions = []
    for msg in recent_messages[:20]:
        msg_id = msg[0]
        supplement = msg[4] if len(msg) > 4 else None
        
        if supplement:
            try:
                if isinstance(supplement, str):
                    supplement_json = json.loads(supplement)
                else:
                    supplement_json = supplement
                
                if isinstance(supplement_json, dict):
                    reactions = supplement_json.get("reactions") or supplement_json.get("emoticons") or []
                    if isinstance(reactions, list) and len(reactions) > 0:
                        supplement_with_reactions.append({
                            'msg_id': msg_id,
                            'reactions_count': len(reactions),
                            'reactions': reactions
                        })
            except (json.JSONDecodeError, TypeError) as e:
                pass
    
    print(f"supplement에 반응 정보가 있는 메시지: {len(supplement_with_reactions)}개")
    if supplement_with_reactions:
        print("")
        print("✅ supplement 반응 정보 상세 (처음 3개):")
        for supp_info in supplement_with_reactions[:3]:
            print(f"  - msg_id={supp_info['msg_id']}, reactions 개수={supp_info['reactions_count']}")
            for idx, reaction in enumerate(supp_info['reactions'][:3]):
                react_type = reaction.get("type") or reaction.get("emoType") or "unknown"
                react_user = reaction.get("userId") or reaction.get("user_id") or "unknown"
                print(f"    [{idx+1}] type={react_type}, user_id={react_user}")
        print("")
    
    conn.close()
    
    print("=" * 60)
    print("테스트 완료")
    print("=" * 60)
    
    # 최종 결과
    if len(messages_with_reactions) > 0 or len(supplement_with_reactions) > 0:
        print("✅ 클라이언트가 반응 데이터를 제대로 가져올 수 있습니다.")
        sys.exit(0)
    else:
        print("⚠️ 반응 데이터가 있는 메시지가 없습니다. (최근 24시간 내)")
        print("   실제로 반응이 있는 메시지가 있는지 확인하세요.")
        sys.exit(0)
        
except Exception as e:
    print(f"❌ 테스트 중 오류 발생: {e}")
    import traceback
    traceback.print_exc()
    conn.close()
    sys.exit(1)

