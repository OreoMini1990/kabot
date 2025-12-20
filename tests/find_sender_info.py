#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
발신자 정보 찾기
DB에서 암호화된 이름이나 sender_id로 실제 정보 찾기
"""

import sqlite3
import os
import sys

# DB 경로
DB_PATH = "/data/data/com.kakao.talk/databases/KakaoTalk.db"

def find_sender_info(encrypted_name=None, sender_id_str=None):
    """DB에서 발신자 정보 찾기"""
    
    if not os.path.exists(DB_PATH):
        print(f"[ERROR] DB 파일을 찾을 수 없습니다: {DB_PATH}")
        print("[INFO] Windows 환경에서는 실제 Android 기기에서 실행해야 합니다.")
        print("")
        print("[대안] Windows에서 DB 파일이 있다면:")
        print("  python -c \"import sqlite3; conn = sqlite3.connect('KakaoTalk.db'); cursor = conn.cursor(); cursor.execute('ATTACH DATABASE \\\"KakaoTalk2.db\\\" AS db2'); cursor.execute('SELECT name, enc FROM db2.friends WHERE name = ?', ('EnmdCn3K',)); print(cursor.fetchall())\"")
        return
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # db2 attach
        try:
            db2_path = "/data/data/com.kakao.talk/databases/KakaoTalk2.db"
            cursor.execute(f"ATTACH DATABASE '{db2_path}' AS db2")
        except:
            pass
        
        print("=" * 70)
        print("발신자 정보 찾기")
        print("=" * 70)
        print("")
        
        if encrypted_name:
            print(f"[검색] 암호화된 이름: {encrypted_name}")
            print("")
            
            # friends 테이블에서 찾기
            try:
                cursor.execute("SELECT id, name, enc FROM db2.friends WHERE name = ?", (encrypted_name,))
                results = cursor.fetchall()
                if results:
                    print("[발견] friends 테이블:")
                    for row in results:
                        print(f"  id={row[0]}, name={row[1]}, enc={row[2]}")
                else:
                    print("[없음] friends 테이블에서 찾을 수 없습니다.")
            except Exception as e:
                print(f"[오류] friends 테이블 조회 실패: {e}")
            
            print("")
            
            # open_chat_member 테이블에서 찾기
            try:
                cursor.execute("SELECT user_id, nickname, enc FROM db2.open_chat_member WHERE nickname = ?", (encrypted_name,))
                results = cursor.fetchall()
                if results:
                    print("[발견] open_chat_member 테이블:")
                    for row in results:
                        print(f"  user_id={row[0]}, nickname={row[1]}, enc={row[2]}")
                else:
                    print("[없음] open_chat_member 테이블에서 찾을 수 없습니다.")
            except Exception as e:
                print(f"[오류] open_chat_member 테이블 조회 실패: {e}")
        
        if sender_id_str:
            print("")
            print(f"[검색] 발신자 ID (문자열): {sender_id_str}")
            print("")
            
            # 숫자로 변환 시도
            sender_id_num = None
            try:
                sender_id_num = int(sender_id_str)
                print(f"[변환] 숫자로 변환: {sender_id_num}")
            except ValueError:
                print(f"[정보] 숫자가 아닙니다: {sender_id_str}")
                print("[정보] 이것은 일반적이지 않습니다. 다른 형태의 ID일 수 있습니다.")
            
            if sender_id_num:
                # friends 테이블에서 찾기
                try:
                    cursor.execute("SELECT id, name, enc FROM db2.friends WHERE id = ?", (sender_id_num,))
                    results = cursor.fetchall()
                    if results:
                        print("[발견] friends 테이블:")
                        for row in results:
                            print(f"  id={row[0]}, name={row[1]}, enc={row[2]}")
                    else:
                        print("[없음] friends 테이블에서 찾을 수 없습니다.")
                except Exception as e:
                    print(f"[오류] friends 테이블 조회 실패: {e}")
                
                print("")
                
                # open_chat_member 테이블에서 찾기
                try:
                    cursor.execute("SELECT user_id, nickname, enc FROM db2.open_chat_member WHERE user_id = ?", (sender_id_num,))
                    results = cursor.fetchall()
                    if results:
                        print("[발견] open_chat_member 테이블:")
                        for row in results:
                            print(f"  user_id={row[0]}, nickname={row[1]}, enc={row[2]}")
                    else:
                        print("[없음] open_chat_member 테이블에서 찾을 수 없습니다.")
                except Exception as e:
                    print(f"[오류] open_chat_member 테이블 조회 실패: {e}")
        
        print("")
        print("=" * 70)
        print("[다음 단계]")
        print("=" * 70)
        print("위에서 찾은 enc 값과 실제 MY_USER_ID로 복호화 테스트:")
        print("  python tests/test_nickname_unknown.py <MY_USER_ID>")
        print("")
        print("MY_USER_ID 찾기:")
        print("  python tests/find_my_user_id.py")
        print("  또는")
        print("  sqlite3 KakaoTalk.db \"SELECT user_id FROM chat_logs WHERE v LIKE '%\\\"isMine\\\":true%' ORDER BY _id DESC LIMIT 1\"")
        
        conn.close()
        
    except Exception as e:
        print(f"[ERROR] 조회 실패: {e}")

if __name__ == "__main__":
    encrypted_name = "EnmdCn3K"
    sender_id_str = "kxHc9v0PW0rg"
    
    if len(sys.argv) > 1:
        encrypted_name = sys.argv[1]
    if len(sys.argv) > 2:
        sender_id_str = sys.argv[2]
    
    find_sender_info(encrypted_name, sender_id_str)

