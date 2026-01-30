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

class KakaoPoller:
    """카카오톡 메시지 폴링 클래스"""
    
    def __init__(self):
        """초기화"""
        # 로그 수집을 위한 print 함수 래핑 (가장 먼저 초기화)
        self._original_print = print
        
        # 카카오톡 DB 경로 (하율 패치로 접근 가능)
        self.DB_PATH = "/data/data/com.kakao.talk/databases/KakaoTalk.db"
        self.DB_PATH2 = "/data/data/com.kakao.talk/databases/KakaoTalk2.db"  # Iris 방식: db2로 attach
        # 서버 URL (WebSocket)
        self.WS_URL = "ws://192.168.0.15:5002/ws"
        self.HTTP_URL = "http://192.168.0.15:5002"

        # [제거됨] Iris HTTP API 설정
        # 이제 Bridge APK가 메시지 전송을 담당하므로 클라이언트는 메시지 수신만 수행합니다.

        # 마지막 처리한 메시지 ID 추적 (파일로 저장)
        self.STATE_FILE = os.path.expanduser("~/last_message_id.txt")
        # 자신의 user_id 저장 (복호화에 사용)
        self.MY_USER_ID_FILE = os.path.expanduser("~/my_user_id.txt")
        self.MY_USER_ID = None
        # 전송한 메시지 ID 추적 (중복 방지)
        self.sent_message_ids = set()

        # 반응 카운트 확인용 경량 캐시 (경량 버전: count만 저장)
        # 키: (chat_id, kakao_log_id) -> last_count
        self._reaction_count_cache = {}
        self.REACTION_CACHE_TTL = 21600  # 6시간 (초)
        self.REACTION_CHECK_INTERVAL = int(os.getenv('REACTION_POLL_INTERVAL_SEC', '20'))  # 기본 20초
        self.REACTION_QUERY_LIMIT = int(os.getenv('REACTION_QUERY_LIMIT', '1200'))  # 기본 1200개
        self.REACTION_TIME_RANGE = int(os.getenv('REACTION_WINDOW_MIN', '20')) * 60  # 기본 20분 (초)
        self.REACTION_BACKFILL_INTERVAL = int(os.getenv('REACTION_BACKFILL_INTERVAL_SEC', '1800'))  # 기본 30분
        self.REACTION_BACKFILL_WINDOW = int(os.getenv('REACTION_BACKFILL_WINDOW_HOURS', '48')) * 3600  # 기본 48시간 (초)
        self.MIN_EVENT_GAP_SEC = 10  # 동일 메시지 중복 전송 방지 (초)
        self.MAX_CACHE_ITEMS = 50000  # 캐시 최대 크기
        self._last_backfill_time = 0  # 마지막 backfill 실행 시간
        self._last_event_times = {}  # 메시지별 마지막 이벤트 전송 시간 (스로틀링용)

        # 복호화 관련 설정
        # 카카오톡 Android 복호화 로직 (Iris KakaoDecrypt.kt 기반)
        # - IV: 고정된 바이트 배열
        # - PASSWORD: 고정된 char 배열
        # - Salt: userId + encType 기반 (incept(830819) for encType=31)
        # - PKCS12 키 유도 (SHA-1, 2 iterations, 256-bit key)
        # - AES/CBC/NoPadding 복호화 후 수동 패딩 제거
        self.DECRYPT_ENABLED = CRYPTO_AVAILABLE

        # ⚠️ 복호화 관련 상수 및 함수는 kakao_decrypt_module.py로 이동됨
        # 복호화 로직은 모듈에서 import하여 사용합니다.
        # 아래 코드는 레거시 호환성을 위해 주석 처리되었습니다.
        # 실제 사용은 kakao_decrypt_module.py의 함수들을 사용하세요.

        # (레거시 호환성: 채팅방 이름 복호화에서 사용하는 경우를 위해 일부 상수는 유지)
        # 하지만 실제 복호화 로직은 모듈에서 import하여 사용
        self.KAKAO_PREFIXES = [
            "", "", "12", "24", "18", "30", "36", "12", "48", "7", "35", "40",
            "17", "23", "29", "isabel", "kale", "sulli", "van", "merry", "kyle",
            "james", "maddux", "tony", "hayden", "paul", "elijah", "dorothy",
            "sally", "bran", KakaoPoller.incept(830819), "veil"
        ]

        # WebSocket 연결 관리
        self.ws_connection = None
        self.ws_lock = threading.Lock()
        self.ws_reconnect_thread = None  # 재연결 스레드
        self.ws_reconnect_attempts = 0  # 재연결 시도 횟수
        self.MAX_RECONNECT_ATTEMPTS = 10  # 최대 재연결 시도 횟수
        self.RECONNECT_INTERVAL = 3  # 재연결 간격 (초)
        # 마지막 메시지의 room 정보 저장 (서버 응답에 room이 없을 때 사용)
        self.last_message_room = None
        self.last_message_chat_id = None  # 마지막 메시지의 chat_id (숫자)

        # 클라이언트 로그 수집 및 전송
        self.client_log_buffer = []  # 로그 버퍼
        self.client_log_lock = threading.Lock()  # 로그 버퍼 락
        self.CLIENT_LOG_SEND_INTERVAL = 10  # 10초마다 전송
        self.CLIENT_LOG_MAX_LINES = 50  # 최대 50줄 전송
        self.last_log_send_time = 0  # 마지막 로그 전송 시간

        # DB 구조 캐시 초기화
        self._db_structure_cache = None
        self._select_columns_cache = None
        
        # 복호화 모듈 설정
        self.ATTACHMENT_DECRYPT_AVAILABLE = ATTACHMENT_DECRYPT_AVAILABLE
        self.decrypt_attachment = decrypt_attachment
        self.ATTACHMENT_DECRYPT_WHITELIST = ATTACHMENT_DECRYPT_WHITELIST
        self.KakaoDecrypt = KakaoDecrypt if 'KakaoDecrypt' in globals() else None
        self.KAKAODECRYPT_AVAILABLE = KAKAODECRYPT_AVAILABLE if 'KAKAODECRYPT_AVAILABLE' in globals() else False

    @staticmethod
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

    def load_last_message_id(self):
        """마지막 메시지 ID 로드"""
        try:
            if os.path.exists(self.STATE_FILE):
                with open(self.STATE_FILE, 'r') as f:
                    content = f.read().strip()
                    if content:
                        last_id = int(content)
                        # 전송한 메시지 ID 세트 초기화 (이미 처리된 메시지)
                        # 너무 많은 메시지를 세트에 추가하지 않도록 제한 (최근 1000개만)
                        if last_id > 1000:
                            self.sent_message_ids = set(range(last_id - 1000, last_id + 1))
                        else:
                            self.sent_message_ids = set(range(1, last_id + 1))
                        return last_id
        except Exception as e:
            self.log_print(f"[경고] 상태 파일 로드 오류: {e}")
        return 0

    def save_last_message_id(self, msg_id):
        """마지막 메시지 ID 저장"""
        try:
            os.makedirs(os.path.dirname(self.STATE_FILE), exist_ok=True)
            with open(self.STATE_FILE, 'w') as f:
                f.write(str(msg_id))
        except Exception as e:
            self.log_print(f"[경고] 상태 저장 오류: {e}")

    def guess_my_user_id(self):
        """
        자신의 user_id 추정 (제공된 코드의 KakaoDbGuessUserId 로직)
        1. open_profile 테이블에서 user_id 가져오기 시도 (제공된 코드 방식)
        2. 실패 시 chat_rooms의 members와 chat_logs의 user_id를 비교하여 자신의 user_id 찾기
        """
        try:
            conn = sqlite3.connect(self.DB_PATH)
            cursor = conn.cursor()
            
            # 방법 1: open_profile 테이블에서 user_id 가져오기 시도 (제공된 코드 방식)
            # 제공된 코드: cur.execute('SELECT user_id FROM open_profile LIMIT 1')
            try:
                cursor.execute('SELECT user_id FROM open_profile LIMIT 1')
                row = cursor.fetchone()
                if row and row[0] is not None:
                    my_user_id = row[0]
                    self.log_print(f"[정보] open_profile에서 자신의 user_id 발견: {my_user_id}")
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
                    self.log_print(f"[정보] user_id 후보 (메시지 수 기준):")
                    for user_id, cnt in candidates:
                        self.log_print(f"  - user_id={user_id}, 메시지 수={cnt}")
                        # 가장 많은 메시지를 보낸 user_id가 자신의 user_id일 가능성이 높음
                        most_active_user_id = candidates[0][0]
                        self.log_print(f"[정보] 가장 활발한 user_id (추정): {most_active_user_id}")
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
                self.log_print(f"[경고] chat_rooms 테이블 조회 실패: {e}")
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
                self.log_print(f"[정보] 가능한 user_id 후보 (총 {total}개):")
                for user_id, count in counter.most_common():
                    prob = count * 100 / total
                    self.log_print(f"  user_id={user_id:20d} (확률: {prob:5.2f}%)")
                
                # 가장 많이 나타나는 user_id가 자신의 user_id일 가능성이 높음
                most_common = counter.most_common(1)[0]
                my_user_id = most_common[0]
                probability = most_common[1] * 100 / total
                
                self.log_print(f"\n[정보] 추정된 자신의 user_id: {my_user_id} (확률: {probability:.2f}%)")
                self.log_print(f"[정보] 추정된 user_id가 잘못되었을 수 있습니다. 복호화 실패 시 다음을 시도하세요:")
                self.log_print(f"  1. 위의 다른 user_id 후보를 순서대로 테스트")
                self.log_print(f"  2. 로그 확인: 복호화 실패한 메시지의 발신자 user_id 확인")
                self.log_print(f"  3. 수동 설정: echo 'YOUR_USER_ID' > ~/my_user_id.txt")
                return my_user_id
            else:
                self.log_print("[경고] 자신의 user_id를 찾을 수 없습니다.")
                self.log_print("[정보] 다음 방법을 시도하세요:")
                self.log_print(f"  1. 복호화 테스트: 여러 user_id 후보를 수동으로 테스트")
                self.log_print(f"  2. 로그 확인: 복호화 실패한 메시지의 발신자 user_id 확인")
                self.log_print(f"  3. 수동 설정: echo 'YOUR_USER_ID' > ~/my_user_id.txt")
                return None
        except Exception as e:
            self.log_print(f"[경고] user_id 추정 실패: {e}")
            return None

    def load_my_user_id(self):
        """자신의 user_id 로드 (파일에서 또는 추정)"""
        # 파일에서 로드 시도
        try:
            if os.path.exists(self.MY_USER_ID_FILE):
                with open(self.MY_USER_ID_FILE, 'r') as f:
                    content = f.read().strip()
                    if content:
                        self.MY_USER_ID = int(content)
                        self.log_print(f"[정보] 저장된 자신의 user_id 사용: {self.MY_USER_ID}")
                        self.log_print(f"[정보] 이 user_id가 잘못되었을 수 있습니다. 복호화 실패 시:")
                        self.log_print(f"  1. guess_user_id.py 실행하여 모든 후보 확인")
                        self.log_print(f"  2. 다른 후보를 수동으로 테스트: echo 'USER_ID' > {self.MY_USER_ID_FILE}")
                        return self.MY_USER_ID
        except Exception as e:
            self.log_print(f"[경고] user_id 파일 로드 오류: {e}")
        
        # 파일이 없으면 추정 시도
        self.log_print("[정보] 자신의 user_id 추정 중...")
        self.MY_USER_ID = self.guess_my_user_id()
        
        # 추정된 user_id 저장
        if self.MY_USER_ID:
            try:
                os.makedirs(os.path.dirname(self.MY_USER_ID_FILE), exist_ok=True)
                with open(self.MY_USER_ID_FILE, 'w') as f:
                    f.write(str(self.MY_USER_ID))
                self.log_print(f"[정보] 추정된 user_id 저장: {self.MY_USER_ID}")
                self.log_print(f"[경고] 추정된 user_id가 잘못되었을 수 있습니다. 복호화 실패 시:")
                self.log_print(f"  1. guess_user_id.py 실행하여 모든 후보 확인")
                self.log_print(f"  2. 다른 후보를 수동으로 테스트: echo 'USER_ID' > {self.MY_USER_ID_FILE}")
            except Exception as e:
                self.log_print(f"[경고] user_id 저장 오류: {e}")
        else:
            self.log_print(f"[경고] user_id를 찾을 수 없습니다. 다음 방법을 시도하세요:")
            self.log_print(f"  1. guess_user_id.py 실행하여 모든 후보 확인")
            self.log_print(f"  2. 수동으로 user_id 설정: echo 'YOUR_USER_ID' > {self.MY_USER_ID_FILE}")
        
        return self.MY_USER_ID

    def check_db_access(self):
        """DB 접근 가능 여부 확인"""
        try:
            # DB 파일 존재 확인
            if not os.path.exists(self.DB_PATH):
                self.log_print(f"\n[오류] DB 파일을 찾을 수 없습니다: {self.DB_PATH}")
                self.log_print("\n[해결 방법]")
                self.log_print("1. 실제 DB 파일 경로 확인:")
                self.log_print("   ls -la /data/data/com.kakao.talk/databases/")
                self.log_print("2. 스크립트의 DB_PATH를 실제 파일 이름으로 수정")
                return False
            
            # 읽기 권한 확인
            if not os.access(self.DB_PATH, os.R_OK):
                self.log_print(f"\n[오류] DB 파일 읽기 권한이 없습니다: {self.DB_PATH}")
                self.log_print("\n[해결 방법]")
                self.log_print("1. 하율 패치가 제대로 적용되었는지 확인")
                self.log_print("2. Termux에서 직접 실행 (Ubuntu/proot 환경 아님)")
                return False
            
            # DB 연결 테스트
            conn = sqlite3.connect(self.DB_PATH)
            conn.close()
            return True
            
        except Exception as e:
            self.log_print(f"\n[오류] DB 접근 실패: {e}")
            self.log_print("\n[해결 방법]")
            self.log_print("1. Termux 환경에서 직접 실행 (proot-distro login ubuntu 아님)")
            self.log_print("2. DB 경로 확인: ls -la /data/data/com.kakao.talk/databases/")
            return False

    def get_latest_message_id(self):
        """DB에서 최신 메시지 ID 조회 (검증용)"""
        try:
            conn = sqlite3.connect(self.DB_PATH)
            cursor = conn.cursor()
            cursor.execute("SELECT MAX(_id) FROM chat_logs")
            result = cursor.fetchone()
            conn.close()
            return result[0] if result[0] is not None else 0
        except Exception as e:
            self.log_print(f"[검증 오류] 최신 메시지 ID 조회 실패: {e}")
            return None

    def get_name_of_user_id(self, user_id):
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
            conn = sqlite3.connect(self.DB_PATH)
            cursor = conn.cursor()
            
            # Iris 방식: KakaoTalk2.db를 db2로 attach
            db2_attached = False
            try:
                if os.path.exists(self.DB_PATH2):
                    cursor.execute(f"ATTACH DATABASE '{self.DB_PATH2}' AS db2")
                    db2_attached = True
            except Exception as e:
                self.log_print(f"[발신자] db2 attach 실패: {e}")
            
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
                        self.log_print(f"[DB조회] open_chat_member 조회 오류: {e}")
                    
                    try:
                        cursor.execute("SELECT name, enc FROM db2.friends WHERE id = ?", (user_id_str,))
                        friends_result = cursor.fetchone()
                        if friends_result:
                            friends_name = friends_result[0]
                            friends_enc = friends_result[1] if len(friends_result) > 1 and friends_result[1] is not None else 0
                    except Exception as e:
                        self.log_print(f"[DB조회] friends 조회 오류: {e}")
                    
                    # [DB 조회 로그] 실제 DB에서 조회한 정보 출력
                    self.log_print(f"[DB조회] user_id={user_id_str}로 조회:")
                    if ocm_name:
                        ocm_name_str = str(ocm_name)
                        self.log_print(f"[DB조회]   open_chat_member: nickname 길이={len(ocm_name_str)}, 값=\"{ocm_name_str}\", enc={ocm_enc}")
                    else:
                        self.log_print(f"[DB조회]   open_chat_member: 결과 없음")
                    if friends_name:
                        friends_name_str = str(friends_name)
                        self.log_print(f"[DB조회]   friends: name 길이={len(friends_name_str)}, 값=\"{friends_name_str}\", enc={friends_enc}")
                    else:
                        self.log_print(f"[DB조회]   friends: 결과 없음")
                    self.log_print(f"[DB조회] MY_USER_ID={self.MY_USER_ID}")
                    
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
                            self.log_print(f"[DB조회] open_chat_member 선택 (더 긴 문자열): 길이={ocm_len}")
                        else:
                            encrypted_name = friends_name
                            enc = friends_enc
                            self.log_print(f"[DB조회] friends 선택 (더 긴 문자열): 길이={friends_len}")
                    elif ocm_name:
                        encrypted_name = ocm_name
                        enc = ocm_enc
                        self.log_print(f"[DB조회] open_chat_member 선택 (유일한 값)")
                    elif friends_name:
                        encrypted_name = friends_name
                        enc = friends_enc
                        self.log_print(f"[DB조회] friends 선택 (유일한 값)")
                    
                    if encrypted_name:
                        # 암호화되어 있으면 복호화 시도 (Iris: KakaoDecrypt.decrypt(enc, encryptedName, Configurable.botId))
                        # 복호화 시도 조건: MY_USER_ID가 있고, 암호화된 문자열인 경우
                        # base64로 보이는 경우 암호화된 것으로 간주
                        # 짧은 문자열도 암호화일 수 있으므로 len > 5로 완화
                        is_base64_like = (isinstance(encrypted_name, str) and 
                                    len(encrypted_name) > 5 and
                                    all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=' for c in encrypted_name))
                        
                        if self.KAKAODECRYPT_AVAILABLE and self.MY_USER_ID and is_base64_like:
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
                                    decrypt_user_id_int = int(self.MY_USER_ID)
                                    if decrypt_user_id_int > 0:
                                        # KakaoDecrypt.decrypt(user_id, enc, cipher_b64)
                                        if self.KakaoDecrypt:
                                            decrypted = self.KakaoDecrypt.decrypt(decrypt_user_id_int, enc_try, encrypted_name)
                                        else:
                                            decrypted = None
                                        
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
                            self.log_print(f"[발신자] ❌ 클라이언트 복호화 실패 (모든 enc 후보 시도 완료), 서버로 암호화된 이름 전송: user_id={user_id}, DB에서 조회한 enc={enc}, MY_USER_ID={self.MY_USER_ID}")
                            self.log_print(f"[발신자] 시도한 enc 후보: {enc_candidates}, 암호화된 이름=\"{encrypted_name}\" (서버에서 복호화 시도 예정)")
                        else:
                            self.log_print(f"[발신자] base64 형태가 아님 (암호화되지 않은 것으로 간주): \"{encrypted_name}\"")
                        
                        # 복호화 실패하거나 암호화되지 않은 경우 원본 반환 (서버에서 복호화 시도)
                        self.log_print(f"[발신자] 암호화된 이름을 서버로 전송 (서버에서 복호화 시도 예정): \"{encrypted_name}\" (길이={len(str(encrypted_name))})")
                        conn.close()
                        return encrypted_name
                    else:
                        # encrypted_name이 None인 경우
                        self.log_print(f"[발신자] 이름 조회 실패: user_id={user_id}, open_chat_member와 friends 모두 결과 없음")
                        conn.close()
                        return None
                except Exception as e:
                    self.log_print(f"[발신자] open_chat_member 조회 오류: {e}")
                    import traceback
                    traceback.print_exc()
                    if conn:
                        conn.close()
                    return None
            else:
                # Iris 코드: 구 DB 방식 (friends 테이블만)
                try:
                    sql = "SELECT name, enc FROM db2.friends WHERE id = ?"
                    if db2_attached:
                        cursor.execute(sql, (user_id_str,))
                        result = cursor.fetchone()
                        
                        # [DB 조회 로그] 실제 DB에서 조회한 정보 출력
                        self.log_print(f"[DB조회] user_id={user_id_str}로 friends 테이블 조회:")
                        if result:
                            name_value = result[0] if result[0] else None
                            enc_value = result[1] if len(result) > 1 else None
                            name_str = str(name_value) if name_value else 'None'
                            self.log_print(f"[DB조회]   결과: name 길이={len(name_str) if name_value else 0}, enc={enc_value}")
                            self.log_print(f"[DB조회]   name 전체값: \"{name_str}\"")
                        else:
                            self.log_print(f"[DB조회]   결과 없음")
                        self.log_print(f"[DB조회] MY_USER_ID={self.MY_USER_ID}")
                        
                        if result and result[0]:
                            encrypted_name = result[0]
                            enc = result[1] if len(result) > 1 and result[1] is not None else 0
                            
                            # 암호화되어 있으면 복호화 시도
                            if self.KAKAODECRYPT_AVAILABLE and self.MY_USER_ID:
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
                                        
                                        self.log_print(f"[발신자] 복호화 시도 (friends): user_id={user_id}, MY_USER_ID={self.MY_USER_ID}, 암호화된 이름=\"{encrypted_name}\", enc 후보={enc_candidates}")
                                        
                                        for enc_try in enc_candidates:
                                            try:
                                                decrypt_user_id_int = int(self.MY_USER_ID)
                                                if decrypt_user_id_int > 0:
                                                    # KakaoDecrypt.decrypt(user_id, enc, cipher_b64)
                                                    if self.KakaoDecrypt:
                                                        decrypted = self.KakaoDecrypt.decrypt(decrypt_user_id_int, enc_try, encrypted_name)
                                                    else:
                                                        decrypted = None
                                                    
                                                    if decrypted and decrypted != encrypted_name:
                                                        # 유효한 텍스트인지 확인
                                                        has_control_chars = any(ord(c) < 32 and c not in '\n\r\t' for c in decrypted)
                                                        
                                                        if not has_control_chars and len(decrypted) > 0:
                                                            self.log_print(f"[발신자] ✅ 복호화 성공 (friends): user_id={user_id}, enc={enc_try}, \"{encrypted_name}\" -> \"{decrypted}\"")
                                                            conn.close()
                                                            return decrypted
                                                        else:
                                                            self.log_print(f"[발신자] 복호화 결과 무효 (friends): enc={enc_try}, 결과=\"{decrypted}\", 제어문자={has_control_chars}")
                                            except Exception as e:
                                                self.log_print(f"[발신자] 복호화 시도 실패 (friends): enc={enc_try}, 오류={type(e).__name__}: {e}")
                                                continue
                                        
                                        # 모든 enc 후보 실패 시 로그 출력 (서버에서 복호화 시도 예정)
                                        self.log_print(f"[발신자] ❌ 클라이언트 복호화 실패 (friends, 모든 enc 후보 시도 완료), 서버로 암호화된 이름 전송: user_id={user_id}, DB에서 조회한 enc={enc}, MY_USER_ID={self.MY_USER_ID}")
                                        self.log_print(f"[발신자] 시도한 enc 후보: {enc_candidates}, 암호화된 이름=\"{encrypted_name}\" (서버에서 복호화 시도 예정)")
                                    else:
                                        self.log_print(f"[발신자] base64 형태가 아님 (friends, 암호화되지 않은 것으로 간주): \"{encrypted_name}\"")
                                except Exception as e:
                                    self.log_print(f"[발신자] 복호화 처리 중 예외 (friends): {type(e).__name__}: {e}")
                                    import traceback
                                    traceback.print_exc()
                        else:
                            self.log_print(f"[발신자] 암호화된 이름을 서버로 전송 (friends, 서버에서 복호화 시도 예정): \"{encrypted_name}\"")
                            conn.close()
                            return encrypted_name
                except Exception as e:
                    self.log_print(f"[발신자] friends 조회 오류: {e}")
            
            conn.close()
            return None
        except Exception as e:
            self.log_print(f"[발신자] 이름 조회 실패: user_id={user_id}, 오류={e}")
            return None

    def get_chat_room_data(self, chat_id):
        """채팅방 ID로 채팅방 데이터 조회 (Iris 방식: private_meta에서 name 추출)"""
        try:
            conn = sqlite3.connect(self.DB_PATH)
            cursor = conn.cursor()
        
            # Iris 방식: KakaoTalk2.db를 db2로 attach
            db2_attached = False
            try:
                if os.path.exists(self.DB_PATH2):
                    cursor.execute(f"ATTACH DATABASE '{self.DB_PATH2}' AS db2")
                    db2_attached = True
                    self.log_print(f"[채팅방] db2 attach 성공: {self.DB_PATH2}")
                else:
                    self.log_print(f"[채팅방] db2 파일 없음: {self.DB_PATH2}")
            except Exception as e:
                self.log_print(f"[채팅방] db2 attach 실패: {e}")
            
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
                        self.log_print(f"[채팅방] private_meta가 NULL이거나 비어있음: chat_id={chat_id}")
                else:
                    self.log_print(f"[채팅방] private_meta 조회 결과 없음: chat_id={chat_id}")
                
                # private_meta에 name이 없으면 db2.open_link 테이블 확인 (Iris 방식)
                if db2_attached:
                    try:
                        cursor.execute("SELECT name FROM db2.open_link WHERE id = (SELECT link_id FROM chat_rooms WHERE id = ?)", (chat_id,))
                        result = cursor.fetchone()
                        if result and result[0]:
                            room_name_raw = result[0]
                            self.log_print(f"[채팅방] db2.open_link에서 이름 조회 성공: chat_id={chat_id}, name=\"{room_name_raw}\"")
                            conn.close()
                            return {
                                'name': room_name_raw,
                                'name_column': 'db2.open_link.name',
                                'raw_data': {'name': room_name_raw}
                            }
                        else:
                            self.log_print(f"[채팅방] db2.open_link 조회 결과 없음: chat_id={chat_id}")
                    except Exception as e:
                        self.log_print(f"[채팅방] db2.open_link 조회 실패: chat_id={chat_id}, 오류={e}")
                else:
                    self.log_print(f"[채팅방] db2 attach 안됨, db2.open_link 확인 불가: chat_id={chat_id}")
            
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
                self.log_print(f"[채팅방] 데이터 조회 예외: chat_id={chat_id}, 오류={e}")
                pass
            
            conn.close()
            return None
        except Exception as e:
            self.log_print(f"[채팅방] DB 연결 오류: chat_id={chat_id}, 오류={e}")
            return None

    def get_new_messages(self):
        """새 메시지 조회 (중복 방지)"""
        last_id = self.load_last_message_id()
        
        # 검증: 최신 메시지 ID 확인 (로그 최소화)
        latest_id_in_db = self.get_latest_message_id()
        if latest_id_in_db is not None:
            if latest_id_in_db < last_id:
                # last_id가 DB의 최신 ID보다 큼 (비정상) - 이 경우만 경고
                self.log_print(f"[경고] last_message_id({last_id})가 DB 최신 ID({latest_id_in_db})보다 큼. 초기화 필요할 수 있음.")
        
        try:
            conn = sqlite3.connect(self.DB_PATH)
            cursor = conn.cursor()
            
            # DB 구조 캐시 사용 (최초 1회만 확인)
            if self._select_columns_cache is None:
                # 먼저 테이블 구조 확인하여 사용 가능한 컬럼 확인
                try:
                    cursor.execute("PRAGMA table_info(chat_logs)")
                    columns_info = cursor.fetchall()
                    available_columns = [col[1] for col in columns_info]
                    self._db_structure_cache = available_columns
                    
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
                        self.log_print(f"[DB 구조] ✅ type 컬럼 사용 가능")
                    else:
                        self.log_print(f"[DB 구조] ⚠️ type 컬럼 없음 - 반응 감지 불가능")
                    if "attachment" in available_columns:
                        select_columns.append("attachment")  # 첨부 정보 (반응 정보 포함 가능)
                        self.log_print(f"[DB 구조] ✅ attachment 컬럼 사용 가능")
                    else:
                        self.log_print(f"[DB 구조] ⚠️ attachment 컬럼 없음 - 반응/이미지 감지 불가능")
                    if "referer" in available_columns:
                        select_columns.append("referer")  # 답장 메시지 ID (referer 필드)
                        self.log_print(f"[DB 구조] ✅ referer 컬럼 사용 가능")
                    else:
                        self.log_print(f"[DB 구조] ⚠️ referer 컬럼 없음 - 답장 감지 불가능")
                    if "supplement" in available_columns:
                        select_columns.append("supplement")  # 반응 상세 정보 (supplement 필드)
                        self.log_print(f"[DB 구조] ✅ supplement 컬럼 사용 가능")
                    else:
                        self.log_print(f"[DB 구조] ⚠️ supplement 컬럼 없음 - 반응 상세 정보 확인 불가능")
                    
                    self._select_columns_cache = select_columns
                except Exception as e:
                    # 테이블 정보 조회 실패 시 기본 쿼리 사용
                    self.log_print(f"[경고] 테이블 구조 확인 실패: {e}, 기본 쿼리 사용")
                    self._select_columns_cache = ["_id", "chat_id", "user_id", "message", "created_at"]
            
            # 캐시된 컬럼 사용
            select_columns = self._select_columns_cache
            
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
            messages = cursor.fetchall()
            
            # 로그: 메시지가 있을 때만 출력
            if len(messages) > 0:
                self.log_print(f"[get_new_messages] 쿼리 결과: {len(messages)}개 메시지 조회됨 (last_id={last_id})")
            
            conn.close()
            
            # 중복 메시지 필터링 (try 블록 안에서 처리)
            new_messages = []
            for msg in messages:
                msg_id = msg[0]
                # 이미 전송한 메시지는 제외
                if msg_id not in self.sent_message_ids:
                    new_messages.append(msg)
                    # 전송 예정으로 표시 (중복 방지) - 세트 크기 제한
                    self.sent_message_ids.add(msg_id)
                    # 세트 크기가 너무 커지지 않도록 제한 (최근 2000개만 유지)
                    if len(self.sent_message_ids) > 2000:
                        # 가장 오래된 메시지 ID 제거
                        min_id = min(self.sent_message_ids)
                        self.sent_message_ids.discard(min_id)
            
            # 로그: 새 메시지가 있을 때만 상세 로그 출력
            if new_messages:
                self.log_print(f"[get_new_messages] ✅ {len(new_messages)}개 새 메시지 발견 (전체 {len(messages)}개 중)")
            elif len(messages) > 0:
                # 메시지는 조회되었지만 모두 이미 처리됨 (30초마다 한 번)
                if not hasattr(self, '_last_skip_log') or time.time() - self._last_skip_log > 30:
                    self.log_print(f"[get_new_messages] ⚠️ 모든 메시지 이미 처리됨 (조회: {len(messages)}개)")
                    self._last_skip_log = time.time()
            
            return new_messages
        except sqlite3.OperationalError as e:
            # 테이블이 없거나 구조가 다를 수 있음
            self.log_print(f"\n[DB 쿼리 오류] {e}")
            self.log_print("카카오톡 DB 구조를 확인해야 합니다.")
            self.log_print("\n[해결 방법]")
            self.log_print(f"1. DB 구조 확인: sqlite3 {self.DB_PATH} '.tables'")
            self.log_print("2. 실제 테이블 이름으로 쿼리 수정")
            return []
        except Exception as e:
            # DB 조회 실패 시 빈 배열 반환
            self.log_print(f"[경고] DB 조회 실패: {e}")
            return []

    def log_print(self, *args, **kwargs):
        """로그를 버퍼에 저장하면서 원래 print 함수도 실행"""
        # 원래 print 함수 실행
        self._original_print(*args, **kwargs)
        
        # 로그 버퍼에 추가
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        log_line = f"[{timestamp}] " + ' '.join(str(arg) for arg in args)
        
        with self.client_log_lock:
            self.client_log_buffer.append(log_line)
            # 버퍼 크기 제한 (최근 100줄만 유지)
            if len(self.client_log_buffer) > 100:
                self.client_log_buffer = self.client_log_buffer[-100:]
        
        # 10초마다 서버로 전송
        current_time = time.time()
        if current_time - self.last_log_send_time >= self.CLIENT_LOG_SEND_INTERVAL:
            self.send_client_logs_to_server()
            self.last_log_send_time = current_time

    def send_client_logs_to_server(self):
        """클라이언트 로그를 서버로 전송"""
        if not self.ws_connection or not self.ws_connection.sock or not self.ws_connection.sock.connected:
            return
        
        with self.client_log_lock:
            if not self.client_log_buffer:
                return
            
            # 최근 50줄만 전송
            logs_to_send = self.client_log_buffer[-self.CLIENT_LOG_MAX_LINES:]
            self.client_log_buffer = []  # 전송 후 버퍼 비우기
        
        try:
            log_data = {
                "type": "client_logs",
                "logs": logs_to_send,
                "timestamp": datetime.now().isoformat(),
                "line_count": len(logs_to_send)
            }
            
            with self.ws_lock:
                if self.ws_connection and self.ws_connection.sock and self.ws_connection.sock.connected:
                    self.ws_connection.send(json.dumps(log_data))
                    self._original_print(f"[클라이언트 로그] {len(logs_to_send)}줄 서버로 전송 완료")
        except Exception as e:
            self._original_print(f"[클라이언트 로그 전송 오류] {e}")

    def connect_websocket(self):
        """WebSocket 연결"""
        def on_message(ws, message):
            """서버로부터 메시지 수신 (로깅만 수행, 전송은 Bridge APK가 담당)"""
            try:
                data = json.loads(message)
                
                # 서버 응답 로깅 (Bridge APK가 전송을 담당하므로 여기서는 로그만 출력)
                if data.get('type') == 'reply' and data.get('replies'):
                    replies = data.get('replies', [])
                    self.log_print(f"[서버 응답] {len(replies)}개 응답 수신 (Bridge APK가 전송 담당)")
                    for idx, reply_item in enumerate(replies):
                        if isinstance(reply_item, dict):
                            reply_text = reply_item.get('text', '')
                            reply_room = reply_item.get('room', '')
                            self.log_print(f"[응답 {idx+1}/{len(replies)}] room=\"{reply_room}\", text=\"{reply_text[:50]}...\"")
                        elif isinstance(reply_item, str):
                            self.log_print(f"[응답 {idx+1}/{len(replies)}] text=\"{reply_item[:50]}...\"")
                elif data.get('type') == 'reply' and not data.get('replies'):
                    # 빈 응답은 로그 출력 안 함
                    pass
                else:
                    self.log_print(f"[서버 응답] {data}")
            except Exception as e:
                self.log_print(f"[서버 응답 파싱 오류] {e}")
        
        def on_error(ws, error):
            """WebSocket 오류"""
            self.log_print(f"[WebSocket 오류] {error}")
        
        def on_close(ws, close_status_code, close_msg):
            """WebSocket 연결 종료 - 재연결 시도"""
            self.log_print(f"[WebSocket 연결 종료] code={close_status_code}, msg={close_msg}")
            self.ws_connection = None
            
            # 재연결 스레드가 이미 실행 중이면 중복 실행 방지
            if self.ws_reconnect_thread and self.ws_reconnect_thread.is_alive():
                self.log_print("[재연결] 이미 재연결 시도 중입니다.")
                return
            
            # 재연결 스레드 시작
            def reconnect_loop():
                self.ws_reconnect_attempts = 0
                
                while self.ws_reconnect_attempts < self.MAX_RECONNECT_ATTEMPTS:
                    self.ws_reconnect_attempts += 1
                    self.log_print(f"[재연결 시도 {self.ws_reconnect_attempts}/{self.MAX_RECONNECT_ATTEMPTS}] {self.RECONNECT_INTERVAL}초 후 재연결 시도...")
                    time.sleep(self.RECONNECT_INTERVAL)
                    
                    # 이미 연결되어 있으면 중단
                    if self.ws_connection and self.ws_connection.sock and self.ws_connection.sock.connected:
                        self.log_print("[재연결] 이미 연결되어 있습니다.")
                        break
                    
                    # 재연결 시도
                    self.log_print(f"[재연결 시도 {self.ws_reconnect_attempts}/{self.MAX_RECONNECT_ATTEMPTS}] 연결 시도 중...")
                    if self.connect_websocket():
                        self.log_print(f"[✓] 재연결 성공 ({self.ws_reconnect_attempts}번째 시도)")
                        self.ws_reconnect_attempts = 0  # 성공 시 카운터 리셋
                        break
                    else:
                        self.log_print(f"[✗] 재연결 실패 ({self.ws_reconnect_attempts}/{self.MAX_RECONNECT_ATTEMPTS})")
                
                if self.ws_reconnect_attempts >= self.MAX_RECONNECT_ATTEMPTS:
                    self.log_print(f"[✗] 재연결 실패: 최대 시도 횟수({self.MAX_RECONNECT_ATTEMPTS}) 초과. 재연결을 중단합니다.")
            
            self.ws_reconnect_thread = threading.Thread(target=reconnect_loop, daemon=True)
            self.ws_reconnect_thread.start()
        
        def on_open(ws):
            """WebSocket 연결 성공"""
            self.log_print("[✓] WebSocket 연결 성공")
            self.ws_reconnect_attempts = 0  # 연결 성공 시 재연결 카운터 리셋
            # 연결 메시지 전송
            ws.send(json.dumps({"type": "connect"}))
        
        try:
            ws = websocket.WebSocketApp(
                self.WS_URL,
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
            self.ws_connection = ws
            return True
        except Exception as e:
            self.log_print(f"[WebSocket 연결 오류] {e}")
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

    def send_to_server(self, message_data, is_reaction=False):
        """서버로 메시지 전송 (WebSocket)
        
        Args:
            message_data: 전송할 메시지 데이터
            is_reaction: 반응 메시지 여부 (기본값: False)
        """
        # msg_id 추출 (kakao_log_id용)
        msg_id = message_data.get("_id") if isinstance(message_data, dict) else None
        
        # 반응 메시지인 경우 바로 전송
        if is_reaction:
            # 반응 메시지는 이미 올바른 형식으로 구성되어 있음
            payload = message_data
            
            # WebSocket 연결 확인
            if self.ws_connection is None:
                self.log_print("[경고] WebSocket 연결 없음. 재연결 시도...")
                if not self.connect_websocket():
                    self.log_print("[✗] WebSocket 재연결 실패")
                    return False
            
            # WebSocket으로 반응 정보 전송
            with self.ws_lock:
                if self.ws_connection and self.ws_connection.sock and self.ws_connection.sock.connected:
                    try:
                        payload_str = json.dumps(payload, ensure_ascii=False)
                        event_type = payload.get('event_type', 'unknown')
                        target_id = payload.get('json', {}).get('target_message_id', 'unknown')
                        old_count = payload.get('json', {}).get('old_count', 0)
                        new_count = payload.get('json', {}).get('new_count', 0)
                        self.log_print(f"[전송] 반응 정보 전송: event_type={event_type}, target={target_id}, {old_count} -> {new_count}")
                        self.ws_connection.send(payload_str)
                        self.log_print(f"[✓] 반응 정보 전송 성공")
                        return True
                    except Exception as e:
                        self.log_print(f"[✗] 반응 정보 전송 오류: {e}")
                        import traceback
                        traceback.print_exc()
                        self.ws_connection = None
                        return False
                else:
                    self.log_print("[✗] WebSocket 연결 없음")
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
                    self.log_print(f"[경고] chat_id 숫자 변환 실패: {chat_id}, 오류: {e}")
                    chat_id = chat_id_original  # 원본 유지
            elif not isinstance(chat_id, (int, str)) or (isinstance(chat_id, str) and not chat_id.isdigit()):
                self.log_print(f"[경고] 잘못된 chat_id 타입: {type(chat_id)}, 값: {chat_id}")
                chat_id = ""
            
            # chat_id 변환 후 확인 (디버그)
            if chat_id_original != chat_id:
                self.log_print(f"[디버그] chat_id 변환: {chat_id_original} ({type(chat_id_original)}) -> {chat_id} ({type(chat_id)})")
            
            room_id = str(chat_id) if chat_id else ""
            
            # 발신자 이름 조회 (Iris 방식)
            user_id = message_data.get("user_id")
            sender_name = None
            sender_name_encrypted = None  # 원본 암호화된 이름 (서버 복호화용)
            sender_name_decrypted = None  # 클라이언트에서 복호화한 이름
            
            if user_id:
                # Iris 원본 코드: getChatInfo에서 getNameOfUserId 호출
                sender_name = self.get_name_of_user_id(user_id)
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
                        self.log_print(f"[발신자] 클라이언트 복호화 실패, 서버로 암호화된 이름 전송 (서버에서 복호화 시도): user_id={user_id}, 암호화된 이름=\"{sender_name[:50]}...\"")
                    else:
                        # 복호화 성공 - 복호화된 이름 저장
                        sender_name_decrypted = sender_name
                        sender_name_encrypted = None
                        self.log_print(f"[발신자] 복호화 성공: user_id={user_id}, 이름=\"{sender_name}\"")
                else:
                    self.log_print(f"[발신자] 이름 조회 실패: user_id={user_id}, user_id만 사용")
            
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
            room_data = self.get_chat_room_data(chat_id) if chat_id else None
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
                
                if is_base64_like and self.KAKAODECRYPT_AVAILABLE and self.MY_USER_ID:
                    self.log_print(f"[채팅방] 암호화된 이름 확인, 복호화 시도: chat_id={chat_id}")
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
                        decrypt_user_id_int = int(self.MY_USER_ID)
                        if decrypt_user_id_int > 0:
                            if self.KakaoDecrypt:
                                decrypted = self.KakaoDecrypt.decrypt(decrypt_user_id_int, enc_try, room_name_raw)
                            else:
                                decrypted = None
                            if decrypted and decrypted != room_name_raw:
                                # 유효한 텍스트인지 확인
                                has_control_chars = any(ord(c) < 32 and c not in '\n\r\t' for c in decrypted)
                                if not has_control_chars:
                                    room_name_decrypted = decrypted
                                    room_name_encrypted = room_name_raw
                                    self.log_print(f"[✓ 채팅방] 복호화 성공: \"{decrypted}\" (enc={enc_try})")
                                    break
                    except Exception as e:
                        continue
                
                    if not room_name_decrypted:
                        room_name_encrypted = room_name_raw
                        self.log_print(f"[✗ 채팅방] 복호화 실패: 서버로 암호화된 원본 전송")
                else:
                    # 암호화되지 않은 일반 텍스트인 경우
                    room_name_decrypted = room_name_raw
                    self.log_print(f"[채팅방] 일반 텍스트: \"{room_name_raw}\"")
            else:
                self.log_print(f"[채팅방] 이름 조회 실패: chat_id={chat_id}")
            
            # 서버로 전송할 room 값 결정
            if room_name_decrypted:
                room = room_name_decrypted
                self.log_print(f"[전송] room 값: 복호화된 이름=\"{room}\"")
            elif room_name_encrypted:
                room = room_name_encrypted
                self.log_print(f"[전송] room 값: 암호화된 이름 (서버에서 복호화 시도)")
            else:
                room = room_id
                self.log_print(f"[전송] room 값: ID=\"{room}\"")
            
            # 빈 메시지는 전송하지 않음
            if not message or message.strip() == "":
                self.log_print(f"[send_to_server] ❌ 빈 메시지로 인해 전송 중단: msg_id={msg_id}, message={repr(message)}")
                return False
            else:
                self.log_print(f"[send_to_server] ✅ 메시지 검증 통과: msg_id={msg_id}, message 길이={len(str(message))}")
            
            # 암호화된 메시지 복호화 시도
            decrypted_message = None
            # 복호화에는 자신의 user_id를 사용해야 함 (제공된 코드 방식)
            # 제공된 코드: decrypt(user_id, encType, b64_ciphertext)
            # 여기서 user_id는 자신의 user_id (메시지를 받는 사람의 user_id)
            # 중요: MY_USER_ID를 우선 사용하고, 없으면 message_data의 myUserId 사용
            decrypt_user_id = self.MY_USER_ID if self.MY_USER_ID else message_data.get("myUserId")
            if not decrypt_user_id:
                # 최후의 수단: userId나 user_id 사용 (하지만 이건 발신자 user_id이므로 복호화 실패 가능)
                decrypt_user_id = message_data.get("userId") or message_data.get("user_id")
                if decrypt_user_id:
                    self.log_print(f"[경고] MY_USER_ID가 없어 발신자 user_id로 복호화 시도 (실패 가능성 높음): {decrypt_user_id}")
            
            enc_type = message_data.get("encType", 31)
            
            # base64로 보이는 메시지는 암호화된 메시지일 가능성이 높음
            is_base64_like = (isinstance(message, str) and 
                             len(message) > 10 and 
                             len(message) % 4 == 0 and
                             all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=' for c in message))
            
            if self.DECRYPT_ENABLED and decrypt_user_id and is_base64_like:
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
                            print(f"[디버그] MY_USER_ID={self.MY_USER_ID}, message_data.myUserId={message_data.get('myUserId')}")
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
                print(f"[경고] MY_USER_ID={self.MY_USER_ID}, message_data.myUserId={message_data.get('myUserId')}")
            
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
            if self.ws_connection is None:
                print("[경고] WebSocket 연결 없음. 재연결 시도...")
                if not self.connect_websocket():
                    print("[✗] WebSocket 재연결 실패")
                    return False
            
            # WebSocket 연결 상태 확인
            if self.ws_connection:
                sock_connected = self.ws_connection.sock and self.ws_connection.sock.connected if self.ws_connection.sock else False
                print(f"[전송] WebSocket 상태: 연결={sock_connected}, payload 길이={len(json.dumps(payload))}")
            else:
                print("[전송] WebSocket 상태: 연결 없음")
            
            # WebSocket으로 메시지 전송
            with self.ws_lock:
                if self.ws_connection and self.ws_connection.sock and self.ws_connection.sock.connected:
                    try:
                        payload_str = json.dumps(payload, ensure_ascii=False)
                        print(f"[전송] WebSocket 전송: room=\"{room}\", sender={sender}, message 길이={len(final_message)}")
                        self.ws_connection.send(payload_str)
                        print(f"[✓] 전송 성공")
                        return True
                    except Exception as e:
                        print(f"[✗] WebSocket 전송 오류: {e}")
                        import traceback
                        traceback.print_exc()
                        self.ws_connection = None
                        return False
                else:
                    print(f"[경고] WebSocket 연결 끊김. ws_connection={self.ws_connection}, sock={self.ws_connection.sock if self.ws_connection else None}")
                    self.ws_connection = None
                    if self.connect_websocket():
                        try:
                            payload_str = json.dumps(payload, ensure_ascii=False)
                            print(f"[디버그] 재연결 후 WebSocket 전송 시도: payload 길이={len(payload_str)}")
                            self.ws_connection.send(payload_str)
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

    def poll_messages(self):
        """메시지 폴링 루프"""
        self.log_print(f"[poll_messages] 폴링 루프 시작")
        
        # 자신의 user_id 로드 (최초 1회)
        if self.MY_USER_ID is None:
            self.MY_USER_ID = self.load_my_user_id()
            if not self.MY_USER_ID:
                self.log_print("[경고] 자신의 user_id를 찾을 수 없습니다. 복호화가 실패할 수 있습니다.")
                self.log_print("[해결] 수동으로 user_id를 설정하려면:")
                self.log_print(f"  echo 'YOUR_USER_ID' > {self.MY_USER_ID_FILE}")
        
        self.log_print("=" * 60)
        self.log_print("[카카오톡 메시지 폴링 시작]")
        self.log_print(f"DB 경로: {self.DB_PATH}")
        self.log_print(f"WebSocket URL: {self.WS_URL}")
        if self.MY_USER_ID:
            self.log_print(f"자신의 user_id: {self.MY_USER_ID}")
        self.log_print("=" * 60)
        
        # DB 접근 확인
        if not self.check_db_access():
            self.log_print("\n[중지] DB 접근 불가. 위의 해결 방법을 참고하세요.")
            return
        
        # DB 구조 확인
        if not self.check_db_structure():
            self.log_print("\n[경고] DB 구조 확인 실패. 계속 진행합니다...")
        
        # 마지막 메시지 ID 로드 (전송한 메시지 세트 초기화)
        last_id = self.load_last_message_id()
        latest_id_in_db = self.get_latest_message_id()
        
        self.log_print(f"\n[시작] 마지막 처리한 메시지 ID: {last_id}")
        self.log_print(f"[시작] 이미 처리한 메시지 수: {len(self.sent_message_ids)}개")
        if latest_id_in_db is not None:
            self.log_print(f"[검증] DB 최신 메시지 ID: {latest_id_in_db}")
            if latest_id_in_db > last_id:
                self.log_print(f"[검증] 처리 대기 중인 새 메시지: {latest_id_in_db - last_id}개")
            elif latest_id_in_db == last_id:
                self.log_print(f"[검증] 모든 메시지 처리 완료")
            else:
                self.log_print(f"[경고] last_id가 DB 최신 ID보다 큼 (초기화 필요할 수 있음)")
        
        # WebSocket 연결
        self.log_print("\n[WebSocket 연결 시도...]")
        if not self.connect_websocket():
            self.log_print("[경고] WebSocket 연결 실패. 계속 진행하지만 메시지 전송이 실패할 수 있습니다.")
        
        self.log_print("\n[폴링 시작] (Ctrl+C로 중지)")
        self.log_print("[참고] 같은 메시지는 한 번만 전송됩니다.\n")
        
        # 반응 업데이트 확인 주기
        last_reaction_check = 0
        
        # 클라이언트 로그 전송 주기 (10초마다)
        self.last_log_send_time = time.time()
        
        while True:
            try:
                messages = self.get_new_messages()
                
                current_time = time.time()
                
                # 주기적으로 반응 카운트 업데이트 확인
                if current_time - last_reaction_check >= self.REACTION_CHECK_INTERVAL:
                    updated_count = self.poll_reaction_updates()
                    if updated_count > 0:
                        self.log_print(f"[반응 카운트] ✅ {updated_count}개 반응 변화 감지됨")
                    last_reaction_check = current_time
                    
                    # 백필 스캔 (저빈도)
                    self.poll_reaction_backfill()
                
                # 주기적으로 클라이언트 로그 전송 (10초마다)
                if current_time - self.last_log_send_time >= self.CLIENT_LOG_SEND_INTERVAL:
                    self.send_client_logs_to_server()
                    self.last_log_send_time = current_time
                
                if messages:
                    self.log_print(f"[poll_messages] ✅ {len(messages)}개 메시지 처리 시작")
                    # 중요: DB의 실제 최신 ID를 확인하여 last_message_id를 업데이트
                    # (조회된 배치의 최대 ID가 아닌 실제 DB 최신 ID 사용)
                    db_latest_id = self.get_latest_message_id()
                    current_last_id = self.load_last_message_id()
                    queried_max_id = max(msg[0] for msg in messages)
                    
                    # DB 최신 ID가 있으면 그것을 사용, 없으면 조회된 최대 ID 사용
                    target_id = db_latest_id if db_latest_id is not None else queried_max_id
                    
                    # target_id가 현재 last_id보다 크면 즉시 업데이트 (로그 최소화)
                    if target_id > current_last_id:
                        self.save_last_message_id(target_id)
                        # 로그 제거: 새 메시지 발견 시에만 출력
                    
                    # 실제로 새 메시지인지 확인 (중복 필터링)
                    new_messages = []
                    skipped_count_debug = 0
                    for msg in messages:
                        msg_id = msg[0]
                        # 이미 전송한 메시지는 제외
                        if msg_id not in self.sent_message_ids:
                            new_messages.append(msg)
                        else:
                            skipped_count_debug += 1
                    
                    # 디버깅: 새 메시지 상태 로깅 (항상 출력)
                    self.log_print(f"[조회 결과] DB에서 조회한 메시지: {len(messages)}개, 새 메시지: {len(new_messages)}개, 스킵: {skipped_count_debug}개, last_id={last_id}")
                    if new_messages:
                        self.log_print(f"[{datetime.now().strftime('%H:%M:%S')}] ✅ 새 메시지 {len(new_messages)}개 발견 (스킵: {skipped_count_debug}개)")
                    elif skipped_count_debug > 0:
                        self.log_print(f"[{datetime.now().strftime('%H:%M:%S')}] ⚠️ 모든 메시지 이미 처리됨 (조회: {len(messages)}개, 스킵: {skipped_count_debug}개)")
                    elif len(messages) == 0:
                        db_latest_id = self.get_latest_message_id()
                        self.log_print(f"[{datetime.now().strftime('%H:%M:%S')}] 📭 새 메시지 없음 (DB 최신 ID: {db_latest_id}, 마지막 처리 ID: {last_id})")
                    
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
                            
                            # ⚠️ 중요: 인덱스를 먼저 계산 (isMine 체크에서 사용하기 위해)
                            select_columns = self._select_columns_cache if self._select_columns_cache else ["_id", "chat_id", "user_id", "message", "created_at"]
                            
                            # 컬럼 이름으로 인덱스 찾기 함수 (먼저 정의)
                            def get_column_index(col_name):
                                try:
                                    return select_columns.index(col_name)
                                except ValueError:
                                    return -1
                            
                            # 모든 인덱스를 먼저 계산
                            type_idx = get_column_index("type")
                            attachment_idx = get_column_index("attachment")
                            
                            # 선택적 필드 처리
                            v_field = None
                            kakao_user_id = None
                            enc_type = 31  # 기본값
                            is_mine = False  # 자신이 보낸 메시지 여부
                            msg_type = None  # 메시지 타입
                            attachment = None  # 첨부 정보
                            
                            if len(msg) >= 6:
                                v_field = msg[5]
                                # v 필드를 JSON 파싱하여 enc 추출 및 isMine 확인
                                if v_field:
                                    try:
                                        if isinstance(v_field, str):
                                            v_json = json.loads(v_field)
                                            if isinstance(v_json, dict):
                                                # isMine 필드 확인 (자신이 보낸 메시지)
                                                is_mine = v_json.get("isMine", False)
                                                
                                                # ⚠️ 중요: 이미지 메시지는 자신이 보낸 메시지여도 처리 (이미지 감지용)
                                                # 먼저 type과 attachment 확인
                                                msg_type_check = None
                                                attachment_check = None
                                                if type_idx >= 0 and len(msg) > type_idx:
                                                    msg_type_check = msg[type_idx]
                                                if attachment_idx >= 0 and len(msg) > attachment_idx:
                                                    attachment_check = msg[attachment_idx]
                                                
                                                is_image_msg = (msg_type_check in [2, 27] or 
                                                              (attachment_check and isinstance(attachment_check, str) and len(attachment_check) > 10))
                                                
                                                if is_mine:
                                                    if is_image_msg:
                                                        print(f"[필터링] ⚠️ 자신이 보낸 메시지지만 이미지 메시지로 판단되어 처리: ID={msg_id}, sender={user_id}, msg_type={msg_type_check}")
                                                        # 이미지 메시지는 처리 계속
                                                    else:
                                                        self.log_print(f"[필터링] ⚠️ 자신이 보낸 메시지 스킵: ID={msg_id}, sender={user_id}")
                                                        skipped_count += 1
                                                        self.sent_message_ids.add(msg_id)  # 이미 처리된 것으로 표시
                                                        continue  # 자신이 보낸 메시지는 서버로 전송하지 않음
                                                else:
                                                    print(f"[필터링] ✅ 타인이 보낸 메시지 (isMine=False): ID={msg_id}, sender={user_id}")
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
                            
                            if len(msg) >= 7:
                                kakao_user_id_raw = msg[6]
                                # userId=1 같은 잘못된 값 필터링 (1000보다 큰 값만 유효)
                                if kakao_user_id_raw and (isinstance(kakao_user_id_raw, (int, str)) and 
                                    (isinstance(kakao_user_id_raw, int) and kakao_user_id_raw > 1000) or
                                    (isinstance(kakao_user_id_raw, str) and kakao_user_id_raw.isdigit() and int(kakao_user_id_raw) > 1000)):
                                    kakao_user_id = kakao_user_id_raw
                                else:
                                    kakao_user_id = None
                                    if kakao_user_id_raw:
                                        print(f"[경고] 잘못된 kakao_user_id 값 무시: {kakao_user_id_raw} (ID={msg_id})")
                            # ⚠️ 중요: 나머지 인덱스 계산 (이미 type_idx, attachment_idx는 위에서 계산됨)
                            enc_type_idx = get_column_index("encType")
                            referer_idx = get_column_index("referer")
                            supplement_idx = get_column_index("supplement")
                            
                            # 디버그: 첫 메시지만 상세 로그 출력 (무한 로그 방지)
                            if not hasattr(self, '_first_msg_logged'):
                                print(f"[필드 인덱스] msg 길이={len(msg)}, select_columns={select_columns}")
                                print(f"[필드 인덱스] 인덱스 매핑: type_idx={type_idx}, attachment_idx={attachment_idx}, enc_type_idx={enc_type_idx}")
                                print(f"[필드 인덱스] 사용 가능한 필드:")
                                for i, val in enumerate(msg):
                                    if i < len(select_columns):
                                        col_name = select_columns[i] if i < len(select_columns) else f"unknown[{i}]"
                                        val_str = str(val)[:50] if val else 'None'
                                        print(f"  [{i}] {col_name}={val_str}")
                                self._first_msg_logged = True
                            
                            # encType 인덱스
                            if enc_type_idx >= 0 and len(msg) > enc_type_idx:
                                db_enc_type = msg[enc_type_idx]
                                if db_enc_type is not None:
                                    enc_type = db_enc_type
                                else:
                                    enc_type = 31  # 기본값
                            else:
                                enc_type = 31  # 기본값
                            
                            # type 인덱스
                            if type_idx >= 0 and len(msg) > type_idx:
                                msg_type = msg[type_idx]
                                print(f"[필드 인덱스] ✅ type 컬럼 발견: 인덱스={type_idx}, 값={msg_type}")
                            else:
                                msg_type = None
                                print(f"[필드 인덱스] ⚠️⚠️⚠️ type 컬럼이 쿼리에 포함되지 않음! select_columns={select_columns}, type_idx={type_idx}")
                            
                            # attachment 인덱스
                            if attachment_idx >= 0 and len(msg) > attachment_idx:
                                attachment = msg[attachment_idx]
                                print(f"[필드 인덱스] ✅ attachment 컬럼 발견: 인덱스={attachment_idx}, 값 존재={bool(attachment)}")
                            else:
                                attachment = None
                                print(f"[필드 인덱스] ⚠️⚠️⚠️ attachment 컬럼이 쿼리에 포함되지 않음! select_columns={select_columns}, attachment_idx={attachment_idx}")
                            
                            # referer 인덱스
                            referer = None
                            if referer_idx >= 0 and len(msg) > referer_idx:
                                referer = msg[referer_idx]
                            
                            # supplement 인덱스
                            supplement = None
                            if supplement_idx >= 0 and len(msg) > supplement_idx:
                                supplement = msg[supplement_idx]
                            
                            # Phase 2: attachment 복호화 (whitelist 기반)
                            attachment_decrypted = None
                            # ⚠️ 중요: msg_type_str_for_decrypt를 먼저 정의 (else 블록에서도 사용)
                            msg_type_str_for_decrypt = str(msg_type) if msg_type is not None else None
                            
                            # ⚠️ 중요: 이미지 메시지 (type 2, 27)는 항상 복호화 시도
                            is_image_type_for_decrypt = msg_type_str_for_decrypt in ["2", "27"] or msg_type in [2, 27]
                            
                            # 디버깅: 복호화 가능 여부 확인
                            if is_image_type_for_decrypt:
                                print(f"[attachment 복호화] 🔍 이미지 메시지 감지: msg_id={msg_id}, msg_type={msg_type_str_for_decrypt}, ATTACHMENT_DECRYPT_AVAILABLE={self.ATTACHMENT_DECRYPT_AVAILABLE}, decrypt_attachment={bool(self.decrypt_attachment)}, MY_USER_ID={bool(self.MY_USER_ID)}, enc_type={enc_type}")
                            
                            if self.ATTACHMENT_DECRYPT_AVAILABLE and self.decrypt_attachment:
                                is_in_whitelist = msg_type_str_for_decrypt in self.ATTACHMENT_DECRYPT_WHITELIST or msg_type in self.ATTACHMENT_DECRYPT_WHITELIST
                                
                                if is_in_whitelist or is_image_type_for_decrypt:
                                    if is_image_type_for_decrypt:
                                        print(f"[attachment 복호화] ⚠️ 이미지 메시지 복호화 시도: msg_id={msg_id}, msg_type={msg_type_str_for_decrypt}, attachment 존재={bool(attachment)}, attachment 길이={len(str(attachment)) if attachment else 0}, MY_USER_ID={self.MY_USER_ID}, enc_type={enc_type}")
                                    
                                    attachment_decrypted = self.decrypt_attachment(
                                        attachment,
                                        enc_type,
                                        self.MY_USER_ID,
                                        msg_type_str_for_decrypt,
                                        msg_id,
                                        debug=True
                                    )
                                    
                                    if is_image_type_for_decrypt:
                                        if attachment_decrypted:
                                            print(f"[attachment 복호화] ✅ 이미지 메시지 복호화 성공: msg_id={msg_id}, 타입={type(attachment_decrypted)}")
                                            if isinstance(attachment_decrypted, dict):
                                                print(f"[attachment 복호화] 복호화된 키: {list(attachment_decrypted.keys())[:20]}")
                                        else:
                                            print(f"[attachment 복호화] ❌ 이미지 메시지 복호화 실패: msg_id={msg_id}, attachment 길이={len(str(attachment)) if attachment else 0}, enc_type={enc_type}, MY_USER_ID={self.MY_USER_ID}")
                                else:
                                    if is_image_type_for_decrypt:
                                        print(f"[attachment 복호화] ⚠️ 이미지 메시지지만 whitelist에 없음: msg_id={msg_id}, msg_type={msg_type_str_for_decrypt}, whitelist={self.ATTACHMENT_DECRYPT_WHITELIST}")
                            else:
                                # 복호화 모듈이 없거나 사용 불가능한 경우
                                if is_image_type_for_decrypt:
                                    print(f"[attachment 복호화] ⚠️ 이미지 메시지지만 복호화 모듈 사용 불가: msg_id={msg_id}, ATTACHMENT_DECRYPT_AVAILABLE={self.ATTACHMENT_DECRYPT_AVAILABLE}, decrypt_attachment={bool(self.decrypt_attachment)}, MY_USER_ID={bool(self.MY_USER_ID)}")
                            
                            # 답장 메시지 ID 추출 (referer 우선, 그 다음 복호화된 attachment, 마지막으로 원본 attachment)
                            reply_to_message_id = None
                            
                            # 1순위: referer 필드 (가장 신뢰할 수 있음)
                            if referer:
                                try:
                                    reply_to_message_id = int(referer) if referer else None
                                    if reply_to_message_id:
                                        print(f"[답장 ID] referer에서 추출: {reply_to_message_id}")
                                except (ValueError, TypeError):
                                    pass
                            
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
                                                        print(f"[답장 ID] 원본 attachment에서 추출: {reply_to_message_id}")
                                                except (ValueError, TypeError):
                                                    pass
                                except (json.JSONDecodeError, TypeError, KeyError):
                                    pass
                            
                            max_id = max(max_id, msg_id)
                            
                            # 메시지가 비어있는 경우 스킵
                            if not message or message.strip() == "":
                                self.log_print(f"[필터링] ⚠️ 빈 메시지 스킵: ID={msg_id}, message={repr(message)}")
                                skipped_count += 1
                                self.sent_message_ids.add(msg_id)
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
                                self.log_print(f"[필터링] ❌ valid_user_id가 없어 메시지 처리 불가: ID={msg_id}, user_id={user_id}")
                                skipped_count += 1
                                self.sent_message_ids.add(msg_id)
                                continue
                            
                            # ⚠️ 중요: msg_type을 먼저 확인하여 이미지 메시지인지 판단
                            msg_type_str = str(msg_type) if msg_type is not None else None
                            is_image_type = msg_type_str in ["2", "27"]
                            
                            # ⚠️⚠️⚠️ 모든 메시지에 대해 msg_type 로그 출력 (이미지 감지 확인용)
                            print(f"[메시지 타입 확인] msg_id={msg_id}, msg_type={msg_type} (str={msg_type_str}), is_image_type={is_image_type}, attachment={bool(attachment)}, attachment_decrypted={bool(attachment_decrypted)}")
                            
                            # ⚠️ 중요: msg_type이 2 또는 27이면 무조건 이미지로 처리 (attachment 확인 전에)
                            if is_image_type:
                                print(f"[이미지 타입 감지] ⚠️⚠️⚠️ msg_type={msg_type_str} 감지됨! 이미지 메시지로 처리합니다.")
                            
                            # 디버깅: attachment 상세 정보 로그
                            if attachment:
                                print(f"[이미지 디버깅] attachment 타입={type(attachment)}, 길이={len(str(attachment)) if isinstance(attachment, str) else 'N/A'}, 샘플={str(attachment)[:100] if isinstance(attachment, str) else attachment}")
                            
                            # Phase 2: 복호화된 attachment 정보 추출
                            has_image = False
                            image_url = None
                            
                            # 이미지 확장자 목록
                            IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']
                            IMAGE_URL_PATTERNS = ['http://', 'https://', 'file://', 'content://']
                            
                            def is_image_url(value):
                                """값이 이미지 URL인지 확인 (확장자 또는 URL 패턴 기반)
                                참고: 카카오톡 알림에서 사용하는 URI 패턴 (content://, file:// 등)
                                """
                                if not isinstance(value, str) or len(value) < 5:
                                    return False
                                value_lower = value.lower()
                                
                                # URL 패턴 확인 (제공된 코드 참고: content://, file:// 등)
                                if any(pattern in value_lower for pattern in IMAGE_URL_PATTERNS):
                                    # 확장자 확인
                                    if any(ext in value_lower for ext in IMAGE_EXTENSIONS):
                                        return True
                                    # URL 패턴이 있으면 이미지로 간주 (확장자가 없어도)
                                    if 'http' in value_lower:
                                        return True
                                    # content:// 또는 file:// 패턴도 이미지로 간주 (카카오톡 알림에서 사용)
                                    if 'content://' in value_lower or 'file://' in value_lower:
                                        return True
                                
                                # 확장자만 있는 경우 (상대 경로)
                                if any(value_lower.endswith(ext) for ext in IMAGE_EXTENSIONS):
                                    return True
                                
                                return False
                            
                            def find_image_url_in_dict(data_dict, depth=0, max_depth=5):
                                """딕셔너리에서 이미지 URL 재귀적으로 찾기
                                참고: 카카오톡 알림에서 사용하는 키 이름 (uri, imageUri, contentUri 등)
                                """
                                if depth > max_depth:
                                    return None
                                
                                if not isinstance(data_dict, dict):
                                    return None
                                
                                # 우선순위 1: Iris Rhino 기준 이미지 URL 키 (제공된 문서 참고)
                                # type=2: attachment.url
                                # type=27: attachment.imageUrls (배열)
                                priority_keys = [
                                    'url',  # ⚠️ 최우선: type=2일 때 원본 이미지 URL
                                    'imageUrls',  # ⚠️ 최우선: type=27일 때 원본 이미지 URL 배열
                                    'thumbnailUrl', 'thumbnailUrls',  # 썸네일 URL
                                    'uri', 'imageUri', 'contentUri', 'image_uri', 'content_uri',  # 알림에서 사용
                                    'path', 'path_1',  # 일반적인 이미지 키
                                    'xl', 'l', 'm', 's',  # 썸네일 크기별 키
                                    'imageUrl', 'image_url', 'photoUrl', 'photo_url',  # 이미지 URL 키
                                    'filePath', 'file_path', 'localPath', 'local_path',  # 로컬 파일 경로
                                    'originalUrl', 'original_url', 'fullUrl', 'full_url'  # 원본 이미지 URL
                                ]
                                
                                for key in priority_keys:
                                    value = data_dict.get(key)
                                    if value:
                                        # ⚠️ 중요: imageUrls는 배열이므로 첫 번째 요소 반환 (Iris Rhino 문서 참고)
                                        if key == 'imageUrls' and isinstance(value, list) and len(value) > 0:
                                            # type=27 (묶어보내기): 첫 번째 이미지 URL 반환
                                            first_url = value[0]
                                            if isinstance(first_url, str) and is_image_url(first_url):
                                                print(f"[이미지 URI 발견] 키='{key}' (배열 첫 번째), URI={first_url[:80]}...")
                                                return first_url
                                        else:
                                            # 문자열로 변환하여 확인
                                            value_str = str(value)
                                            if is_image_url(value_str):
                                                print(f"[이미지 URI 발견] 키='{key}', URI={value_str[:80]}...")
                                                return value_str
                                
                                # 우선순위 2: 모든 키-값 쌍 확인 (더 깊이 탐색)
                                for key, value in data_dict.items():
                                    if isinstance(value, str):
                                        # 문자열 값이 이미지 URL인지 확인
                                        if is_image_url(value):
                                            print(f"[이미지 URI 발견] 키='{key}', URI={value[:80]}...")
                                            return value
                                    elif isinstance(value, dict):
                                        # 재귀적으로 딕셔너리 내부 확인 (깊이 증가)
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
                                                print(f"[이미지 URI 발견] 리스트 항목, URI={item[:80]}...")
                                                return item
                                
                                return None
                            
                            # attachment가 있으면 항상 이미지 URL 추출 시도 (msg_type과 무관)
                            # 참고: 제공된 코드에서 onNotificationPosted에서 uri를 추출하는 방식과 유사하게 처리
                            attachment_to_check = attachment_decrypted if attachment_decrypted else attachment
                            if attachment_to_check:
                                print(f"[이미지 체크] attachment 확인: msg_id={msg_id}, attachment 존재={True}, 타입={type(attachment_to_check)}, attachment_decrypted={bool(attachment_decrypted)}, attachment={bool(attachment)}")
                                
                                if isinstance(attachment_to_check, dict):
                                    print(f"[이미지 체크] attachment dict keys: {list(attachment_to_check.keys())[:20]}")
                                    # 제공된 코드 참고: msgBundle.getParcelable("uri")와 유사하게 uri 키 우선 확인
                                    image_url = find_image_url_in_dict(attachment_to_check)
                                    if image_url:
                                        has_image = True
                                        print(f"[이미지 감지] ✅ 감지 (dict, URI 패턴): url={image_url[:80] if image_url else None}..., msg_id={msg_id}, msg_type={msg_type_str}")
                                    else:
                                        # 모든 키-값 쌍 출력 (디버깅)
                                        print(f"[이미지 체크] ⚠️ 이미지 URL 없음: attachment keys={list(attachment_to_check.keys())[:20]}")
                                        # URI 관련 키가 있는지 확인
                                        uri_keys = [k for k in attachment_to_check.keys() if 'uri' in k.lower() or 'url' in k.lower() or 'path' in k.lower()]
                                        if uri_keys:
                                            print(f"[이미지 체크] URI 관련 키 발견: {uri_keys[:10]}")
                                            for key in uri_keys[:5]:
                                                value = attachment_to_check.get(key)
                                                if isinstance(value, str) and len(value) > 10:
                                                    print(f"[이미지 체크] URI 키 값: {key}={value[:100]}...")
                                        else:
                                            for key in list(attachment_to_check.keys())[:15]:
                                                value = attachment_to_check.get(key)
                                                if isinstance(value, str) and len(value) > 10:
                                                    print(f"[이미지 체크] 키 샘플: {key}={value[:100]}...")
                                
                                elif isinstance(attachment_to_check, str):
                                    print(f"[이미지 체크] attachment 문자열 길이: {len(attachment_to_check)}, 샘플: {attachment_to_check[:100]}...")
                                    # 직접 URI인지 확인 (content://, file:// 등)
                                    if is_image_url(attachment_to_check):
                                        image_url = attachment_to_check
                                        has_image = True
                                        print(f"[이미지 감지] ✅ 감지 (직접 URI 문자열): url={image_url[:80]}..., msg_id={msg_id}, msg_type={msg_type_str}")
                                    else:
                                        try:
                                            attach_json = json.loads(attachment_to_check)
                                            if isinstance(attach_json, dict):
                                                print(f"[이미지 체크] 파싱된 attachment dict keys: {list(attach_json.keys())[:20]}")
                                                image_url = find_image_url_in_dict(attach_json)
                                                if image_url:
                                                    has_image = True
                                                    print(f"[이미지 감지] ✅ 감지 (문자열 파싱, URI 패턴): url={image_url[:80] if image_url else None}..., msg_id={msg_id}, msg_type={msg_type_str}")
                                                else:
                                                    print(f"[이미지 체크] ⚠️ 이미지 URL 없음 (문자열 파싱): keys={list(attach_json.keys())[:20]}")
                                        except (json.JSONDecodeError, TypeError) as e:
                                            print(f"[이미지 체크] attachment 문자열 파싱 실패: {e}, 샘플: {attachment_to_check[:200]}...")
                            else:
                                print(f"[이미지 체크] attachment 없음: msg_id={msg_id}, attachment_decrypted={bool(attachment_decrypted)}, attachment={bool(attachment)}")
                                # ⚠️ 중요: attachment가 없어도 msg_type이 2 또는 27이면 이미지 메시지로 처리
                                if is_image_type:
                                    print(f"[이미지 체크] ⚠️⚠️⚠️ attachment 없지만 msg_type={msg_type_str}이므로 이미지 메시지로 강제 처리")
                                    has_image = True
                            
                            # ⚠️ 중요: ref 코드 기준으로 이미지 타입은 2(PhotoChat), 27(MultiPhotoChat)만
                            # type 12는 이모티콘이므로 이미지로 처리하지 않음
                            # msg_type이 2 또는 27이면 이미지로 강제 설정 (attachment에 url이 있어도 없어도)
                            if is_image_type:
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
                                            # ⚠️ 중요: 복호화 실패한 경우에도 원본 attachment에서 직접 확인
                                            # base64 문자열이지만 복호화 실패한 경우, supplement 필드 확인
                                            print(f"[이미지 강제 체크] attachment가 문자열이고 복호화 실패, supplement 필드 확인: msg_id={msg_id}")
                                            
                                            # supplement 필드에서 이미지 URL 찾기 시도
                                            if supplement:
                                                print(f"[이미지 강제 체크] supplement 필드 확인: msg_id={msg_id}, supplement 타입={type(supplement)}")
                                                if isinstance(supplement, dict):
                                                    found_url = find_image_url_in_dict(supplement)
                                                    if found_url:
                                                        image_url = found_url
                                                        has_image = True
                                                        print(f"[이미지 강제 감지] ✅ supplement에서 url 발견: url={found_url[:80]}...")
                                                elif isinstance(supplement, str):
                                                    try:
                                                        supplement_json = json.loads(supplement)
                                                        if isinstance(supplement_json, dict):
                                                            found_url = find_image_url_in_dict(supplement_json)
                                                            if found_url:
                                                                image_url = found_url
                                                                has_image = True
                                                                print(f"[이미지 강제 감지] ✅ supplement(문자열 파싱)에서 url 발견: url={found_url[:80]}...")
                                                    except:
                                                        pass
                                            
                                            # 원본 attachment 문자열에서 직접 URI 패턴 확인
                                            if not has_image and is_image_url(attachment_to_check):
                                                # attachment 자체가 URI인 경우 (드물지만 가능)
                                                image_url = attachment_to_check
                                                has_image = True
                                                print(f"[이미지 강제 감지] ✅ attachment 문자열 자체가 URI: url={image_url[:80]}...")
                                            else:
                                                # JSON 파싱 재시도
                                                try:
                                                    attach_json = json.loads(attachment_to_check)
                                                    if isinstance(attach_json, dict):
                                                        found_url = find_image_url_in_dict(attach_json)
                                                        if found_url:
                                                            image_url = found_url
                                                            has_image = True
                                                            print(f"[이미지 강제 감지] ✅ msg_type={msg_type_str}에서 url 발견 (문자열 파싱, 확장자 필터링): url={found_url[:80]}...")
                                                except:
                                                    # JSON 파싱 실패는 이미 위에서 처리됨
                                                    pass
                                
                                # 이미지 타입 확인 로그
                                print(f"[이미지 최종] msg_id={msg_id}, msg_type={msg_type_str}, has_image={has_image}, image_url={image_url[:80] if image_url else 'None'}...")
                                
                                # ⚠️ 중요: msg_type이 2 또는 27이면 무조건 이미지로 설정 (url이 없어도)
                                # 하지만 image_url이 None이면 서버에서 처리할 수 없으므로 경고
                                if not has_image:
                                    print(f"[이미지 강제 설정] ⚠️ msg_type={msg_type_str}이지만 url을 찾지 못함. has_image를 True로 강제 설정")
                                    has_image = True  # msg_type이 이미지 타입이면 무조건 이미지로 처리
                                elif has_image and not image_url:
                                    print(f"[이미지 경고] ⚠️⚠️⚠️ msg_type={msg_type_str}, has_image=True이지만 image_url=None! 서버에서 처리 불가능할 수 있음")
                            
                            message_data = {
                                "_id": msg_id,
                                "chat_id": chat_id,
                                "user_id": valid_user_id,  # DB의 user_id 컬럼 (메시지 발신자, 유효성 검사 통과)
                                "message": message,  # 원본 메시지 (복호화는 send_to_server에서)
                                "created_at": created_at,
                                "v": v_field,  # 암호화 정보 포함
                                "userId": valid_kakao_user_id if valid_kakao_user_id else valid_user_id,  # 발신자 user_id (서버 참고용, 유효성 검사 통과)
                                "myUserId": self.MY_USER_ID,  # 자신의 user_id (복호화에 사용)
                                "encType": enc_type,  # 암호화 타입 (기본값: 31)
                                "reply_to_message_id": reply_to_message_id,  # 답장 메시지 ID (referer 또는 attachment.src_message)
                                "origin": origin,  # 메시지 출처 (MSG, SYNCMSG, SYNCDLMSG 등) - 삭제 감지용
                                "msg_type": msg_type,  # 메시지 타입 (Feed 감지용)
                                "attachment": json.dumps(attachment_decrypted) if attachment_decrypted else attachment,  # Phase 2: 복호화된 attachment 우선
                                "attachment_decrypted": attachment_decrypted,  # Phase 2: dict 형태 (서버에서 사용)
                                "has_image": has_image,  # Phase 2: 이미지 여부
                                "image_url": image_url,  # Phase 2: 이미지 URL
                                "enc_type": enc_type,  # ⚠️ 중요: 서버에서 복호화 시도용
                                # ⚠️ Bridge fallback용 메타데이터 강화
                                "kakao_log_id": str(msg_id),  # 카카오 로그 ID (가능하면)
                                "room_name_raw": chat_id,  # 원본 채팅방 ID (정규화 전)
                                "sender_raw": str(valid_user_id),  # 원본 발신자 ID
                                "type": msg_type  # 메시지 타입 (2, 27 등)
                            }
                            
                            # 디버그: 이미지 관련 데이터 전송 확인
                            if has_image or image_url:
                                print(f"[이미지 전송 확인] msg_id={msg_id}, has_image={message_data['has_image']}, image_url={message_data['image_url'][:50] if message_data['image_url'] else 'None'}...")
                            
                            # 디버그: 잘못된 값이 필터링되었는지 확인
                            if (kakao_user_id and not valid_kakao_user_id) or (user_id and not valid_user_id):
                                print(f"[경고] 잘못된 user_id 값 필터링: kakao_user_id={kakao_user_id}, user_id={user_id} (ID={msg_id})")
                            
                            # 서버로 전송
                            self.log_print(f"[전송 시도] msg_id={msg_id}, message 길이={len(str(message)) if message else 0}")
                            send_result = self.send_to_server(message_data)
                            self.log_print(f"[전송 결과] msg_id={msg_id}, 결과={send_result}")
                            if send_result:
                                sent_count += 1
                                # 전송 성공한 메시지는 sent_message_ids에 추가 (이미 추가되어 있지만 확실히)
                                self.sent_message_ids.add(msg_id)
                                self.log_print(f"[✅] 메시지 전송 성공: ID={msg_id}")
                            else:
                                # 전송 실패한 메시지는 sent_message_ids에서 제거하여 재시도 가능하게 함
                                self.sent_message_ids.discard(msg_id)
                                self.log_print(f"[❌] 메시지 전송 실패: ID={msg_id}, chat_id={chat_id}")
                    
                    # 메시지 전송 완료 로그
                    # 참고: last_message_id는 이미 위(565-572줄)에서 조회된 메시지의 최대 ID로 업데이트됨
                    if sent_count > 0:
                        log_msg = f"[완료] {sent_count}개 메시지 전송 완료"
                        if skipped_count > 0:
                            log_msg += f", {skipped_count}개 스킵"
                        print(log_msg)
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

    def check_db_structure(self):
        """카카오톡 DB 구조 확인"""
        try:
            conn = sqlite3.connect(self.DB_PATH)
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

    def cleanup_reaction_count_cache(self):
        """반응 카운트 캐시 정리 (TTL 기반, LRU)"""
        current_time = time.time()
        expired_keys = []
        remove_count = 0  # 초기화: LRU 정리 시 사용
        
        # TTL 기반 정리
        for cache_key, cache_data in self._reaction_count_cache.items():
            if current_time - cache_data.get('last_seen', 0) > self.REACTION_CACHE_TTL:
                expired_keys.append(cache_key)
        
        for key in expired_keys:
            self._reaction_count_cache.pop(key, None)
            self._last_event_times.pop(key, None)
        
        # LRU 기반 정리 (캐시 크기 제한)
        if len(self._reaction_count_cache) > self.MAX_CACHE_ITEMS:
            # last_seen 기준으로 정렬하여 오래된 것 제거
            sorted_items = sorted(self._reaction_count_cache.items(), key=lambda x: x[1].get('last_seen', 0))
            remove_count = len(self._reaction_count_cache) - self.MAX_CACHE_ITEMS
            for i in range(remove_count):
                key = sorted_items[i][0]
                self._reaction_count_cache.pop(key, None)
                self._last_event_times.pop(key, None)
        
        if expired_keys or remove_count > 0:
            print(f"[반응 캐시] 정리: TTL={len(expired_keys)}개, LRU={remove_count}개")

    def poll_reaction_updates(self):
        """반응 카운트 업데이트 전용 폴링 함수 (경량 버전)
        
        Returns:
            int: 감지된 반응 변화 개수
        """
        try:
            # 캐시 정리
            self.cleanup_reaction_count_cache()
            
            # DB 연결
            conn = sqlite3.connect(self.DB_PATH)
            cursor = conn.cursor()
            
            # 최근 윈도우 이내 메시지 조회 (최적화된 쿼리)
            current_time = int(time.time())
            time_threshold = current_time - self.REACTION_TIME_RANGE
            
            query = """
                SELECT id, chat_id, v, created_at
                FROM chat_logs
                WHERE v IS NOT NULL
                  AND v != ''
                  AND created_at > ?
                ORDER BY created_at DESC
                LIMIT ?
            """
            
            cursor.execute(query, (time_threshold, self.REACTION_QUERY_LIMIT))
            rows = cursor.fetchall()
            conn.close()
            
            if not rows:
                return 0
            
            update_count = 0
            scanned_count = 0
            changed_count = 0
            parse_fail_count = 0
            current_timestamp = time.time()
            
            for row in rows:
                msg_id, chat_id, v_field, created_at = row
                scanned_count += 1
                
                # v 필드 파싱 (supplement 사용 안 함)
                current_count = 0
                try:
                    if v_field:
                        if isinstance(v_field, str):
                            v_data = json.loads(v_field)
                        elif isinstance(v_field, dict):
                            v_data = v_field
                        else:
                            continue
                        
                        if isinstance(v_data, dict):
                            # defaultEmoticonsCount만 추출
                            current_count = int(v_data.get('defaultEmoticonsCount', 0) or 0)
                except (json.JSONDecodeError, TypeError, ValueError) as e:
                    parse_fail_count += 1
                    if parse_fail_count <= 3:  # 처음 3번만 로그
                        print(f"[반응 파싱 실패] msg_id={msg_id}: {e}")
                    continue
                
                # 캐시 키: (chat_id, kakao_log_id)
                cache_key = (chat_id, msg_id)
                old_count = self._reaction_count_cache.get(cache_key, {}).get('count', 0)
                
                # 변화 감지 및 전송 조건 확인
                if current_count != old_count and current_count > 0:
                    # 스로틀링: 동일 메시지에 대해 MIN_EVENT_GAP_SEC 내 중복 전송 방지
                    last_event_time = self._last_event_times.get(cache_key, 0)
                    if current_timestamp - last_event_time < self.MIN_EVENT_GAP_SEC:
                        continue
                    
                    changed_count += 1
                    
                    # 채팅방 이름 조회
                    room_data = self.get_chat_room_data(chat_id) if chat_id else None
                    room_name = room_data.get('name') if room_data else str(chat_id) if chat_id else ""
                    
                    # reaction_count_update 이벤트 생성 (경량 버전)
                    event_data = {
                        "type": "reaction_count_update",
                        "json": {
                            "chat_id": int(chat_id) if chat_id else None,
                            "room_name": room_name,
                            "kakao_log_id": str(msg_id),  # 문자열로 전송 (정밀도 보존)
                            "old_count": old_count,
                            "new_count": current_count,
                            "observed_at": datetime.fromtimestamp(current_timestamp).isoformat()
                        }
                    }
                    
                    # 서버 전송
                    if self.send_to_server(event_data, is_reaction=True):
                        print(f"[반응 카운트] ✅ 전송: chat_id={chat_id}, log_id={msg_id}, {old_count}->{current_count}")
                        update_count += 1
                        self._last_event_times[cache_key] = current_timestamp
                    else:
                        print(f"[반응 카운트] ✗ 전송 실패: chat_id={chat_id}, log_id={msg_id}")
                
                # 캐시 업데이트 (변화 여부와 관계없이)
                self._reaction_count_cache[cache_key] = {
                    'count': current_count,
                    'last_seen': current_timestamp
                }
            
            # 요약 로그 (1분에 1회 수준)
            if update_count > 0 or (int(current_timestamp) % 60 < self.REACTION_CHECK_INTERVAL):
                print(f"[반응 폴링] scanned={scanned_count}, changed={changed_count}, sent={update_count}, parse_fail={parse_fail_count}")
            
            return update_count
            
        except Exception as e:
            print(f"[반응 업데이트] 오류: {e}")
            import traceback
            traceback.print_exc()
            return 0

    def poll_reaction_backfill(self):
        """반응 카운트 백필 스캐너 (저빈도, 최근 48시간)"""
        current_time = time.time()
        
        # 백필 간격 확인
        if current_time - self._last_backfill_time < self.REACTION_BACKFILL_INTERVAL:
            return 0
        
        self._last_backfill_time = current_time
        
        try:
            print(f"[반응 백필] 시작: 최근 {self.REACTION_BACKFILL_WINDOW // 3600}시간 범위")
            
            conn = sqlite3.connect(self.DB_PATH)
            cursor = conn.cursor()
            
            # 48시간을 6시간 단위로 분할하여 처리
            time_threshold = int(current_time) - self.REACTION_BACKFILL_WINDOW
            chunk_hours = 6
            chunk_seconds = chunk_hours * 3600
            
            total_updated = 0
            
            for chunk_start in range(time_threshold, int(current_time), chunk_seconds):
                chunk_end = min(chunk_start + chunk_seconds, int(current_time))
                
                query = """
                    SELECT id, chat_id, v, created_at
                    FROM chat_logs
                    WHERE v IS NOT NULL
                      AND v != ''
                      AND created_at >= ?
                      AND created_at < ?
                    ORDER BY created_at DESC
                    LIMIT ?
                """
                
                cursor.execute(query, (chunk_start, chunk_end, self.REACTION_QUERY_LIMIT))
                rows = cursor.fetchall()
                
                for row in rows:
                    msg_id, chat_id, v_field, created_at = row
                    
                    # 카운트 추출
                    current_count = 0
                    try:
                        if v_field:
                            if isinstance(v_field, str):
                                v_data = json.loads(v_field)
                            elif isinstance(v_field, dict):
                                v_data = v_field
                            
                            if isinstance(v_data, dict):
                                current_count = int(v_data.get('defaultEmoticonsCount', 0) or 0)
                    except:
                        continue
                    
                    # 변화가 있을 때만 전송
                    cache_key = (chat_id, msg_id)
                    old_count = self._reaction_count_cache.get(cache_key, {}).get('count', 0)
                    
                    if current_count != old_count and current_count > 0:
                        room_data = self.get_chat_room_data(chat_id) if chat_id else None
                        room_name = room_data.get('name') if room_data else str(chat_id) if chat_id else ""
                        
                        event_data = {
                            "type": "reaction_count_update",
                            "json": {
                                "chat_id": int(chat_id) if chat_id else None,
                                "room_name": room_name,
                                "kakao_log_id": str(msg_id),
                                "old_count": old_count,
                                "new_count": current_count,
                                "observed_at": datetime.fromtimestamp(time.time()).isoformat()
                            }
                        }
                        
                        if self.send_to_server(event_data, is_reaction=True):
                            total_updated += 1
                        
                        self._reaction_count_cache[cache_key] = {
                            'count': current_count,
                            'last_seen': time.time()
                        }
            
            conn.close()
            print(f"[반응 백필] 완료: {total_updated}개 업데이트")
            return total_updated
            
        except Exception as e:
            print(f"[반응 백필] 오류: {e}")
            import traceback
            traceback.print_exc()
            return 0

# 반응 관련 함수 구현
def normalize_reactions(reactions):
    """reactions 배열을 정규화하여 set으로 변환
    
    Args:
        reactions: reactions 배열 (list of dict)
    
    Returns:
        set: 정규화된 reactions set {(type, userId, createdAt), ...}
    """
    if not isinstance(reactions, list):
        return set()
    
    normalized = set()
    for r in reactions:
        if isinstance(r, dict):
            r_type = r.get("type")
            user_id = r.get("userId")
            created_at = r.get("createdAt")
            if r_type is not None and user_id is not None and created_at is not None:
                normalized.add((str(r_type), int(user_id), int(created_at)))
    
    return normalized


def make_reaction_signature(reactions):
    """reactions 배열의 signature 생성 (변화 감지용)
    
    Args:
        reactions: reactions 배열 (list of dict)
    
    Returns:
        str: MD5 해시값
    """
    import hashlib
    
    normalized = normalize_reactions(reactions)
    if not normalized:
        return ""
    
    # 정렬하여 일관된 signature 생성
    sorted_reactions = sorted(normalized)
    raw = json.dumps(sorted_reactions, ensure_ascii=False)
    return hashlib.md5(raw.encode('utf-8')).hexdigest()


def cleanup_reaction_cache():
    """반응 캐시 정리 (TTL 기반)"""
    global _reaction_check_cache
    
    current_time = time.time()
    expired_keys = []
    
    for msg_id, cache_data in _reaction_check_cache.items():
        if current_time - cache_data.get('last_seen', 0) > REACTION_CACHE_TTL:
            expired_keys.append(msg_id)
    
    for key in expired_keys:
        _reaction_check_cache.pop(key, None)
    
    if expired_keys:
        print(f"[반응 캐시] TTL 기반 정리: {len(expired_keys)}개 항목 제거")


def create_reaction_event(msg_id, chat_id, user_id, created_at, msg_type, old_count, new_count,
                          new_reactions, removed_reactions, all_reactions, v_data, supplement):
    """반응 이벤트 데이터 생성
    
    Args:
        msg_id: 메시지 ID
        chat_id: 채팅방 ID
        user_id: 발신자 ID
        created_at: 메시지 생성 시간
        msg_type: 메시지 타입
        old_count: 이전 반응 개수
        new_count: 현재 반응 개수
        new_reactions: 새로 추가된 반응 set
        removed_reactions: 제거된 반응 set
        all_reactions: 전체 reactions 배열
        v_data: v 필드 데이터
        supplement: supplement 필드
    
    Returns:
        dict: 이벤트 데이터
    """
    # 채팅방 정보 조회
    room_data = get_chat_room_data(chat_id) if chat_id else None
    room_name = room_data.get('name') if room_data else str(chat_id) if chat_id else ""
    
    # 발신자 이름 조회
    sender_name = get_name_of_user_id(user_id) if user_id else None
    sender = f"{sender_name}/{user_id}" if sender_name and user_id else (str(user_id) if user_id else "")
    
    # new_reactions와 removed_reactions를 리스트로 변환
    new_reactions_list = [
        {"type": r[0], "userId": r[1], "createdAt": r[2]}
        for r in new_reactions
    ]
    
    removed_reactions_list = [
        {"type": r[0], "userId": r[1], "createdAt": r[2]}
        for r in removed_reactions
    ]
    
    # 이벤트 타입 결정
    if old_count == 0 and new_count > 0:
        event_type = "reaction_new"
    elif new_count > old_count:
        event_type = "reaction_added"
    elif new_count < old_count:
        event_type = "reaction_removed"
    else:
        event_type = "reaction_updated"
    
    # 이벤트 데이터 구성
    # ⚠️ 중요: kakao_log_id는 문자열로 전송 (64-bit 정밀도 보존)
    event_data = {
        "type": "reaction_update",
        "event_type": event_type,
        "room": room_name,
        "sender": sender,
        "json": {
            "target_message_id": str(msg_id),  # ✅ 문자열로 변환 (정밀도 보존)
            "chat_id": int(chat_id) if chat_id else None,  # ✅ chat_id 포함
            "user_id": user_id,
            "old_count": old_count,
            "new_count": new_count,
            "new_reactions": new_reactions_list,
            "removed_reactions": removed_reactions_list,
            "all_reactions": all_reactions if isinstance(all_reactions, list) else [],
            "updated_at": int(time.time()),
            "created_at": created_at,
            "msg_type": msg_type,
            "v": v_data,
            "supplement": supplement
        }
    }
    
    # 디버그 로그 추가
    print(f"[반응 이벤트 생성] log_id={msg_id} (str), chat_id={chat_id}, old={old_count} -> new={new_count}, event_type={event_type}")
    
    return event_data

if __name__ == "__main__":
    poller = KakaoPoller()
    poller.poll_messages()

