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

# ⚠️ 복호화 로직 모듈화 (절대 수정 금지)
# 복호화 로직은 별도 모듈로 분리되어 있으며, 이 모듈은 절대 수정하지 않습니다.

# Phase 2: attachment 복호화 모듈 변수 초기화 (기본값 설정)
ATTACHMENT_DECRYPT_AVAILABLE = False
decrypt_attachment = None
ATTACHMENT_DECRYPT_WHITELIST = set()

try:
    import sys
    import os
    # 현재 스크립트 디렉토리를 경로에 추가
    script_dir = os.path.dirname(os.path.abspath(__file__))
    if script_dir not in sys.path:
        sys.path.insert(0, script_dir)
    from kakao_decrypt_module import decrypt_message, decrypt_kakaotalk_message, CRYPTO_AVAILABLE, KAKAODECRYPT_AVAILABLE
    # kakaodecrypt 모듈도 import (채팅방 이름 복호화에 사용)
    try:
        from kakaodecrypt import KakaoDecrypt
    except ImportError:
        KakaoDecrypt = None
    # Phase 2: attachment 복호화 모듈 import
    try:
        from attachment_decrypt import decrypt_attachment as _decrypt_attachment, ATTACHMENT_DECRYPT_WHITELIST as _ATTACHMENT_DECRYPT_WHITELIST
        ATTACHMENT_DECRYPT_AVAILABLE = True
        decrypt_attachment = _decrypt_attachment
        ATTACHMENT_DECRYPT_WHITELIST = _ATTACHMENT_DECRYPT_WHITELIST
        print("[✓] attachment 복호화 모듈 로드 성공 (attachment_decrypt.py)")
    except ImportError as e:
        ATTACHMENT_DECRYPT_AVAILABLE = False
        decrypt_attachment = None
        ATTACHMENT_DECRYPT_WHITELIST = set()
        print(f"[경고] attachment 복호화 모듈 로드 실패: {e}")
    print("[✓] 복호화 모듈 로드 성공 (kakao_decrypt_module.py)")
except ImportError as e:
    print(f"[✗] 복호화 모듈 로드 실패: {e}")
    print("[경고] 복호화 기능이 제한될 수 있습니다.")
    CRYPTO_AVAILABLE = False
    KAKAODECRYPT_AVAILABLE = False
    KakaoDecrypt = None
    # ATTACHMENT_DECRYPT_AVAILABLE은 이미 위에서 False로 초기화됨
    # 폴백 함수 정의 (에러 방지)
    def decrypt_message(*args, **kwargs):
        return None
    def decrypt_kakaotalk_message(*args, **kwargs):
        return None

# 카카오톡 DB 경로 (하율 패치로 접근 가능)
DB_PATH = "/data/data/com.kakao.talk/databases/KakaoTalk.db"
DB_PATH2 = "/data/data/com.kakao.talk/databases/KakaoTalk2.db"  # Iris 방식: db2로 attach
# 서버 URL (WebSocket)
WS_URL = "ws://211.218.42.222:5002/ws"
HTTP_URL = "http://211.218.42.222:5002"

# [제거됨] Iris HTTP API 설정
# 이제 Bridge APK가 메시지 전송을 담당하므로 클라이언트는 메시지 수신만 수행합니다.

# 마지막 처리한 메시지 ID 추적 (파일로 저장)
STATE_FILE = os.path.expanduser("~/last_message_id.txt")
# 자신의 user_id 저장 (복호화에 사용)
MY_USER_ID_FILE = os.path.expanduser("~/my_user_id.txt")
MY_USER_ID = None
# 전송한 메시지 ID 추적 (중복 방지)
sent_message_ids = set()

# 반응 업데이트 확인용 캐시 (msg_id -> {'count': int, 'supplement': str, 'last_check': float})
_reaction_check_cache = {}

# 복호화 관련 설정
# 카카오톡 Android 복호화 로직 (Iris KakaoDecrypt.kt 기반)
# - IV: 고정된 바이트 배열
# - PASSWORD: 고정된 char 배열
# - Salt: userId + encType 기반 (incept(830819) for encType=31)
# - PKCS12 키 유도 (SHA-1, 2 iterations, 256-bit key)
# - AES/CBC/NoPadding 복호화 후 수동 패딩 제거
DECRYPT_ENABLED = CRYPTO_AVAILABLE

# ⚠️ 복호화 관련 상수 및 함수는 kakao_decrypt_module.py로 이동됨
# 복호화 로직은 모듈에서 import하여 사용합니다.
# 아래 코드는 레거시 호환성을 위해 주석 처리되었습니다.
# 실제 사용은 kakao_decrypt_module.py의 함수들을 사용하세요.

# (레거시 호환성: 채팅방 이름 복호화에서 사용하는 경우를 위해 일부 상수는 유지)
# 하지만 실제 복호화 로직은 모듈에서 import하여 사용
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

def get_name_of_user_id(user_id):
    """
    Iris 원본 코드 기반: user_id로 발신자 이름 조회 (KakaoDB.getNameOfUserId)
    
    Args:
        user_id: 발신자의 user_id (Long integer 또는 문자열)
    
    Returns:
        발신자 이름 (복호화된) 또는 None
    """
    if not user_id:
        return None
    
    try:
        user_id_str = str(user_id)
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Iris 방식: KakaoTalk2.db를 db2로 attach
        db2_attached = False
        try:
            if os.path.exists(DB_PATH2):
                cursor.execute(f"ATTACH DATABASE '{DB_PATH2}' AS db2")
                db2_attached = True
        except Exception as e:
            print(f"[발신자] db2 attach 실패: {e}")
        
        # Iris 코드: checkNewDb() - open_chat_member 테이블 존재 확인
        has_open_chat_member = False
        if db2_attached:
            try:
                cursor.execute("SELECT name FROM db2.sqlite_master WHERE type='table' AND name='open_chat_member'")
                has_open_chat_member = cursor.fetchone() is not None
            except:
                pass
        
        # Iris 코드: getNameOfUserId - 신규 DB 방식 (open_chat_member 우선)
        # 중요: 각 테이블에서 개별 조회하여 더 긴 문자열을 선택
        if has_open_chat_member:
            try:
                # 먼저 각 테이블에서 개별 조회 (전체 문자열 확인)
                ocm_name = None
                ocm_enc = None
                friends_name = None
                friends_enc = None
                
                try:
                    cursor.execute("SELECT nickname, enc FROM db2.open_chat_member WHERE user_id = ?", (user_id_str,))
                    ocm_result = cursor.fetchone()
                    if ocm_result:
                        ocm_name = ocm_result[0]
                        ocm_enc = ocm_result[1] if len(ocm_result) > 1 and ocm_result[1] is not None else 0
                except Exception as e:
                    print(f"[DB조회] open_chat_member 조회 오류: {e}")
                
                try:
                    cursor.execute("SELECT name, enc FROM db2.friends WHERE id = ?", (user_id_str,))
                    friends_result = cursor.fetchone()
                    if friends_result:
                        friends_name = friends_result[0]
                        friends_enc = friends_result[1] if len(friends_result) > 1 and friends_result[1] is not None else 0
                except Exception as e:
                    print(f"[DB조회] friends 조회 오류: {e}")
                
                # [DB 조회 로그] 실제 DB에서 조회한 정보 출력
                print(f"[DB조회] user_id={user_id_str}로 조회:")
                if ocm_name:
                    ocm_name_str = str(ocm_name)
                    print(f"[DB조회]   open_chat_member: nickname 길이={len(ocm_name_str)}, 값=\"{ocm_name_str}\", enc={ocm_enc}")
                else:
                    print(f"[DB조회]   open_chat_member: 결과 없음")
                if friends_name:
                    friends_name_str = str(friends_name)
                    print(f"[DB조회]   friends: name 길이={len(friends_name_str)}, 값=\"{friends_name_str}\", enc={friends_enc}")
                else:
                    print(f"[DB조회]   friends: 결과 없음")
                print(f"[DB조회] MY_USER_ID={MY_USER_ID}")
                
                # 더 긴 문자열 선택 (복호화 성공률 높이기 위해)
                encrypted_name = None
                enc = 0
                
                if ocm_name and friends_name:
                    # 둘 다 있으면 더 긴 것을 선택
                    ocm_len = len(str(ocm_name))
                    friends_len = len(str(friends_name))
                    if ocm_len >= friends_len:
                        encrypted_name = ocm_name
                        enc = ocm_enc
                        print(f"[DB조회] open_chat_member 선택 (더 긴 문자열): 길이={ocm_len}")
                    else:
                        encrypted_name = friends_name
                        enc = friends_enc
                        print(f"[DB조회] friends 선택 (더 긴 문자열): 길이={friends_len}")
                elif ocm_name:
                    encrypted_name = ocm_name
                    enc = ocm_enc
                    print(f"[DB조회] open_chat_member 선택 (유일한 값)")
                elif friends_name:
                    encrypted_name = friends_name
                    enc = friends_enc
                    print(f"[DB조회] friends 선택 (유일한 값)")
                
                if encrypted_name:
                    
                    # 암호화되어 있으면 복호화 시도 (Iris: KakaoDecrypt.decrypt(enc, encryptedName, Configurable.botId))
                    # 복호화 시도 조건: MY_USER_ID가 있고, 암호화된 문자열인 경우
                    if KAKAODECRYPT_AVAILABLE and MY_USER_ID:
                        # base64로 보이는 경우 암호화된 것으로 간주
                        # 짧은 문자열도 암호화일 수 있으므로 len > 5로 완화
                        is_base64_like = (isinstance(encrypted_name, str) and 
                                        len(encrypted_name) > 5 and
                                        all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=' for c in encrypted_name))
                        
                        if is_base64_like:
                            # enc 후보: DB에서 조회한 enc가 있으면 우선 사용, 없으면 31, 30, 32 시도
                            enc_candidates = []
                            if enc > 0:
                                enc_candidates.append(enc)
                            # 기본 후보 추가 (enc가 없거나 실패 시)
                            enc_candidates.extend([31, 30, 32])
                            enc_candidates = list(dict.fromkeys(enc_candidates))  # 중복 제거
                            
                            # 복호화 관련 로그 주석 처리 (복호화 완료되었으므로)
                            # print(f"[발신자] 복호화 시도: user_id={user_id}, MY_USER_ID={MY_USER_ID}, 암호화된 이름=\"{encrypted_name}\", enc 후보={enc_candidates}")
                            
                            for enc_try in enc_candidates:
                                try:
                                    decrypt_user_id_int = int(MY_USER_ID)
                                    if decrypt_user_id_int > 0:
                                        # KakaoDecrypt.decrypt(user_id, enc, cipher_b64)
                                        decrypted = KakaoDecrypt.decrypt(decrypt_user_id_int, enc_try, encrypted_name)
                                        
                                        if decrypted and decrypted != encrypted_name:
                                            # 유효한 텍스트인지 확인 (제어 문자 제외)
                                            has_control_chars = any(ord(c) < 32 and c not in '\n\r\t' for c in decrypted)
                                            
                                            # 복호화 결과가 너무 짧거나 제어 문자가 많으면 실패로 간주
                                            if not has_control_chars and len(decrypted) > 0:
                                                # print(f"[발신자] ✅ 복호화 성공: user_id={user_id}, enc={enc_try}, \"{encrypted_name}\" -> \"{decrypted}\"")
                                                # print(f"[발신자] 복호화 결과 검증: 길이={len(decrypted)}, 제어문자={has_control_chars}")
                                                conn.close()
                                                return decrypted
                                            # else:
                                            #     print(f"[발신자] 복호화 결과 무효: enc={enc_try}, 결과=\"{decrypted}\", 제어문자={has_control_chars}")
                                except Exception as e:
                                    # print(f"[발신자] 복호화 시도 실패: enc={enc_try}, 오류={type(e).__name__}: {e}")
                                    continue
                            
                            # 모든 enc 후보 실패 시 로그 출력 (서버에서 복호화 시도 예정)
                            print(f"[발신자] ❌ 클라이언트 복호화 실패 (모든 enc 후보 시도 완료), 서버로 암호화된 이름 전송: user_id={user_id}, DB에서 조회한 enc={enc}, MY_USER_ID={MY_USER_ID}")
                            print(f"[발신자] 시도한 enc 후보: {enc_candidates}, 암호화된 이름=\"{encrypted_name}\" (서버에서 복호화 시도 예정)")
                        else:
                            print(f"[발신자] base64 형태가 아님 (암호화되지 않은 것으로 간주): \"{encrypted_name}\"")
                    
                    # 복호화 실패하거나 암호화되지 않은 경우 원본 반환 (서버에서 복호화 시도)
                    print(f"[발신자] 암호화된 이름을 서버로 전송 (서버에서 복호화 시도 예정): \"{encrypted_name}\" (길이={len(str(encrypted_name))})")
                    conn.close()
                    return encrypted_name
                else:
                    # encrypted_name이 None인 경우
                    print(f"[발신자] 이름 조회 실패: user_id={user_id}, open_chat_member와 friends 모두 결과 없음")
                    conn.close()
                    return None
            except Exception as e:
                print(f"[발신자] open_chat_member 조회 오류: {e}")
                import traceback
                traceback.print_exc()
                if conn:
                    conn.close()
        else:
            # Iris 코드: 구 DB 방식 (friends 테이블만)
            try:
                sql = "SELECT name, enc FROM db2.friends WHERE id = ?"
                if db2_attached:
                    cursor.execute(sql, (user_id_str,))
                    result = cursor.fetchone()
                    
                    # [DB 조회 로그] 실제 DB에서 조회한 정보 출력
                    print(f"[DB조회] user_id={user_id_str}로 friends 테이블 조회:")
                    if result:
                        name_value = result[0] if result[0] else None
                        enc_value = result[1] if len(result) > 1 else None
                        name_str = str(name_value) if name_value else 'None'
                        print(f"[DB조회]   결과: name 길이={len(name_str) if name_value else 0}, enc={enc_value}")
                        print(f"[DB조회]   name 전체값: \"{name_str}\"")
                    else:
                        print(f"[DB조회]   결과 없음")
                    print(f"[DB조회] MY_USER_ID={MY_USER_ID}")
                    
                    if result and result[0]:
                        encrypted_name = result[0]
                        enc = result[1] if len(result) > 1 and result[1] is not None else 0
                        
                        # 암호화되어 있으면 복호화 시도
                        if KAKAODECRYPT_AVAILABLE and MY_USER_ID:
                            try:
                                # base64로 보이는 경우 암호화된 것으로 간주 (길이 조건 완화)
                                is_base64_like = (isinstance(encrypted_name, str) and 
                                                len(encrypted_name) > 5 and
                                                all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=' for c in encrypted_name))
                                
                                if is_base64_like:
                                    # enc 후보: DB에서 조회한 enc가 있으면 우선 사용, 없으면 31, 30, 32 시도
                                    enc_candidates = []
                                    if enc > 0:
                                        enc_candidates.append(enc)
                                    enc_candidates.extend([31, 30, 32])
                                    enc_candidates = list(dict.fromkeys(enc_candidates))
                                    
                                    print(f"[발신자] 복호화 시도 (friends): user_id={user_id}, MY_USER_ID={MY_USER_ID}, 암호화된 이름=\"{encrypted_name}\", enc 후보={enc_candidates}")
                                    
                                    for enc_try in enc_candidates:
                                        try:
                                            decrypt_user_id_int = int(MY_USER_ID)
                                            if decrypt_user_id_int > 0:
                                                # KakaoDecrypt.decrypt(user_id, enc, cipher_b64)
                                                decrypted = KakaoDecrypt.decrypt(decrypt_user_id_int, enc_try, encrypted_name)
                                                
                                                if decrypted and decrypted != encrypted_name:
                                                    # 유효한 텍스트인지 확인
                                                    has_control_chars = any(ord(c) < 32 and c not in '\n\r\t' for c in decrypted)
                                                    
                                                    if not has_control_chars and len(decrypted) > 0:
                                                        print(f"[발신자] ✅ 복호화 성공 (friends): user_id={user_id}, enc={enc_try}, \"{encrypted_name}\" -> \"{decrypted}\"")
                                                        conn.close()
                                                        return decrypted
                                                    else:
                                                        print(f"[발신자] 복호화 결과 무효 (friends): enc={enc_try}, 결과=\"{decrypted}\", 제어문자={has_control_chars}")
                                        except Exception as e:
                                            print(f"[발신자] 복호화 시도 실패 (friends): enc={enc_try}, 오류={type(e).__name__}: {e}")
                                            continue
                                    
                                    # 모든 enc 후보 실패 시 로그 출력 (서버에서 복호화 시도 예정)
                                    print(f"[발신자] ❌ 클라이언트 복호화 실패 (friends, 모든 enc 후보 시도 완료), 서버로 암호화된 이름 전송: user_id={user_id}, DB에서 조회한 enc={enc}, MY_USER_ID={MY_USER_ID}")
                                    print(f"[발신자] 시도한 enc 후보: {enc_candidates}, 암호화된 이름=\"{encrypted_name}\" (서버에서 복호화 시도 예정)")
                                else:
                                    print(f"[발신자] base64 형태가 아님 (friends, 암호화되지 않은 것으로 간주): \"{encrypted_name}\"")
                            except Exception as e:
                                print(f"[발신자] 복호화 처리 중 예외 (friends): {type(e).__name__}: {e}")
                                import traceback
                                traceback.print_exc()
                        else:
                            print(f"[발신자] 암호화된 이름을 서버로 전송 (friends, 서버에서 복호화 시도 예정): \"{encrypted_name}\"")
                            conn.close()
                            return encrypted_name
            except Exception as e:
                print(f"[발신자] friends 조회 오류: {e}")
        
        conn.close()
        return None
    except Exception as e:
        print(f"[발신자] 이름 조회 실패: user_id={user_id}, 오류={e}")
        return None

def get_chat_room_data(chat_id):
    """채팅방 ID로 채팅방 데이터 조회 (Iris 방식: private_meta에서 name 추출)"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Iris 방식: KakaoTalk2.db를 db2로 attach
        db2_attached = False
        try:
            if os.path.exists(DB_PATH2):
                cursor.execute(f"ATTACH DATABASE '{DB_PATH2}' AS db2")
                db2_attached = True
                print(f"[채팅방] db2 attach 성공: {DB_PATH2}")
            else:
                print(f"[채팅방] db2 파일 없음: {DB_PATH2}")
        except Exception as e:
            print(f"[채팅방] db2 attach 실패: {e}")
        
        # Iris 방식: chat_rooms 테이블의 private_meta 컬럼에서 name 추출
        try:
            # private_meta 컬럼 확인 (Iris 방식)
            cursor.execute("SELECT private_meta FROM chat_rooms WHERE id = ?", (chat_id,))
            result = cursor.fetchone()
            
            if result:
                private_meta_value = result[0]
                
                # Iris 방식: !value.isNullOrEmpty() 체크
                if private_meta_value and str(private_meta_value).strip():
                    private_meta_str = str(private_meta_value)
                    
                    try:
                        # JSON 파싱 (Iris: Json.decodeFromString)
                        private_meta = json.loads(private_meta_str)
                        
                        # Iris: name.jsonPrimitive.content
                        name_element = private_meta.get('name')
                        
                        if name_element is not None:
                            # Iris: name.jsonPrimitive.content
                            if isinstance(name_element, str):
                                room_name_raw = name_element
                            elif isinstance(name_element, dict):
                                # JsonPrimitive의 content 속성
                                room_name_raw = name_element.get('content') or name_element.get('value') or str(name_element)
                            else:
                                room_name_raw = str(name_element)
                            
                            if room_name_raw:
                                conn.close()
                                return {
                                    'name': str(room_name_raw),  # 암호화된 이름 (JSON에서 추출)
                                    'name_column': 'private_meta.name',
                                    'raw_data': {'private_meta': private_meta_str, 'private_meta_parsed': private_meta}
                                }
                    except json.JSONDecodeError as e:
                        pass
                else:
                    print(f"[채팅방] private_meta가 NULL이거나 비어있음: chat_id={chat_id}")
            else:
                print(f"[채팅방] private_meta 조회 결과 없음: chat_id={chat_id}")
            
            # private_meta에 name이 없으면 db2.open_link 테이블 확인 (Iris 방식)
            if db2_attached:
                try:
                    cursor.execute("SELECT name FROM db2.open_link WHERE id = (SELECT link_id FROM chat_rooms WHERE id = ?)", (chat_id,))
                    result = cursor.fetchone()
                    if result and result[0]:
                        room_name_raw = result[0]
                        print(f"[채팅방] db2.open_link에서 이름 조회 성공: chat_id={chat_id}, name=\"{room_name_raw}\"")
                        conn.close()
                        return {
                            'name': room_name_raw,
                            'name_column': 'db2.open_link.name',
                            'raw_data': {'name': room_name_raw}
                        }
                    else:
                        print(f"[채팅방] db2.open_link 조회 결과 없음: chat_id={chat_id}")
                except Exception as e:
                    print(f"[채팅방] db2.open_link 조회 실패: chat_id={chat_id}, 오류={e}")
            else:
                print(f"[채팅방] db2 attach 안됨, db2.open_link 확인 불가: chat_id={chat_id}")
            
            # fallback: 직접 name 컬럼 확인
            cursor.execute("PRAGMA table_info(chat_rooms)")
            columns_info = cursor.fetchall()
            available_columns = [col[1] for col in columns_info]
            
            if 'name' in available_columns:
                cursor.execute("SELECT name FROM chat_rooms WHERE id = ?", (chat_id,))
                result = cursor.fetchone()
                if result and result[0]:
                    room_name_raw = result[0]
                    conn.close()
                    return {
                        'name': room_name_raw,
                        'name_column': 'name',
                        'raw_data': {'name': room_name_raw}
                    }
        except Exception as e:
            print(f"[채팅방] 데이터 조회 예외: chat_id={chat_id}, 오류={e}")
        
        conn.close()
        return None
    except Exception as e:
        print(f"[채팅방] DB 연결 오류: chat_id={chat_id}, 오류={e}")
        return None

# DB 구조 캐시 (최초 1회만 확인)
_db_structure_cache = None
_select_columns_cache = None

def get_new_messages():
    """새 메시지 조회 (중복 방지)"""
    global _db_structure_cache, _select_columns_cache
    
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
        
        # DB 구조 캐시 사용 (최초 1회만 확인)
        if _select_columns_cache is None:
            # 먼저 테이블 구조 확인하여 사용 가능한 컬럼 확인
            try:
                cursor.execute("PRAGMA table_info(chat_logs)")
                columns_info = cursor.fetchall()
                available_columns = [col[1] for col in columns_info]
                _db_structure_cache = available_columns
                
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
                if "type" in available_columns:
                    select_columns.append("type")  # 메시지 타입 (반응 감지용)
                    print(f"[DB 구조] ✅ type 컬럼 사용 가능")
                else:
                    print(f"[DB 구조] ⚠️ type 컬럼 없음 - 반응 감지 불가능")
                if "attachment" in available_columns:
                    select_columns.append("attachment")  # 첨부 정보 (반응 정보 포함 가능)
                    print(f"[DB 구조] ✅ attachment 컬럼 사용 가능")
                else:
                    print(f"[DB 구조] ⚠️ attachment 컬럼 없음 - 반응/이미지 감지 불가능")
                if "referer" in available_columns:
                    select_columns.append("referer")  # 답장 메시지 ID (referer 필드)
                    print(f"[DB 구조] ✅ referer 컬럼 사용 가능")
                else:
                    print(f"[DB 구조] ⚠️ referer 컬럼 없음 - 답장 감지 불가능")
                if "supplement" in available_columns:
                    select_columns.append("supplement")  # 반응 상세 정보 (supplement 필드)
                    print(f"[DB 구조] ✅ supplement 컬럼 사용 가능")
                else:
                    print(f"[DB 구조] ⚠️ supplement 컬럼 없음 - 반응 상세 정보 확인 불가능")
                
                _select_columns_cache = select_columns
            except Exception as e:
                # 테이블 정보 조회 실패 시 기본 쿼리 사용
                print(f"[경고] 테이블 구조 확인 실패: {e}, 기본 쿼리 사용")
                _select_columns_cache = ["_id", "chat_id", "user_id", "message", "created_at"]
        
        # 캐시된 컬럼 사용
        select_columns = _select_columns_cache
        
        # 쿼리 생성
        columns_str = ", ".join(select_columns)
        query = f"""
            SELECT {columns_str}
            FROM chat_logs
            WHERE _id > ?
            ORDER BY _id ASC
            LIMIT 10
        """
        
        cursor.execute(query, (last_id,))
        raw_messages = cursor.fetchall()
        
        # ⚠️ 개선: 컬럼명 기반 dict로 변환 (인덱스 기반 접근 문제 해결)
        print(f"[get_new_messages] ⚠️⚠️⚠️ dict 변환 시작: raw_messages 개수={len(raw_messages) if raw_messages else 0}")
        try:
            column_names = [description[0] for description in cursor.description]
            print(f"[get_new_messages] ⚠️⚠️⚠️ 컬럼명 추출 완료: {len(column_names)}개")
            messages = []
            for row in raw_messages:
                msg_dict = dict(zip(column_names, row))
                messages.append(msg_dict)
            
            # ⚠️ 개선: DB 쿼리 결과 확인 로그 추가 (항상 출력)
            print(f"[get_new_messages] 쿼리 결과: {len(messages)}개 메시지 조회됨 (last_id={last_id})")
            print(f"[DB 쿼리] ⚠️⚠️⚠️ dict 변환 완료: messages 개수={len(messages)}, 타입={type(messages).__name__}")
            if len(messages) > 0:
                print(f"[DB 쿼리] 컬럼명: {column_names}")
                first_msg = messages[0]
                print(f"[DB 쿼리] 첫 메시지 타입: {type(first_msg).__name__}")
                print(f"[DB 쿼리] 첫 메시지 attachment: {first_msg.get('attachment') if first_msg.get('attachment') else 'NULL'}")
                print(f"[DB 쿼리] 첫 메시지 referer: {first_msg.get('referer') if first_msg.get('referer') else 'NULL'}")
                print(f"[DB 쿼리] 첫 메시지 msg_type: {first_msg.get('msg_type') if first_msg.get('msg_type') is not None else 'NULL'}")
            else:
                print(f"[DB 쿼리] ⚠️ messages가 비어있음")
        except Exception as e:
            print(f"[오류] ⚠️⚠️⚠️ dict 변환 실패: {e}, raw_messages 개수={len(raw_messages) if raw_messages else 0}")
            import traceback
            traceback.print_exc()
            # fallback: 원본 튜플 리스트 사용
            messages = raw_messages
            print(f"[오류] ⚠️⚠️⚠️ fallback으로 튜플 리스트 사용: messages 타입={type(messages).__name__}")
        
        conn.close()
        
        # 중복 메시지 필터링 (try 블록 안에서 처리)
        new_messages = []
        for msg in messages:
            msg_id = msg.get('_id') or msg.get('id')  # 컬럼명 기반 접근
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
        
        # 로그: 새 메시지가 있을 때만 상세 로그 출력
        if new_messages:
            print(f"[get_new_messages] ✅ {len(new_messages)}개 새 메시지 발견 (전체 {len(messages)}개 중)")
        elif len(messages) > 0:
            # 메시지는 조회되었지만 모두 이미 처리됨 (30초마다 한 번)
            if not hasattr(get_new_messages, 'last_skip_log') or time.time() - get_new_messages.last_skip_log > 30:
                print(f"[get_new_messages] ⚠️ 모든 메시지 이미 처리됨 (조회: {len(messages)}개)")
                get_new_messages.last_skip_log = time.time()
        
        return new_messages
        
    except Exception as e:
        # DB 조회 실패 시 빈 배열 반환
        print(f"[경고] DB 조회 실패: {e}")
        return []
        
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
ws_reconnect_thread = None  # 재연결 스레드
ws_reconnect_attempts = 0  # 재연결 시도 횟수
MAX_RECONNECT_ATTEMPTS = 10  # 최대 재연결 시도 횟수
RECONNECT_INTERVAL = 3  # 재연결 간격 (초)
# 마지막 메시지의 room 정보 저장 (서버 응답에 room이 없을 때 사용)
last_message_room = None
last_message_chat_id = None  # 마지막 메시지의 chat_id (숫자)

def connect_websocket():
    """WebSocket 연결"""
    global ws_connection
    
    def on_message(ws, message):
        """서버로부터 메시지 수신 (로깅만 수행, 전송은 Bridge APK가 담당)"""
        try:
            data = json.loads(message)
            
            # 서버 응답 로깅 (Bridge APK가 전송을 담당하므로 여기서는 로그만 출력)
            if data.get('type') == 'reply' and data.get('replies'):
                replies = data.get('replies', [])
                print(f"[서버 응답] {len(replies)}개 응답 수신 (Bridge APK가 전송 담당)")
                for idx, reply_item in enumerate(replies):
                    if isinstance(reply_item, dict):
                        reply_text = reply_item.get('text', '')
                        reply_room = reply_item.get('room', '')
                        print(f"[응답 {idx+1}/{len(replies)}] room=\"{reply_room}\", text=\"{reply_text[:50]}...\"")
                    elif isinstance(reply_item, str):
                        print(f"[응답 {idx+1}/{len(replies)}] text=\"{reply_item[:50]}...\"")
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
        """WebSocket 연결 종료 - 재연결 시도"""
        global ws_connection, ws_reconnect_thread, ws_reconnect_attempts
        print(f"[WebSocket 연결 종료] code={close_status_code}, msg={close_msg}")
        ws_connection = None
        
        # 재연결 스레드가 이미 실행 중이면 중복 실행 방지
        if ws_reconnect_thread and ws_reconnect_thread.is_alive():
            print("[재연결] 이미 재연결 시도 중입니다.")
            return
        
        # 재연결 스레드 시작
        def reconnect_loop():
            global ws_connection, ws_reconnect_attempts
            ws_reconnect_attempts = 0
            
            while ws_reconnect_attempts < MAX_RECONNECT_ATTEMPTS:
                ws_reconnect_attempts += 1
                print(f"[재연결 시도 {ws_reconnect_attempts}/{MAX_RECONNECT_ATTEMPTS}] {RECONNECT_INTERVAL}초 후 재연결 시도...")
                time.sleep(RECONNECT_INTERVAL)
                
                # 이미 연결되어 있으면 중단
                if ws_connection and ws_connection.sock and ws_connection.sock.connected:
                    print("[재연결] 이미 연결되어 있습니다.")
                    break
                
                # 재연결 시도
                print(f"[재연결 시도 {ws_reconnect_attempts}/{MAX_RECONNECT_ATTEMPTS}] 연결 시도 중...")
                if connect_websocket():
                    print(f"[✓] 재연결 성공 ({ws_reconnect_attempts}번째 시도)")
                    ws_reconnect_attempts = 0  # 성공 시 카운터 리셋
                    break
                else:
                    print(f"[✗] 재연결 실패 ({ws_reconnect_attempts}/{MAX_RECONNECT_ATTEMPTS})")
            
            if ws_reconnect_attempts >= MAX_RECONNECT_ATTEMPTS:
                print(f"[✗] 재연결 실패: 최대 시도 횟수({MAX_RECONNECT_ATTEMPTS}) 초과. 재연결을 중단합니다.")
        
        ws_reconnect_thread = threading.Thread(target=reconnect_loop, daemon=True)
        ws_reconnect_thread.start()
    
    def on_open(ws):
        """WebSocket 연결 성공"""
        global ws_connection, ws_reconnect_attempts
        print("[✓] WebSocket 연결 성공")
        ws_reconnect_attempts = 0  # 연결 성공 시 재연결 카운터 리셋
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

# ⚠️ 복호화 관련 함수들은 kakao_decrypt_module.py로 이동되었습니다.
# 이제 복호화 로직은 모듈에서 import하여 사용합니다.
# 아래 함수들은 제거되었으며, kakao_decrypt_module.py를 사용하세요.
# 
# 제거된 함수들:
# - generate_salt() -> kakao_decrypt_module.generate_salt()
# - generate_secret_key() -> kakao_decrypt_module.generate_secret_key()
# - decrypt_kakaotalk_message() -> kakao_decrypt_module.decrypt_kakaotalk_message()
# - decrypt_message() -> kakao_decrypt_module.decrypt_message()
# 
# ⚠️ 경고: 복호화 로직은 절대 수정하지 마세요!

# [제거됨] send_to_kakaotalk 함수
# 이제 Bridge APK가 메시지 전송을 담당하므로 클라이언트에서는 전송 로직이 필요 없습니다.
# Bridge APK가 서버로부터 type: "send" 메시지를 받아서 카카오톡으로 전송합니다.

def send_to_server(message_data, is_reaction=False):
    """서버로 메시지 전송 (WebSocket)
    
    Args:
        message_data: 전송할 메시지 데이터
        is_reaction: 반응 메시지 여부 (기본값: False)
    """
    global ws_connection, last_message_room
    
    # msg_id 추출 (kakao_log_id용)
    msg_id = message_data.get("_id") if isinstance(message_data, dict) else None
    
    # 반응 메시지인 경우 바로 전송
    if is_reaction:
        # 반응 메시지는 이미 올바른 형식으로 구성되어 있음
        payload = message_data
        
        # WebSocket 연결 확인
        if ws_connection is None:
            print("[경고] WebSocket 연결 없음. 재연결 시도...")
            if not connect_websocket():
                print("[✗] WebSocket 재연결 실패")
                return False
        
        # WebSocket으로 반응 정보 전송
        with ws_lock:
            if ws_connection and ws_connection.sock and ws_connection.sock.connected:
                try:
                    payload_str = json.dumps(payload, ensure_ascii=False)
                    print(f"[전송] 반응 정보 전송: 타입={payload.get('json', {}).get('reaction_type', 'unknown')}, 대상={payload.get('json', {}).get('target_message_id', 'unknown')}")
                    ws_connection.send(payload_str)
                    print(f"[✓] 반응 정보 전송 성공")
                    return True
                except Exception as e:
                    print(f"[✗] 반응 정보 전송 오류: {e}")
                    import traceback
                    traceback.print_exc()
                    ws_connection = None
                    return False
            else:
                print("[✗] WebSocket 연결 없음")
                return False
    
    # 일반 메시지 처리
    try:
        # room과 sender를 문자열로 변환 (서버가 문자열을 기대함)
        chat_id = message_data.get("chat_id", "")
        
        # chat_id 원본 값 저장 (디버그용)
        chat_id_original = chat_id
        
        # chat_id가 문자열이면 숫자로 변환 시도 (큰 숫자 처리)
        if isinstance(chat_id, str) and chat_id.isdigit():
            try:
                chat_id = int(chat_id)
            except (ValueError, OverflowError) as e:
                print(f"[경고] chat_id 숫자 변환 실패: {chat_id}, 오류: {e}")
                chat_id = chat_id_original  # 원본 유지
        elif not isinstance(chat_id, (int, str)) or (isinstance(chat_id, str) and not chat_id.isdigit()):
            print(f"[경고] 잘못된 chat_id 타입: {type(chat_id)}, 값: {chat_id}")
            chat_id = ""
        
        # chat_id 변환 후 확인 (디버그)
        if chat_id_original != chat_id:
            print(f"[디버그] chat_id 변환: {chat_id_original} ({type(chat_id_original)}) -> {chat_id} ({type(chat_id)})")
        
        room_id = str(chat_id) if chat_id else ""
        
        # 발신자 이름 조회 (Iris 방식)
        user_id = message_data.get("user_id")
        sender_name = None
        sender_name_encrypted = None  # 원본 암호화된 이름 (서버 복호화용)
        sender_name_decrypted = None  # 클라이언트에서 복호화한 이름
        
        if user_id:
            # Iris 원본 코드: getChatInfo에서 getNameOfUserId 호출
            sender_name = get_name_of_user_id(user_id)
            if sender_name:
                # sender_name이 암호화된 형태인지 확인 (복호화 실패한 경우)
                is_encrypted_name = (isinstance(sender_name, str) and 
                                   len(sender_name) > 10 and 
                                   len(sender_name) % 4 == 0 and
                                   all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=' for c in sender_name))
                
                if is_encrypted_name:
                    # 복호화 실패 - 암호화된 원본 저장 (서버에서 복호화 시도)
                    sender_name_encrypted = sender_name
                    sender_name_decrypted = None
                    print(f"[발신자] 클라이언트 복호화 실패, 서버로 암호화된 이름 전송 (서버에서 복호화 시도): user_id={user_id}, 암호화된 이름=\"{sender_name[:50]}...\"")
                else:
                    # 복호화 성공 - 복호화된 이름 저장
                    sender_name_decrypted = sender_name
                    sender_name_encrypted = None
                    print(f"[발신자] 복호화 성공: user_id={user_id}, 이름=\"{sender_name}\"")
            else:
                print(f"[발신자] 이름 조회 실패: user_id={user_id}, user_id만 사용")
        
        # 발신자 값 결정: 복호화된 이름이 있으면 "이름/user_id", 없으면 "user_id"
        # 서버 호환성을 위해 sender 필드에는 복호화된 이름 또는 암호화된 이름을 사용 (하위 호환성 유지)
        if sender_name_decrypted:
            sender = f"{sender_name_decrypted}/{user_id}" if user_id else sender_name_decrypted
        elif sender_name_encrypted:
            # 복호화 실패한 경우 암호화된 이름 사용 (서버에서 복호화 시도)
            sender = f"{sender_name_encrypted}/{user_id}" if user_id else sender_name_encrypted
        else:
            sender = str(user_id) if user_id else ""
        
        # sender_id 명시적으로 추출 (Phase 1.1: 데이터 구조 표준화)
        sender_id_for_transmission = str(user_id) if user_id else None
        
        message = str(message_data.get("message", ""))
        v_field = message_data.get("v")
        
        # 채팅방 데이터 조회 및 복호화
        room_data = get_chat_room_data(chat_id) if chat_id else None
        room_name_raw = room_data.get('name') if room_data else None
        room_name_column = room_data.get('name_column') if room_data else None
        
        # 채팅방 이름 복호화 시도
        room_name_decrypted = None
        room_name_encrypted = None
        
        if room_name_raw:
            print(f"[채팅방] 이름 조회 성공: chat_id={chat_id}, 길이={len(room_name_raw) if isinstance(room_name_raw, str) else 'N/A'}")
            
            # base64로 보이는 경우 암호화된 것으로 간주
            is_base64_like = (isinstance(room_name_raw, str) and 
                             len(room_name_raw) > 10 and 
                             len(room_name_raw) % 4 == 0 and
                             all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=' for c in room_name_raw))
            
            if is_base64_like and KAKAODECRYPT_AVAILABLE and MY_USER_ID:
                print(f"[채팅방] 암호화된 이름 확인, 복호화 시도: chat_id={chat_id}")
                # enc 후보 추출
                enc_type_room = 31
                if v_field:
                    try:
                        if isinstance(v_field, str):
                            v_parsed = json.loads(v_field)
                            if isinstance(v_parsed, dict) and "enc" in v_parsed:
                                enc_type_room = v_parsed["enc"] or 31
                    except:
                        pass
                
                # private_meta에서 enc 정보 확인
                if room_data and room_data.get('raw_data'):
                    raw_data = room_data.get('raw_data')
                    if 'private_meta_parsed' in raw_data:
                        private_meta = raw_data.get('private_meta_parsed')
                        if isinstance(private_meta, dict) and 'enc' in private_meta:
                            enc_type_room = private_meta['enc'] or 31
                
                # 복호화 시도
                enc_candidates = [enc_type_room, 31, 30]
                enc_candidates = list(dict.fromkeys(enc_candidates))
                
                for enc_try in enc_candidates:
                    try:
                        decrypt_user_id_int = int(MY_USER_ID)
                        if decrypt_user_id_int > 0:
                            decrypted = KakaoDecrypt.decrypt(decrypt_user_id_int, enc_try, room_name_raw)
                            if decrypted and decrypted != room_name_raw:
                                # 유효한 텍스트인지 확인
                                has_control_chars = any(ord(c) < 32 and c not in '\n\r\t' for c in decrypted)
                                if not has_control_chars:
                                    room_name_decrypted = decrypted
                                    room_name_encrypted = room_name_raw
                                    print(f"[✓ 채팅방] 복호화 성공: \"{decrypted}\" (enc={enc_try})")
                                    break
                    except Exception as e:
                        continue
                
                if not room_name_decrypted:
                    room_name_encrypted = room_name_raw
                    print(f"[✗ 채팅방] 복호화 실패: 서버로 암호화된 원본 전송")
            else:
                # 암호화되지 않은 일반 텍스트인 경우
                room_name_decrypted = room_name_raw
                print(f"[채팅방] 일반 텍스트: \"{room_name_raw}\"")
        else:
            print(f"[채팅방] 이름 조회 실패: chat_id={chat_id}")
        
        # 서버로 전송할 room 값 결정
        if room_name_decrypted:
            room = room_name_decrypted
            print(f"[전송] room 값: 복호화된 이름=\"{room}\"")
        elif room_name_encrypted:
            room = room_name_encrypted
            print(f"[전송] room 값: 암호화된 이름 (서버에서 복호화 시도)")
        else:
            room = room_id
            print(f"[전송] room 값: ID=\"{room}\"")
        
        # 빈 메시지는 전송하지 않음
        if not message or message.strip() == "":
            print(f"[send_to_server] ❌ 빈 메시지로 인해 전송 중단: msg_id={msg_id}, message={repr(message)}")
            return False
        else:
            print(f"[send_to_server] ✅ 메시지 검증 통과: msg_id={msg_id}, message 길이={len(str(message))}")
        
        # 암호화된 메시지 복호화 시도
        decrypted_message = None
        # 복호화에는 자신의 user_id를 사용해야 함 (제공된 코드 방식)
        # 제공된 코드: decrypt(user_id, encType, b64_ciphertext)
        # 여기서 user_id는 자신의 user_id (메시지를 받는 사람의 user_id)
        # 중요: MY_USER_ID를 우선 사용하고, 없으면 message_data의 myUserId 사용
        decrypt_user_id = MY_USER_ID if MY_USER_ID else message_data.get("myUserId")
        if not decrypt_user_id:
            # 최후의 수단: userId나 user_id 사용 (하지만 이건 발신자 user_id이므로 복호화 실패 가능)
            decrypt_user_id = message_data.get("userId") or message_data.get("user_id")
            if decrypt_user_id:
                print(f"[경고] MY_USER_ID가 없어 발신자 user_id로 복호화 시도 (실패 가능성 높음): {decrypt_user_id}")
        
        enc_type = message_data.get("encType", 31)
        
        # base64로 보이는 메시지는 암호화된 메시지일 가능성이 높음
        is_base64_like = (isinstance(message, str) and 
                         len(message) > 10 and 
                         len(message) % 4 == 0 and
                         all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=' for c in message))
        
        if DECRYPT_ENABLED and decrypt_user_id and is_base64_like:
            try:
                # 숫자로 변환 시도 (큰 숫자도 처리)
                try:
                    decrypt_user_id_int = int(decrypt_user_id)
                except (ValueError, OverflowError):
                    decrypt_user_id_int = None
                
                if decrypt_user_id_int and decrypt_user_id_int > 0:
                    # 여러 enc_type 시도 (31, 30, 32 순서)
                    enc_candidates = [enc_type, 31, 30, 32]
                    enc_candidates = list(dict.fromkeys(enc_candidates))  # 중복 제거
                    
                    for enc_try in enc_candidates:
                        decrypted_message = decrypt_message(message, v_field, decrypt_user_id_int, enc_try, debug=True)
                        if decrypted_message:
                            print(f"[✓] 메시지 복호화 성공: user_id={decrypt_user_id_int}, enc_type={enc_try}")
                            break
                    
                    if not decrypted_message:
                        print(f"[✗] 메시지 복호화 실패: user_id={decrypt_user_id_int}, 시도한 enc_type={enc_candidates}")
                        print(f"[디버그] MY_USER_ID={MY_USER_ID}, message_data.myUserId={message_data.get('myUserId')}")
                        print(f"[디버그] message 길이={len(message)}, base64 형태={is_base64_like}")
            except Exception as e:
                # 복호화 실패는 무시 (암호화되지 않은 메시지일 수 있음)
                if message and len(message) > 10 and len(message) % 4 == 0:
                    print(f"[경고] 복호화 오류: {type(e).__name__}: {e}")
                    import traceback
                    traceback.print_exc()
                pass
        elif is_base64_like and not decrypt_user_id:
            print(f"[경고] 암호화된 메시지로 보이지만 복호화할 user_id가 없습니다.")
            print(f"[경고] MY_USER_ID={MY_USER_ID}, message_data.myUserId={message_data.get('myUserId')}")
        
        # 복호화 성공하면 복호화된 메시지 사용, 실패하면 원본 사용
        final_message = decrypted_message if decrypted_message else message
        
        # 마지막 메시지의 room 정보 저장 (서버 응답에 room이 없을 때 사용)
        last_message_room = room
        last_message_chat_id = chat_id  # chat_id도 저장 (숫자)
        
        # chat_id 타입 및 값 확인 (디버그)
        print(f"[전송 전] chat_id 값: {chat_id}, 타입: {type(chat_id)}, message_data.chat_id: {message_data.get('chat_id')}")
        
        # 서버가 기대하는 형식 (IrisLink 형식)
        # 서버 코드를 보면 "message" 필드를 기대함
        payload = {
            "type": "message",
            "room": room,  # 복호화된 채팅방 이름 또는 암호화된 이름 또는 ID
            "sender": sender,  # 하위 호환성 유지 (기존 형식)
            "message": final_message,  # 복호화된 메시지 또는 원본
            "isGroupChat": True,  # 명시적으로 추가
            "json": {
                **message_data,  # 원본 메시지 데이터
                "chat_id": str(chat_id),  # chat_id를 문자열로 전송 (큰 숫자 손실 방지)
                "_id": msg_id,  # 카카오톡 원본 logId (기존 필드)
                "kakao_log_id": msg_id,  # ✅ Phase 1.1: 카카오톡 원본 logId 명시적 필드
                "reply_to_message_id": message_data.get("reply_to_message_id"),  # 답장 메시지 ID
                # 채팅방 이름 정보
                "room_name": room_name_encrypted if room_name_encrypted else room_name_raw,  # 암호화된 채팅방 이름 (서버 복호화용)
                "room_name_decrypted": room_name_decrypted,  # 클라이언트에서 복호화한 이름
                "room_name_column": room_name_column,  # 채팅방 이름 컬럼명
                "room_data": room_data.get('raw_data') if room_data else None,  # 채팅방 원본 데이터
                # 발신자 이름 정보 (Phase 1.1: 데이터 구조 표준화)
                "sender_name": sender_name_decrypted,  # ✅ 정규화된 닉네임 (우선 사용)
                "sender_id": sender_id_for_transmission,  # ✅ user_id 명시적 필드
                "sender_name_decrypted": sender_name_decrypted,  # 하위 호환성 유지
                "sender_name_encrypted": sender_name_encrypted,  # 원본 암호화된 발신자 이름 (서버 복호화용)
                "user_name": sender_name_decrypted,  # 서버 호환성을 위한 별칭 (복호화된 이름)
                "raw_sender": sender  # ✅ Phase 1.1: 원본 sender 문자열 (디버깅용)
            }
        }
        
        # payload의 chat_id 확인 (디버그)
        print(f"[전송 전] payload.json.chat_id: {payload['json']['chat_id']}, 타입: {type(payload['json']['chat_id'])}")
        
        # WebSocket 연결 확인
        if ws_connection is None:
            print("[경고] WebSocket 연결 없음. 재연결 시도...")
            if not connect_websocket():
                print("[✗] WebSocket 재연결 실패")
                return False
        
        # WebSocket 연결 상태 확인
        if ws_connection:
            sock_connected = ws_connection.sock and ws_connection.sock.connected if ws_connection.sock else False
            print(f"[전송] WebSocket 상태: 연결={sock_connected}, payload 길이={len(json.dumps(payload))}")
        else:
            print("[전송] WebSocket 상태: 연결 없음")
        
        # WebSocket으로 메시지 전송
        with ws_lock:
            if ws_connection and ws_connection.sock and ws_connection.sock.connected:
                try:
                    payload_str = json.dumps(payload, ensure_ascii=False)
                    print(f"[전송] ⚠️⚠️⚠️ WebSocket 전송 시작: msg_id={msg_id}, room=\"{room}\", sender={sender}, message 길이={len(final_message)}, payload 길이={len(payload_str)}")
                    print(f"[전송] ⚠️⚠️⚠️ WebSocket 상태: connected={ws_connection.sock.connected}, sock={ws_connection.sock is not None}")
                    
                    # 실제 전송
                    ws_connection.send(payload_str)
                    
                    # 전송 후 상태 확인
                    if ws_connection.sock and ws_connection.sock.connected:
                        print(f"[전송] ✅✅✅ WebSocket 전송 완료: msg_id={msg_id}, 연결 상태 유지")
                    else:
                        print(f"[전송] ⚠️⚠️⚠️ WebSocket 전송 후 연결 끊김: msg_id={msg_id}")
                        ws_connection = None
                        return False
                    
                    return True
                except Exception as e:
                    print(f"[전송] ❌❌❌ WebSocket 전송 오류: msg_id={msg_id}, 오류={e}")
                    import traceback
                    traceback.print_exc()
                    ws_connection = None
                    return False
            else:
                print(f"[경고] ⚠️⚠️⚠️ WebSocket 연결 끊김: msg_id={msg_id}, ws_connection={ws_connection is not None}, sock={ws_connection.sock if ws_connection else None}")
                ws_connection = None
                if connect_websocket():
                    try:
                        payload_str = json.dumps(payload, ensure_ascii=False)
                        print(f"[재연결] ⚠️⚠️⚠️ 재연결 후 WebSocket 전송 시도: msg_id={msg_id}, payload 길이={len(payload_str)}")
                        print(f"[재연결] ⚠️⚠️⚠️ WebSocket 상태: connected={ws_connection.sock.connected if ws_connection and ws_connection.sock else False}")
                        
                        ws_connection.send(payload_str)
                        
                        # 전송 후 상태 확인
                        if ws_connection.sock and ws_connection.sock.connected:
                            print(f"[재연결] ✅✅✅ 재연결 후 WebSocket 전송 완료: msg_id={msg_id}")
                        else:
                            print(f"[재연결] ⚠️⚠️⚠️ 재연결 후 전송 후 연결 끊김: msg_id={msg_id}")
                            return False
                        
                        return True
                    except Exception as e:
                        print(f"[재연결] ❌❌❌ 재연결 후 전송 실패: msg_id={msg_id}, 오류={e}")
                        import traceback
                        traceback.print_exc()
                        return False
                else:
                    print(f"[재연결] ❌❌❌ WebSocket 재연결 실패: msg_id={msg_id}")
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

def poll_reaction_updates():
    """이미 저장된 메시지의 반응 정보 주기적 확인"""
    global _reaction_check_cache
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 최근 24시간 내 메시지만 확인 (성능 최적화)
        # created_at은 초 단위 또는 밀리초 단위일 수 있으므로 둘 다 고려
        current_time_sec = int(time.time())
        current_time_ms = current_time_sec * 1000
        twenty_four_hours_ago_sec = current_time_sec - (24 * 60 * 60)
        twenty_four_hours_ago_ms = current_time_ms - (24 * 60 * 60 * 1000)
        
        # created_at이 초 단위인지 밀리초 단위인지 확인
        cursor.execute("SELECT MAX(created_at) FROM chat_logs")
        max_created_at = cursor.fetchone()[0]
        
        use_seconds = False
        if max_created_at:
            # 값이 10자리 수면 초 단위, 13자리면 밀리초 단위로 추정
            if isinstance(max_created_at, (int, float)):
                if max_created_at < 1e12:  # 10자리 이하면 초 단위
                    use_seconds = True
        
        # 적절한 시간 단위로 쿼리 실행
        if use_seconds:
            time_threshold = twenty_four_hours_ago_sec
        else:
            time_threshold = twenty_four_hours_ago_ms
        
        # 최근 메시지 조회 (이미 저장된 메시지)
        query = """
            SELECT _id, chat_id, user_id, v, supplement, created_at
            FROM chat_logs
            WHERE created_at > ?
            ORDER BY _id DESC
            LIMIT 100
        """
        
        cursor.execute(query, (time_threshold,))
        recent_messages = cursor.fetchall()
        
        # ⚠️ 개선: 반응 감지 로직 점검 로그 강화
        print(f"[반응 업데이트] 최근 메시지 {len(recent_messages)}개 확인")
        if len(recent_messages) > 0:
            print(f"[반응 업데이트] 첫 메시지 구조: 길이={len(recent_messages[0])}, _id={recent_messages[0][0] if recent_messages[0] else 'N/A'}")
        
        # 디버깅: 반응이 있는 메시지 개수 확인
        messages_with_reactions = 0
        total_reaction_count = 0
        for msg in recent_messages[:10]:  # 처음 10개만 확인
            v_field = msg[3] if len(msg) > 3 else None
            if v_field:
                try:
                    v_json = json.loads(v_field) if isinstance(v_field, str) else v_field
                    if isinstance(v_json, dict):
                        count = v_json.get("defaultEmoticonsCount", 0)
                        if count > 0:
                            messages_with_reactions += 1
                            total_reaction_count += count
                except:
                    pass
        if messages_with_reactions > 0:
            print(f"[반응 업데이트] 반응 있는 메시지: {messages_with_reactions}개 (샘플), 총 반응: {total_reaction_count}개")
        
        # 메시지가 없으면 더 넓은 범위로 시도
        if len(recent_messages) == 0:
            if use_seconds:
                seven_days_ago = current_time_sec - (7 * 24 * 60 * 60)
            else:
                seven_days_ago = current_time_ms - (7 * 24 * 60 * 60 * 1000)
            cursor.execute(query, (seven_days_ago,))
            recent_messages = cursor.fetchall()
            if len(recent_messages) > 0:
                print(f"[반응 업데이트] 최근 7일 내 메시지: {len(recent_messages)}개")
        # conn.close()는 이미 위에서 호출됨
        
        updated_reactions = []
        
        for msg in recent_messages:
            msg_id = msg[0]
            chat_id = msg[1]
            user_id = msg[2]
            v_field = msg[3] if len(msg) > 3 else None
            supplement = msg[4] if len(msg) > 4 else None
            created_at = msg[5] if len(msg) > 5 else None
            
            # v 필드에서 defaultEmoticonsCount 확인
            current_reaction_count = 0
            if v_field:
                try:
                    if isinstance(v_field, str):
                        v_json = json.loads(v_field)
                    else:
                        v_json = v_field
                    
                    if isinstance(v_json, dict):
                        current_reaction_count = v_json.get("defaultEmoticonsCount", 0)
                except (json.JSONDecodeError, TypeError):
                    pass
            
            # 이전에 확인한 값과 비교
            cache_key = msg_id
            previous_data = _reaction_check_cache.get(cache_key, {})
            previous_count = previous_data.get('count', 0)
            
            # 디버깅: 반응이 있는 메시지 상세 로그 (처음 몇 개만)
            if current_reaction_count > 0 and len(updated_reactions) < 5:
                print(f"[반응 디버깅] msg_id={msg_id}, 현재={current_reaction_count}, 이전={previous_count}, supplement={bool(supplement)}")
            
            # 반응 개수가 증가했으면 업데이트 감지
            # 또는 첫 실행 시 반응이 있으면 모두 처리
            if current_reaction_count > previous_count:
                if len(updated_reactions) < 5:
                    print(f"[반응 감지] msg_id={msg_id}: {previous_count}→{current_reaction_count} (증가={current_reaction_count - previous_count})")
                
                # supplement에서 새로 추가된 반응 정보 추출
                new_reactions = []
                if supplement:
                    try:
                        if isinstance(supplement, str):
                            supplement_json = json.loads(supplement)
                        else:
                            supplement_json = supplement
                        
                        if isinstance(supplement_json, dict):
                            reactions = supplement_json.get("reactions") or supplement_json.get("emoticons") or []
                            
                            if isinstance(reactions, list) and len(reactions) > 0:
                                # 이전 supplement와 비교하여 새 반응 찾기
                                previous_supplement = previous_data.get('supplement')
                                previous_reactions = []
                                if previous_supplement:
                                    try:
                                        prev_supp_json = json.loads(previous_supplement) if isinstance(previous_supplement, str) else previous_supplement
                                        previous_reactions = prev_supp_json.get("reactions") or prev_supp_json.get("emoticons") or []
                                    except Exception:
                                        pass
                                
                                # 첫 실행 시 (previous_supplement가 없으면) 모든 반응을 새 반응으로 간주
                                if not previous_supplement:
                                    # 캐시가 비어있으면 모든 reactions를 새 반응으로 처리
                                    new_reactions = reactions
                                    if len(updated_reactions) < 5:
                                        print(f"[반응 감지] msg_id={msg_id}: 첫 실행, reactions {len(reactions)}개 모두 새 반응으로 처리")
                                else:
                                    # 이전 반응과 비교하여 새 반응만 추가
                                    previous_reaction_ids = set()
                                    for prev_react in previous_reactions:
                                        if isinstance(prev_react, dict):
                                            prev_id = prev_react.get("userId") or prev_react.get("user_id") or None
                                            prev_type = prev_react.get("type") or prev_react.get("emoType") or None
                                            if prev_id and prev_type:
                                                previous_reaction_ids.add(f"{prev_id}:{prev_type}")
                                    
                                    for react in reactions:
                                        if isinstance(react, dict):
                                            react_id = react.get("userId") or react.get("user_id") or None
                                            react_type = react.get("type") or react.get("emoType") or react.get("reaction") or None
                                            react_key = f"{react_id}:{react_type}" if react_id and react_type else None
                                            
                                            if react_key and react_key not in previous_reaction_ids:
                                                new_reactions.append(react)
                                    if len(updated_reactions) < 5:
                                        print(f"[반응 감지] msg_id={msg_id}: 새 반응 {len(new_reactions)}개 발견 (전체={len(reactions)}, 이전={len(previous_reactions)})")
                            else:
                                if len(updated_reactions) < 5:
                                    print(f"[반응 감지] msg_id={msg_id}: reactions가 리스트가 아니거나 비어있음 (type={type(reactions)}, len={len(reactions) if isinstance(reactions, list) else 'N/A'})")
                    except (json.JSONDecodeError, TypeError):
                        pass
                
                # 새 반응 정보를 서버로 전송
                # 첫 실행 시 (previous_count가 0이고 current_reaction_count > 0이면) 모든 반응 전송
                if new_reactions:
                    print(f"[반응 업데이트] msg_id={msg_id}: 반응 {len(new_reactions)}개 발견 (이전={previous_count}, 현재={current_reaction_count})")
                    for reaction_detail in new_reactions:
                        reaction_type_detail = reaction_detail.get("type") or reaction_detail.get("emoType") or reaction_detail.get("reaction") or "thumbs_up"
                        reactor_id = reaction_detail.get("userId") or reaction_detail.get("user_id") or user_id
                        
                        # 채팅방 정보 조회
                        room_data = get_chat_room_data(chat_id) if chat_id else None
                        room_name_raw = room_data.get('name') if room_data else None
                        
                        # ⚠️ 개선: 반응 발견 시 서버 전송 확정 구현
                        reaction_data = {
                            "type": "reaction_update",
                            "room": room_name_raw or str(chat_id) if chat_id else "",
                            "sender": str(reactor_id) if reactor_id else "",
                            "json": {
                                "target_message_id": msg_id,  # kakao_log_id
                                "reaction_type": reaction_type_detail,
                                "message_id": msg_id,
                                "chat_id": chat_id,
                                "user_id": reactor_id,
                                "created_at": created_at,
                                "reaction_count": current_reaction_count,
                                "new_reactions": [reaction_detail],  # ⚠️ 개선: new_reactions 필드 추가
                                "all_reactions": None,  # supplement에서 추출 가능
                                "supplement": supplement
                            }
                        }
                        
                        updated_reactions.append(reaction_data)
                        print(f"[반응 업데이트] 반응 데이터 구성 완료: target={msg_id}, type={reaction_type_detail}, reactor={reactor_id}")
                else:
                    # 반응 개수는 증가했지만 new_reactions가 비어있는 경우
                    # supplement가 없거나 파싱 실패한 경우, 최소한 반응 개수 정보는 전송
                    if current_reaction_count > 0 and previous_count == 0:
                        print(f"[반응 업데이트] msg_id={msg_id}: 반응 {current_reaction_count}개 있으나 supplement 정보 없음 (첫 발견)")
                        # 채팅방 정보 조회
                        room_data = get_chat_room_data(chat_id) if chat_id else None
                        room_name_raw = room_data.get('name') if room_data else None
                        
                        # 반응 상세 정보 없이 전체 반응 정보만 전송
                        # ⚠️ 개선: 반응 발견 시 서버 전송 확정 구현
                        reaction_data = {
                            "type": "reaction_update",
                            "room": room_name_raw or str(chat_id) if chat_id else "",
                            "sender": str(user_id) if user_id else "",
                            "json": {
                                "target_message_id": msg_id,  # kakao_log_id
                                "reaction_type": "unknown",
                                "message_id": msg_id,
                                "chat_id": chat_id,
                                "user_id": user_id,
                                "created_at": created_at,
                                "reaction_count": current_reaction_count,
                                "new_reactions": [],  # ⚠️ 개선: new_reactions 필드 추가
                                "all_reactions": None,  # supplement에서 추출 가능
                                "supplement": supplement
                            }
                        }
                        updated_reactions.append(reaction_data)
                        print(f"[반응 업데이트] 반응 데이터 구성 완료 (상세 정보 없음): target={msg_id}, count={current_reaction_count}")
                
                # 캐시 업데이트
                _reaction_check_cache[cache_key] = {
                    'count': current_reaction_count,
                    'supplement': supplement,
                    'last_check': time.time()
                }
            
            elif current_reaction_count > 0:
                # 반응이 있지만 변화는 없음 - 캐시만 업데이트
                _reaction_check_cache[cache_key] = {
                    'count': current_reaction_count,
                    'supplement': supplement,
                    'last_check': time.time()
                }
            
            # 오래된 캐시 정리 (24시간 이상)
            if cache_key in _reaction_check_cache:
                if time.time() - _reaction_check_cache[cache_key].get('last_check', 0) > 24 * 60 * 60:
                    del _reaction_check_cache[cache_key]
        
        # 새로 감지된 반응을 서버로 전송
        sent_count = 0
        failed_count = 0
        print(f"[반응 업데이트] 서버 전송 시작: {len(updated_reactions)}개 반응 데이터")
        for i, reaction_data in enumerate(updated_reactions):
            target_id = reaction_data.get('json', {}).get('target_message_id', 'unknown')
            reaction_type = reaction_data.get('json', {}).get('reaction_type', 'unknown')
            print(f"[반응 업데이트] [{i+1}/{len(updated_reactions)}] 전송 시도: target={target_id}, type={reaction_type}")
            
            if send_to_server(reaction_data, is_reaction=True):
                sent_count += 1
                print(f"[반응 업데이트] [{i+1}/{len(updated_reactions)}] ✅ 전송 성공")
            else:
                failed_count += 1
                print(f"[반응 업데이트] [{i+1}/{len(updated_reactions)}] ❌ 전송 실패: target={target_id}, type={reaction_type}")
                # 재시도 (1회)
                print(f"[반응 업데이트] [{i+1}/{len(updated_reactions)}] 재시도 중...")
                if send_to_server(reaction_data, is_reaction=True):
                    sent_count += 1
                    failed_count -= 1
                    print(f"[반응 업데이트] [{i+1}/{len(updated_reactions)}] ✅ 재시도 성공")
                else:
                    print(f"[반응 업데이트] [{i+1}/{len(updated_reactions)}] ❌ 재시도 실패")
        
        if len(updated_reactions) > 0:
            print(f"[반응 업데이트] 결과: {len(updated_reactions)}개 감지, {sent_count}개 전송 성공, {failed_count}개 전송 실패")
        return len(updated_reactions)
        
    except Exception as e:
        print(f"[오류] 반응 업데이트 확인 실패: {e}")
        import traceback
        traceback.print_exc()
        return 0

def poll_messages():
    """메시지 폴링 루프"""
    global MY_USER_ID
    print(f"[poll_messages] 폴링 루프 시작")
    
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
    
    # 반응 업데이트 확인 주기 (10초마다)
    last_reaction_check = time.time()  # ✅ 초기화: 현재 시간으로 설정
    REACTION_CHECK_INTERVAL = 10  # 10초
    
    print(f"[반응 업데이트] 주기적 확인 설정: 간격={REACTION_CHECK_INTERVAL}초, 초기 시간={last_reaction_check}")
    
    while True:
        try:
            messages = get_new_messages()
            
            # 주기적으로 반응 업데이트 확인 (10초마다)
            current_time = time.time()
            time_since_last_check = current_time - last_reaction_check
            # ⚠️ 개선: poll_reaction_updates() 호출 확인 로그 추가
            print(f"[반응 업데이트] 호출 체크: time_since_last_check={time_since_last_check:.1f}초, REACTION_CHECK_INTERVAL={REACTION_CHECK_INTERVAL}초, 호출 여부={time_since_last_check >= REACTION_CHECK_INTERVAL}")
            if time_since_last_check >= REACTION_CHECK_INTERVAL:
                print(f"[반응 업데이트] ⚠️⚠️⚠️ 주기적 확인 시작 (간격: {REACTION_CHECK_INTERVAL}초, 경과: {time_since_last_check:.1f}초)")
                updated_count = poll_reaction_updates()
                print(f"[반응 업데이트] poll_reaction_updates() 호출 완료: 반환값={updated_count}")
                if updated_count > 0:
                    print(f"[반응 업데이트] ✅ {updated_count}개 반응 변화 감지됨")
                else:
                    print(f"[반응 업데이트] 변화 없음 (확인 완료)")
                last_reaction_check = current_time
            else:
                # 디버그: 처음 몇 번만 로그 출력
                if time_since_last_check < 2.0:  # 2초 이내에만 출력
                    print(f"[반응 업데이트] 대기 중... (다음 확인까지 {REACTION_CHECK_INTERVAL - time_since_last_check:.1f}초 남음)")
            
            # ⚠️ 중요: messages 상태 확인 로그 (항상 출력)
            print(f"[poll_messages] ⚠️⚠️⚠️ messages 상태: 개수={len(messages) if messages else 0}, 타입={type(messages).__name__ if messages else 'N/A'}, bool값={bool(messages)}")
            if messages:
                print(f"[poll_messages] ✅ {len(messages)}개 메시지 처리 시작")
                # 중요: DB의 실제 최신 ID를 확인하여 last_message_id를 업데이트
                # (조회된 배치의 최대 ID가 아닌 실제 DB 최신 ID 사용)
                db_latest_id = get_latest_message_id()
                current_last_id = load_last_message_id()
                
                # ⚠️ 개선: messages가 dict 리스트인지 확인하고 적절히 처리
                if messages and isinstance(messages[0], dict):
                    # dict 기반 접근
                    queried_max_id = max((msg.get('_id') or msg.get('id') or 0) for msg in messages if msg)
                else:
                    # 튜플 기반 접근 (하위 호환)
                    queried_max_id = max((msg[0] if msg and len(msg) > 0 else 0) for msg in messages if msg)
                
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
                    # ⚠️ 개선: dict 기반 접근으로 변경
                    if isinstance(msg, dict):
                        msg_id = msg.get('_id') or msg.get('id')
                    else:
                        msg_id = msg[0] if msg and len(msg) > 0 else None
                    
                    # 이미 전송한 메시지는 제외
                    if msg_id and msg_id not in sent_message_ids:
                        new_messages.append(msg)
                    else:
                        skipped_count_debug += 1
                
                # 디버깅: 새 메시지 상태 로깅 (항상 출력)
                print(f"[조회 결과] DB에서 조회한 메시지: {len(messages)}개, 새 메시지: {len(new_messages)}개, 스킵: {skipped_count_debug}개, last_id={last_id}")
                print(f"[조회 결과] messages 타입: {type(messages).__name__}, 첫 메시지 타입: {type(messages[0]).__name__ if messages else 'N/A'}")
                if new_messages:
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] ✅ 새 메시지 {len(new_messages)}개 발견 (스킵: {skipped_count_debug}개)")
                elif skipped_count_debug > 0:
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] ⚠️ 모든 메시지 이미 처리됨 (조회: {len(messages)}개, 스킵: {skipped_count_debug}개)")
                elif len(messages) == 0:
                    db_latest_id = get_latest_message_id()
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] 📭 새 메시지 없음 (DB 최신 ID: {db_latest_id}, 마지막 처리 ID: {last_id})")
                
                # ⚠️ 중요: new_messages 상태 확인 로그 (항상 출력)
                print(f"[디버그] ⚠️⚠️⚠️ new_messages 상태: 개수={len(new_messages)}, 타입={type(new_messages).__name__}, 비어있음={not new_messages}, bool값={bool(new_messages)}")
                if new_messages:
                    print(f"[디버그] ⚠️⚠️⚠️ new_messages 루프 진입 조건: True")
                else:
                    print(f"[디버그] ⚠️⚠️⚠️ new_messages 루프 진입 조건: False (루프 미실행)")
                
                if new_messages:
                    # ⚠️ 개선: 메시지 처리 루프 진입 로그 강화
                    print(f"[메시지 처리] ⚠️⚠️⚠️ 루프 진입: new_messages 개수={len(new_messages)}")
                    
                    max_id = 0
                    sent_count = 0
                    skipped_count = 0
                    
                    for idx, msg in enumerate(new_messages):
                        # ⚠️ 개선: 각 메시지 처리 시작 시 상세 로그 출력
                        # msg는 이제 dict 형태
                        msg_id = msg.get('_id') or msg.get('id')
                        print(f"[메시지 처리] [{idx+1}/{len(new_messages)}] 처리 시작: msg_id={msg_id}")
                        
                        # ⚠️ 개선: 컬럼명 기반 접근으로 변경
                        chat_id = msg.get('chat_id')
                        user_id = msg.get('user_id')
                        message = msg.get('message')
                        created_at = msg.get('created_at')
                        
                        # 선택적 필드 처리
                        v_field = msg.get('v')
                        kakao_user_id = msg.get('userId')
                        enc_type = msg.get('encType', 31)  # 기본값 31
                        is_mine = False  # 자신이 보낸 메시지 여부
                        msg_type = msg.get('type')  # 메시지 타입
                        attachment = msg.get('attachment')  # 첨부 정보
                        referer = msg.get('referer')  # referer 필드 (답장 메시지 ID)
                        supplement = msg.get('supplement')  # supplement 필드 (반응 상세 정보)
                        
                        if v_field:
                            # v 필드를 JSON 파싱하여 enc 추출 및 isMine 확인
                            if v_field:
                                try:
                                    if isinstance(v_field, str):
                                        v_json = json.loads(v_field)
                                        if isinstance(v_json, dict):
                                            # isMine 필드 확인 (자신이 보낸 메시지)
                                            is_mine = v_json.get("isMine", False)
                                            if is_mine:
                                                # ⚠️ 개선: is_mine 필터링 로그 강화
                                                print(f"[필터링] ⚠️ 자신이 보낸 메시지 스킵: ID={msg_id}, sender={user_id}, isMine={is_mine}")
                                                skipped_count += 1
                                                sent_message_ids.add(msg_id)  # 이미 처리된 것으로 표시
                                                continue  # 자신이 보낸 메시지는 서버로 전송하지 않음
                                            else:
                                                # ⚠️ 개선: 타인 메시지 로그 강화
                                                print(f"[필터링] ✅ 타인이 보낸 메시지 (isMine=False): ID={msg_id}, sender={user_id}, isMine={is_mine}")
                                            # enc 추출
                                            if "enc" in v_json:
                                                enc_type = v_json["enc"]
                                                if enc_type is None:
                                                    enc_type = 31  # 기본값
                                except (json.JSONDecodeError, TypeError, KeyError):
                                    # JSON 파싱 실패 시 기본값 사용
                                    pass
                        
                        # v 필드에서 origin 추출 (메시지 삭제 감지용)
                        origin = None
                        if v_field:
                            try:
                                if isinstance(v_field, str):
                                    v_json = json.loads(v_field)
                                    if isinstance(v_json, dict):
                                        origin = v_json.get("origin")
                                elif isinstance(v_field, dict):
                                    origin = v_field.get("origin")
                            except (json.JSONDecodeError, TypeError, KeyError):
                                pass
                        
                        # ⚠️ 개선: kakao_user_id 유효성 검사 (dict 기반)
                        if kakao_user_id:
                            # userId=1 같은 잘못된 값 필터링 (1000보다 큰 값만 유효)
                            if isinstance(kakao_user_id, (int, str)) and (
                                (isinstance(kakao_user_id, int) and kakao_user_id > 1000) or
                                (isinstance(kakao_user_id, str) and kakao_user_id.isdigit() and int(kakao_user_id) > 1000)
                            ):
                                pass  # 유효한 값
                            else:
                                if kakao_user_id:
                                    print(f"[경고] 잘못된 kakao_user_id 값 무시: {kakao_user_id} (ID={msg_id})")
                                kakao_user_id = None
                        
                        # ⚠️ 중요: 모든 메시지에 대해 msg_type 로그 출력 (답장 감지용)
                        print(f"[msg_type 확인] msg_id={msg_id}, msg_type={msg_type}, 타입={type(msg_type).__name__ if msg_type is not None else 'None'}")
                        
                        # ⚠️ 중요: 모든 메시지에 대해 attachment 로그 출력 (답장 감지용)
                        if attachment:
                            attach_type = type(attachment).__name__
                            attach_len = len(str(attachment)) if attachment else 0
                            print(f"[attachment 확인] msg_id={msg_id}, attachment 존재={True}, 타입={attach_type}, 길이={attach_len}, 샘플={str(attachment)[:100] if attachment else 'None'}...")
                        else:
                            print(f"[attachment 확인] msg_id={msg_id}, attachment 존재={False}")
                        
                        # ⚠️ 중요: 모든 메시지에 대해 referer 로그 출력 (답장 감지용)
                        if referer:
                            print(f"[referer 확인] msg_id={msg_id}, referer={referer}, 타입={type(referer).__name__}")
                        else:
                            print(f"[referer 확인] msg_id={msg_id}, referer=None")
                        
                        # supplement는 이미 위에서 dict 기반으로 추출됨
                        
                        # Phase 2: attachment 복호화 (whitelist 기반)
                        # ⚠️ 개선: msg_type=0이어도 attachment가 있으면 복호화 시도 (답장 메시지일 수 있음)
                        attachment_decrypted = None
                        if ATTACHMENT_DECRYPT_AVAILABLE and decrypt_attachment and attachment:
                            msg_type_str_for_decrypt = str(msg_type) if msg_type is not None else None
                            
                            # ⚠️ 개선: whitelist에 없어도 attachment가 있으면 복호화 시도
                            should_decrypt = (
                                msg_type_str_for_decrypt in ATTACHMENT_DECRYPT_WHITELIST or 
                                msg_type in ATTACHMENT_DECRYPT_WHITELIST or
                                (attachment and isinstance(attachment, str) and len(attachment) > 10)  # attachment가 있으면 시도
                            )
                            
                            if should_decrypt:
                                print(f"[attachment 복호화 시도] msg_id={msg_id}, msg_type={msg_type_str_for_decrypt}, attachment 존재={bool(attachment)}, whitelist={msg_type_str_for_decrypt in ATTACHMENT_DECRYPT_WHITELIST}")
                                attachment_decrypted = decrypt_attachment(
                                    attachment,
                                    enc_type,
                                    MY_USER_ID,
                                    msg_type_str_for_decrypt,
                                    msg_id,
                                    debug=True
                                )
                                # ⚠️ 디버그: attachment 복호화 결과 로그
                                if attachment_decrypted:
                                    print(f"[attachment 복호화 성공] msg_id={msg_id}, 타입={type(attachment_decrypted).__name__}, 길이={len(str(attachment_decrypted)) if attachment_decrypted else 0}")
                                else:
                                    print(f"[attachment 복호화 실패] msg_id={msg_id}")
                            else:
                                print(f"[attachment 복호화 스킵] msg_id={msg_id}, msg_type={msg_type_str_for_decrypt}, whitelist에 없음")
                        
                        # 답장 메시지 ID 추출 (referer 우선, 그 다음 복호화된 attachment, 마지막으로 원본 attachment)
                        reply_to_message_id = None
                        
                        # ⚠️ 중요: 답장 ID 추출 시작 로그
                        print(f"[답장 ID 추출 시작] msg_id={msg_id}, referer={referer}, attachment={bool(attachment)}, attachment_decrypted={bool(attachment_decrypted)}")
                        
                        # 1순위: referer 필드 (가장 신뢰할 수 있음)
                        if referer:
                            try:
                                reply_to_message_id = int(referer) if referer else None
                                if reply_to_message_id:
                                    print(f"[답장 ID] ✅ referer에서 추출 성공: {reply_to_message_id}")
                                else:
                                    print(f"[답장 ID] ⚠️ referer 변환 실패: referer={referer}, 타입={type(referer).__name__}")
                            except (ValueError, TypeError) as e:
                                print(f"[답장 ID] ⚠️ referer 파싱 예외: referer={referer}, 오류={e}")
                        else:
                            print(f"[답장 ID] referer 없음: msg_id={msg_id}")
                        
                        # 2순위: 복호화된 attachment에서 src_message 확인 (type 26 답장 메시지)
                        if not reply_to_message_id and attachment_decrypted:
                            if isinstance(attachment_decrypted, dict):
                                # src_message 또는 logId 확인
                                src_message_id = attachment_decrypted.get("src_message") or attachment_decrypted.get("logId") or attachment_decrypted.get("src_logId")
                                if src_message_id:
                                    try:
                                        reply_to_message_id = int(src_message_id) if src_message_id else None
                                        if reply_to_message_id:
                                            print(f"[답장 ID] 복호화된 attachment에서 추출: {reply_to_message_id}, keys={list(attachment_decrypted.keys())[:10]}")
                                    except (ValueError, TypeError):
                                        pass
                            elif isinstance(attachment_decrypted, str):
                                # 복호화된 attachment가 문자열인 경우 파싱 시도
                                try:
                                    attachment_json = json.loads(attachment_decrypted)
                                    if isinstance(attachment_json, dict):
                                        src_message_id = attachment_json.get("src_message") or attachment_json.get("logId") or attachment_json.get("src_logId")
                                        if src_message_id:
                                            try:
                                                reply_to_message_id = int(src_message_id) if src_message_id else None
                                                if reply_to_message_id:
                                                    print(f"[답장 ID] 복호화된 attachment(문자열)에서 추출: {reply_to_message_id}")
                                            except (ValueError, TypeError):
                                                pass
                                except (json.JSONDecodeError, TypeError, KeyError):
                                    pass
                        
                        # 3순위: fallback - 복호화되지 않은 attachment에서 확인 (기존 방식)
                        if not reply_to_message_id and attachment and not attachment_decrypted:
                            print(f"[답장 ID] 원본 attachment에서 추출 시도: msg_id={msg_id}, attachment 타입={type(attachment).__name__}")
                            try:
                                if isinstance(attachment, str):
                                    attachment_json = json.loads(attachment)
                                    if isinstance(attachment_json, dict):
                                        # src_message 또는 logId 확인
                                        src_message_id = attachment_json.get("src_message") or attachment_json.get("logId") or attachment_json.get("src_logId")
                                        if src_message_id:
                                            try:
                                                reply_to_message_id = int(src_message_id) if src_message_id else None
                                                if reply_to_message_id:
                                                    print(f"[답장 ID] ✅ 원본 attachment에서 추출 성공: {reply_to_message_id}")
                                                else:
                                                    print(f"[답장 ID] ⚠️ 원본 attachment에서 추출 실패: src_message_id={src_message_id}")
                                            except (ValueError, TypeError) as e:
                                                print(f"[답장 ID] ⚠️ 원본 attachment 파싱 예외: src_message_id={src_message_id}, 오류={e}")
                                        else:
                                            print(f"[답장 ID] ⚠️ 원본 attachment에 src_message/logId/src_logId 없음, keys={list(attachment_json.keys())[:20]}")
                                    else:
                                        print(f"[답장 ID] ⚠️ 원본 attachment JSON 파싱 결과가 dict가 아님: 타입={type(attachment_json).__name__}")
                                else:
                                    print(f"[답장 ID] ⚠️ 원본 attachment가 문자열이 아님: 타입={type(attachment).__name__}")
                            except (json.JSONDecodeError, TypeError, KeyError) as e:
                                print(f"[답장 ID] ⚠️ 원본 attachment 파싱 예외: 오류={e}, attachment 샘플={str(attachment)[:100] if attachment else 'None'}...")
                        
                        # ⚠️ 중요: 답장 ID 추출 최종 결과 로그
                        if reply_to_message_id:
                            print(f"[답장 ID] ✅ 최종 추출 성공: msg_id={msg_id}, reply_to_message_id={reply_to_message_id}")
                        else:
                            print(f"[답장 ID] ❌ 최종 추출 실패: msg_id={msg_id}, reply_to_message_id=None (일반 메시지일 수 있음)")
                        
                        # message_data에 reply_to_message_id 설정 (서버 전송용)
                        # message_data는 나중에 생성되지만, 여기서 추출한 값을 사용할 수 있도록 로컬 변수에 저장
                        
                        # ⚠️ 중요: msg_type과 reply_to_message_id를 변수에 저장하여 message_data에 포함
                        
                        # 반응(reaction) 정보 추출: v 필드의 defaultEmoticonsCount 확인
                        reaction_count = 0
                        reaction_details = []
                        
                        # v 필드에서 defaultEmoticonsCount 확인
                        if v_field:
                            try:
                                if isinstance(v_field, str):
                                    v_json = json.loads(v_field)
                                elif isinstance(v_field, dict):
                                    v_json = v_field
                                else:
                                    v_json = None
                                
                                if isinstance(v_json, dict):
                                    reaction_count = v_json.get("defaultEmoticonsCount", 0)
                                    if reaction_count > 0:
                                        print(f"[반응 감지] v 필드에서 반응 개수 발견: msg_id={msg_id}, count={reaction_count}")
                                        
                                        # supplement 필드에서 반응 상세 정보 추출
                                        if supplement:
                                            try:
                                                if isinstance(supplement, str):
                                                    supplement_json = json.loads(supplement)
                                                elif isinstance(supplement, dict):
                                                    supplement_json = supplement
                                                else:
                                                    supplement_json = None
                                                
                                                if isinstance(supplement_json, dict):
                                                    # supplement에서 반응 정보 추출 시도
                                                    # 카카오톡 DB 구조에 따라 필드명이 다를 수 있음
                                                    if "reactions" in supplement_json:
                                                        reaction_details = supplement_json["reactions"] if isinstance(supplement_json["reactions"], list) else []
                                                        print(f"[반응 상세] supplement에서 반응 상세 정보 발견: msg_id={msg_id}, reactions={len(reaction_details)}개")
                                                    elif "emoticons" in supplement_json:
                                                        reaction_details = supplement_json["emoticons"] if isinstance(supplement_json["emoticons"], list) else []
                                                        print(f"[반응 상세] supplement에서 이모지 정보 발견: msg_id={msg_id}, emoticons={len(reaction_details)}개")
                                            except (json.JSONDecodeError, TypeError, KeyError) as e:
                                                print(f"[반응 상세] supplement 파싱 실패: msg_id={msg_id}, 오류={e}")
                            except (json.JSONDecodeError, TypeError, KeyError):
                                pass
                        
                        # 반응(reaction) 메시지 처리 (기존 로직 - type 70-79 등 별도 반응 메시지)
                        is_reaction = False
                        reaction_type = None
                        target_message_id = None
                        
                        # msg_type_str 초기화 (항상 정의되도록)
                        msg_type_str = str(msg_type) if msg_type is not None else None
                        
                        # 디버그: 타입이 0이 아닌 경우 또는 첫 메시지만 로깅 (무한 로그 방지)
                        if msg_type is not None and msg_type != 0:
                            print(f"[DEBUG] 메시지 처리 시작: msg_id={msg_id}, msg_type={msg_type}, msg_type_str={msg_type_str}, attachment 존재={bool(attachment)}, referer={referer}")
                            print(f"[DEBUG] 메시지 타입: msg_id={msg_id}, type={msg_type}, type_str={msg_type_str}, message={str(message)[:30] if message else 'None'}...")
                        
                        # ⚠️ 중요: 답장 메시지 감지 로그 (msg_type=26 또는 referer/attachment가 있는 경우)
                        # 모든 메시지에 대해 답장 가능성 체크 (디버그 강화)
                        is_reply_candidate = False
                        reply_reasons = []
                        # msg_type 비교 강화 (숫자, 문자열 모두 처리)
                        msg_type_str = str(msg_type) if msg_type is not None else None
                        if msg_type == 26 or msg_type == '26' or msg_type_str == '26':
                            is_reply_candidate = True
                            reply_reasons.append(f"msg_type={msg_type}")
                        if referer:
                            is_reply_candidate = True
                            reply_reasons.append(f"referer={referer}")
                        if attachment:
                            is_reply_candidate = True
                            reply_reasons.append(f"attachment 존재")
                        if attachment_decrypted:
                            is_reply_candidate = True
                            reply_reasons.append(f"attachment_decrypted 존재")
                        
                        # ⚠️ 개선: msg_type=0이어도 referer나 attachment가 있으면 답장 후보로 처리
                        if not is_reply_candidate and (referer or attachment or attachment_decrypted):
                            is_reply_candidate = True
                            reply_reasons.append(f"msg_type=0이지만 referer/attachment 존재")
                        
                        if is_reply_candidate:
                            print(f"[답장 감지] ⚠️⚠️⚠️ 답장 가능성 발견: msg_id={msg_id}, 이유={', '.join(reply_reasons)}")
                            print(f"[답장 감지] 상세: msg_type={msg_type} (타입={type(msg_type).__name__ if msg_type is not None else 'None'}), referer={referer}, attachment={bool(attachment)}, attachment_decrypted={bool(attachment_decrypted)}, reply_to_message_id={reply_to_message_id}")
                            if attachment_decrypted and isinstance(attachment_decrypted, dict):
                                print(f"[답장 감지] attachment_decrypted keys: {list(attachment_decrypted.keys())[:20]}")
                                if 'src_message' in attachment_decrypted or 'logId' in attachment_decrypted or 'src_logId' in attachment_decrypted:
                                    src_msg = attachment_decrypted.get('src_message') or attachment_decrypted.get('logId') or attachment_decrypted.get('src_logId')
                                    print(f"[답장 감지] ✅ src_message/logId/src_logId 발견: {src_msg}")
                        else:
                            # 답장 후보가 아니어도 기본 정보는 로그 출력 (디버그용)
                            print(f"[답장 감지] 일반 메시지: msg_id={msg_id}, msg_type={msg_type}, referer={referer}, attachment={bool(attachment)}")
                        
                        # 1. type 컬럼에서 반응 타입 확인
                        # 카카오톡 메시지 타입 (참고: Iris, DBManager)
                        # - 1: 일반 텍스트
                        # - 2: 사진
                        # - 71: 선물
                        # - 12: Feed (시스템 메시지 - 입퇴장, 강퇴, 반응 등)
                        if msg_type and msg_type_str:
                            if isinstance(msg_type, (int, str)):
                                # 반응 관련 타입 확인 (더 넓은 범위)
                                # 카카오톡 반응은 type 12 (Feed) 또는 70-79 범위일 수 있음
                                reaction_types = ["70", "71", "72", "73", "74", "75", "76", "77", "78", "79"]
                                feed_type = "12"  # Feed 타입 (반응 포함 가능)
                                
                                if msg_type_str in reaction_types:
                                    is_reaction = True
                                    reaction_type = "thumbs_up"  # 기본값
                                    print(f"[반응 감지] type 컬럼에서 반응 감지: msg_type={msg_type_str}, msg_id={msg_id}")
                                
                                # Feed 타입 (12)에서 feedType 확인 (강퇴, 입퇴장 등)
                                if msg_type_str == feed_type and attachment:
                                    try:
                                        feed_attach = json.loads(attachment) if isinstance(attachment, str) else attachment
                                        if isinstance(feed_attach, dict) and "feedType" in feed_attach:
                                            feed_type_val = feed_attach.get("feedType")
                                            print(f"[Feed 감지] type=12, feedType={feed_type_val}, msg_id={msg_id}")
                                            # feedType 값:
                                            # 1: 초대, 2: 퇴장, 4: 오픈채팅 입장, 6: 강퇴, 11: 부방승급, 12: 부방강등, 14: 삭제, 15: 방장위임
                                    except (json.JSONDecodeError, TypeError):
                                        pass
                        
                        # 2. attachment 필드에서 반응 정보 확인 (복호화된 attachment 우선 사용)
                        # 디버그: attachment가 있거나 반응이 감지된 경우만 로깅 (무한 로그 방지)
                        if not is_reaction and (attachment_decrypted or attachment):
                            attachment_to_check = attachment_decrypted if attachment_decrypted else attachment
                            if attachment_to_check:
                                try:
                                    # 복호화된 attachment가 dict인 경우 그대로 사용, 문자열이면 파싱
                                    if isinstance(attachment_to_check, dict):
                                        attachment_json = attachment_to_check
                                    elif isinstance(attachment_to_check, str):
                                        attachment_json = json.loads(attachment_to_check)
                                    else:
                                        attachment_json = None
                                    
                                    if isinstance(attachment_json, dict):
                                        # 반응 정보 확인 - 다양한 필드명 지원
                                        reaction_keys = ["reaction", "like", "thumbs", "emoji", "emoType", "react", "likeType", "emo"]
                                        for rkey in reaction_keys:
                                            if rkey in attachment_json:
                                                is_reaction = True
                                                reaction_type = attachment_json.get(rkey) or "thumbs_up"
                                                print(f"[반응 감지] ✅ attachment에서 반응 키 발견: key={rkey}, value={reaction_type}, msg_id={msg_id}")
                                                break
                                        
                                        # 대상 메시지 ID 확인
                                        if is_reaction:
                                            target_message_id = attachment_json.get("message_id") or attachment_json.get("target_id") or attachment_json.get("logId") or attachment_json.get("src_logId") or attachment_json.get("src_message")
                                            
                                            # 반응 이모지 타입 매핑
                                            emoji_map = {
                                                "0": "heart",      # ❤️
                                                "1": "thumbs_up",  # 👍
                                                "2": "check",      # ✅
                                                "3": "surprised",  # 😱
                                                "4": "sad",        # 😢
                                                "heart": "heart",
                                                "like": "thumbs_up",
                                                "check": "check",
                                                "wow": "surprised",
                                                "sad": "sad"
                                            }
                                            if reaction_type in emoji_map:
                                                reaction_type = emoji_map[reaction_type]
                                            
                                            print(f"[반응 감지] ✅ attachment에서 반응 감지 완료: type={reaction_type}, target={target_message_id}, msg_id={msg_id}")
                                except (json.JSONDecodeError, TypeError, KeyError) as e:
                                    # 파싱 실패는 조용히 무시 (일반 메시지일 수 있음)
                                    pass
                        
                        # 3. message 필드에서 반응 정보 확인 (fallback)
                        if not is_reaction and message:
                            # 메시지가 반응 이모지만 있는 경우 (예: 👍)
                            reaction_emojis = ["👍", "❤️", "😆", "😮", "😢", "🙏"]
                            if message.strip() in reaction_emojis:
                                is_reaction = True
                                reaction_type = "thumbs_up"  # 기본값
                        
                        # 반응이 있는 메시지 처리 (v.defaultEmoticonsCount > 0)
                        # 반응은 별도 메시지가 아니라 원본 메시지의 메타데이터로 저장됨
                        if reaction_count > 0:
                            print(f"[반응 정보] 메시지 ID {msg_id}에 {reaction_count}개 반응 있음")
                            # 반응 정보를 서버로 전송 (기존 반응 감지 로직과 별도로 처리)
                            try:
                                # 반응 상세 정보가 있으면 각 반응별로 전송
                                if reaction_details and isinstance(reaction_details, list):
                                    for reaction_detail in reaction_details:
                                        # 반응 상세 정보에서 타입, 사용자 정보 추출
                                        reaction_type_detail = reaction_detail.get("type") or reaction_detail.get("emoType") or reaction_detail.get("reaction") or "thumbs_up"
                                        reactor_id = reaction_detail.get("userId") or reaction_detail.get("user_id") or user_id
                                        reactor_name = get_name_of_user_id(reactor_id) if reactor_id else None
                                        
                                        reaction_data = {
                                            "type": "reaction_update",
                                            "room": room_name_raw or str(chat_id) if chat_id else "",
                                            "sender": reactor_name or str(reactor_id) if reactor_id else "",
                                            "json": {
                                                "target_message_id": msg_id,  # 반응 대상 메시지 ID (kakao_log_id)
                                                "reaction_type": reaction_type_detail,
                                                "message_id": msg_id,
                                                "chat_id": chat_id,
                                                "user_id": reactor_id,
                                                "created_at": created_at,
                                                "msg_type": msg_type,
                                                "reaction_count": reaction_count,
                                                "supplement": supplement
                                            }
                                        }
                                        
                                        if send_to_server(reaction_data, is_reaction=True):
                                            print(f"[✓] 반응 정보 전송 성공: ID={msg_id}, 타입={reaction_type_detail}, 반응자={reactor_name or reactor_id}")
                                else:
                                    # 반응 상세 정보가 없으면 전체 반응 개수만 전송
                                    print(f"[반응 정보] 반응 상세 정보 없음, 전체 반응 개수만 전송: msg_id={msg_id}, count={reaction_count}")
                                    # 전체 반응 개수 정보는 일반 메시지와 함께 전송되므로 별도 전송 불필요
                            except Exception as e:
                                print(f"[오류] 반응 정보 처리 실패: ID={msg_id}, 오류={e}")
                                import traceback
                                traceback.print_exc()
                        
                        # 반응 메시지인 경우 별도 처리 (기존 로직 - type 70-79 등)
                        # 디버그: 반응이 감지된 경우만 로깅 (무한 로그 방지)
                        if is_reaction:
                            print(f"[반응 체크 최종] ✅ 반응 감지: is_reaction={is_reaction}, msg_id={msg_id}, msg_type={msg_type}, msg_type_str={msg_type_str}")
                            # 반응 정보를 서버로 전송
                            try:
                                print(f"[반응 처리] 반응 메시지 감지: msg_id={msg_id}, type={msg_type}, reaction_type={reaction_type}, target={target_message_id}")
                                
                                # 발신자 이름 조회
                                sender_name = get_name_of_user_id(user_id) if user_id else None
                                sender = f"{sender_name}/{user_id}" if sender_name and user_id else (str(user_id) if user_id else "")
                                
                                # 채팅방 정보 조회
                                room_data = get_chat_room_data(chat_id) if chat_id else None
                                room_name_raw = room_data.get('name') if room_data else None
                                
                                # 반응 메시지 데이터 구성 (Phase 2: 복호화된 attachment 포함)
                                reaction_data = {
                                    "type": "reaction",
                                    "room": room_name_raw or str(chat_id) if chat_id else "",
                                    "sender": sender,
                                    "json": {
                                        "target_message_id": target_message_id or msg_id,  # 반응 대상 메시지 ID
                                        "reaction_type": reaction_type or "thumbs_up",
                                        "message_id": msg_id,  # 반응 메시지 자체의 ID
                                        "chat_id": chat_id,
                                        "user_id": user_id,
                                        "created_at": created_at,
                                        "msg_type": msg_type,  # 원본 메시지 타입 추가
                                        "attachment": json.dumps(attachment_decrypted) if attachment_decrypted else attachment,  # Phase 2: 복호화된 attachment 우선
                                        "attachment_decrypted": attachment_decrypted  # Phase 2: dict 형태
                                    }
                                }
                                
                                print(f"[반응 전송] 서버로 전송 시도: sender={sender}, room={room_name_raw or str(chat_id)}, target={target_message_id or msg_id}")
                                
                                # 서버로 반응 정보 전송
                                if send_to_server(reaction_data, is_reaction=True):
                                    print(f"[✓] 반응 정보 전송 성공: ID={msg_id}, 타입={reaction_type}, 대상={target_message_id or msg_id}")
                                    sent_count += 1
                                    sent_message_ids.add(msg_id)
                                else:
                                    print(f"[✗] 반응 정보 전송 실패: ID={msg_id}")
                                    sent_message_ids.discard(msg_id)
                            except Exception as e:
                                print(f"[오류] 반응 정보 처리 실패: ID={msg_id}, 오류={e}")
                                import traceback
                                traceback.print_exc()
                                sent_message_ids.add(msg_id)  # 오류 발생해도 처리된 것으로 표시
                            
                            continue  # 반응 메시지는 일반 메시지 처리 스킵
                        
                        max_id = max(max_id, msg_id)
                        
                        # 메시지가 비어있는 경우 스킵
                        if not message or message.strip() == "":
                            print(f"[필터링] ⚠️ 빈 메시지 스킵: ID={msg_id}, message={repr(message)}")
                            skipped_count += 1
                            sent_message_ids.add(msg_id)
                            continue
                        else:
                            print(f"[필터링] ✅ 메시지 있음: ID={msg_id}, message 길이={len(str(message))}")
                        
                        # 메시지 데이터 구성 (복호화는 send_to_server 함수에서 처리)
                        # 정상 작동 코드(55baa72) 기준: poll_messages에서는 복호화하지 않고 원본 메시지를 전송
                        # send_to_server 함수 내에서 MY_USER_ID로 복호화 처리
                        # userId 유효성 검사 (잘못된 값 필터링)
                        valid_user_id = None
                        if user_id:
                            try:
                                user_id_num = int(user_id) if isinstance(user_id, str) and user_id.isdigit() else (user_id if isinstance(user_id, int) else None)
                                if user_id_num and user_id_num > 1000:
                                    valid_user_id = user_id
                                    print(f"[유효성 검사] ✅ valid_user_id: {valid_user_id}")
                                else:
                                    print(f"[유효성 검사] ⚠️ user_id 유효하지 않음: user_id={user_id}, user_id_num={user_id_num}")
                            except (ValueError, TypeError) as e:
                                print(f"[유효성 검사] ⚠️ user_id 변환 실패: user_id={user_id}, 오류={e}")
                        else:
                            print(f"[유효성 검사] ⚠️ user_id가 None: ID={msg_id}")
                        
                        # kakao_user_id 유효성 검사
                        valid_kakao_user_id = None
                        if kakao_user_id:
                            try:
                                kakao_user_id_num = int(kakao_user_id) if isinstance(kakao_user_id, str) and kakao_user_id.isdigit() else (kakao_user_id if isinstance(kakao_user_id, int) else None)
                                if kakao_user_id_num and kakao_user_id_num > 1000:
                                    valid_kakao_user_id = kakao_user_id
                                    print(f"[유효성 검사] ✅ valid_kakao_user_id: {valid_kakao_user_id}")
                                else:
                                    print(f"[유효성 검사] ⚠️ kakao_user_id 유효하지 않음: kakao_user_id={kakao_user_id}, kakao_user_id_num={kakao_user_id_num}")
                            except (ValueError, TypeError) as e:
                                print(f"[유효성 검사] ⚠️ kakao_user_id 변환 실패: kakao_user_id={kakao_user_id}, 오류={e}")
                        
                        # valid_user_id가 없으면 메시지 처리 불가
                        if not valid_user_id:
                            print(f"[필터링] ❌ valid_user_id가 없어 메시지 처리 불가: ID={msg_id}, user_id={user_id}")
                            skipped_count += 1
                            sent_message_ids.add(msg_id)
                            continue
                        
                        # Phase 2: 복호화된 attachment 정보 추출
                        has_image = False
                        image_url = None
                        
                        # 이미지 확장자 목록
                        IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']
                        IMAGE_URL_PATTERNS = ['http://', 'https://', 'file://', 'content://']
                        
                        def is_image_url(value):
                            """값이 이미지 URL인지 확인 (확장자 또는 URL 패턴 기반)"""
                            if not isinstance(value, str) or len(value) < 5:
                                return False
                            value_lower = value.lower()
                            # URL 패턴 확인
                            if any(pattern in value_lower for pattern in IMAGE_URL_PATTERNS):
                                # 확장자 확인
                                if any(ext in value_lower for ext in IMAGE_EXTENSIONS):
                                    return True
                                # URL 패턴이 있으면 이미지로 간주 (확장자가 없어도)
                                if 'http' in value_lower:
                                    return True
                            # 확장자만 있는 경우 (상대 경로)
                            if any(value_lower.endswith(ext) for ext in IMAGE_EXTENSIONS):
                                return True
                            return False
                        
                        def find_image_url_in_dict(data_dict, depth=0, max_depth=3):
                            """딕셔너리에서 이미지 URL 재귀적으로 찾기"""
                            if depth > max_depth:
                                return None
                            if not isinstance(data_dict, dict):
                                return None
                            
                            # 우선순위 1: 일반적인 이미지 URL 키
                            priority_keys = ['url', 'thumbnailUrl', 'path', 'path_1', 'xl', 'l', 'm', 's', 'imageUrl', 'image_url', 'photoUrl', 'photo_url']
                            for key in priority_keys:
                                value = data_dict.get(key)
                                if value and is_image_url(str(value)):
                                    return str(value)
                            
                            # 우선순위 2: 모든 키-값 쌍 확인
                            for key, value in data_dict.items():
                                if isinstance(value, str) and is_image_url(value):
                                    return value
                                elif isinstance(value, dict):
                                    # 재귀적으로 딕셔너리 내부 확인
                                    found = find_image_url_in_dict(value, depth + 1, max_depth)
                                    if found:
                                        return found
                                elif isinstance(value, list):
                                    # 리스트 내부 확인
                                    for item in value:
                                        if isinstance(item, dict):
                                            found = find_image_url_in_dict(item, depth + 1, max_depth)
                                            if found:
                                                return found
                                        elif isinstance(item, str) and is_image_url(item):
                                            return item
                            
                            return None
                        
                        # attachment가 있으면 항상 이미지 URL 추출 시도 (msg_type과 무관)
                        attachment_to_check = attachment_decrypted if attachment_decrypted else attachment
                        if attachment_to_check:
                            print(f"[이미지 체크] attachment 확인: msg_id={msg_id}, attachment 존재={True}, 타입={type(attachment_to_check)}, attachment_decrypted={bool(attachment_decrypted)}, attachment={bool(attachment)}")
                            
                            if isinstance(attachment_to_check, dict):
                                print(f"[이미지 체크] attachment dict keys: {list(attachment_to_check.keys())[:20]}")
                                image_url = find_image_url_in_dict(attachment_to_check)
                                if image_url:
                                    has_image = True
                                    print(f"[이미지 감지] ✅ 감지 (dict, 확장자 필터링): url={image_url[:80] if image_url else None}..., msg_id={msg_id}, msg_type={msg_type_str}")
                                else:
                                    # 모든 키-값 쌍 출력 (디버깅)
                                    print(f"[이미지 체크] ⚠️ 이미지 URL 없음: attachment keys={list(attachment_to_check.keys())[:20]}")
                                    for key in list(attachment_to_check.keys())[:15]:
                                        value = attachment_to_check.get(key)
                                        if isinstance(value, str) and len(value) > 10:
                                            print(f"[이미지 체크] 키 샘플: {key}={value[:100]}...")
                            
                            elif isinstance(attachment_to_check, str):
                                print(f"[이미지 체크] attachment 문자열 길이: {len(attachment_to_check)}, 샘플: {attachment_to_check[:100]}...")
                                try:
                                    attach_json = json.loads(attachment_to_check)
                                    if isinstance(attach_json, dict):
                                        print(f"[이미지 체크] 파싱된 attachment dict keys: {list(attach_json.keys())[:20]}")
                                        image_url = find_image_url_in_dict(attach_json)
                                        if image_url:
                                            has_image = True
                                            print(f"[이미지 감지] ✅ 감지 (문자열 파싱, 확장자 필터링): url={image_url[:80] if image_url else None}..., msg_id={msg_id}, msg_type={msg_type_str}")
                                        else:
                                            print(f"[이미지 체크] ⚠️ 이미지 URL 없음 (문자열 파싱): keys={list(attach_json.keys())[:20]}")
                                except (json.JSONDecodeError, TypeError) as e:
                                    print(f"[이미지 체크] attachment 문자열 파싱 실패: {e}, 샘플: {attachment_to_check[:200]}...")
                        else:
                            print(f"[이미지 체크] attachment 없음: msg_id={msg_id}, attachment_decrypted={bool(attachment_decrypted)}, attachment={bool(attachment)}")
                        
                        # ⚠️ 중요: ref 코드 기준으로 이미지 타입은 2(PhotoChat), 27(MultiPhotoChat)만
                        # type 12는 이모티콘이므로 이미지로 처리하지 않음
                        # msg_type이 2 또는 27이면 이미지로 강제 설정 (attachment에 url이 있어야 함)
                        if msg_type_str in ["2", "27"]:
                            if not has_image:
                                print(f"[이미지 강제 체크] msg_type={msg_type_str}인데 has_image=False, attachment 재확인 필요 (확장자 필터링 사용)")
                                # attachment에서 url을 찾지 못했지만 msg_type이 이미지 타입이면
                                # 확장자 필터링을 사용하여 재확인
                                if attachment_to_check:
                                    if isinstance(attachment_to_check, dict):
                                        # 재귀적으로 이미지 URL 찾기
                                        found_url = find_image_url_in_dict(attachment_to_check)
                                        if found_url:
                                            image_url = found_url
                                            has_image = True
                                            print(f"[이미지 강제 감지] ✅ msg_type={msg_type_str}에서 url 발견 (확장자 필터링): url={found_url[:80]}...")
                                    elif isinstance(attachment_to_check, str):
                                        try:
                                            attach_json = json.loads(attachment_to_check)
                                            if isinstance(attach_json, dict):
                                                found_url = find_image_url_in_dict(attach_json)
                                                if found_url:
                                                    image_url = found_url
                                                    has_image = True
                                                    print(f"[이미지 강제 감지] ✅ msg_type={msg_type_str}에서 url 발견 (문자열 파싱, 확장자 필터링): url={found_url[:80]}...")
                                        except:
                                            pass
                            
                            # 이미지 타입 확인 로그
                            print(f"[이미지 최종] msg_id={msg_id}, msg_type={msg_type_str}, has_image={has_image}, image_url={image_url[:80] if image_url else 'None'}...")
                            
                            # ⚠️ 중요: msg_type이 2 또는 27이면 무조건 이미지로 설정 (url이 없어도)
                            if not has_image:
                                print(f"[이미지 강제 설정] ⚠️ msg_type={msg_type_str}이지만 url을 찾지 못함. has_image를 True로 강제 설정")
                                has_image = True  # msg_type이 이미지 타입이면 무조건 이미지로 처리
                        
                        message_data = {
                            "_id": msg_id,
                            "chat_id": chat_id,
                            "user_id": valid_user_id,  # DB의 user_id 컬럼 (메시지 발신자, 유효성 검사 통과)
                            "message": message,  # 원본 메시지 (복호화는 send_to_server에서)
                            "created_at": created_at,
                            "v": v_field,  # 암호화 정보 포함
                            "userId": valid_kakao_user_id if valid_kakao_user_id else valid_user_id,  # 발신자 user_id (서버 참고용, 유효성 검사 통과)
                            "myUserId": MY_USER_ID,  # 자신의 user_id (복호화에 사용)
                            "encType": enc_type,  # 암호화 타입 (기본값: 31)
                            "reply_to_message_id": reply_to_message_id,  # 답장 메시지 ID (referer 또는 attachment.src_message)
                            "origin": origin,  # 메시지 출처 (MSG, SYNCMSG, SYNCDLMSG 등) - 삭제 감지용
                            "msg_type": msg_type,  # 메시지 타입 (Feed 감지용)
                            "attachment": json.dumps(attachment_decrypted) if attachment_decrypted else attachment,  # Phase 2: 복호화된 attachment 우선
                            "attachment_decrypted": attachment_decrypted,  # Phase 2: dict 형태 (서버에서 사용)
                            "has_image": has_image,  # Phase 2: 이미지 여부
                            "image_url": image_url  # Phase 2: 이미지 URL
                        }
                        
                        # ⚠️ 디버그: 답장 메시지 전송 전 최종 확인
                        if reply_to_message_id or msg_type == 26 or msg_type == '26' or referer or attachment or attachment_decrypted:
                            print(f"[답장 전송] ⚠️⚠️⚠️ 답장 메시지 전송: msg_id={msg_id}, msg_type={msg_type}, reply_to_message_id={reply_to_message_id}, referer={referer}, attachment={bool(attachment)}, attachment_decrypted={bool(attachment_decrypted)}")
                            print(f"[답장 전송] message_data.reply_to_message_id={message_data.get('reply_to_message_id')}, message_data.msg_type={message_data.get('msg_type')}")
                        else:
                            print(f"[답장 전송] 일반 메시지: msg_id={msg_id}, msg_type={msg_type}, reply_to_message_id={reply_to_message_id}")
                        
                        # 디버그: 이미지 관련 데이터 전송 확인
                        if has_image or image_url:
                            print(f"[이미지 전송 확인] msg_id={msg_id}, has_image={message_data['has_image']}, image_url={message_data['image_url'][:50] if message_data['image_url'] else 'None'}...")
                        
                        # 디버그: 잘못된 값이 필터링되었는지 확인
                        if (kakao_user_id and not valid_kakao_user_id) or (user_id and not valid_user_id):
                            print(f"[경고] 잘못된 user_id 값 필터링: kakao_user_id={kakao_user_id}, user_id={user_id} (ID={msg_id})")
                        
                        # 서버로 전송
                        print(f"[전송 시도] msg_id={msg_id}, message 길이={len(str(message)) if message else 0}")
                        # ⚠️ 개선: 서버 전송 데이터 확인 로그 추가 (답장 정보 확인용)
                        print(f"[서버 전송] ⚠️ 답장 정보 확인: msg_id={msg_id}, msg_type={msg_type}, reply_to_message_id={reply_to_message_id}, referer={referer if referer else 'None'}, attachment 존재={bool(attachment)}, attachment 타입={type(attachment).__name__ if attachment else 'None'}, attachment_decrypted 존재={bool(message_data.get('attachment_decrypted'))}")
                        print(f"[서버 전송] message_data 구조: {list(message_data.keys())}")
                        
                        send_result = send_to_server(message_data)
                        print(f"[전송 결과] msg_id={msg_id}, 결과={send_result}")
                        if send_result:
                            sent_count += 1
                            # 전송 성공한 메시지는 sent_message_ids에 추가 (이미 추가되어 있지만 확실히)
                            sent_message_ids.add(msg_id)
                            print(f"[✅] 메시지 전송 성공: ID={msg_id}")
                        else:
                            # 전송 실패한 메시지는 sent_message_ids에서 제거하여 재시도 가능하게 함
                            sent_message_ids.discard(msg_id)
                            print(f"[❌] 메시지 전송 실패: ID={msg_id}, chat_id={chat_id}")
                    
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
                print(f"[poll_messages] ⚠️⚠️⚠️ messages가 비어있어서 처리하지 않음")
            
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

