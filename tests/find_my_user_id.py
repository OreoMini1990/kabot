#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
자신의 user_id 찾기 (Iris 방식)
chat_logs에서 isMine=true인 메시지의 user_id를 찾습니다.
"""

import sqlite3
import os

# DB 경로
DB_PATH = "/data/data/com.kakao.talk/databases/KakaoTalk.db"

def find_my_user_id_iris_way():
    """Iris 방식으로 자신의 user_id 찾기"""
    try:
        if not os.path.exists(DB_PATH):
            print(f"[ERROR] DB 파일을 찾을 수 없습니다: {DB_PATH}")
            print("[INFO] Windows 환경에서는 실제 Android 기기에서 실행해야 합니다.")
            return None
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Iris 방식: isMine=true인 메시지에서 user_id 추출
        query = "SELECT user_id FROM chat_logs WHERE v LIKE '%\"isMine\":true%' ORDER BY _id DESC LIMIT 1"
        cursor.execute(query)
        result = cursor.fetchone()
        
        if result and result[0]:
            my_user_id = result[0]
            print(f"[SUCCESS] 자신의 user_id 발견: {my_user_id}")
            print("")
            print("이 user_id로 닉네임 복호화 테스트를 실행하세요:")
            print(f"  python tests/test_nickname_with_sender_id.py {my_user_id}")
            conn.close()
            return my_user_id
        else:
            print("[WARNING] 자신의 user_id를 찾을 수 없습니다.")
            print("다른 방법을 시도하세요:")
            print("1. guess_my_user_id() 함수 실행")
            print("2. 수동으로 확인")
            conn.close()
            return None
    except Exception as e:
        print(f"[ERROR] user_id 조회 실패: {e}")
        return None

if __name__ == "__main__":
    print("=" * 60)
    print("자신의 user_id 찾기 (Iris 방식)")
    print("=" * 60)
    print("")
    print("Iris는 chat_logs에서 isMine=true인 메시지의 user_id를 사용합니다.")
    print("")
    
    my_user_id = find_my_user_id_iris_way()
    
    if my_user_id:
        print("")
        print("=" * 60)
        print("다음 단계:")
        print("=" * 60)
        print(f"1. 이 user_id ({my_user_id})로 닉네임 복호화 테스트:")
        print(f"   python tests/test_nickname_with_sender_id.py {my_user_id}")
        print("")
        print("2. 또는 ~/my_user_id.txt 파일에 저장:")
        print(f"   echo '{my_user_id}' > ~/my_user_id.txt")

