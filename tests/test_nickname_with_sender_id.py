#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
닉네임 복호화 테스트 (발신자 정보 포함)
발신자 user_id: 4897202238384073231
예상 닉네임: "환영하는 라이언"
암호화된 이름: "R1Znx2lwf3K"

주의: 복호화에는 자신의 user_id (MY_USER_ID)가 필요합니다!
"""

import sys
import os

script_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(script_dir)
client_dir = os.path.join(parent_dir, 'client')

if client_dir not in sys.path:
    sys.path.insert(0, client_dir)

try:
    from kakaodecrypt import KakaoDecrypt
    print("[OK] kakaodecrypt 모듈 로드 성공")
except ImportError as e:
    print(f"[FAIL] kakaodecrypt 모듈 로드 실패: {e}")
    sys.exit(1)

def test_with_sender_info():
    """발신자 정보를 사용한 테스트"""
    
    # 제공된 정보
    sender_user_id = 4897202238384073231  # 발신자의 user_id
    encrypted_name = "R1Znx2lwf3K"
    expected_decrypted = "환영하는 라이언"
    
    print("=" * 60)
    print("닉네임 복호화 테스트 (발신자 정보 포함)")
    print("=" * 60)
    print(f"발신자 user_id: {sender_user_id}")
    print(f"암호화된 이름: {encrypted_name}")
    print(f"예상 복호화 결과: {expected_decrypted}")
    print("")
    print("[중요] 복호화에는 자신의 user_id (MY_USER_ID)가 필요합니다!")
    print("       발신자의 user_id가 아닙니다!")
    print("")
    
    # MY_USER_ID 후보들 (일반적인 값들)
    # 실제 값은 사용자가 제공해야 함
    my_user_id_candidates = [
        # 여기에 실제 MY_USER_ID를 입력하세요
        # 예: 429744344 (Iris에서 자주 사용되는 값)
    ]
    
    # 명령줄 인자로 MY_USER_ID 받기
    if len(sys.argv) > 1:
        try:
            my_user_id = int(sys.argv[1])
            my_user_id_candidates = [my_user_id]
            print(f"명령줄에서 MY_USER_ID 받음: {my_user_id}")
        except ValueError:
            print(f"[ERROR] 잘못된 MY_USER_ID: {sys.argv[1]}")
            return
    else:
        print("[INFO] MY_USER_ID를 인자로 제공하지 않았습니다.")
        print("사용법: python test_nickname_with_sender_id.py <MY_USER_ID>")
        print("")
        if not my_user_id_candidates:
            print("[경고] MY_USER_ID 후보가 없습니다.")
            print("다음 방법으로 확인하세요:")
            print("1. ~/my_user_id.txt 파일 확인")
            print("2. chat_logs에서 isMine=true인 메시지의 user_id 확인")
            print("3. guess_my_user_id() 함수 실행")
            return
    
    enc_candidates = list(range(0, 32))  # 0-31 전체 범위
    
    print(f"테스트할 MY_USER_ID 후보: {len(my_user_id_candidates)}개")
    print(f"테스트할 enc 범위: 0-31 (총 {len(enc_candidates)}개)")
    print("")
    
    found = False
    all_results = []
    
    for my_user_id in my_user_id_candidates:
        print(f"[테스트] MY_USER_ID={my_user_id}")
        print("-" * 60)
        
        for enc in enc_candidates:
            try:
                result = KakaoDecrypt.decrypt(my_user_id, enc, encrypted_name)
                if result and result != encrypted_name:
                    # 한글 포함 여부 확인
                    has_korean = any('\uAC00' <= c <= '\uD7A3' for c in result)
                    # 제어 문자 확인
                    has_control = any(ord(c) < 32 and c not in '\n\r\t' for c in result)
                    
                    if not has_control:
                        all_results.append((my_user_id, enc, result, has_korean))
                        status = "한글포함" if has_korean else "영문/숫자"
                        print(f"  enc={enc:2d}: '{result}' ({status})")
                        
                        if result == expected_decrypted:
                            print(f"  [SUCCESS] 정확히 일치! MY_USER_ID={my_user_id}, enc={enc}")
                            found = True
            except ValueError:
                # Invalid enc value - 무시
                pass
            except Exception as e:
                # 기타 오류 - 무시
                pass
        
        print("")
    
    print("=" * 60)
    if found:
        print("[결과] 정확히 일치하는 결과를 찾았습니다!")
    elif all_results:
        print(f"[결과] {len(all_results)}개의 유효한 복호화 결과를 찾았습니다:")
        print("")
        for my_user_id, enc, result, has_korean in all_results:
            if has_korean:
                print(f"  MY_USER_ID={my_user_id}, enc={enc}: '{result}' <- 한글 포함 (가능성 높음)")
            else:
                print(f"  MY_USER_ID={my_user_id}, enc={enc}: '{result}'")
    else:
        print("[결과] 복호화 실패 - 올바른 결과를 찾지 못했습니다.")
        print("")
        print("[가능한 원인]")
        print("1. MY_USER_ID가 잘못되었을 수 있습니다")
        print("2. DB에서 실제 enc 값을 확인해야 합니다:")
        print("   SELECT name, enc FROM db2.friends WHERE id = 4897202238384073231;")
        print("   또는")
        print("   SELECT nickname, enc FROM db2.open_chat_member WHERE user_id = 4897202238384073231;")
    print("=" * 60)

if __name__ == "__main__":
    test_with_sender_info()

