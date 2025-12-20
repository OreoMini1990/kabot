#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DB에서 암호화된 이름이나 user_id로 정보 조회
실제 로그를 찍어서 테스트할 DB 정보를 가져옴
"""

import sys
import os
import sqlite3

# DB 경로
DB_PATH = "/data/data/com.kakao.talk/databases/KakaoTalk.db"
DB_PATH2 = "/data/data/com.kakao.talk/databases/KakaoTalk2.db"

def lookup_by_encrypted_name(encrypted_name):
    """암호화된 이름으로 DB에서 정보 찾기"""
    print("=" * 70)
    print(f"암호화된 이름으로 조회: {encrypted_name}")
    print("=" * 70)
    print("")
    
    if not os.path.exists(DB_PATH):
        print(f"[ERROR] DB 파일을 찾을 수 없습니다: {DB_PATH}")
        print("[INFO] Android 기기에서 실행하거나 DB 파일 경로를 수정하세요.")
        return
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # db2 attach
        db2_attached = False
        if os.path.exists(DB_PATH2):
            try:
                cursor.execute(f"ATTACH DATABASE '{DB_PATH2}' AS db2")
                db2_attached = True
                print("[OK] db2 attach 성공")
            except Exception as e:
                print(f"[ERROR] db2 attach 실패: {e}")
        else:
            print(f"[WARNING] DB_PATH2 파일을 찾을 수 없습니다: {DB_PATH2}")
        
        print("")
        
        if db2_attached:
            # friends 테이블에서 찾기
            print("[1] friends 테이블 조회:")
            try:
                cursor.execute("SELECT id, name, enc FROM db2.friends WHERE name = ?", (encrypted_name,))
                results = cursor.fetchall()
                if results:
                    for row in results:
                        user_id, name, enc = row
                        print(f"  [발견] user_id={user_id}, name={name}, enc={enc}")
                else:
                    print("  [없음] friends 테이블에서 찾을 수 없습니다.")
            except Exception as e:
                print(f"  [오류] {e}")
            
            print("")
            
            # open_chat_member 테이블에서 찾기
            print("[2] open_chat_member 테이블 조회:")
            try:
                cursor.execute("SELECT user_id, nickname, enc FROM db2.open_chat_member WHERE nickname = ?", (encrypted_name,))
                results = cursor.fetchall()
                if results:
                    for row in results:
                        user_id, nickname, enc = row
                        print(f"  [발견] user_id={user_id}, nickname={nickname}, enc={enc}")
                else:
                    print("  [없음] open_chat_member 테이블에서 찾을 수 없습니다.")
            except Exception as e:
                print(f"  [오류] {e}")
            
            print("")
            
            # 유사한 이름으로도 검색 (부분 일치)
            print("[3] 유사한 이름 검색 (처음 10자리):")
            try:
                partial_name = encrypted_name[:10] if len(encrypted_name) >= 10 else encrypted_name
                cursor.execute("SELECT id, name, enc FROM db2.friends WHERE name LIKE ? LIMIT 5", (f"{partial_name}%",))
                results = cursor.fetchall()
                if results:
                    for row in results:
                        user_id, name, enc = row
                        print(f"  [발견] user_id={user_id}, name={name}, enc={enc}")
                else:
                    print("  [없음] 유사한 이름을 찾을 수 없습니다.")
            except Exception as e:
                print(f"  [오류] {e}")
        
        print("")
        print("=" * 70)
        
        conn.close()
        
    except Exception as e:
        print(f"[ERROR] 조회 실패: {e}")
        import traceback
        traceback.print_exc()

def lookup_by_user_id(user_id_str):
    """user_id로 DB에서 정보 찾기"""
    print("=" * 70)
    print(f"user_id로 조회: {user_id_str}")
    print("=" * 70)
    print("")
    
    # 숫자로 변환 시도
    user_id_num = None
    try:
        user_id_num = int(user_id_str)
        print(f"[INFO] 숫자로 변환: {user_id_num}")
    except ValueError:
        print(f"[INFO] 숫자가 아닙니다: {user_id_str}")
        print("[INFO] 문자열 그대로 조회를 시도합니다.")
    
    if not os.path.exists(DB_PATH):
        print(f"[ERROR] DB 파일을 찾을 수 없습니다: {DB_PATH}")
        print("[INFO] Android 기기에서 실행하거나 DB 파일 경로를 수정하세요.")
        return
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # db2 attach
        db2_attached = False
        if os.path.exists(DB_PATH2):
            try:
                cursor.execute(f"ATTACH DATABASE '{DB_PATH2}' AS db2")
                db2_attached = True
                print("[OK] db2 attach 성공")
            except Exception as e:
                print(f"[ERROR] db2 attach 실패: {e}")
        
        print("")
        
        if db2_attached and user_id_num:
            # friends 테이블에서 찾기
            print("[1] friends 테이블 조회:")
            try:
                cursor.execute("SELECT id, name, enc FROM db2.friends WHERE id = ?", (user_id_num,))
                result = cursor.fetchone()
                if result:
                    user_id, name, enc = result
                    print(f"  [발견] user_id={user_id}, name={name}, enc={enc}")
                else:
                    print("  [없음] friends 테이블에서 찾을 수 없습니다.")
            except Exception as e:
                print(f"  [오류] {e}")
            
            print("")
            
            # open_chat_member 테이블에서 찾기
            print("[2] open_chat_member 테이블 조회:")
            try:
                cursor.execute("SELECT user_id, nickname, enc FROM db2.open_chat_member WHERE user_id = ?", (user_id_num,))
                results = cursor.fetchall()
                if results:
                    for row in results:
                        user_id, nickname, enc = row
                        print(f"  [발견] user_id={user_id}, nickname={nickname}, enc={enc}")
                else:
                    print("  [없음] open_chat_member 테이블에서 찾을 수 없습니다.")
            except Exception as e:
                print(f"  [오류] {e}")
        
        print("")
        print("=" * 70)
        
        conn.close()
        
    except Exception as e:
        print(f"[ERROR] 조회 실패: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    # 테스트 케이스
    encrypted_name = "EnmdCn3K"
    sender_id = "kxHc9v0PW0rg"
    
    if len(sys.argv) > 1:
        # 첫 번째 인자가 암호화된 이름인지 user_id인지 판단
        arg = sys.argv[1]
        if arg.startswith("k") or arg.startswith("R") or (len(arg) > 10 and not arg.isdigit()):
            # 암호화된 이름으로 보임
            encrypted_name = arg
            lookup_by_encrypted_name(encrypted_name)
        else:
            # user_id로 보임
            lookup_by_user_id(arg)
    else:
        # 기본값으로 둘 다 조회
        print("\n" + "="*70)
        print("기본 테스트 케이스")
        print("="*70 + "\n")
        
        lookup_by_encrypted_name(encrypted_name)
        print("\n")
        lookup_by_user_id(sender_id)

