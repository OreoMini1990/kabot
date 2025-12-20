#!/usr/bin/env python3
"""
닉네임 복호화 테스트
"R1Znx2lwf3K" → "환영하는 라이언" 복호화 테스트
"""

import sys
import os

# 현재 스크립트의 상위 디렉토리를 경로에 추가
script_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(script_dir)
client_dir = os.path.join(parent_dir, 'client')

if client_dir not in sys.path:
    sys.path.insert(0, client_dir)

# kakaodecrypt 모듈 import
try:
    from kakaodecrypt import KakaoDecrypt
    print("[OK] kakaodecrypt 모듈 로드 성공")
except ImportError as e:
    print(f"[FAIL] kakaodecrypt 모듈 로드 실패: {e}")
    sys.exit(1)

def test_nickname_decrypt():
    """닉네임 복호화 테스트"""
    
    # 테스트 데이터
    encrypted_name = "R1Znx2lwf3K"
    expected_decrypted = "환영하는 라이언"
    
    print("=" * 60)
    print("닉네임 복호화 테스트")
    print("=" * 60)
    print(f"암호화된 이름: {encrypted_name}")
    print(f"예상 복호화 결과: {expected_decrypted}")
    print("")
    
    # MY_USER_ID 후보들 (일반적인 범위)
    # 실제 값은 사용자가 제공해야 함
    my_user_id_candidates = [
        # 여기에 실제 MY_USER_ID를 입력하세요
        # 예: 429744344, 1234567890 등
    ]
    
    # enc 후보들
    enc_candidates = [31, 30, 32]
    
    print("[테스트 시작]")
    print(f"enc 후보: {enc_candidates}")
    print("")
    
    if not my_user_id_candidates:
        print("[경고] MY_USER_ID 후보가 없습니다.")
        print("다음과 같이 테스트하세요:")
        print("  python test_nickname_decrypt.py <MY_USER_ID>")
        print("")
        print("또는 스크립트에서 my_user_id_candidates에 값을 추가하세요.")
        return
    
    found = False
    for my_user_id in my_user_id_candidates:
        print(f"[테스트] MY_USER_ID={my_user_id}")
        for enc in enc_candidates:
            try:
                result = KakaoDecrypt.decrypt(my_user_id, enc, encrypted_name)
                if result and result != encrypted_name:
                    print(f"  enc={enc}: '{result}'")
                    if result == expected_decrypted:
                        print(f"  [SUCCESS] 성공! enc={enc}, MY_USER_ID={my_user_id}")
                        found = True
                else:
                    print(f"  enc={enc}: 복호화 실패 또는 결과 없음")
            except Exception as e:
                print(f"  enc={enc}: 오류 - {e}")
        print("")
    
    if not found:
        print("[결과] 복호화 실패 - MY_USER_ID 또는 enc 값이 잘못되었을 수 있습니다.")
        print("")
        print("[디버깅 팁]")
        print("1. MY_USER_ID 확인:")
        print("   ~/my_user_id.txt 파일 내용 확인")
        print("   또는 guess_my_user_id() 함수 실행 결과 확인")
        print("")
        print("2. 다른 enc 값 시도:")
        print("   enc 후보에 다른 값 추가 (예: 0, 1, 2, ...)")
        print("")
        print("3. DB에서 직접 확인:")
        print("   SELECT name, enc FROM db2.friends WHERE name = 'R1Znx2lwf3K'")
        print("   또는")
        print("   SELECT nickname, enc FROM db2.open_chat_member WHERE nickname = 'R1Znx2lwf3K'")

def test_with_user_id(my_user_id_str):
    """MY_USER_ID를 인자로 받아서 테스트"""
    try:
        my_user_id = int(my_user_id_str)
    except ValueError:
        print(f"[오류] 잘못된 MY_USER_ID: {my_user_id_str}")
        return
    
    encrypted_name = "R1Znx2lwf3K"
    expected_decrypted = "환영하는 라이언"
    
    print("=" * 60)
    print("닉네임 복호화 테스트")
    print("=" * 60)
    print(f"암호화된 이름: {encrypted_name}")
    print(f"예상 복호화 결과: {expected_decrypted}")
    print(f"MY_USER_ID: {my_user_id}")
    print("")
    
    enc_candidates = [31, 30, 32]
    
    print(f"enc 후보: {enc_candidates}")
    print("")
    
    found = False
    for enc in enc_candidates:
        try:
            result = KakaoDecrypt.decrypt(my_user_id, enc, encrypted_name)
            if result and result != encrypted_name:
                print(f"enc={enc}: '{result}'")
                if result == expected_decrypted:
                    print(f"  [SUCCESS] 성공! enc={enc}")
                    found = True
                    print("")
                    print("=" * 60)
                    print("해결 방법:")
                    print(f"  MY_USER_ID={my_user_id}, enc={enc} 사용")
                    print("=" * 60)
            else:
                print(f"enc={enc}: 복호화 실패 또는 결과 없음")
        except Exception as e:
            print(f"enc={enc}: 오류 - {e}")
    
    if not found:
        print("")
        print("[결과] 복호화 실패")
        print("")
        print("추가 디버깅:")
        print("1. 다른 enc 값 시도 (0-40 범위)")
        print("2. MY_USER_ID가 정확한지 확인")
        print("3. DB에서 enc 값 직접 확인:")
        print("   sqlite3 /data/data/com.kakao.talk/databases/KakaoTalk2.db")
        print("   SELECT name, enc FROM friends WHERE name LIKE 'R1Znx2lwf3K%'")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        # MY_USER_ID를 인자로 받음
        test_with_user_id(sys.argv[1])
    else:
        # 기본 테스트
        test_nickname_decrypt()

