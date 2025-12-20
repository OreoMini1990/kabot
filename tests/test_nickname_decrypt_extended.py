#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
닉네임 복호화 확장 테스트
더 넓은 enc 범위를 시도하여 올바른 값 찾기
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

def test_all_enc_values(my_user_id_str):
    """모든 enc 값 시도"""
    try:
        my_user_id = int(my_user_id_str)
    except ValueError:
        print(f"[ERROR] 잘못된 MY_USER_ID: {my_user_id_str}")
        return
    
    encrypted_name = "R1Znx2lwf3K"
    expected_decrypted = "환영하는 라이언"
    
    print("=" * 60)
    print("닉네임 복호화 확장 테스트")
    print("=" * 60)
    print(f"암호화된 이름: {encrypted_name}")
    print(f"예상 복호화 결과: {expected_decrypted}")
    print(f"MY_USER_ID: {my_user_id}")
    print("")
    
    # KAKAO_PREFIXES 길이 확인 (일반적으로 32)
    # enc 유효 범위: 0 ~ len(KAKAO_PREFIXES) - 1
    valid_enc_range = list(range(0, 32))
    
    print(f"테스트할 enc 범위: 0-31 (총 {len(valid_enc_range)}개)")
    print("")
    
    found = False
    results = []
    
    for enc in valid_enc_range:
        try:
            result = KakaoDecrypt.decrypt(my_user_id, enc, encrypted_name)
            if result and result != encrypted_name:
                # 한글이 포함되어 있는지 확인
                has_korean = any('\uAC00' <= c <= '\uD7A3' for c in result)
                # 제어 문자 확인
                has_control = any(ord(c) < 32 and c not in '\n\r\t' for c in result)
                
                if not has_control:
                    results.append((enc, result, has_korean))
                    print(f"enc={enc:2d}: '{result}' (한글: {'YES' if has_korean else 'NO'})")
                    
                    if result == expected_decrypted:
                        print(f"  [SUCCESS] 정확히 일치! enc={enc}")
                        found = True
        except ValueError as e:
            # Invalid enc value - 무시
            pass
        except Exception as e:
            # 기타 오류 - 무시
            pass
    
    print("")
    print("=" * 60)
    if found:
        print("[결과] 정확히 일치하는 결과를 찾았습니다!")
    elif results:
        print(f"[결과] {len(results)}개의 유효한 복호화 결과를 찾았습니다:")
        print("")
        for enc, result, has_korean in results:
            if has_korean:
                print(f"  enc={enc}: '{result}' <- 한글 포함 (가능성 높음)")
            else:
                print(f"  enc={enc}: '{result}'")
    else:
        print("[결과] 복호화 실패 - 올바른 결과를 찾지 못했습니다.")
        print("")
        print("[가능한 원인]")
        print("1. MY_USER_ID가 잘못되었을 수 있습니다")
        print("2. 암호화된 이름이 예상과 다를 수 있습니다")
        print("3. DB에서 직접 enc 값을 확인해보세요:")
        print("   SELECT name, enc FROM db2.friends WHERE name = 'R1Znx2lwf3K'")
        print("   또는")
        print("   SELECT nickname, enc FROM db2.open_chat_member WHERE nickname = 'R1Znx2lwf3K'")
    print("=" * 60)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        test_all_enc_values(sys.argv[1])
    else:
        print("사용법: python test_nickname_decrypt_extended.py <MY_USER_ID>")
        print("예시: python test_nickname_decrypt_extended.py 4897202238384073231")

