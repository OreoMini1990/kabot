#!/usr/bin/env python3
"""
채팅방 이름 조회 및 복호화 테스트 스크립트
Iris 코드를 참고하여 정확하게 구현
"""
import sqlite3
import json
import sys
import os

# kakaodecrypt 모듈 import
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'client'))
from kakaodecrypt import KakaoDecrypt

# 카카오톡 DB 경로
# PC 로컬 테스트: DB 파일을 PC로 복사한 후 경로 지정
# Android 기기: /data/data/com.kakao.talk/databases/KakaoTalk.db
import os
import sys

# 명령줄 인자로 DB 경로 받기
if len(sys.argv) > 1 and sys.argv[1].endswith('.db'):
    DB_PATH = sys.argv[1]
    print(f"[정보] DB 경로를 명령줄 인자로 받음: {DB_PATH}")
    # chat_id는 다음 인자
    sys.argv = [sys.argv[0]] + sys.argv[2:]
else:
    DB_PATH = os.environ.get("KAKAO_DB_PATH", None)
    if not DB_PATH:
        # 기본 경로들 시도
        possible_paths = [
            "./KakaoTalk.db",
            "./KakaoTalk.db.backup",
            "C:/Users/Public/KakaoTalk.db",
            "/data/data/com.kakao.talk/databases/KakaoTalk.db"
        ]
        for path in possible_paths:
            if os.path.exists(path):
                DB_PATH = path
                print(f"[정보] DB 경로 자동 발견: {DB_PATH}")
                break
        
        if not DB_PATH:
            print("[오류] DB 경로를 찾을 수 없습니다.")
            print("[사용법] python3 test_room_name.py [DB_PATH] [chat_id]")
            print("[예시] python3 test_room_name.py ./KakaoTalk.db 18469584418690487")
            print("[또는] export KAKAO_DB_PATH=./KakaoTalk.db")
            sys.exit(1)

def get_my_user_id():
    """자신의 user_id 조회 (Iris 방식)"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Iris 방식: isMine=true인 메시지에서 user_id 추출
        cursor.execute("SELECT user_id FROM chat_logs WHERE v LIKE '%\"isMine\":true%' ORDER BY _id DESC LIMIT 1")
        result = cursor.fetchone()
        
        if result and result[0]:
            my_user_id = result[0]
            print(f"[정보] 자신의 user_id: {my_user_id}")
            conn.close()
            return my_user_id
        else:
            print("[경고] 자신의 user_id를 찾을 수 없습니다.")
            conn.close()
            return None
    except Exception as e:
        print(f"[오류] user_id 조회 실패: {e}")
        return None

def get_chat_room_name_iris_way(chat_id, my_user_id):
    """
    Iris 방식으로 채팅방 이름 조회 및 복호화
    KakaoDB.kt의 getChatInfo() 함수와 동일한 로직
    """
    print(f"\n{'='*60}")
    print(f"[테스트] 채팅방 이름 조회: chat_id={chat_id}")
    print(f"{'='*60}")
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 방법 1: private_meta에서 name 추출 (Iris 방식)
        print(f"\n[방법 1] private_meta 조회 시도")
        try:
            cursor.execute("SELECT private_meta FROM chat_rooms WHERE id = ?", (chat_id,))
            result = cursor.fetchone()
            
            if result and result[0]:
                private_meta_str = result[0]
                print(f"[방법 1] private_meta 조회 성공: 길이={len(private_meta_str)}")
                print(f"[방법 1] private_meta 내용 (처음 200자): {private_meta_str[:200]}")
                
                try:
                    # JSON 파싱
                    private_meta = json.loads(private_meta_str)
                    print(f"[방법 1] JSON 파싱 성공: 키={list(private_meta.keys()) if isinstance(private_meta, dict) else 'N/A'}")
                    
                    name_element = private_meta.get('name')
                    print(f"[방법 1] name 필드 추출: name_element={name_element}, 타입={type(name_element)}")
                    
                    if name_element is not None:
                        # Iris: name.jsonPrimitive.content
                        # Python에서는 name이 문자열이면 그대로 사용, dict면 content 추출
                        if isinstance(name_element, str):
                            room_name_raw = name_element
                        elif isinstance(name_element, dict):
                            room_name_raw = name_element.get('content') or name_element.get('value') or str(name_element)
                        else:
                            room_name_raw = str(name_element)
                        
                        print(f"[방법 1] room_name_raw 추출: {room_name_raw}, 타입={type(room_name_raw)}, 길이={len(room_name_raw) if isinstance(room_name_raw, str) else 'N/A'}")
                        
                        # base64로 보이는지 확인
                        is_base64_like = (isinstance(room_name_raw, str) and 
                                         len(room_name_raw) > 10 and 
                                         len(room_name_raw) % 4 == 0 and
                                         all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=' for c in room_name_raw))
                        
                        if is_base64_like:
                            print(f"[방법 1] 채팅방 이름이 암호화된 것으로 확인됨 (base64 형태)")
                            
                            # 복호화 시도
                            # enc 후보: private_meta에서 enc 추출 시도
                            enc_candidates = [31, 32, 30]
                            if 'enc' in private_meta:
                                enc_from_meta = private_meta['enc']
                                if isinstance(enc_from_meta, (int, str)):
                                    enc_candidates.insert(0, int(enc_from_meta))
                                    print(f"[방법 1] private_meta에서 enc 추출: {enc_from_meta}")
                            
                            print(f"[방법 1] 복호화 시도: user_id={my_user_id}, enc 후보={enc_candidates}")
                            
                            for enc_try in enc_candidates:
                                try:
                                    decrypted = KakaoDecrypt.decrypt(my_user_id, enc_try, room_name_raw)
                                    if decrypted and decrypted != room_name_raw:
                                        # 유효한 텍스트인지 확인
                                        has_control_chars = any(ord(c) < 32 and c not in '\n\r\t' for c in decrypted)
                                        if not has_control_chars:
                                            print(f"[✓ 방법 1] 채팅방 이름 복호화 성공!")
                                            print(f"  - enc: {enc_try}")
                                            print(f"  - 복호화된 이름: \"{decrypted}\"")
                                            conn.close()
                                            return decrypted
                                        else:
                                            print(f"[방법 1] 복호화 결과가 제어 문자 포함: enc={enc_try}")
                                    else:
                                        print(f"[방법 1] 복호화 실패: enc={enc_try}, 결과={decrypted}")
                                except Exception as e:
                                    print(f"[방법 1] 복호화 예외 (enc={enc_try}): {e}")
                            
                            print(f"[방법 1] 모든 enc 시도 실패, 원본 반환: \"{room_name_raw}\"")
                            conn.close()
                            return room_name_raw
                        else:
                            # 암호화되지 않은 일반 텍스트
                            print(f"[방법 1] 채팅방 이름 (일반 텍스트): \"{room_name_raw}\"")
                            conn.close()
                            return room_name_raw
                    else:
                        print(f"[방법 1] private_meta에 name 필드가 없음")
                except json.JSONDecodeError as e:
                    print(f"[방법 1] JSON 파싱 실패: {e}")
            else:
                print(f"[방법 1] private_meta 조회 결과 없음 또는 NULL")
        except Exception as e:
            print(f"[방법 1] 오류: {e}")
            import traceback
            traceback.print_exc()
        
        # 방법 2: open_link 테이블 확인 (Iris 방식)
        print(f"\n[방법 2] open_link 테이블 조회 시도")
        try:
            # KakaoTalk2.db attach 확인 필요하지만, 일단 직접 조회 시도
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='open_link'")
            if cursor.fetchone():
                cursor.execute("SELECT name FROM open_link WHERE id = (SELECT link_id FROM chat_rooms WHERE id = ?)", (chat_id,))
                result = cursor.fetchone()
                if result and result[0]:
                    room_name = result[0]
                    print(f"[✓ 방법 2] 채팅방 이름 조회 성공 (open_link): \"{room_name}\"")
                    conn.close()
                    return room_name
            else:
                print(f"[방법 2] open_link 테이블이 없음")
        except Exception as e:
            print(f"[방법 2] 오류: {e}")
        
        # 방법 3: 직접 name 컬럼 확인
        print(f"\n[방법 3] chat_rooms.name 컬럼 조회 시도")
        try:
            cursor.execute("SELECT name FROM chat_rooms WHERE id = ?", (chat_id,))
            result = cursor.fetchone()
            if result and result[0]:
                room_name = result[0]
                print(f"[방법 3] chat_rooms.name 조회: \"{room_name}\"")
                conn.close()
                return room_name
        except Exception as e:
            print(f"[방법 3] 오류: {e}")
        
        conn.close()
        print(f"\n[✗] 모든 방법 실패: 채팅방 이름을 찾을 수 없음")
        return None
        
    except Exception as e:
        print(f"[오류] 채팅방 이름 조회 실패: {e}")
        import traceback
        traceback.print_exc()
        return None

def test_with_chat_id(chat_id):
    """특정 chat_id로 테스트"""
    print(f"\n{'='*60}")
    print(f"[테스트 시작] chat_id={chat_id}")
    print(f"{'='*60}")
    
    # 자신의 user_id 조회
    my_user_id = get_my_user_id()
    if not my_user_id:
        print("[오류] 자신의 user_id를 찾을 수 없어 테스트를 진행할 수 없습니다.")
        return
    
    # 채팅방 이름 조회 및 복호화
    room_name = get_chat_room_name_iris_way(chat_id, my_user_id)
    
    print(f"\n{'='*60}")
    print(f"[테스트 결과]")
    print(f"  - chat_id: {chat_id}")
    print(f"  - my_user_id: {my_user_id}")
    print(f"  - room_name: \"{room_name}\"")
    print(f"  - \"의운모\" 매칭: {room_name == '의운모' if room_name else False}")
    print(f"{'='*60}\n")

def test_with_recent_messages():
    """최근 메시지들의 chat_id로 테스트"""
    print(f"\n{'='*60}")
    print(f"[테스트] 최근 메시지들의 chat_id로 테스트")
    print(f"{'='*60}")
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 최근 10개 메시지의 chat_id 조회
        cursor.execute("SELECT DISTINCT chat_id FROM chat_logs ORDER BY _id DESC LIMIT 10")
        chat_ids = [row[0] for row in cursor.fetchall()]
        
        conn.close()
        
        print(f"[정보] 발견된 chat_id 개수: {len(chat_ids)}")
        
        # 자신의 user_id 조회
        my_user_id = get_my_user_id()
        if not my_user_id:
            print("[오류] 자신의 user_id를 찾을 수 없어 테스트를 진행할 수 없습니다.")
            return
        
        # 각 chat_id로 테스트
        for chat_id in chat_ids:
            room_name = get_chat_room_name_iris_way(chat_id, my_user_id)
            print(f"\n[결과] chat_id={chat_id} -> room_name=\"{room_name}\"")
            if room_name == '의운모':
                print(f"[✓] '의운모' 채팅방 발견! chat_id={chat_id}")
        
    except Exception as e:
        print(f"[오류] 테스트 실패: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print(f"[정보] 사용 중인 DB 경로: {DB_PATH}")
    
    if not os.path.exists(DB_PATH):
        print(f"[오류] DB 파일을 찾을 수 없습니다: {DB_PATH}")
        print("[사용법] python3 test_room_name.py [DB_PATH] [chat_id]")
        print("[예시] python3 test_room_name.py ./KakaoTalk.db 18469584418690487")
        sys.exit(1)
    
    if len(sys.argv) > 1:
        # 특정 chat_id로 테스트
        chat_id = sys.argv[1]
        try:
            chat_id = int(chat_id)
            test_with_chat_id(chat_id)
        except ValueError:
            print(f"[오류] 잘못된 chat_id 형식: {chat_id}")
            print("[사용법] python3 test_room_name.py [DB_PATH] [chat_id]")
            print("[예시] python3 test_room_name.py ./KakaoTalk.db 18469584418690487")
    else:
        # 최근 메시지들로 테스트
        test_with_recent_messages()

