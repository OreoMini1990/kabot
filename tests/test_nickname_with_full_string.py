#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
실제 DB에서 조회한 전체 암호화된 이름으로 복호화 테스트
로그에서 확인한 정보:
  - user_id: 4897202238384073231
  - 암호화된 이름 (전체): R1Znx2lwf3K/2e+WAtA1UAH30GbjviPEfvKZ84iiqdE=
  - enc: 31
  - MY_USER_ID: 429744344
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

def test_full_encrypted_name():
    """실제 DB에서 조회한 전체 암호화된 이름으로 복호화 테스트"""
    
    # 로그에서 확인한 실제 정보
    sender_user_id = 4897202238384073231
    encrypted_name_full = "R1Znx2lwf3K/2e+WAtA1UAH30GbjviPEfvKZ84iiqdE="  # 실제 DB에서 조회한 전체 문자열
    encrypted_name_partial = "R1Znx2lwf3K"  # 사용자가 제공한 부분 문자열
    enc_from_db = 31
    my_user_id = 429744344
    
    print("=" * 70)
    print("실제 DB 조회 정보로 복호화 테스트")
    print("=" * 70)
    print(f"발신자 user_id: {sender_user_id}")
    print(f"암호화된 이름 (전체): {encrypted_name_full}")
    print(f"암호화된 이름 (부분): {encrypted_name_partial}")
    print(f"DB에서 조회한 enc: {enc_from_db}")
    print(f"MY_USER_ID: {my_user_id}")
    print("")
    print("[테스트 1] 전체 문자열로 복호화:")
    print("-" * 70)
    
    # 전체 문자열로 테스트
    test_decrypt(encrypted_name_full, enc_from_db, my_user_id, "전체 문자열")
    
    print("")
    print("[테스트 2] 부분 문자열로 복호화:")
    print("-" * 70)
    
    # 부분 문자열로 테스트
    test_decrypt(encrypted_name_partial, enc_from_db, my_user_id, "부분 문자열")
    
    print("")
    print("[테스트 3] 다른 enc 값으로 테스트 (전체 문자열):")
    print("-" * 70)
    
    # 다른 enc 값들로도 시도
    for enc_try in [30, 32, 0]:
        test_decrypt(encrypted_name_full, enc_try, my_user_id, f"enc={enc_try}")
    
    print("")
    print("=" * 70)
    print("[결론]")
    print("=" * 70)
    print("실제 DB에서 조회한 전체 암호화된 이름을 사용해야 합니다.")
    print("사용자가 제공한 부분 문자열만으로는 복호화가 실패할 수 있습니다.")

def test_decrypt(encrypted_name, enc, my_user_id, test_name):
    """복호화 테스트"""
    print(f"\n[{test_name}] enc={enc}, MY_USER_ID={my_user_id}")
    try:
        decrypted = KakaoDecrypt.decrypt(my_user_id, enc, encrypted_name)
        if decrypted and decrypted != encrypted_name:
            # 유효한 텍스트인지 확인
            has_control_chars = any(ord(c) < 32 and c not in '\n\r\t' for c in decrypted)
            if not has_control_chars:
                has_korean = any('\uAC00' <= c <= '\uD7A3' for c in decrypted)
                status = "한글포함" if has_korean else "영문/숫자"
                print(f"  [성공] '{decrypted}' ({status})")
                return decrypted
            else:
                print(f"  [실패] 제어 문자 포함: {decrypted[:50]}")
        else:
            print(f"  [실패] 복호화 결과가 원본과 같거나 None")
    except Exception as e:
        print(f"  [오류] {e}")
    return None

if __name__ == "__main__":
    test_full_encrypted_name()

