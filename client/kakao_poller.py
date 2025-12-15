#!/usr/bin/env python3
"""
카카오톡 메시지 폴링 스크립트
카카오톡 DB를 직접 폴링하여 서버로 메시지 전송 (WebSocket 사용)
자체 복호화 로직 사용 (Iris KakaoDecrypt.kt 기반)
"""
import sqlite3
import time
import json
import os
import threading
from datetime import datetime
import base64
import hashlib

# 필수 의존성: websocket (WebSocket 통신용)
try:
    import websocket
    WEBSOCKET_AVAILABLE = True
except ImportError:
    WEBSOCKET_AVAILABLE = False
    print("[오류] websocket 모듈이 설치되지 않았습니다.")
    print("[설치] pip install websocket-client")
    print("[참고] 이 모듈은 WebSocket 통신에 필수입니다.")
    exit(1)

# 자체 복호화 라이브러리 (테스트된 kakaodecrypt 모듈 사용)
try:
    from Crypto.Cipher import AES
    CRYPTO_AVAILABLE = True
except ImportError:
    CRYPTO_AVAILABLE = False
    print("[경고] pycryptodome이 설치되지 않았습니다. 암호화된 메시지 복호화가 제한됩니다.")
    print("[설치] pip install pycryptodome")

# 테스트된 복호화 모듈 import (kakaodecrypt.py)
try:
    import sys
    import os
    # 현재 스크립트 디렉토리를 경로에 추가
    script_dir = os.path.dirname(os.path.abspath(__file__))
    if script_dir not in sys.path:
        sys.path.insert(0, script_dir)
    from kakaodecrypt import KakaoDecrypt
    KAKAODECRYPT_AVAILABLE = True
except ImportError as e:
    KAKAODECRYPT_AVAILABLE = False
    print(f"[경고] kakaodecrypt 모듈을 로드할 수 없습니다: {e}")
    print("[정보] 자체 구현 복호화 로직을 사용합니다.")

# 카카오톡 DB 경로 (하율 패치로 접근 가능)
DB_PATH = "/data/data/com.kakao.talk/databases/KakaoTalk.db"
# 서버 URL (WebSocket)
WS_URL = "ws://211.218.42.222:5002/ws"
HTTP_URL = "http://211.218.42.222:5002"
# Iris 서버 사용 안 함 - 자체 코드로 카카오톡 메시지 전송

# 마지막 처리한 메시지 ID 추적 (파일로 저장)
STATE_FILE = os.path.expanduser("~/last_message_id.txt")
# 자신의 user_id 저장 (복호화에 사용)
MY_USER_ID_FILE = os.path.expanduser("~/my_user_id.txt")
MY_USER_ID = None
# 전송한 메시지 ID 추적 (중복 방지)
sent_message_ids = set()

# 복호화 관련 설정
# 카카오톡 Android 복호화 로직 (Iris KakaoDecrypt.kt 기반)
# - IV: 고정된 바이트 배열
# - PASSWORD: 고정된 char 배열
# - Salt: userId + encType 기반 (incept(830819) for encType=31)
# - PKCS12 키 유도 (SHA-1, 2 iterations, 256-bit key)
# - AES/CBC/NoPadding 복호화 후 수동 패딩 제거
DECRYPT_ENABLED = CRYPTO_AVAILABLE

# 카카오톡 복호화 상수 (Java 코드에서 가져옴)
# IV: signed byte 배열을 unsigned로 변환 (-36 -> 220, -11 -> 245, -32 -> 224, -31 -> 225)
KAKAO_IV = bytes([15, 8, 1, 0, 25, 71, 37, 220, 21, 245, 23, 224, 225, 21, 12, 53])
KAKAO_PASSWORD = bytes([22, 8, 9, 111, 2, 23, 43, 8, 33, 33, 10, 16, 3, 3, 7, 6])

def incept(n):
    """
    Reimplementation of com.kakao.talk.dream.Projector.incept() from libdream.so
    encType 31 (실제로는 830819)에 대한 특별한 처리
    """
    dict1 = ['adrp.ldrsh.ldnp', 'ldpsw', 'umax', 'stnp.rsubhn', 'sqdmlsl', 'uqrshl.csel', 'sqshlu', 'umin.usubl.umlsl', 'cbnz.adds', 'tbnz',
             'usubl2', 'stxr', 'sbfx', 'strh', 'stxrb.adcs', 'stxrh', 'ands.urhadd', 'subs', 'sbcs', 'fnmadd.ldxrb.saddl',
             'stur', 'ldrsb', 'strb', 'prfm', 'ubfiz', 'ldrsw.madd.msub.sturb.ldursb', 'ldrb', 'b.eq', 'ldur.sbfiz', 'extr',
             'fmadd', 'uqadd', 'sshr.uzp1.sttrb', 'umlsl2', 'rsubhn2.ldrh.uqsub', 'uqshl', 'uabd', 'ursra', 'usubw', 'uaddl2',
             'b.gt', 'b.lt', 'sqshl', 'bics', 'smin.ubfx', 'smlsl2', 'uabdl2', 'zip2.ssubw2', 'ccmp', 'sqdmlal',
             'b.al', 'smax.ldurh.uhsub', 'fcvtxn2', 'b.pl']
    dict2 = ['saddl', 'urhadd', 'ubfiz.sqdmlsl.tbnz.stnp', 'smin', 'strh', 'ccmp', 'usubl', 'umlsl', 'uzp1', 'sbfx',
             'b.eq', 'zip2.prfm.strb', 'msub', 'b.pl', 'csel', 'stxrh.ldxrb', 'uqrshl.ldrh', 'cbnz', 'ursra', 'sshr.ubfx.ldur.ldnp',
             'fcvtxn2', 'usubl2', 'uaddl2', 'b.al', 'ssubw2', 'umax', 'b.lt', 'adrp.sturb', 'extr', 'uqshl',
             'smax', 'uqsub.sqshlu', 'ands', 'madd', 'umin', 'b.gt', 'uabdl2', 'ldrsb.ldpsw.rsubhn', 'uqadd', 'sttrb',
             'stxr', 'adds', 'rsubhn2.umlsl2', 'sbcs.fmadd', 'usubw', 'sqshl', 'stur.ldrsh.smlsl2', 'ldrsw', 'fnmadd', 'stxrb.sbfiz',
             'adcs', 'bics.ldrb', 'l1ursb', 'subs.uhsub', 'ldurh', 'uabd', 'sqdmlal']
    word1 = dict1[n % len(dict1)]
    word2 = dict2[(n+31) % len(dict2)]
    return word1 + '.' + word2

# PREFIXES: kakaodecrypt.py와 동일하게 구성 (테스트된 버전 사용)
# 인덱스 30: incept(830819) = 'extr.ursra'
# 인덱스 31: 'veil'
KAKAO_PREFIXES = [
    "", "", "12", "24", "18", "30", "36", "12", "48", "7", "35", "40",
    "17", "23", "29", "isabel", "kale", "sulli", "van", "merry", "kyle",
    "james", "maddux", "tony", "hayden", "paul", "elijah", "dorothy",
    "sally", "bran", incept(830819), "veil"
]

def load_last_message_id():
    """마지막 메시지 ID 로드"""
    try:
        if os.path.exists(STATE_FILE):
            with open(STATE_FILE, 'r') as f:
                content = f.read().strip()
                if content:
                    last_id = int(content)
                    # 전송한 메시지 ID 세트 초기화 (이미 처리된 메시지)
                    global sent_message_ids
                    # 너무 많은 메시지를 세트에 추가하지 않도록 제한 (최근 1000개만)
                    if last_id > 1000:
                        sent_message_ids = set(range(last_id - 1000, last_id + 1))
                    else:
                        sent_message_ids = set(range(1, last_id + 1))
                    return last_id
    except Exception as e:
        print(f"[경고] 상태 파일 로드 오류: {e}")
    return 0

def save_last_message_id(msg_id):
    """마지막 메시지 ID 저장"""
    try:
        os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
        with open(STATE_FILE, 'w') as f:
            f.write(str(msg_id))
    except Exception as e:
        print(f"[경고] 상태 저장 오류: {e}")

def guess_my_user_id():
    """
    자신의 user_id 추정 (제공된 코드의 KakaoDbGuessUserId 로직)
    1. open_profile 테이블에서 user_id 가져오기 시도 (제공된 코드 방식)
    2. 실패 시 chat_rooms의 members와 chat_logs의 user_id를 비교하여 자신의 user_id 찾기
    """
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 방법 1: open_profile 테이블에서 user_id 가져오기 시도 (제공된 코드 방식)
        # 제공된 코드: cur.execute('SELECT user_id FROM open_profile LIMIT 1')
        try:
            cursor.execute('SELECT user_id FROM open_profile LIMIT 1')
            row = cursor.fetchone()
            if row and row[0] is not None:
                my_user_id = row[0]
                print(f"[정보] open_profile에서 자신의 user_id 발견: {my_user_id}")
                conn.close()
                return my_user_id
        except sqlite3.OperationalError:
            # open_profile 테이블이 없을 수 있음
            pass
        
        # 방법 1-2: friends 테이블에서 자신의 user_id 찾기 시도
        # 제공된 글: "친구 테이블에 본인의 정보가 들어가 있어"
        # friends 테이블의 id 컬럼이 user_id일 가능성이 높음
        try:
            # friends 테이블에서 가장 자주 나타나는 user_id 찾기
            # (본인의 메시지가 가장 많을 가능성이 높음)
            cursor.execute('''
                SELECT user_id, COUNT(*) as cnt 
                FROM chat_logs 
                WHERE user_id IS NOT NULL 
                GROUP BY user_id 
                ORDER BY cnt DESC 
                LIMIT 5
            ''')
            candidates = cursor.fetchall()
            if candidates:
                print(f"[정보] user_id 후보 (메시지 수 기준):")
                for user_id, cnt in candidates:
                    print(f"  - user_id={user_id}, 메시지 수={cnt}")
                # 가장 많은 메시지를 보낸 user_id가 자신의 user_id일 가능성이 높음
                most_active_user_id = candidates[0][0]
                print(f"[정보] 가장 활발한 user_id (추정): {most_active_user_id}")
                # 하지만 이것이 정확하지 않을 수 있으므로, 다른 방법도 시도
        except sqlite3.OperationalError:
            pass
        
        # 방법 2: chat_rooms의 members와 chat_logs의 user_id를 비교하여 자신의 user_id 찾기
        try:
            cursor.execute('SELECT id, members FROM chat_rooms')
            chat_members = {}
            for row in cursor.fetchall():
                chat_id = row[0]
                members_json = row[1]
                if members_json:
                    try:
                        members = json.loads(members_json)
                        chat_members[chat_id] = members if isinstance(members, list) else []
                    except (json.JSONDecodeError, TypeError):
                        chat_members[chat_id] = []
                else:
                    chat_members[chat_id] = []
        except sqlite3.OperationalError as e:
            print(f"[경고] chat_rooms 테이블 조회 실패: {e}")
            conn.close()
            return None
        
        # 각 채팅방에서 members에 없는 user_id 찾기 (제공된 코드 방식)
        # 제공된 코드: KakaoDbGuessUserId.run()
        found = []
        for chat_id in chat_members:
            if len(chat_members[chat_id]) > 0:
                # members에 있는 user_id들을 제외하고 chat_logs에서 user_id 찾기
                # 제공된 코드: exclude = ','.join(list(map(str, chat_members[chat_id])))
                exclude = ','.join([str(mid) for mid in chat_members[chat_id]])
                try:
                    # 제공된 코드: cur.execute('SELECT DISTINCT user_id FROM chat_logs WHERE chat_id = %d AND user_id NOT IN (%s)' % (chat_id, exclude))
                    query = f'SELECT DISTINCT user_id FROM chat_logs WHERE chat_id = {chat_id} AND user_id NOT IN ({exclude})'
                    cursor.execute(query)
                    for row in cursor.fetchall():
                        if row[0] is not None:
                            found.append(row[0])
                except sqlite3.OperationalError:
                    continue
        
        conn.close()
        
        total = len(found)
        if total > 0:
            # 제공된 코드 방식: Counter를 사용하여 확률 계산
            from collections import Counter
            counter = Counter(found)
            
            # 모든 후보 출력 (제공된 코드 방식)
            print(f"[정보] 가능한 user_id 후보 (총 {total}개):")
            for user_id, count in counter.most_common():
                prob = count * 100 / total
                print(f"  user_id={user_id:20d} (확률: {prob:5.2f}%)")
            
            # 가장 많이 나타나는 user_id가 자신의 user_id일 가능성이 높음
            most_common = counter.most_common(1)[0]
            my_user_id = most_common[0]
            probability = most_common[1] * 100 / total
            
            print(f"\n[정보] 추정된 자신의 user_id: {my_user_id} (확률: {probability:.2f}%)")
            print(f"[정보] 추정된 user_id가 잘못되었을 수 있습니다. 복호화 실패 시 다음을 시도하세요:")
            print(f"  1. 위의 다른 user_id 후보를 순서대로 테스트")
            print(f"  2. 로그 확인: 복호화 실패한 메시지의 발신자 user_id 확인")
            print(f"  3. 수동 설정: echo 'YOUR_USER_ID' > ~/my_user_id.txt")
            return my_user_id
        else:
            print("[경고] 자신의 user_id를 찾을 수 없습니다.")
            print("[정보] 다음 방법을 시도하세요:")
            print(f"  1. 복호화 테스트: 여러 user_id 후보를 수동으로 테스트")
            print(f"  2. 로그 확인: 복호화 실패한 메시지의 발신자 user_id 확인")
            print(f"  3. 수동 설정: echo 'YOUR_USER_ID' > ~/my_user_id.txt")
            return None
            
    except Exception as e:
        print(f"[경고] user_id 추정 실패: {e}")
        return None

def load_my_user_id():
    """자신의 user_id 로드 (파일에서 또는 추정)"""
    global MY_USER_ID
    
    # 파일에서 로드 시도
    try:
        if os.path.exists(MY_USER_ID_FILE):
            with open(MY_USER_ID_FILE, 'r') as f:
                content = f.read().strip()
                if content:
                    MY_USER_ID = int(content)
                    print(f"[정보] 저장된 자신의 user_id 사용: {MY_USER_ID}")
                    print(f"[정보] 이 user_id가 잘못되었을 수 있습니다. 복호화 실패 시:")
                    print(f"  1. guess_user_id.py 실행하여 모든 후보 확인")
                    print(f"  2. 다른 후보를 수동으로 테스트: echo 'USER_ID' > {MY_USER_ID_FILE}")
                    return MY_USER_ID
    except Exception as e:
        print(f"[경고] user_id 파일 로드 오류: {e}")
    
    # 파일이 없으면 추정 시도
    print("[정보] 자신의 user_id 추정 중...")
    MY_USER_ID = guess_my_user_id()
    
    # 추정된 user_id 저장
    if MY_USER_ID:
        try:
            os.makedirs(os.path.dirname(MY_USER_ID_FILE), exist_ok=True)
            with open(MY_USER_ID_FILE, 'w') as f:
                f.write(str(MY_USER_ID))
            print(f"[정보] 추정된 user_id 저장: {MY_USER_ID}")
            print(f"[경고] 추정된 user_id가 잘못되었을 수 있습니다. 복호화 실패 시:")
            print(f"  1. guess_user_id.py 실행하여 모든 후보 확인")
            print(f"  2. 다른 후보를 수동으로 테스트: echo 'USER_ID' > {MY_USER_ID_FILE}")
        except Exception as e:
            print(f"[경고] user_id 저장 오류: {e}")
    else:
        print(f"[경고] user_id를 찾을 수 없습니다. 다음 방법을 시도하세요:")
        print(f"  1. guess_user_id.py 실행하여 모든 후보 확인")
        print(f"  2. 수동으로 user_id 설정: echo 'YOUR_USER_ID' > {MY_USER_ID_FILE}")
    
    return MY_USER_ID

def check_db_access():
    """DB 접근 가능 여부 확인"""
    try:
        # DB 파일 존재 확인
        if not os.path.exists(DB_PATH):
            print(f"\n[오류] DB 파일을 찾을 수 없습니다: {DB_PATH}")
            print("\n[해결 방법]")
            print("1. 실제 DB 파일 경로 확인:")
            print("   ls -la /data/data/com.kakao.talk/databases/")
            print("2. 스크립트의 DB_PATH를 실제 파일 이름으로 수정")
            return False
        
        # 읽기 권한 확인
        if not os.access(DB_PATH, os.R_OK):
            print(f"\n[오류] DB 파일 읽기 권한이 없습니다: {DB_PATH}")
            print("\n[해결 방법]")
            print("1. 하율 패치가 제대로 적용되었는지 확인")
            print("2. Termux에서 직접 실행 (Ubuntu/proot 환경 아님)")
            return False
        
        # DB 연결 테스트
        conn = sqlite3.connect(DB_PATH)
        conn.close()
        return True
        
    except Exception as e:
        print(f"\n[오류] DB 접근 실패: {e}")
        print("\n[해결 방법]")
        print("1. Termux 환경에서 직접 실행 (proot-distro login ubuntu 아님)")
        print("2. DB 경로 확인: ls -la /data/data/com.kakao.talk/databases/")
        return False

def get_latest_message_id():
    """DB에서 최신 메시지 ID 조회 (검증용)"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT MAX(_id) FROM chat_logs")
        result = cursor.fetchone()
        conn.close()
        return result[0] if result[0] is not None else 0
    except Exception as e:
        print(f"[검증 오류] 최신 메시지 ID 조회 실패: {e}")
        return None

def get_new_messages():
    """새 메시지 조회 (중복 방지)"""
    last_id = load_last_message_id()
    
    # 검증: 최신 메시지 ID 확인 (로그 최소화)
    latest_id_in_db = get_latest_message_id()
    if latest_id_in_db is not None:
        if latest_id_in_db < last_id:
            # last_id가 DB의 최신 ID보다 큼 (비정상) - 이 경우만 경고
            print(f"[경고] last_message_id({last_id})가 DB 최신 ID({latest_id_in_db})보다 큼. 초기화 필요할 수 있음.")
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 먼저 테이블 구조 확인하여 사용 가능한 컬럼 확인
        try:
            cursor.execute("PRAGMA table_info(chat_logs)")
            columns_info = cursor.fetchall()
            available_columns = [col[1] for col in columns_info]
            
            # 기본 필수 컬럼
            base_columns = ["_id", "chat_id", "user_id", "message", "created_at"]
            
            # 선택적 컬럼 추가
            select_columns = base_columns.copy()
            if "v" in available_columns:
                select_columns.append("v")
            if "userId" in available_columns:
                select_columns.append("userId")
            if "encType" in available_columns:
                select_columns.append("encType")
            
            # 쿼리 생성
            columns_str = ", ".join(select_columns)
            query = f"""
                SELECT {columns_str}
                FROM chat_logs
                WHERE _id > ?
                ORDER BY _id ASC
                LIMIT 10
            """
        except Exception as e:
            # 테이블 정보 조회 실패 시 기본 쿼리 사용
            print(f"[경고] 테이블 구조 확인 실패: {e}, 기본 쿼리 사용")
            query = """
                SELECT _id, chat_id, user_id, message, created_at
                FROM chat_logs
                WHERE _id > ?
                ORDER BY _id ASC
                LIMIT 10
            """
        
        cursor.execute(query, (last_id,))
        messages = cursor.fetchall()
        
        # 검증 로그 제거 (새 메시지가 있을 때만 출력)
        # if messages:
        #     latest_id = max(msg[0] for msg in messages)
        #     oldest_id = min(msg[0] for msg in messages)
        #     print(f"[검증] 조회 범위: ID {oldest_id}~{latest_id} (마지막 처리 ID: {last_id}, DB 최신 ID: {latest_id_in_db})")
        # else:
        #     print(f"[검증] 조회된 메시지 없음 (마지막 처리 ID: {last_id}, DB 최신 ID: {latest_id_in_db})")
        
        conn.close()
        
        # 중복 메시지 필터링
        new_messages = []
        for msg in messages:
            msg_id = msg[0]
            # 이미 전송한 메시지는 제외
            if msg_id not in sent_message_ids:
                new_messages.append(msg)
                # 전송 예정으로 표시 (중복 방지) - 세트 크기 제한
                sent_message_ids.add(msg_id)
                # 세트 크기가 너무 커지지 않도록 제한 (최근 2000개만 유지)
                if len(sent_message_ids) > 2000:
                    # 가장 오래된 메시지 ID 제거
                    min_id = min(sent_message_ids)
                    sent_message_ids.discard(min_id)
        
        return new_messages
    except sqlite3.OperationalError as e:
        # 테이블이 없거나 구조가 다를 수 있음
        print(f"\n[DB 쿼리 오류] {e}")
        print("카카오톡 DB 구조를 확인해야 합니다.")
        print("\n[해결 방법]")
        print("1. DB 구조 확인: sqlite3 {} '.tables'".format(DB_PATH))
        print("2. 실제 테이블 이름으로 쿼리 수정")
        return []
    except Exception as e:
        print(f"\n[DB 접근 오류] {e}")
        return []


# WebSocket 연결 관리
ws_connection = None
ws_lock = threading.Lock()
# 마지막 메시지의 room 정보 저장 (서버 응답에 room이 없을 때 사용)
last_message_room = None

def connect_websocket():
    """WebSocket 연결"""
    global ws_connection
    
    def on_message(ws, message):
        """서버로부터 메시지 수신 및 카카오톡에 응답 전송"""
        global last_message_room
        
        try:
            data = json.loads(message)
            
            # 서버 응답 처리 (type='reply')
            if data.get('type') == 'reply' and data.get('replies'):
                replies = data.get('replies', [])
                print(f"[서버 응답] {len(replies)}개 응답 수신")
                
                # 각 응답을 카카오톡에 전송 (순차적으로, 약간의 지연)
                for idx, reply_item in enumerate(replies):
                    if isinstance(reply_item, dict):
                        reply_text = reply_item.get('text', '')
                        reply_room = reply_item.get('room', '') or last_message_room
                        
                        if reply_text and reply_room:
                            # 카카오톡에 메시지 전송
                            success = send_to_kakaotalk(reply_room, reply_text)
                            if success:
                                print(f"[✓] 응답 {idx+1}/{len(replies)} 전송 완료")
                            else:
                                print(f"[✗] 응답 {idx+1}/{len(replies)} 전송 실패")
                            
                            # 메시지 간 지연 (Iris의 messageSendRate와 유사)
                            # 너무 빠르게 전송하면 카카오톡이 무시할 수 있음
                            if idx < len(replies) - 1:  # 마지막 메시지가 아니면
                                time.sleep(0.5)  # 500ms 지연
                        elif reply_text:
                            print(f"[경고] room 정보 없음, 응답 전송 스킵: {reply_text[:50]}...")
                    elif isinstance(reply_item, str):
                        # 문자열로 직접 전송된 경우
                        if last_message_room:
                            success = send_to_kakaotalk(last_message_room, reply_item)
                            if success:
                                print(f"[✓] 응답 {idx+1}/{len(replies)} 전송 완료")
                            else:
                                print(f"[✗] 응답 {idx+1}/{len(replies)} 전송 실패")
                            
                            if idx < len(replies) - 1:
                                time.sleep(0.5)
                        else:
                            print(f"[경고] room 정보 없음, 응답 전송 스킵: {reply_item[:50]}...")
            elif data.get('type') == 'reply' and not data.get('replies'):
                # 빈 응답은 로그 출력 안 함
                pass
            else:
                print(f"[서버 응답] {data}")
        except Exception as e:
            print(f"[서버 응답 파싱 오류] {e}")
    
    def on_error(ws, error):
        """WebSocket 오류"""
        print(f"[WebSocket 오류] {error}")
    
    def on_close(ws, close_status_code, close_msg):
        """WebSocket 연결 종료"""
        global ws_connection
        print("[WebSocket 연결 종료]")
        ws_connection = None
    
    def on_open(ws):
        """WebSocket 연결 성공"""
        global ws_connection
        print("[✓] WebSocket 연결 성공")
        # 연결 메시지 전송
        ws.send(json.dumps({"type": "connect"}))
    
    try:
        ws = websocket.WebSocketApp(
            WS_URL,
            on_message=on_message,
            on_error=on_error,
            on_close=on_close,
            on_open=on_open
        )
        
        # 백그라운드 스레드에서 실행
        def run_ws():
            ws.run_forever()
        
        ws_thread = threading.Thread(target=run_ws, daemon=True)
        ws_thread.start()
        
        # 연결 대기
        time.sleep(1)
        ws_connection = ws
        return True
    except Exception as e:
        print(f"[WebSocket 연결 오류] {e}")
        return False

def generate_salt(user_id, enc_type):
    """
    카카오톡 복호화용 Salt 생성 (kakaodecrypt.py의 genSalt와 동일)
    참고: kakaodecrypt.py의 KakaoDecrypt.genSalt() 사용 권장
    """
    # kakaodecrypt.py 모듈이 있으면 그것을 사용 (우선)
    if KAKAODECRYPT_AVAILABLE:
        try:
            return KakaoDecrypt.genSalt(user_id, enc_type)
        except Exception:
            # 폴백: 자체 구현
            pass
    
    # 폴백: 자체 구현 (kakaodecrypt.py와 동일한 로직)
    salt = bytearray(16)
    
    # kakaodecrypt.py: if user_id <= 0: return b'\0' * 16
    if user_id <= 0:
        return bytes(salt)
    
    # kakaodecrypt.py: if enc < 0 or enc >= len(KAKAO_PREFIXES): raise ValueError
    if enc_type < 0 or enc_type >= len(KAKAO_PREFIXES):
        # 범위를 벗어나면 userId만 사용
        salt_str = str(user_id)
    else:
        # kakaodecrypt.py: prefix = KAKAO_PREFIXES[enc]
        prefix = KAKAO_PREFIXES[enc_type]
        # kakaodecrypt.py: s = (prefix + str(user_id))[:16]
        salt_str = (prefix + str(user_id))[:16]
    
    # kakaodecrypt.py: s = s + "\0" * (16 - len(s))
    # (bytearray(16)로 이미 0으로 초기화되어 있음)
    salt_bytes = salt_str.encode('utf-8')
    for i in range(min(len(salt_bytes), 16)):
        salt[i] = salt_bytes[i]
    
    return bytes(salt)

def pkcs16adjust(a, aOff, b):
    """PKCS12 키 유도에 필요한 헬퍼 함수"""
    x = (b[len(b) - 1] & 0xff) + (a[aOff + len(b) - 1] & 0xff) + 1
    a[aOff + len(b) - 1] = x % 256
    x = x >> 8
    for i in range(len(b)-2, -1, -1):
        x = x + (b[i] & 0xff) + (a[aOff + i] & 0xff)
        a[aOff + i] = x % 256
        x = x >> 8

def generate_secret_key(salt):
    """
    PKCS12 키 유도 방식 (Iris KakaoDecrypt.kt의 deriveKey() 함수 기반)
    PBEWITHSHAAND256BITAES-CBC-BC 키 생성
    - SHA-1 해시 사용
    - iterations = 2 (실제로는 1번 반복: for j in range(1, 2))
    - 256-bit 키 생성
    """
    # Java의 PBEWITHSHAAND256BITAES-CBC-BC는 PKCS12 키 유도 방식을 사용
    # 제공된 Python 코드의 deriveKey() 함수와 동일한 방식
    password = KAKAO_PASSWORD
    # PKCS12 방식: password를 UTF-16-BE로 변환
    # 제공된 코드: password = (password + b'\0').decode('ascii').encode('utf-16-be')
    password = (password + b'\0').decode('ascii').encode('utf-16-be')
    
    hasher = hashlib.sha1()
    v = hasher.block_size  # 64
    u = hasher.digest_size  # 20
    
    D = [1] * v
    S = [0] * v * int((len(salt) + v - 1) / v)
    for i in range(len(S)):
        S[i] = salt[i % len(salt)]
    P = [0] * v * int((len(password) + v - 1) / v)
    for i in range(len(P)):
        P[i] = password[i % len(password)]
    
    I = S + P
    
    B = [0] * v
    dkeySize = 32
    c = int((dkeySize + u - 1) / u)
    
    dKey = [0] * dkeySize
    for i in range(1, c+1):
        hasher = hashlib.sha1()
        hasher.update(bytes(D))
        hasher.update(bytes(I))
        A = list(hasher.digest())
        
        # Iris 방식: for (j in 1 until iterations) - iterations=2일 때 j=1만 실행 (1번 반복)
        # Python의 range(1, 2)는 [1]만 생성하므로 1번 반복
        for j in range(1, 2):  # iterations = 2일 때 j=1만 실행 (1번 반복)
            hasher = hashlib.sha1()
            hasher.update(bytes(A))
            A = list(hasher.digest())
        
        for j in range(len(B)):
            B[j] = A[j % len(A)]
        
        for j in range(int(len(I)/v)):
            pkcs16adjust(I, j * v, B)
        
        start = (i - 1) * u
        if i == c:
            dKey[start : dkeySize] = A[0 : dkeySize-start]
        else:
            dKey[start : start+len(A)] = A[0 : len(A)]
    
    return bytes(dKey)

def decrypt_kakaotalk_message(encrypted_text, user_id, enc_type=31, debug=False):
    """
    카카오톡 메시지 복호화 (테스트된 kakaodecrypt 모듈 사용)
    
    Args:
        encrypted_text: base64로 인코딩된 암호화된 메시지
        user_id: 카카오톡 사용자 ID (chatLog의 userId)
        enc_type: 암호화 타입 (기본값 31)
        debug: 디버그 로그 출력 여부
    
    Returns:
        복호화된 메시지 문자열 또는 None
    """
    if not CRYPTO_AVAILABLE:
        if debug:
            print(f"[복호화] CRYPTO_AVAILABLE=False, 복호화 불가")
        return None
    
    # 테스트된 kakaodecrypt 모듈 사용 (우선)
    if KAKAODECRYPT_AVAILABLE:
        try:
            # 빈 메시지 체크
            if not encrypted_text or encrypted_text == "{}" or encrypted_text == "[]":
                if debug:
                    print(f"[복호화] 빈 메시지 또는 특수 문자")
                return encrypted_text
            
            if debug:
                print(f"[복호화] kakaodecrypt 모듈 사용: user_id={user_id}, enc_type={enc_type}, 텍스트 길이={len(encrypted_text)}")
            
            # 테스트된 KakaoDecrypt.decrypt() 사용
            result = KakaoDecrypt.decrypt(user_id, enc_type, encrypted_text)
            
            if result:
                if debug:
                    print(f"[복호화] 성공: 복호화된 텍스트 길이={len(result)}")
                return result
            else:
                if debug:
                    print(f"[복호화] 실패: KakaoDecrypt.decrypt()가 None 반환")
                return None
        except Exception as e:
            if debug:
                print(f"[복호화] kakaodecrypt 모듈 오류: {type(e).__name__}: {e}")
                import traceback
                traceback.print_exc()
            # 폴백: 기존 로직 사용
            pass
    
    # 폴백: 기존 자체 구현 로직 (kakaodecrypt 모듈이 없거나 실패한 경우)
    try:
        # 빈 메시지 체크
        if not encrypted_text or encrypted_text == "{}" or encrypted_text == "[]":
            if debug:
                print(f"[복호화] 빈 메시지 또는 특수 문자")
            return encrypted_text
        
        if debug:
            print(f"[복호화] 자체 구현 사용: user_id={user_id}, enc_type={enc_type}, 텍스트 길이={len(encrypted_text)}")
        
        # Salt 생성
        salt = generate_salt(user_id, enc_type)
        if debug:
            print(f"[복호화] Salt 생성 완료: {salt.hex()[:16]}...")
        
        # SecretKey 생성 (PKCS12 키 유도 방식 - Iris KakaoDecrypt.kt 기반)
        secret_key = generate_secret_key(salt)
        if debug:
            print(f"[복호화] SecretKey 생성 완료: {secret_key.hex()[:16]}...")
        
        # AES/CBC/NoPadding 복호화 (Iris 방식)
        cipher = AES.new(secret_key, AES.MODE_CBC, KAKAO_IV)
        
        # Base64 디코딩
        decoded_bytes = base64.b64decode(encrypted_text)
        
        if len(decoded_bytes) == 0:
            if debug:
                print(f"[복호화] 빈 암호문")
            return encrypted_text
        
        # 복호화 (Iris 방식: cipher.doFinal() with BadPaddingException handling)
        try:
            padded = cipher.decrypt(decoded_bytes)
        except Exception as e:
            # Iris 코드: BadPaddingException catch 후 원본 반환
            if debug:
                print(f"[복호화] BadPaddingException 또는 복호화 오류: {type(e).__name__}: {e}")
                print(f"[복호화] 잘못된 키 또는 데이터일 수 있습니다. 원본 ciphertext 반환")
            return encrypted_text
        
        # PKCS5Padding 제거
        try:
            if len(padded) == 0:
                if debug:
                    print(f"[복호화] 경고: 복호화된 데이터가 비어있음")
                return encrypted_text
            
            padding_length = padded[-1] & 0xff
            
            if debug:
                print(f"[복호화] 패딩 확인: padded 길이={len(padded)}, 마지막 바이트={padded[-1]}, padding_length={padding_length}")
            
            if padding_length <= 0 or padding_length > 16:
                if debug:
                    print(f"[복호화] 실패: 잘못된 패딩 길이 ({padding_length})")
                return None
            
            if padding_length > len(padded):
                if debug:
                    print(f"[복호화] 실패: 패딩 길이({padding_length})가 데이터 길이({len(padded)})보다 큼")
                return None
            
            plaintext = padded[:-padding_length]
            
            if debug:
                print(f"[복호화] PKCS5 패딩 제거: padding_length={padding_length}, plaintext 길이={len(plaintext)}")
            
            if len(plaintext) == 0:
                if debug:
                    print(f"[복호화] 실패: 패딩 제거 후 길이가 0")
                return None
                
        except (IndexError, ValueError) as e:
            if debug:
                print(f"[복호화] 패딩 제거 실패: {e}")
            return None
        
        # UTF-8 디코딩
        try:
            decrypted_text = plaintext.decode('utf-8')
            
            # 복호화된 메시지가 유효한 텍스트인지 확인
            has_control_chars = any(ord(c) < 32 and c not in '\n\r\t' for c in decrypted_text)
            if has_control_chars:
                if debug:
                    print(f"[복호화] 경고: 제어 문자 포함, 바이너리 데이터일 수 있음")
                control_char_count = sum(1 for c in decrypted_text if ord(c) < 32 and c not in '\n\r\t')
                if control_char_count > len(decrypted_text) * 0.1:  # 10% 이상이면 실패
                    if debug:
                        print(f"[복호화] 실패: 제어 문자 비율이 너무 높음 ({control_char_count}/{len(decrypted_text)})")
                    return None
            
            if debug:
                print(f"[복호화] 성공: 복호화된 텍스트 길이={len(decrypted_text)}")
            
            return decrypted_text
        except UnicodeDecodeError as e:
            if debug:
                print(f"[복호화] UTF-8 디코딩 실패: {e}")
            return None
        
    except Exception as e:
        if debug:
            print(f"[복호화] 오류 발생: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
        return None

def decrypt_message(encrypted_message, v_field=None, user_id=None, enc_type=31, debug=False):
    """
    암호화된 메시지 복호화 시도
    
    1. v_field에서 enc 추출
    2. 카카오톡 복호화 로직 시도 (user_id가 있는 경우)
    3. base64 디코딩 시도
    """
    if not encrypted_message:
        return None
    
    # 1. v_field에서 enc 추출
    if v_field and isinstance(v_field, str):
        try:
            v_parsed = json.loads(v_field)
            if isinstance(v_parsed, dict) and "enc" in v_parsed:
                v_enc_type = v_parsed["enc"]
                if v_enc_type is not None:
                    enc_type = v_enc_type
                    if debug:
                        print(f"[복호화] v 필드에서 enc 추출: {enc_type}")
        except (json.JSONDecodeError, TypeError, KeyError):
            # JSON 파싱 실패 시 기존 enc_type 사용
            pass
    
    # 2. 카카오톡 복호화 로직 시도 (user_id가 있는 경우)
    if CRYPTO_AVAILABLE and user_id:
        try:
            decrypted = decrypt_kakaotalk_message(encrypted_message, user_id, enc_type, debug=debug)
            if decrypted:
                return decrypted
        except Exception as e:
            if debug:
                print(f"[복호화] decrypt_kakaotalk_message 오류: {type(e).__name__}: {e}")
            pass
    
    # 3. base64 디코딩 시도 (간단한 경우)
    try:
        if isinstance(encrypted_message, str):
            decoded_bytes = base64.b64decode(encrypted_message)
            # UTF-8로 디코딩 시도
            try:
                decrypted = decoded_bytes.decode('utf-8')
                # 유효한 텍스트인지 확인 (base64만 있는 경우 제외)
                if decrypted and not all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=' for c in decrypted[:50]):
                    return decrypted
            except UnicodeDecodeError:
                pass
    except Exception:
        pass
    
    return None

def send_to_kakaotalk(room_id, message_text):
    """
    카카오톡에 메시지 전송 (Iris Replier.kt 기반, 자체 구현)
    
    Iris의 sendMessageInternal() 함수를 참고하여 Intent 전송
    - Component: com.kakao.talk/com.kakao.talk.notification.NotificationActionService
    - Action: com.kakao.talk.notification.REPLY_MESSAGE
    - Extra: noti_referer, chat_id
    - RemoteInput: reply_message (Bundle)
    
    Args:
        room_id: 채팅방 ID (문자열 또는 숫자)
        message_text: 전송할 메시지 텍스트
    
    Returns:
        bool: 전송 성공 여부
    """
    try:
        # room_id를 숫자로 변환
        try:
            chat_id = int(room_id)
        except (ValueError, TypeError):
            print(f"[경고] 잘못된 room_id: {room_id}, 메시지 전송 스킵")
            return False
        
        if not message_text or not message_text.strip():
            print(f"[경고] 빈 메시지, 전송 스킵")
            return False
        
        import subprocess
        
        # Iris Replier.kt의 sendMessageInternal() 기반
        # noti_referer는 임의의 문자열 (Iris는 "iris" 사용)
        referer = "kakao_poller"
        
        # 메시지 텍스트 이스케이프 처리 (특수 문자 처리)
        # 쉘 명령어에서 특수 문자를 안전하게 처리
        message_escaped = message_text.replace("'", "'\"'\"'").replace("\\", "\\\\")
        
        # 방법 1: 기본 Intent 전송 (RemoteInput 없이)
        # 참고: 일부 경우에는 기본 Extra만으로도 작동할 수 있음
        cmd_basic = [
            "am", "startservice",
            "-n", "com.kakao.talk/.notification.NotificationActionService",
            "-a", "com.kakao.talk.notification.REPLY_MESSAGE",
            "--es", "noti_referer", referer,
            "--ei", "chat_id", str(chat_id),
            "--es", "reply_message", message_text
        ]
        
        try:
            result = subprocess.run(
                cmd_basic,
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0:
                # 성공 (출력이 없거나 빈 출력이면 성공으로 간주)
                if not result.stderr or "Error" not in result.stderr:
                    print(f"[✓] 카카오톡 전송 성공: room_id={chat_id}, message={message_text[:50]}...")
                    return True
                else:
                    print(f"[정보] 기본 Intent 실패, RemoteInput 방식 시도: {result.stderr}")
            else:
                print(f"[정보] 기본 Intent 실패 (코드: {result.returncode}), RemoteInput 방식 시도")
        except FileNotFoundError:
            print(f"[경고] 'am' 명령어를 찾을 수 없습니다.")
            print(f"[정보] Termux 환경에서 실행 중인지 확인하세요.")
            print(f"[정보] ADB를 통한 실행 방법:")
            print(f"  adb shell am startservice -n com.kakao.talk/.notification.NotificationActionService \\")
            print(f"    -a com.kakao.talk.notification.REPLY_MESSAGE \\")
            print(f"    --es noti_referer '{referer}' \\")
            print(f"    --ei chat_id {chat_id} \\")
            print(f"    --es reply_message '{message_escaped}'")
            return False
        except subprocess.TimeoutExpired:
            print(f"[경고] Intent 전송 타임아웃")
            return False
        except Exception as e:
            print(f"[정보] 기본 Intent 오류: {e}, RemoteInput 방식 시도")
        
        # 방법 2: RemoteInput 포함 Intent 전송 시도
        # 참고: RemoteInput은 Bundle을 통해 전달되므로 복잡함
        # 하지만 일부 경우에는 추가 Extra로 작동할 수 있음
        
        # RemoteInput의 결과는 Bundle에 저장되므로,
        # Intent의 추가 Extra로 시도
        try:
            # RemoteInput 결과를 시뮬레이션하기 위해 추가 Extra 시도
            # 참고: 실제 RemoteInput은 복잡하지만, 일부 경우에는 작동할 수 있음
            cmd_remote = [
                "am", "startservice",
                "-n", "com.kakao.talk/.notification.NotificationActionService",
                "-a", "com.kakao.talk.notification.REPLY_MESSAGE",
                "--es", "noti_referer", referer,
                "--ei", "chat_id", str(chat_id),
                "--es", "android.remoteinput.results", json.dumps({"reply_message": message_text}),
                "--es", "reply_message", message_text
            ]
            
            result = subprocess.run(
                cmd_remote,
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0 and (not result.stderr or "Error" not in result.stderr):
                print(f"[✓] 카카오톡 전송 성공 (RemoteInput 방식): room_id={chat_id}, message={message_text[:50]}...")
                return True
        except Exception as e:
            print(f"[정보] RemoteInput 방식 오류: {e}")
        
        # 방법 3: Python의 android 모듈 사용 시도 (Termux에서 가능할 수도 있음)
        # 참고: Termux는 Android 환경이므로 일부 Android API 접근 가능
        # 하지만 android 모듈은 일반적으로 설치되지 않으므로 주석 처리
        # try:
        #     import android
        #     from android import Android
        #     droid = Android()
        #     # Intent 구성 및 전송 구현 필요
        # except ImportError:
        #     pass
        
        # 모든 방법 실패
        print(f"[✗] 카카오톡 전송 실패: 모든 방법 시도 완료")
        print(f"[디버그] room_id={chat_id}, message 길이={len(message_text)}")
        print(f"[정보] 해결 방법:")
        print(f"  1. Termux 환경에서 실행 중인지 확인")
        print(f"  2. 카카오톡이 실행 중인지 확인")
        print(f"  3. 하율 패치가 제대로 적용되었는지 확인")
        print(f"  4. 로그 확인: logcat | grep -i kakao")
        
        return False
        
    except Exception as e:
        print(f"[✗] 카카오톡 전송 오류: {e}")
        import traceback
        traceback.print_exc()
        return False

def send_to_server(message_data):
    """서버로 메시지 전송 (WebSocket)"""
    global ws_connection, last_message_room
    
    try:
        # room과 sender를 문자열로 변환 (서버가 문자열을 기대함)
        room = str(message_data.get("chat_id", ""))
        sender = str(message_data.get("user_id", ""))
        message = str(message_data.get("message", ""))
        v_field = message_data.get("v")
        
        # 빈 메시지는 전송하지 않음
        if not message or message.strip() == "":
            return False
        
        # 암호화된 메시지 복호화 시도
        decrypted_message = None
        # 복호화에는 자신의 user_id를 사용해야 함 (제공된 코드 방식)
        # 제공된 코드: decrypt(user_id, encType, b64_ciphertext)
        # 여기서 user_id는 자신의 user_id (메시지를 받는 사람의 user_id)
        decrypt_user_id = MY_USER_ID if MY_USER_ID else (message_data.get("userId") or message_data.get("user_id"))
        enc_type = message_data.get("encType", 31)
        
        if DECRYPT_ENABLED and decrypt_user_id:
            try:
                # 숫자로 변환 시도 (큰 숫자도 처리)
                try:
                    decrypt_user_id_int = int(decrypt_user_id)
                except (ValueError, OverflowError):
                    decrypt_user_id_int = None
                
                if decrypt_user_id_int and decrypt_user_id_int > 0:
                    decrypted_message = decrypt_message(message, v_field, decrypt_user_id_int, enc_type, debug=True)
                    if decrypted_message:
                        print(f"[✓] 메시지 복호화 성공: user_id={decrypt_user_id_int}, enc_type={enc_type}")
                    else:
                        print(f"[✗] 메시지 복호화 실패: user_id={decrypt_user_id_int}, enc_type={enc_type}")
            except Exception as e:
                # 복호화 실패는 무시 (암호화되지 않은 메시지일 수 있음)
                if message and len(message) > 10 and len(message) % 4 == 0:
                    print(f"[경고] 복호화 오류: {type(e).__name__}: {e}")
                pass
        
        # 복호화 성공하면 복호화된 메시지 사용, 실패하면 원본 사용
        final_message = decrypted_message if decrypted_message else message
        
        # 마지막 메시지의 room 정보 저장 (서버 응답에 room이 없을 때 사용)
        last_message_room = room
        
        # 서버가 기대하는 형식 (IrisLink 형식)
        # 서버 코드를 보면 "message" 필드를 기대함
        payload = {
            "type": "message",
            "room": room,
            "sender": sender,
            "message": final_message,  # 복호화된 메시지 또는 원본
            "isGroupChat": True,  # 명시적으로 추가
            "json": message_data  # 원본 데이터도 포함
        }
        
        # WebSocket 연결 확인
        if ws_connection is None:
            print("[경고] WebSocket 연결 없음. 재연결 시도...")
            if not connect_websocket():
                print("[✗] WebSocket 재연결 실패")
                return False
        
        # WebSocket 연결 상태 상세 확인
        if ws_connection:
            sock_connected = ws_connection.sock and ws_connection.sock.connected if ws_connection.sock else False
            print(f"[디버그] WebSocket 상태: ws_connection={ws_connection is not None}, sock={ws_connection.sock is not None if ws_connection else None}, connected={sock_connected}")
        else:
            print("[디버그] WebSocket 상태: ws_connection=None")
        
        # WebSocket으로 메시지 전송
        with ws_lock:
            if ws_connection and ws_connection.sock and ws_connection.sock.connected:
                try:
                    payload_str = json.dumps(payload, ensure_ascii=False)
                    print(f"[디버그] WebSocket 전송 시도: payload 길이={len(payload_str)}, type={payload.get('type')}")
                    ws_connection.send(payload_str)
                    print(f"[✓] WebSocket 전송 성공")
                    return True
                except Exception as e:
                    print(f"[✗] WebSocket 전송 오류: {e}")
                    import traceback
                    traceback.print_exc()
                    ws_connection = None
                    return False
            else:
                print(f"[경고] WebSocket 연결 끊김. ws_connection={ws_connection}, sock={ws_connection.sock if ws_connection else None}")
                ws_connection = None
                if connect_websocket():
                    try:
                        payload_str = json.dumps(payload, ensure_ascii=False)
                        print(f"[디버그] 재연결 후 WebSocket 전송 시도: payload 길이={len(payload_str)}")
                        ws_connection.send(payload_str)
                        print(f"[✓] 재연결 후 WebSocket 전송 성공")
                        return True
                    except Exception as e:
                        print(f"[✗] 재연결 후 전송 실패: {e}")
                        import traceback
                        traceback.print_exc()
                        return False
                return False
        
    except Exception as e:
        print(f"[✗] 서버 전송 오류: {e}")
        return False

def check_db_structure():
    """카카오톡 DB 구조 확인"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 테이블 목록 조회
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        
        print("\n[DB 구조 확인]")
        print(f"접근 가능한 테이블: {[t[0] for t in tables]}")
        
        # chat_logs 테이블이 있는지 확인
        if any('chat' in t[0].lower() or 'log' in t[0].lower() for t in tables):
            print("\n[chat_logs 유사 테이블 찾기]")
            for table in tables:
                table_name = table[0]
                if 'chat' in table_name.lower() or 'log' in table_name.lower():
                    cursor.execute(f"PRAGMA table_info({table_name})")
                    columns = cursor.fetchall()
                    print(f"\n테이블: {table_name}")
                    print(f"컬럼: {[c[1] for c in columns]}")
        
        conn.close()
        return True
    except Exception as e:
        print(f"DB 구조 확인 오류: {e}")
        return False

def poll_messages():
    """메시지 폴링 루프"""
    global MY_USER_ID
    
    # 자신의 user_id 로드 (최초 1회)
    if MY_USER_ID is None:
        MY_USER_ID = load_my_user_id()
        if not MY_USER_ID:
            print("[경고] 자신의 user_id를 찾을 수 없습니다. 복호화가 실패할 수 있습니다.")
            print("[해결] 수동으로 user_id를 설정하려면:")
            print(f"  echo 'YOUR_USER_ID' > {MY_USER_ID_FILE}")
    
    print("=" * 60)
    print("[카카오톡 메시지 폴링 시작]")
    print(f"DB 경로: {DB_PATH}")
    print(f"WebSocket URL: {WS_URL}")
    if MY_USER_ID:
        print(f"자신의 user_id: {MY_USER_ID}")
    print("=" * 60)
    
    # DB 접근 확인
    if not check_db_access():
        print("\n[중지] DB 접근 불가. 위의 해결 방법을 참고하세요.")
        return
    
    # DB 구조 확인
    if not check_db_structure():
        print("\n[경고] DB 구조 확인 실패. 계속 진행합니다...")
    
    # 마지막 메시지 ID 로드 (전송한 메시지 세트 초기화)
    last_id = load_last_message_id()
    latest_id_in_db = get_latest_message_id()
    
    print(f"\n[시작] 마지막 처리한 메시지 ID: {last_id}")
    print(f"[시작] 이미 처리한 메시지 수: {len(sent_message_ids)}개")
    if latest_id_in_db is not None:
        print(f"[검증] DB 최신 메시지 ID: {latest_id_in_db}")
        if latest_id_in_db > last_id:
            print(f"[검증] 처리 대기 중인 새 메시지: {latest_id_in_db - last_id}개")
        elif latest_id_in_db == last_id:
            print(f"[검증] 모든 메시지 처리 완료")
        else:
            print(f"[경고] last_id가 DB 최신 ID보다 큼 (초기화 필요할 수 있음)")
    
    # WebSocket 연결
    print("\n[WebSocket 연결 시도...]")
    if not connect_websocket():
        print("[경고] WebSocket 연결 실패. 계속 진행하지만 메시지 전송이 실패할 수 있습니다.")
    
    print("\n[폴링 시작] (Ctrl+C로 중지)")
    print("[참고] 같은 메시지는 한 번만 전송됩니다.\n")
    
    while True:
        try:
            messages = get_new_messages()
            
            if messages:
                # 중요: DB의 실제 최신 ID를 확인하여 last_message_id를 업데이트
                # (조회된 배치의 최대 ID가 아닌 실제 DB 최신 ID 사용)
                db_latest_id = get_latest_message_id()
                current_last_id = load_last_message_id()
                queried_max_id = max(msg[0] for msg in messages)
                
                # DB 최신 ID가 있으면 그것을 사용, 없으면 조회된 최대 ID 사용
                target_id = db_latest_id if db_latest_id is not None else queried_max_id
                
                # target_id가 현재 last_id보다 크면 즉시 업데이트 (로그 최소화)
                if target_id > current_last_id:
                    save_last_message_id(target_id)
                    # 로그 제거: 새 메시지 발견 시에만 출력
                
                # 실제로 새 메시지인지 확인 (중복 필터링)
                new_messages = []
                skipped_count_debug = 0
                for msg in messages:
                    msg_id = msg[0]
                    # 이미 전송한 메시지는 제외
                    if msg_id not in sent_message_ids:
                        new_messages.append(msg)
                    else:
                        skipped_count_debug += 1
                
                # 디버깅 로그 최소화: 새 메시지가 있을 때만 출력
                if new_messages:
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] 새 메시지 {len(new_messages)}개 발견 (스킵: {skipped_count_debug}개)")
                elif skipped_count_debug > 0:
                    # 같은 메시지를 계속 조회하는 경우만 로그 (30초마다 한 번)
                    if not hasattr(poll_messages, 'last_skip_log') or time.time() - poll_messages.last_skip_log > 30:
                        db_latest_id = get_latest_message_id()
                        print(f"[{datetime.now().strftime('%H:%M:%S')}] 모든 메시지 이미 처리됨 (조회: {len(messages)}개, 스킵: {skipped_count_debug}개, DB 최신 ID: {db_latest_id})")
                        poll_messages.last_skip_log = time.time()
                
                if new_messages:
                    
                    max_id = 0
                    sent_count = 0
                    skipped_count = 0
                    
                    for msg in new_messages:
                        # 필드 개수에 따라 동적으로 처리
                        msg_id = msg[0]
                        chat_id = msg[1]
                        user_id = msg[2]
                        message = msg[3]
                        created_at = msg[4]
                        
                        # 선택적 필드 처리
                        v_field = None
                        kakao_user_id = None
                        enc_type = 31  # 기본값
                        
                        if len(msg) >= 6:
                            v_field = msg[5]
                            # v 필드를 JSON 파싱하여 enc 추출
                            if v_field:
                                try:
                                    if isinstance(v_field, str):
                                        v_parsed = json.loads(v_field)
                                        if isinstance(v_parsed, dict) and "enc" in v_parsed:
                                            enc_type = v_parsed["enc"]
                                            if enc_type is None:
                                                enc_type = 31  # 기본값 (이미지 분석 결과: i9은 31로 고정)
                                except (json.JSONDecodeError, TypeError, KeyError):
                                    # JSON 파싱 실패 시 기본값 사용
                                    pass
                        if len(msg) >= 7:
                            kakao_user_id = msg[6]
                        if len(msg) >= 8:
                            # DB의 encType 컬럼이 있으면 우선 사용
                            db_enc_type = msg[7]
                            if db_enc_type is not None:
                                enc_type = db_enc_type
                            else:
                                enc_type = 31  # 기본값
                        
                        max_id = max(max_id, msg_id)
                        
                        # 메시지가 비어있는 경우 스킵
                        if not message or message.strip() == "":
                            skipped_count += 1
                            sent_message_ids.add(msg_id)
                            continue
                        
                        # 암호화된 메시지 복호화 시도
                        decrypted_message = None
                        
                        # base64로 보이는 메시지는 암호화된 메시지일 가능성이 높음
                        is_base64_like = (isinstance(message, str) and 
                                         len(message) > 10 and 
                                         len(message) % 4 == 0 and
                                         all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=' for c in message))
                        
                        if DECRYPT_ENABLED and is_base64_like:
                            # enc 후보: v.enc/encType 우선, 이후 31, 32, 30 순 재시도
                            # kakaodecrypt.py 테스트에서 enc=31이 가장 일반적이므로 우선순위 높임
                            enc_candidates = []
                            if enc_type is not None:
                                enc_candidates.append(enc_type)
                            # 기본값 31을 우선 시도 (가장 일반적)
                            enc_candidates += [31, 32, 30]
                            enc_candidates = list(dict.fromkeys(enc_candidates))  # 중복 제거

                            decrypted_message = None
                            tried_user_ids = []
                            
                            # 시도할 user_id 후보 목록 (우선순위 순서)
                            candidate_user_ids = []
                            decrypt_user_id = kakao_user_id if kakao_user_id else user_id
                            if decrypt_user_id:
                                candidate_user_ids.append(('발신자 user_id (DB)', decrypt_user_id))
                            if MY_USER_ID and MY_USER_ID != decrypt_user_id:
                                candidate_user_ids.append(('MY_USER_ID', MY_USER_ID))
                            
                            print(f"[디버그] 복호화 시도할 user_id 후보: {candidate_user_ids}, enc 후보: {enc_candidates}")
                            
                            for candidate_name, candidate_id in candidate_user_ids:
                                if decrypted_message:
                                    break
                                tried_user_ids.append(candidate_id)
                                for enc_try in enc_candidates:
                                    try:
                                        decrypt_user_id_int = int(candidate_id)
                                        if decrypt_user_id_int > 0:
                                            decrypted_message = decrypt_message(message, v_field, decrypt_user_id_int, enc_try, debug=False)
                                            if decrypted_message and decrypted_message != message:
                                                has_control_chars = any(ord(c) < 32 and c not in '\n\r\t' for c in decrypted_message)
                                                if not has_control_chars:
                                                    print(f"[✓] 메시지 복호화 성공 ({candidate_name}): ID={msg_id}, user_id={candidate_id}, enc_type={enc_try}")
                                                    if candidate_name == 'MY_USER_ID':
                                                        print(f"[정보] MY_USER_ID로 복호화 성공했지만, 일반적으로는 발신자 user_id를 사용합니다.")
                                                    break
                                                else:
                                                    decrypted_message = None
                                                    print(f"[경고] 복호화된 메시지가 깨져있음 ({candidate_name}): ID={msg_id}, user_id={candidate_id}, enc_type={enc_try}")
                                            else:
                                                decrypted_message = None
                                    except Exception:
                                        decrypted_message = None
                                if decrypted_message:
                                    break
                            
                            if not user_id:
                                print(f"[경고] 발신자 user_id가 없어 복호화 불가: ID={msg_id}, enc_type={enc_type}")
                                print(f"[해결] DB에서 user_id 컬럼을 확인하세요.")
                            
                            if not decrypted_message:
                                print(f"[✗] 메시지 복호화 실패: ID={msg_id}, 발신자 user_id={user_id}, enc_type={enc_type}")
                                if user_id:
                                    print(f"[디버그] 복호화 실패 원인 확인: 발신자 user_id={user_id}, enc_type={enc_type}, 메시지 길이={len(message)}")
                                    print(f"[디버그] enc 후보: {enc_candidates}, user 후보: {candidate_user_ids}")
                            elif decrypted_message:
                                has_control_chars = any(ord(c) < 32 and c not in '\n\r\t' for c in decrypted_message)
                                is_garbled = len(decrypted_message) > 0 and (has_control_chars or 
                                    any(ord(c) > 127 and c not in decrypted_message.encode('utf-8', errors='ignore').decode('utf-8', errors='ignore') 
                                        for c in decrypted_message))
                                
                                if has_control_chars or is_garbled:
                                    print(f"[경고] 복호화된 메시지가 깨져있음: ID={msg_id}, 발신자 user_id={user_id}")
                                    print(f"[경고] 복호화 키가 잘못되었을 가능성이 높습니다.")
                                    print(f"[디버그] enc 후보: {enc_candidates}, user 후보: {candidate_user_ids}")
                                    decrypted_message = None
                        
                        # 복호화 성공하면 복호화된 메시지 사용, 실패하면 원본 사용
                        final_message = decrypted_message if decrypted_message else message
                        
                        # 복호화 실패한 base64 메시지도 서버로 전송 (서버에서 복호화 시도)
                        # 단, 복호화 실패한 경우 원본 메시지와 함께 복호화 정보 전송
                        if is_base64_like and not decrypted_message:
                            print(f"[경고] 암호화된 메시지 복호화 실패: ID={msg_id}, 서버로 원본 전송 (서버에서 복호화 시도)")
                            # 복호화 실패해도 서버로 전송 (서버에서 처리하도록)
                            # final_message는 원본 메시지 사용
                        
                        # 메시지 데이터 구성
                        # Iris 코드: ObserverHelper.kt에서 val userId = cursor.getLong(columnNames.indexOf("user_id"))
                        # Iris 코드: KakaoDecrypt.decrypt(enc, message, userId) - 발신자의 user_id 사용
                        # 따라서 복호화에는 발신자의 user_id를 사용해야 함
                        # DB의 user_id 컬럼이 발신자의 user_id (Iris 코드 기준)
                        decrypt_user_id_for_server = kakao_user_id if kakao_user_id else user_id
                        
                        # 중요: userId가 없으면 서버에서 복호화 불가
                        if not decrypt_user_id_for_server:
                            print(f"[경고] 발신자 user_id가 없어 서버 복호화 불가: ID={msg_id}, chat_id={chat_id}")
                            print(f"[경고] DB의 user_id 컬럼을 확인하세요.")
                        
                        message_data = {
                            "_id": msg_id,
                            "chat_id": chat_id,
                            "user_id": user_id,  # DB의 user_id 컬럼 (메시지 발신자, Iris 코드 기준)
                            "message": final_message,  # 복호화된 메시지 또는 원본
                            "created_at": created_at,
                            "v": v_field,  # 암호화 정보 포함
                            "userId": decrypt_user_id_for_server,  # 메시지 발신자 user_id (복호화에 사용, Iris 코드 기준)
                            "myUserId": MY_USER_ID,  # 자신의 user_id (참고용, fallback용)
                            "encType": enc_type  # 암호화 타입 (기본값: 31)
                        }
                        
                        # 디버그: 서버로 전송할 user_id 확인 (복호화 실패한 경우만)
                        if not decrypted_message and is_base64_like:
                            print(f"[디버그] 서버로 전송할 user_id 정보:")
                            print(f"  - DB 쿼리 결과: msg[2] (user_id)={user_id}, msg[6] (userId)={kakao_user_id if len(msg) >= 7 else 'N/A'}")
                            print(f"  - 최종 선택된 userId: {decrypt_user_id_for_server} (kakao_user_id 우선, 없으면 user_id)")
                            print(f"  - Iris 코드 기준: 발신자 user_id를 사용해야 함 (ObserverHelper.kt 참조)")
                            print(f"  - 전송할 message_data.userId: {decrypt_user_id_for_server}")
                            print(f"  - 전송할 message_data.user_id: {user_id}")
                            print(f"  - 전송할 message_data.myUserId: {MY_USER_ID}")
                        
                        # 서버로 전송
                        print(f"[전송 시도] 메시지 ID={msg_id}, 내용 길이={len(final_message)}, room={chat_id}")
                        if send_to_server(message_data):
                            sent_count += 1
                            # 전송 성공한 메시지는 sent_message_ids에 추가 (이미 추가되어 있지만 확실히)
                            sent_message_ids.add(msg_id)
                            print(f"[✓] 메시지 전송 성공: ID={msg_id}")
                        else:
                            # 전송 실패한 메시지는 sent_message_ids에서 제거하여 재시도 가능하게 함
                            sent_message_ids.discard(msg_id)
                            print(f"[✗] 메시지 전송 실패: ID={msg_id}, chat_id={chat_id}")
                    
                    # 메시지 전송 완료 로그
                    # 참고: last_message_id는 이미 위(565-572줄)에서 조회된 메시지의 최대 ID로 업데이트됨
                    if sent_count > 0:
                        log_msg = f"[완료] {sent_count}개 메시지 전송 완료"
                        if skipped_count > 0:
                            log_msg += f", {skipped_count}개 스킵"
                        print(log_msg)
                else:
                    # 모든 메시지가 이미 처리됨
                    # 참고: last_message_id는 이미 위(565-572줄)에서 조회된 메시지의 최대 ID로 업데이트됨
                    pass
            else:
                # 메시지 없음 (로그 출력 안 함)
                pass
            
            # 폴링 간격 증가 (1초로 변경하여 로그 최소화)
            time.sleep(1.0)
            
        except KeyboardInterrupt:
            print("\n\n[폴링 중지]")
            break
        except Exception as e:
            print(f"\n[폴링 오류] {e}")
            import traceback
            traceback.print_exc()
            time.sleep(1)

if __name__ == "__main__":
    poll_messages()

