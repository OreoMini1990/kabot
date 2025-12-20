#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
종합 닉네임 복호화 테스트
발신자 정보를 기반으로 여러 MY_USER_ID 후보를 테스트합니다.

발신자 정보:
  - user_id: 4897202238384073231
  - 암호화된 이름: R1Znx2lwf3K
  - 예상 결과: 환영하는 라이언
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

def test_comprehensive():
    """종합 테스트"""
    
    # 제공된 정보
    sender_user_id = 4897202238384073231  # 발신자의 user_id
    encrypted_name = "R1Znx2lwf3K"
    expected_decrypted = "환영하는 라이언"
    
    print("=" * 70)
    print("종합 닉네임 복호화 테스트")
    print("=" * 70)
    print(f"발신자 user_id: {sender_user_id}")
    print(f"암호화된 이름: {encrypted_name}")
    print(f"예상 복호화 결과: {expected_decrypted}")
    print("")
    print("[중요] 복호화에는 자신의 user_id (MY_USER_ID)가 필요합니다!")
    print("       발신자의 user_id (4897202238384073231)가 아닙니다!")
    print("")
    
    # MY_USER_ID 후보들
    # 일반적으로 자신의 user_id는 발신자 user_id보다 작은 값입니다
    # Iris는 chat_logs에서 isMine=true인 메시지의 user_id를 사용합니다
    my_user_id_candidates = []
    
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
        # 일반적인 후보들 (발신자 user_id보다 작은 값들)
        # 실제 값은 사용자가 제공해야 함
        print("[INFO] MY_USER_ID를 인자로 제공하지 않았습니다.")
        print("")
        print("일반적인 MY_USER_ID 후보들 시도:")
        common_candidates = [
            429744344,  # Iris에서 자주 사용되는 값
            # 더 많은 후보는 사용자가 제공해야 함
        ]
        
        if common_candidates:
            my_user_id_candidates = common_candidates
            print(f"  {common_candidates}")
        else:
            print("  (후보 없음 - 명령줄에서 제공 필요)")
            print("")
            print("사용법: python test_nickname_comprehensive.py <MY_USER_ID>")
            print("예시: python test_nickname_comprehensive.py 429744344")
            return
    
    enc_candidates = list(range(0, 32))  # 0-31 전체 범위
    
    print(f"테스트할 MY_USER_ID 후보: {len(my_user_id_candidates)}개")
    print(f"테스트할 enc 범위: 0-31 (총 {len(enc_candidates)}개)")
    print("")
    
    found = False
    all_results = []
    korean_results = []
    
    for my_user_id in my_user_id_candidates:
        print(f"[테스트] MY_USER_ID={my_user_id}")
        print("-" * 70)
        
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
                        if has_korean:
                            korean_results.append((my_user_id, enc, result))
                            status = "한글포함"
                            marker = "***"
                        else:
                            status = "영문/숫자"
                            marker = "   "
                        
                        print(f"{marker} enc={enc:2d}: '{result}' ({status})")
                        
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
    
    print("=" * 70)
    if found:
        print("[결과] 정확히 일치하는 결과를 찾았습니다!")
        print("")
        print("해결 방법:")
        for my_user_id, enc, result, has_korean in all_results:
            if result == expected_decrypted:
                print(f"  MY_USER_ID={my_user_id}, enc={enc} 사용")
                print(f"  ~/my_user_id.txt 파일에 저장: echo '{my_user_id}' > ~/my_user_id.txt")
    elif korean_results:
        print(f"[결과] {len(korean_results)}개의 한글 포함 결과를 찾았습니다:")
        print("")
        for my_user_id, enc, result in korean_results:
            print(f"  MY_USER_ID={my_user_id}, enc={enc}: '{result}'")
            # "라이언" 또는 "환영"이 포함되어 있으면 강조
            if "라이언" in result or "환영" in result:
                print(f"    <- 이 결과가 정답일 가능성이 매우 높습니다!")
    elif all_results:
        print(f"[결과] {len(all_results)}개의 유효한 복호화 결과를 찾았습니다:")
        print("")
        for my_user_id, enc, result, has_korean in all_results[:10]:  # 최대 10개만
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
        print("")
        print("3. 다른 MY_USER_ID 후보 시도:")
        print("   - 일반적으로 자신의 user_id는 발신자 user_id보다 작은 값입니다")
        print("   - Iris는 chat_logs에서 isMine=true인 메시지의 user_id를 사용합니다")
    print("=" * 70)

if __name__ == "__main__":
    test_comprehensive()

