#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
닉네임 복호화 테스트 (예상값 없음)
발신자 정보:
  - 암호화된 이름: EnmdCn3K
  - 발신자 user_id: kxHc9v0PW0rg (문자열로 보이지만 숫자일 수도 있음)

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

def test_unknown_nickname():
    """예상값 없이 모든 가능한 결과 출력"""
    
    # 제공된 정보
    sender_user_id_str = "kxHc9v0PW0rg"  # 발신자 user_id (문자열로 보임)
    encrypted_name = "EnmdCn3K"
    
    print("=" * 70)
    print("닉네임 복호화 테스트 (예상값 없음)")
    print("=" * 70)
    print(f"발신자 user_id (문자열): {sender_user_id_str}")
    print(f"암호화된 이름: {encrypted_name}")
    print("")
    print("[중요] 복호화에는 자신의 user_id (MY_USER_ID)가 필요합니다!")
    print("       발신자의 user_id가 아닙니다!")
    print("")
    
    # 발신자 user_id가 숫자로 변환 가능한지 확인
    sender_user_id_num = None
    try:
        # 숫자로 변환 시도
        sender_user_id_num = int(sender_user_id_str)
        print(f"[INFO] 발신자 user_id를 숫자로 변환: {sender_user_id_num}")
    except ValueError:
        print(f"[INFO] 발신자 user_id는 숫자가 아닙니다: {sender_user_id_str}")
        print("[INFO] 이것은 일반적이지 않습니다. 실제 DB에서 확인이 필요합니다.")
    
    # MY_USER_ID 후보들
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
        # 일반적인 후보들 (더 많은 후보 시도)
        common_candidates = [
            429744344,  # Iris에서 자주 사용되는 값
            100000000,  # 일반적인 작은 값
            500000000,  # 중간 값
            1000000000, # 큰 값
        ]
        
        # 발신자 user_id가 숫자라면, 그것보다 작은 값들도 시도
        if sender_user_id_num:
            # 발신자 user_id의 1/10, 1/100, 1/1000 값 시도
            for divisor in [10, 100, 1000, 10000]:
                candidate = sender_user_id_num // divisor
                if candidate > 1000 and candidate not in common_candidates:
                    common_candidates.append(candidate)
        
        my_user_id_candidates = common_candidates
        print(f"일반적인 MY_USER_ID 후보들 시도: {common_candidates}")
        print("")
        print("[참고] 더 정확한 결과를 원하면 실제 MY_USER_ID를 인자로 제공하세요:")
        print("  python test_nickname_unknown.py <MY_USER_ID>")
        print("")
    
    enc_candidates = list(range(0, 32))  # 0-31 전체 범위
    
    print(f"테스트할 MY_USER_ID 후보: {len(my_user_id_candidates)}개")
    print(f"테스트할 enc 범위: 0-31 (총 {len(enc_candidates)}개)")
    print("")
    
    all_results = []
    korean_results = []
    valid_results = []
    
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
                        
                        # 유효한 결과인지 확인 (한글이 있거나 의미있는 텍스트)
                        if has_korean or (len(result) > 1 and result.isprintable()):
                            valid_results.append((my_user_id, enc, result, has_korean))
                            print(f"{marker} enc={enc:2d}: '{result}' ({status})")
            except ValueError:
                # Invalid enc value - 무시
                pass
            except Exception as e:
                # 기타 오류 - 무시
                pass
        
        print("")
    
    print("=" * 70)
    print("[결과 요약]")
    print("=" * 70)
    
    if korean_results:
        print(f"[한글 포함 결과] {len(korean_results)}개 (가장 가능성 높음):")
        print("")
        for my_user_id, enc, result in korean_results:
            print(f"  MY_USER_ID={my_user_id}, enc={enc}: '{result}'")
        print("")
    
    if valid_results and not korean_results:
        print(f"[유효한 결과] {len(valid_results)}개:")
        print("")
        for my_user_id, enc, result, has_korean in valid_results[:20]:  # 최대 20개
            print(f"  MY_USER_ID={my_user_id}, enc={enc}: '{result}'")
        print("")
    
    if all_results:
        print(f"[전체 결과] {len(all_results)}개의 복호화 결과를 찾았습니다.")
        if korean_results:
            print("")
            print("[추천] 한글 포함 결과가 가장 가능성이 높습니다.")
            print("       위의 한글 포함 결과 중 하나가 정답일 가능성이 높습니다.")
    else:
        print("[결과] 복호화 실패 - 올바른 결과를 찾지 못했습니다.")
        print("")
        print("[가능한 원인]")
        print("1. MY_USER_ID가 잘못되었을 수 있습니다")
        print("2. DB에서 실제 enc 값을 확인해야 합니다:")
        if sender_user_id_num:
            print(f"   SELECT name, enc FROM db2.friends WHERE id = {sender_user_id_num};")
            print(f"   또는")
            print(f"   SELECT nickname, enc FROM db2.open_chat_member WHERE user_id = {sender_user_id_num};")
        else:
            print(f"   SELECT name, enc FROM db2.friends WHERE name = '{encrypted_name}';")
            print(f"   또는")
            print(f"   SELECT nickname, enc FROM db2.open_chat_member WHERE nickname = '{encrypted_name}';")
        print("")
        print("3. 다른 MY_USER_ID 후보 시도:")
        print("   - 일반적으로 자신의 user_id는 발신자 user_id보다 작은 값입니다")
        print("   - Iris는 chat_logs에서 isMine=true인 메시지의 user_id를 사용합니다")
    print("=" * 70)

if __name__ == "__main__":
    test_unknown_nickname()

