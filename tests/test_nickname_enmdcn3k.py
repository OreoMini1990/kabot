#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EnmdCn3K 케이스 테스트
로그에서 실제 DB 조회 정보를 확인한 후 테스트하세요.

사용법:
  1. 실제 메시지가 들어와서 로그에 [DB조회] 정보가 나올 때까지 대기
  2. 로그에서 확인한 전체 암호화된 이름과 enc 값을 사용하여 테스트
  3. 또는 직접 DB에서 조회: python tests/test_db_lookup.py EnmdCn3K
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

def test_enmdcn3k():
    """EnmdCn3K 케이스 테스트"""
    
    # 사용자가 제공한 정보
    encrypted_name_partial = "EnmdCn3K"  # 부분 문자열 (실제 DB에는 더 긴 문자열일 수 있음)
    sender_id_str = "kxHc9v0PW0rg"
    my_user_id = 429744344  # 로그에서 확인한 MY_USER_ID
    
    print("=" * 70)
    print("EnmdCn3K 케이스 테스트")
    print("=" * 70)
    print(f"제공된 암호화된 이름 (부분): {encrypted_name_partial}")
    print(f"제공된 발신자 ID: {sender_id_str}")
    print(f"MY_USER_ID: {my_user_id}")
    print("")
    print("[주의] 실제 DB에는 더 긴 암호화된 문자열이 저장되어 있을 수 있습니다.")
    print("      로그에서 [DB조회] 항목의 전체 name 값을 확인하세요.")
    print("")
    
    # 부분 문자열로 테스트 (실패할 가능성이 높음)
    print("[테스트 1] 부분 문자열로 복호화 시도 (enc 0-31):")
    print("-" * 70)
    
    success_count = 0
    for enc in range(0, 32):
        try:
            decrypted = KakaoDecrypt.decrypt(my_user_id, enc, encrypted_name_partial)
            if decrypted and decrypted != encrypted_name_partial:
                has_control_chars = any(ord(c) < 32 and c not in '\n\r\t' for c in decrypted)
                if not has_control_chars:
                    has_korean = any('\uAC00' <= c <= '\uD7A3' for c in decrypted)
                    status = "한글포함" if has_korean else "영문/숫자"
                    print(f"  [성공] enc={enc:2d}: '{decrypted}' ({status})")
                    success_count += 1
        except ValueError:
            # Invalid enc value - 무시
            pass
        except Exception:
            # 기타 오류 - 무시
            pass
    
    if success_count == 0:
        print("  [결과] 부분 문자열로는 복호화 실패")
        print("")
        print("[해결 방법]")
        print("1. 실제 메시지가 들어올 때 로그에서 [DB조회] 정보 확인")
        print("2. DB에서 직접 조회: python tests/test_db_lookup.py EnmdCn3K")
        print("3. 로그에서 확인한 전체 암호화된 이름으로 재테스트")
    else:
        print(f"  [결과] {success_count}개의 복호화 결과 발견")
    
    print("")
    print("=" * 70)

if __name__ == "__main__":
    test_enmdcn3k()

