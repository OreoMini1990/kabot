#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
클라이언트 반응 데이터 조회 및 서버 전송 테스트
카카오톡 DB에서 v 필드와 supplement 필드를 가져와서 서버로 전송하고 Supabase에 저장되는지 확인

사용법:
    python client/test_reaction_with_server.py [DB_PATH]
    
예시:
    python client/test_reaction_with_server.py /data/data/com.kakao.talk/databases/KakaoTalk.db
"""

import sys
import os
import time
from pathlib import Path

# 프로젝트 루트 경로 추가
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# 클라이언트 모듈 경로 추가
client_dir = project_root / 'client'
sys.path.insert(0, str(client_dir))

# a 모듈 import (kakao_poller.py를 a.py로 이름 변경)
try:
    # 환경 변수 설정 (a.py가 사용하는 변수들)
    if len(sys.argv) > 1:
        os.environ['KAKAO_DB_PATH'] = sys.argv[1]
    
    # a 모듈의 함수들 import (kakao_poller.py를 a.py로 이름 변경)
    from a import (
        DB_PATH,
        WS_URL,
        poll_reaction_updates,
        connect_websocket,
        send_to_server,
        check_db_access,
        check_db_structure,
        load_my_user_id,
        MY_USER_ID,
        get_chat_room_data  # 채팅방 정보 조회용 (poll_reaction_updates에서 사용)
    )
    print("[✓] a 모듈 import 성공")
except ImportError as e:
    print(f"[✗] a 모듈 import 실패: {e}")
    print("[오류] client/a.py 파일을 확인하세요.")
    sys.exit(1)
except Exception as e:
    print(f"[✗] 초기화 오류: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("=" * 60)
print("클라이언트 반응 데이터 조회 및 서버 전송 테스트")
print("=" * 60)
print(f"DB 경로: {DB_PATH}")
print(f"WebSocket URL: {WS_URL}")
print("")

# DB 접근 확인
print("[1단계] DB 접근 확인")
print("-" * 60)
if not check_db_access():
    print("\n[중지] DB 접근 불가. 위의 해결 방법을 참고하세요.")
    sys.exit(1)
print("✅ DB 접근 성공\n")

# DB 구조 확인
print("[2단계] DB 구조 확인")
print("-" * 60)
if not check_db_structure():
    print("\n[경고] DB 구조 확인 실패. 계속 진행합니다...\n")
else:
    print("✅ DB 구조 확인 완료\n")

# MY_USER_ID 로드
print("[3단계] MY_USER_ID 로드")
print("-" * 60)
if MY_USER_ID is None:
    load_my_user_id()
if MY_USER_ID:
    print(f"✅ MY_USER_ID: {MY_USER_ID}\n")
else:
    print("⚠️ MY_USER_ID를 찾을 수 없습니다. (복호화 실패 가능)\n")

# WebSocket 연결
print("[4단계] WebSocket 연결")
print("-" * 60)
if not connect_websocket():
    print("[경고] WebSocket 연결 실패. 서버 전송이 실패할 수 있습니다.\n")
else:
    print("✅ WebSocket 연결 성공\n")
    # 연결 안정화 대기
    time.sleep(2)

# 반응 업데이트 확인 및 전송
print("=" * 60)
print("[5단계] 반응 업데이트 확인 및 서버 전송")
print("=" * 60)
print("")

print("클라이언트의 poll_reaction_updates() 함수 호출...")
print("(이 함수는 최근 24시간 내 메시지의 반응 변화를 확인하고 서버로 전송합니다)")
print("")

try:
    # poll_reaction_updates() 함수 호출 (실제 클라이언트 코드 사용)
    updated_count = poll_reaction_updates()
    
    print("")
    print("=" * 60)
    print("테스트 결과")
    print("=" * 60)
    print(f"감지된 반응 변화: {updated_count}개")
    print("")
    
    if updated_count > 0:
        print("✅ 반응 데이터가 감지되어 서버로 전송되었습니다.")
        print("")
        print("📋 다음 단계:")
        print("  1. 서버 로그에서 '[반응 처리]' 또는 '[반응 저장]' 메시지 확인")
        print("  2. Supabase DB의 chat_reactions 테이블에서 저장 확인")
        print("  3. Supabase DB의 reaction_logs 테이블에서 로그 확인")
    else:
        print("⚠️ 반응 변화가 감지되지 않았습니다.")
        print("")
        print("📋 가능한 원인:")
        print("  1. 최근 24시간 내 반응이 추가/변경된 메시지가 없음")
        print("  2. 반응이 있는 메시지가 없음")
        print("  3. v 필드나 supplement 필드에 반응 정보가 없음")
        print("")
        print("💡 테스트 방법:")
        print("  1. 카카오톡에서 실제로 메시지에 반응을 눌러보세요")
        print("  2. 몇 분 후 이 스크립트를 다시 실행하세요")
    
    # 연결 유지를 위해 잠시 대기 (서버 전송 완료 대기)
    print("")
    print("서버 전송 완료 대기 중... (3초)")
    time.sleep(3)
    
    print("")
    print("=" * 60)
    print("테스트 완료")
    print("=" * 60)
    
    sys.exit(0)
    
except KeyboardInterrupt:
    print("\n\n[테스트 중지] 사용자에 의해 중단되었습니다.")
    sys.exit(0)
except Exception as e:
    print(f"\n[오류] 테스트 중 오류 발생: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

