"""
복호화 테스트 스크립트
=====================

이 스크립트는 복호화 로직을 로컬에서 테스트합니다.
실제 카카오톡 DB에서 가져온 암호화된 메시지를 복호화하여 정상 작동 여부를 확인합니다.

사용법:
    python test_decryption.py

테스트 케이스:
1. 실제 암호화된 메시지 복호화
2. 발신자 이름 복호화
3. 채팅방 이름 복호화
4. 복호화 실패 케이스 처리
"""

import sys
import os
import json
import base64
import sqlite3
from pathlib import Path

# 프로젝트 루트 경로 추가
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# kakao_poller.py의 복호화 로직 import
try:
    from kakao_poller import (
        decrypt_message,
        decrypt_kakaotalk_message,
        MY_USER_ID,
        KAKAODECRYPT_AVAILABLE,
        CRYPTO_AVAILABLE,
        KakaoDecrypt
    )
    print("[✓] kakao_poller 모듈 import 성공")
except ImportError as e:
    print(f"[✗] kakao_poller 모듈 import 실패: {e}")
    sys.exit(1)

# 카카오톡 DB 경로
DB_PATH = "/data/data/com.kakao.talk/databases/KakaoTalk.db"

def load_my_user_id():
    """MY_USER_ID 로드"""
    my_user_id_file = os.path.expanduser("~/my_user_id.txt")
    if os.path.exists(my_user_id_file):
        with open(my_user_id_file, 'r') as f:
            return f.read().strip()
    return None

def get_test_messages_from_db(limit=10):
    """DB에서 테스트용 메시지 가져오기"""
    if not os.path.exists(DB_PATH):
        print(f"[경고] DB 파일이 없습니다: {DB_PATH}")
        print("[정보] 실제 기기에서 DB를 복사하거나, 수동으로 테스트 케이스를 입력하세요.")
        return []
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 최근 메시지 가져오기
        query = """
            SELECT id, chat_id, user_id, message, v, type, attachment
            FROM chat_logs
            WHERE message IS NOT NULL AND message != ''
            ORDER BY id DESC
            LIMIT ?
        """
        cursor.execute(query, (limit,))
        messages = cursor.fetchall()
        
        conn.close()
        return messages
    except Exception as e:
        print(f"[✗] DB 조회 실패: {e}")
        return []

def test_decrypt_message(encrypted_message, v_field, user_id, enc_type=31, expected_result=None):
    """메시지 복호화 테스트"""
    print(f"\n{'='*60}")
    print(f"[테스트] 메시지 복호화")
    print(f"{'='*60}")
    print(f"암호화된 메시지: {encrypted_message[:50]}... (길이: {len(encrypted_message)})")
    print(f"user_id: {user_id}")
    print(f"enc_type: {enc_type}")
    if v_field:
        print(f"v_field: {v_field[:100]}...")
    
    # 복호화 시도
    result = decrypt_message(encrypted_message, v_field, user_id, enc_type, debug=True)
    
    if result:
        print(f"[✓] 복호화 성공!")
        print(f"복호화된 메시지: {result[:100]}...")
        
        # 유효성 검사
        has_control_chars = any(ord(c) < 32 and c not in '\n\r\t' for c in result)
        if has_control_chars:
            print(f"[경고] 복호화된 메시지에 제어 문자가 포함되어 있습니다.")
        else:
            print(f"[✓] 복호화된 메시지가 유효한 텍스트입니다.")
        
        if expected_result:
            if result == expected_result:
                print(f"[✓] 예상 결과와 일치합니다!")
            else:
                print(f"[✗] 예상 결과와 다릅니다.")
                print(f"예상: {expected_result}")
                print(f"실제: {result}")
    else:
        print(f"[✗] 복호화 실패!")
        print(f"[디버그] 복호화 실패 원인 분석:")
        print(f"  - CRYPTO_AVAILABLE: {CRYPTO_AVAILABLE}")
        print(f"  - KAKAODECRYPT_AVAILABLE: {KAKAODECRYPT_AVAILABLE}")
        print(f"  - user_id 타입: {type(user_id)}")
        print(f"  - enc_type: {enc_type}")
        
        # base64 확인
        is_base64 = (isinstance(encrypted_message, str) and 
                    len(encrypted_message) > 10 and 
                    len(encrypted_message) % 4 == 0 and
                    all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=' for c in encrypted_message))
        print(f"  - base64 형식: {is_base64}")
    
    return result

def test_decrypt_with_my_user_id(encrypted_message, v_field=None, enc_type=31):
    """MY_USER_ID로 복호화 테스트 (send_to_server 방식)"""
    my_user_id = load_my_user_id()
    if not my_user_id:
        print(f"[경고] MY_USER_ID가 설정되지 않았습니다.")
        print(f"[정보] ~/my_user_id.txt 파일에 자신의 user_id를 저장하세요.")
        return None
    
    print(f"\n{'='*60}")
    print(f"[테스트] MY_USER_ID로 복호화 (send_to_server 방식)")
    print(f"{'='*60}")
    print(f"MY_USER_ID: {my_user_id}")
    
    try:
        decrypt_user_id_int = int(my_user_id)
        return test_decrypt_message(encrypted_message, v_field, decrypt_user_id_int, enc_type)
    except (ValueError, OverflowError) as e:
        print(f"[✗] MY_USER_ID 변환 실패: {e}")
        return None

def test_decrypt_with_sender_id(encrypted_message, v_field, sender_id, enc_type=31):
    """발신자 user_id로 복호화 테스트"""
    print(f"\n{'='*60}")
    print(f"[테스트] 발신자 user_id로 복호화")
    print(f"{'='*60}")
    print(f"발신자 user_id: {sender_id}")
    
    try:
        sender_id_int = int(sender_id)
        return test_decrypt_message(encrypted_message, v_field, sender_id_int, enc_type)
    except (ValueError, OverflowError) as e:
        print(f"[✗] 발신자 user_id 변환 실패: {e}")
        return None

def test_manual_case():
    """수동 테스트 케이스 (로그에서 본 실패 케이스)"""
    print(f"\n{'='*60}")
    print(f"[테스트] 수동 테스트 케이스")
    print(f"{'='*60}")
    
    # 로그에서 본 실패 케이스
    encrypted_message = "jy2FmmdDof70biHgEwyw9Q=="
    my_user_id = load_my_user_id()
    
    if not my_user_id:
        print(f"[경고] MY_USER_ID가 설정되지 않았습니다.")
        print(f"[정보] 테스트를 위해 MY_USER_ID를 입력하세요:")
        my_user_id = input("MY_USER_ID: ").strip()
        if not my_user_id:
            print(f"[✗] MY_USER_ID가 필요합니다.")
            return
    
    print(f"\n[테스트 케이스 1] MY_USER_ID로 복호화")
    result1 = test_decrypt_with_my_user_id(encrypted_message, None, 31)
    
    # 다른 enc_type 시도
    for enc_type in [30, 32]:
        print(f"\n[테스트 케이스] MY_USER_ID로 복호화 (enc_type={enc_type})")
        test_decrypt_with_my_user_id(encrypted_message, None, enc_type)

def test_from_db():
    """DB에서 메시지를 가져와서 테스트"""
    print(f"\n{'='*60}")
    print(f"[테스트] DB에서 메시지 가져와서 테스트")
    print(f"{'='*60}")
    
    messages = get_test_messages_from_db(limit=5)
    if not messages:
        print(f"[정보] DB에서 메시지를 가져올 수 없습니다. 수동 테스트 케이스를 사용하세요.")
        return
    
    my_user_id = load_my_user_id()
    if not my_user_id:
        print(f"[경고] MY_USER_ID가 설정되지 않았습니다.")
        return
    
    try:
        decrypt_user_id_int = int(my_user_id)
    except (ValueError, OverflowError) as e:
        print(f"[✗] MY_USER_ID 변환 실패: {e}")
        return
    
    for i, msg in enumerate(messages, 1):
        msg_id, chat_id, user_id, message, v_field, msg_type, attachment = msg
        
        print(f"\n[테스트 {i}] 메시지 ID: {msg_id}")
        print(f"  chat_id: {chat_id}")
        print(f"  user_id: {user_id}")
        print(f"  message 길이: {len(message) if message else 0}")
        
        # v_field에서 enc 추출
        enc_type = 31
        if v_field:
            try:
                v_parsed = json.loads(v_field)
                if isinstance(v_parsed, dict) and "enc" in v_parsed:
                    enc_type = v_parsed["enc"] or 31
            except:
                pass
        
        # MY_USER_ID로 복호화 시도
        result = test_decrypt_message(message, v_field, decrypt_user_id_int, enc_type)
        
        if not result:
            # 발신자 user_id로도 시도
            if user_id:
                print(f"\n[대안 테스트] 발신자 user_id로 복호화 시도")
                test_decrypt_with_sender_id(message, v_field, user_id, enc_type)

def main():
    """메인 함수"""
    print("="*60)
    print("복호화 테스트 스크립트")
    print("="*60)
    
    # 환경 확인
    print(f"\n[환경 확인]")
    print(f"CRYPTO_AVAILABLE: {CRYPTO_AVAILABLE}")
    print(f"KAKAODECRYPT_AVAILABLE: {KAKAODECRYPT_AVAILABLE}")
    
    my_user_id = load_my_user_id()
    if my_user_id:
        print(f"MY_USER_ID: {my_user_id}")
    else:
        print(f"MY_USER_ID: (설정되지 않음)")
    
    # 테스트 선택
    print(f"\n[테스트 선택]")
    print(f"1. 수동 테스트 케이스 (로그에서 본 실패 케이스)")
    print(f"2. DB에서 메시지 가져와서 테스트")
    print(f"3. 둘 다 실행")
    
    choice = input("\n선택 (1/2/3, 기본값: 1): ").strip() or "1"
    
    if choice == "1":
        test_manual_case()
    elif choice == "2":
        test_from_db()
    elif choice == "3":
        test_manual_case()
        test_from_db()
    else:
        print(f"[✗] 잘못된 선택입니다.")
        return
    
    print(f"\n{'='*60}")
    print(f"[테스트 완료]")
    print(f"{'='*60}")

if __name__ == "__main__":
    main()

